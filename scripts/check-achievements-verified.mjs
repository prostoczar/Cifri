// Do the achievements still fire correctly now the score is computed on the server?
//
// The honest answer to "should achievements read server-verified values" is NO, and this script
// exists because that needs proving rather than asserting.
//
// Achievements read LOCAL state, and they have to keep doing so: an achievement that waited for
// a server would stop firing offline, and offline play earning nothing is not a trade this app
// makes. So nothing was rewired. What changed is that the number they read is now provably the
// same number the server computes — and that is what turns "the client says you scored 100" from
// an assertion into a fact.
//
// check:parity proves the two sides compute the same score. check:triggers proves the reducer
// unlocks the right achievements for a given score. This closes the gap between them: it takes a
// REAL question set, marks it with the SERVER's scoreAttempt, and drives the REAL reducer with
// the number that came out — so the whole chain is exercised end to end, with no invented scores
// anywhere in it.
//
// It also nails down the rule that matters most for tamper-resistance: a boosted score must not
// unlock anything the raw score could not.
//
// Run it with:  npm run check:achievements-verified

import { createServer } from 'vite';
import { scoreAttempt, applyBrainingBoost, BRAINING_BOOST_PCT } from '../supabase/functions/_shared/scoring.js';
import { generateChallengeSet } from '../supabase/functions/_shared/generator.js';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { reducer, defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const { ACHIEVEMENTS } = await server.ssrLoadModule('/src/store/achievements.js');

let failed = 0;
const fail = (msg) => { failed++; console.log('FAIL  ' + msg); };
const ok = (msg) => console.log('ok    ' + msg);

// `unlocked` is a list of achievement OBJECTS, not keys — and some entries (the streak-lit card)
// are announcements with no key at all. Comparing it to key strings directly silently matches
// nothing, which is exactly what the first draft of this script did: every score achievement
// reported as missing while the reducer was firing all of them correctly.
const keysOf = (unlocked) => (unlocked || []).map((u) => u && u.key).filter(Boolean);

// The four score-based achievements, and the only ones whose trigger is the score NUMBER rather
// than how the run was played. Everything else keys off correct answers, difficulty or operation
// coverage, none of which the boost can touch.
const SCORE_LADDER = [
  { key: 'ch_peak', at: (s) => s >= 100, label: '100+' },
  { key: 'ch_sky', at: (s) => s >= 150, label: '150+' },
  { key: 'ch_moon', at: (s) => s >= 200, label: '200+' },
  { key: 'ch_nice', at: (s) => s === 69, label: 'exactly 69' },
];

// ── Building a run that scores exactly N, as the server would mark it ─────────
//
// Greedy: walk the set, and for each question choose an answer time whose points bring the
// running total as close to the target as possible without passing it. Because a question's
// worth depends on its operation as well as its speed, the reachable values are dense enough
// that exact targets land within a few questions.
function runScoringExactly(target, questions, difficulty) {
  const answers = [];
  for (let i = 0; i < questions.length; i++) {
    const remaining = target - scoreAttempt({ questions, answers, difficulty }).rawScore;
    if (remaining === 0) break;

    let best = null;
    for (let ms = 400; ms <= 13000; ms += 100) {
      const trial = answers.concat([{ i, value: questions[i].ans, ms }]);
      const got = scoreAttempt({ questions, answers: trial, difficulty }).rawScore;
      if (got > target) continue;
      if (!best || got > best.got) best = { got, ms };
      if (got === target) break;
    }
    if (!best) return null; // nothing at this question can avoid overshooting
    answers.push({ i, value: questions[i].ans, ms: best.ms });
  }
  const finalScore = scoreAttempt({ questions, answers, difficulty }).rawScore;
  return finalScore === target ? answers : null;
}

function playChallenge(state, { diff, score, correct = 5, wrong = 0, attemptId = 'a1' }) {
  return reducer(state, {
    type: 'CHALLENGE_SESSION_COMPLETE', reqId: 1, diff, score, isPrac: false,
    correct, wrong, origin: 'challenge', opTimes: null, breakdown: null,
    attemptId, lang: 'en',
  });
}

// ── 1. Server-marked runs drive the reducer ──────────────────────────────────

console.log('\nA real set, marked by the server, drives the real reducer');
{
  const targets = [69, 99, 100, 101, 149, 150, 199, 200, 260];
  let built = 0;

  for (const target of targets) {
    // Easy has the finest granularity (no difficulty multiplier), so exact targets are reachable.
    const questions = generateChallengeSet(1000 + target, 'easy');
    const answers = runScoringExactly(target, questions, 'easy');
    if (!answers) { fail(`could not construct a run scoring exactly ${target}`); continue; }
    built++;

    const marked = scoreAttempt({ questions, answers, difficulty: 'easy' });
    if (marked.rawScore !== target) {
      fail(`the server marked the constructed run as ${marked.rawScore}, not ${target}`);
      continue;
    }

    // Drive the reducer with the SERVER's number, exactly as App.jsx does.
    const after = playChallenge({ ...defaultState() }, {
      diff: 'easy', score: marked.rawScore, correct: marked.correct, wrong: marked.wrong,
    });
    const unlocked = keysOf(after._lastSessionResult.unlocked);

    for (const rung of SCORE_LADDER) {
      const should = rung.at(target);
      const did = unlocked.indexOf(rung.key) !== -1;
      if (should !== did) {
        fail(`score ${target}: ${rung.key} (${rung.label}) ${did ? 'fired but should not have' : 'did not fire but should have'}`);
      }
    }
  }
  if (built === targets.length) {
    ok(`${built} runs built from real question sets, each scoring an exact target the server confirmed`);
    ok('every score-ladder achievement fired exactly when the server-computed score said it should');
  }
}

// ── 2. The boost cannot buy an achievement ───────────────────────────────────
//
// This is the rule the whole raw/boosted split exists to protect, and the place it would fail
// silently. A 96-point run boosts to 101; if anything read the boosted number, To the Peak would
// unlock for a player who never scored 100.

console.log('\nThe Braining boost cannot buy a score achievement');
{
  const questions = generateChallengeSet(555001, 'easy');
  const boundaries = [
    { raw: 96, ladder: 'ch_peak', threshold: 100 },
    { raw: 143, ladder: 'ch_sky', threshold: 150 },
    { raw: 191, ladder: 'ch_moon', threshold: 200 },
  ];

  for (const b of boundaries) {
    const answers = runScoringExactly(b.raw, questions, 'easy');
    if (!answers) { fail(`could not construct a run scoring exactly ${b.raw}`); continue; }
    const marked = scoreAttempt({ questions, answers, difficulty: 'easy' });
    const boosted = applyBrainingBoost(marked.rawScore);

    if (boosted < b.threshold) {
      fail(`fixture is wrong: ${b.raw} boosts to ${boosted}, which does not cross ${b.threshold}`);
      continue;
    }

    // A day with an unspent boost waiting, exactly as finishing Braining leaves it.
    const withBoost = { ...defaultState(), brBoostDay: new Date().toLocaleDateString('en-CA') };
    const after = playChallenge(withBoost, { diff: 'easy', score: marked.rawScore, correct: marked.correct, wrong: marked.wrong });
    const result = after._lastSessionResult;
    const unlocked = keysOf(result.unlocked);

    if (!result.boosted) { fail(`the boost was not spent on a ${b.raw}-point run`); continue; }
    if (result.score !== boosted) {
      fail(`a ${b.raw}-point run counted for ${result.score}, expected ${boosted}`);
      continue;
    }
    if (unlocked.indexOf(b.ladder) !== -1) {
      fail(`${b.ladder} unlocked on a raw ${b.raw} boosted to ${boosted} — THE BOOST BOUGHT AN ACHIEVEMENT`);
    } else {
      ok(`raw ${b.raw} → counted ${boosted}, crossing ${b.threshold}, and ${b.ladder} stayed locked`);
    }
    // And the run really is stored at the boosted value, so this is not passing by accident.
    const stored = after.db.easy.sessions[after.db.easy.sessions.length - 1];
    if (stored.score !== boosted || stored.rawScore !== b.raw) {
      fail(`stored session is score=${stored.score} raw=${stored.rawScore}, expected ${boosted}/${b.raw}`);
    }
  }

  // The mirror image: a raw score that genuinely crosses the line still unlocks when boosted.
  const answers = runScoringExactly(100, questions, 'easy');
  const withBoost = { ...defaultState(), brBoostDay: new Date().toLocaleDateString('en-CA') };
  const after = playChallenge(withBoost, { diff: 'easy', score: scoreAttempt({ questions, answers, difficulty: 'easy' }).rawScore, correct: 12 });
  if (keysOf(after._lastSessionResult.unlocked).indexOf('ch_peak') === -1) {
    fail('a genuine 100 did not unlock To the Peak when a boost was also spent');
  } else {
    ok('a genuine raw 100 still unlocks To the Peak with a boost active — the rule cuts one way only');
  }
}

// ── 3. The verified flag changes nothing about what is earned ────────────────
//
// The flag records that the server witnessed a run. It must not become a condition of earning
// anything, or a player with no signal would stop progressing — so the same run is played twice,
// once confirmed and once not, and the two must be indistinguishable in what they unlocked.

console.log('\nBeing verified is not a condition of earning anything');
{
  const questions = generateChallengeSet(777333, 'easy');
  const answers = runScoringExactly(150, questions, 'easy');
  const marked = scoreAttempt({ questions, answers, difficulty: 'easy' });

  const offline = playChallenge({ ...defaultState() }, { diff: 'easy', score: marked.rawScore, correct: marked.correct, attemptId: 'off-1' });
  let online = playChallenge({ ...defaultState() }, { diff: 'easy', score: marked.rawScore, correct: marked.correct, attemptId: 'on-1' });
  online = reducer(online, { type: 'CHALLENGE_ATTEMPT_VERIFIED', diff: 'easy', attemptId: 'on-1' });

  const a = keysOf(offline._lastSessionResult.unlocked).sort().join(',');
  const b = keysOf(online._lastSessionResult.unlocked).sort().join(',');
  if (a !== b) fail(`verified and unverified runs unlocked different things:\n  offline ${a}\n  online  ${b}`);
  else ok(`an unverified run unlocks exactly what a verified one does (${keysOf(offline._lastSessionResult.unlocked).length} achievements)`);

  const offSession = offline.db.easy.sessions[0];
  const onSession = online.db.easy.sessions[0];
  if (offSession.score !== onSession.score) fail('the two runs recorded different scores');
  else if (onSession.verified !== true) fail('the confirmed run was not marked verified');
  else if (offSession.verified !== undefined) fail('the unconfirmed run was marked verified');
  else ok('both scored identically; only the confirmed one carries the flag');

  // Streaks are the other thing a player would notice losing.
  if (offline.streak !== online.streak) fail(`streak differs: offline ${offline.streak}, online ${online.streak}`);
  else ok(`the streak moved identically either way (${offline.streak})`);
}

// ── 4. Braining, the same way ────────────────────────────────────────────────

console.log('\nBraining: verification changes nothing a player earns');
{
  const brain = (attemptId) => reducer({ ...defaultState() }, {
    type: 'BRAINING_SESSION_COMPLETE', reqId: 1, sec: 175, age: 20, isPrac: false,
    wrong: 0, total: 50, opTimes: null, attemptId, lang: 'en',
  });

  const offline = brain('br-off');
  let online = brain('br-on');
  online = reducer(online, { type: 'BRAINING_ATTEMPT_VERIFIED', attemptId: 'br-on' });

  const a = keysOf(offline._lastBrResult.unlocked).sort().join(',');
  const b = keysOf(online._lastBrResult.unlocked).sort().join(',');
  if (a !== b) fail(`verified and unverified trials unlocked different things:\n  offline ${a}\n  online  ${b}`);
  else ok(`an unverified trial unlocks exactly what a verified one does (${keysOf(offline._lastBrResult.unlocked).length} achievements)`);

  // The boost is granted locally either way. Whether it is ever PAID is the server's business,
  // and that is a different question from whether the player earned it.
  if (!offline.brBoostDay) fail('an offline Braining trial did not grant the local boost');
  else if (offline.brBoostDay !== online.brBoostDay) fail('the local boost differed by verification');
  else ok('both trials granted the local boost — the server decides only whether it is paid');

  if (online.brState.sessions[0].verified !== true) fail('the confirmed trial was not marked verified');
  else ok('only the confirmed trial carries the flag');
}

// ── 5. The catalogue is still whole ──────────────────────────────────────────

console.log('\nThe catalogue');
{
  if (ACHIEVEMENTS.length !== 59) fail(`the catalogue holds ${ACHIEVEMENTS.length} achievements, expected 59`);
  else ok('all 59 achievements are present');

  const keys = ACHIEVEMENTS.map((a) => a.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length) fail(`duplicate achievement keys: ${dupes.join(', ')}`);
  else ok('every key is unique — none has been renamed onto another');

  for (const rung of SCORE_LADDER) {
    if (keys.indexOf(rung.key) === -1) fail(`${rung.key} is no longer in the catalogue`);
  }
  ok(`the ${SCORE_LADDER.length} score-based achievements are all still present and were all exercised above`);
  ok(`the boost is ${BRAINING_BOOST_PCT}%, read from the same constant the server pays from`);
}

await server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
