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

// The ten score-based achievements, and the only ones whose trigger is the score NUMBER rather
// than how the run was played. Everything else keys off correct answers, difficulty or operation
// coverage, none of which the boost can touch.
//
// `diff` is half of each rule now: nine of the ten only fire on the tier they were calibrated for,
// so a rung is wrong in TWO ways it was not before — it can fire on the right number and the wrong
// tier. `fires()` below is the single place that combines the two, so no test can check one and
// forget the other.
const SCORE_LADDER = [
  { key: 'ch_sprout', diff: 'easy', at: (s) => s >= 125, label: 'easy 125+' },
  { key: 'ch_leaf', diff: 'easy', at: (s) => s >= 300, label: 'easy 300+' },
  { key: 'ch_evergreen', diff: 'easy', at: (s) => s >= 375, label: 'easy 375+' },
  { key: 'ch_small_change', diff: 'medium', at: (s) => s >= 150, label: 'medium 150+' },
  { key: 'ch_making_bank', diff: 'medium', at: (s) => s >= 400, label: 'medium 400+' },
  { key: 'ch_priceless', diff: 'medium', at: (s) => s >= 525, label: 'medium 525+' },
  { key: 'ch_peak', diff: 'hard', at: (s) => s >= 200, label: 'hard 200+' },
  { key: 'ch_sky', diff: 'hard', at: (s) => s >= 550, label: 'hard 550+' },
  { key: 'ch_moon', diff: 'hard', at: (s) => s >= 750, label: 'hard 750+' },
  // Nice! is the one rung with no tier gate: an exact 69 anywhere.
  { key: 'ch_nice', diff: null, at: (s) => s === 69, label: 'exactly 69, any tier' },
];

const fires = (rung, score, diff) => (rung.diff === null || rung.diff === diff) && rung.at(score);

// ── Building a run that scores exactly N, as the server would mark it ─────────
//
// Greedy: walk the set, and for each question choose an answer time whose points bring the
// running total as close to the target as possible without passing it.
//
// WHY THIS ALSO USES WRONG ANSWERS. Correct answers alone cannot land on an arbitrary total once
// the difficulty multiplier is large. A question's worth is `round(speed × OMULT × dm)`, so on Hard
// the cheapest correct answer is worth `round(1 × 1.0 × 4.2)` = 4 points and the reachable values
// climb in steps of four or more. A gap of one, two or three points is then simply unreachable, and
// a greedy walk of correct answers stalls three short of the target forever. This is not a flaw in
// the game — it is what coarser scoring means — but it does mean the old solver silently stopped
// being able to build fixtures the moment the multipliers went up, which is exactly how a test file
// stops testing anything.
//
// A wrong answer is a flat −2 at any speed, and that is the fine adjustment. So: fill upwards with
// correct answers, then deliberately OVERSHOOT by an even margin with one more correct answer and
// walk back down two points at a time. Every score in range becomes constructible.
function runScoringExactly(target, questions, difficulty) {
  const scoreOf = (a) => scoreAttempt({ questions, answers: a, difficulty }).rawScore;
  const wrongAt = (i) => ({ i, value: questions[i].ans + 1, ms: 3000 });
  const answers = [];
  let next = 0;

  // Phase 1 — greedy fill with correct answers, never passing the target.
  for (; next < questions.length; next++) {
    const remaining = target - scoreOf(answers);
    if (remaining === 0) return answers;

    let best = null;
    for (let ms = 400; ms <= 13000; ms += 100) {
      const got = scoreOf(answers.concat([{ i: next, value: questions[next].ans, ms }]));
      if (got > target) continue;
      if (!best || got > best.got) best = { got, ms };
      if (got === target) break;
    }
    if (!best) break; // every speed at this question overshoots — phase 2 takes over
    if (best.got === scoreOf(answers)) break; // no forward progress available
    answers.push({ i: next, value: questions[next].ans, ms: best.ms });
  }

  if (scoreOf(answers) === target) return answers;

  // Phase 2 — overshoot by an even margin, then subtract 2 per wrong answer.
  const gap = target - scoreOf(answers);
  if (gap < 0) return null;
  for (let i = next; i < questions.length; i++) {
    for (let ms = 400; ms <= 13000; ms += 100) {
      const trial = answers.concat([{ i, value: questions[i].ans, ms }]);
      const over = scoreOf(trial) - target;
      if (over < 0 || over % 2 !== 0) continue;
      const wrongsNeeded = over / 2;
      if (i + 1 + wrongsNeeded > questions.length) continue;
      for (let w = 0; w < wrongsNeeded; w++) trial.push(wrongAt(i + 1 + w));
      if (scoreOf(trial) === target) return trial;
    }
  }
  return null;
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
  // One pair of targets either side of every rung, plus 69 and 70 for Nice!, played on the tier the
  // rung belongs to. The values one BELOW each threshold are the ones that matter: an off-by-one in
  // the reducer is exactly the kind of thing that never throws.
  //
  // Every target is played on all three tiers, not just its own, which is the assertion the flat
  // ladder never needed: a 400-point EASY run must leave Making Bank (medium 400+) locked. A rung
  // firing on the right number and the wrong tier is the new way this can be wrong.
  const targets = {
    easy: [69, 70, 124, 125, 299, 300, 374, 375],
    medium: [149, 150, 399, 400, 524, 525],
    hard: [199, 200, 549, 550, 749, 750],
  };
  let built = 0, wanted = 0;

  for (const playedOn of ['easy', 'medium', 'hard']) {
    for (const target of targets[playedOn]) {
      wanted++;
      const questions = generateChallengeSet(1000 + target, playedOn);
      const answers = runScoringExactly(target, questions, playedOn);
      if (!answers) { fail(`could not construct a ${playedOn} run scoring exactly ${target}`); continue; }
      built++;

      const marked = scoreAttempt({ questions, answers, difficulty: playedOn });
      if (marked.rawScore !== target) {
        fail(`the server marked the constructed run as ${marked.rawScore}, not ${target}`);
        continue;
      }

      // Drive the reducer with the SERVER's number, exactly as App.jsx does.
      const after = playChallenge({ ...defaultState() }, {
        diff: playedOn, score: marked.rawScore, correct: marked.correct, wrong: marked.wrong,
      });
      const unlocked = keysOf(after._lastSessionResult.unlocked);

      for (const rung of SCORE_LADDER) {
        const should = fires(rung, target, playedOn);
        const did = unlocked.indexOf(rung.key) !== -1;
        if (should !== did) {
          fail(`${playedOn} score ${target}: ${rung.key} (${rung.label}) ` +
            (did ? 'fired but should not have' : 'did not fire but should have'));
        }
      }
    }
  }
  if (built === wanted) {
    ok(`${built} runs built from real question sets across all three tiers, each scoring an exact target the server confirmed`);
    ok('every score-ladder achievement fired exactly when the score AND the tier said it should');
  }
}

// ── 2. The boost cannot buy an achievement ───────────────────────────────────
//
// This is the rule the whole raw/boosted split exists to protect, and the place it would fail
// silently. A 96-point run boosts to 101; if anything read the boosted number, To the Peak would
// unlock for a player who never scored 100.

console.log('\nThe Braining boost cannot buy a score achievement');
{
  // One straddling fixture per rung, on the rung's own tier: a raw score just under the threshold
  // that the 5% boost carries over it. These are the only scores where the raw/boosted distinction
  // is observable at all, so they are the only ones worth testing.
  const boundaries = [
    { diff: 'easy', raw: 120, ladder: 'ch_sprout', threshold: 125 },
    { diff: 'easy', raw: 286, ladder: 'ch_leaf', threshold: 300 },
    { diff: 'easy', raw: 358, ladder: 'ch_evergreen', threshold: 375 },
    { diff: 'medium', raw: 143, ladder: 'ch_small_change', threshold: 150 },
    { diff: 'medium', raw: 381, ladder: 'ch_making_bank', threshold: 400 },
    { diff: 'medium', raw: 500, ladder: 'ch_priceless', threshold: 525 },
    { diff: 'hard', raw: 191, ladder: 'ch_peak', threshold: 200 },
    { diff: 'hard', raw: 524, ladder: 'ch_sky', threshold: 550 },
    { diff: 'hard', raw: 715, ladder: 'ch_moon', threshold: 750 },
  ];

  for (const b of boundaries) {
    const questions = generateChallengeSet(555001 + b.raw, b.diff);
    const answers = runScoringExactly(b.raw, questions, b.diff);
    if (!answers) { fail(`could not construct a ${b.diff} run scoring exactly ${b.raw}`); continue; }
    const marked = scoreAttempt({ questions, answers, difficulty: b.diff });
    const boosted = applyBrainingBoost(marked.rawScore);

    if (boosted < b.threshold) {
      fail(`fixture is wrong: ${b.raw} boosts to ${boosted}, which does not cross ${b.threshold}`);
      continue;
    }

    // A day with an unspent boost waiting, exactly as finishing Braining leaves it.
    const withBoost = { ...defaultState(), brBoostDay: new Date().toLocaleDateString('en-CA') };
    const after = playChallenge(withBoost, { diff: b.diff, score: marked.rawScore, correct: marked.correct, wrong: marked.wrong });
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
    const stored = after.db[b.diff].sessions[after.db[b.diff].sessions.length - 1];
    if (stored.score !== boosted || stored.rawScore !== b.raw) {
      fail(`stored session is score=${stored.score} raw=${stored.rawScore}, expected ${boosted}/${b.raw}`);
    }
  }

  // The mirror image: a raw score that genuinely crosses the line still unlocks when boosted. Run on
  // Easy against Sprout's 125, the lowest rung, so the fixture stays easy to build exactly.
  const questions = generateChallengeSet(555999, 'easy');
  const answers = runScoringExactly(125, questions, 'easy');
  if (!answers) {
    fail('could not construct an easy run scoring exactly 125');
  } else {
    const withBoost = { ...defaultState(), brBoostDay: new Date().toLocaleDateString('en-CA') };
    const after = playChallenge(withBoost, { diff: 'easy', score: scoreAttempt({ questions, answers, difficulty: 'easy' }).rawScore, correct: 12 });
    if (keysOf(after._lastSessionResult.unlocked).indexOf('ch_sprout') === -1) {
      fail('a genuine raw 125 did not unlock First Shoots when a boost was also spent');
    } else {
      ok('a genuine raw 125 still unlocks First Shoots with a boost active — the rule cuts one way only');
    }
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
  if (ACHIEVEMENTS.length !== 65) fail(`the catalogue holds ${ACHIEVEMENTS.length} achievements, expected 65`);
  else ok('all 65 achievements are present');

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
