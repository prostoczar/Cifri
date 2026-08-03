// One score, three places, no drift.
//
// A Challenge day's score exists in three forms, and they are computed by three different pieces
// of code that nobody ever runs side by side:
//
//   what the player sees    selectors.todayChallengeAvg / dayAverage  (home screen, chart, result)
//   what the server stores  projectDailyRows                          (daily_results)
//   what the row claims     score === round(score_sum / attempt_count)
//
// The third is an invariant the database is trusting the client to uphold — migration 0006 adds
// no constraint for it — so it is only true for as long as someone checks. The first two are the
// ones that actually hurt if they part company: a player would see one number and be ranked on
// another, and nothing anywhere would report an error.
//
// The existing check:projection asserts this against a hand-written fixture. This one asserts it
// against states built by the REAL reducer from random play, so it also covers the arithmetic as
// it is actually produced — including the boosted attempt, which is the one term in the sum that
// is not the number the run scored.
//
// Run it with:  npm run check:invariant

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { reducer, defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const { projectDailyRows } = await server.ssrLoadModule('/src/lib/dailyResults.js');
const { todayChallengeAvg, dayAverage, todaySessionsFor } = await server.ssrLoadModule('/src/store/selectors.js');
const { applyBrainingBoost, isValidBoost } = await server.ssrLoadModule('/src/store/scoring.js');

const DIFFS = ['easy', 'medium', 'hard'];

// Deterministic, so a failure can be reproduced from the seed rather than being a story about a
// run that will never happen again.
let seed = 20260803;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];

function challenge(s, diff, score, isPrac = false) {
  return reducer(s, {
    type: 'CHALLENGE_SESSION_COMPLETE', reqId: 1, diff, score, isPrac,
    correct: 1 + Math.floor(rnd() * 25), wrong: Math.floor(rnd() * 4),
    origin: isPrac ? 'practice' : 'challenge', opTimes: null, breakdown: null, lang: 'en',
  });
}

let failed = 0;
const fail = (msg) => { failed++; console.log('FAIL  ' + msg); };

// ── Random days of real play ──────────────────────────────────────────────────
const TRIALS = 300;
let boostedDays = 0;
for (let trial = 0; trial < TRIALS; trial++) {
  let s = { ...defaultState() };

  // Braining first on some days, which is what puts a boosted attempt into the sum.
  const withBoost = rnd() < 0.5;
  if (withBoost) {
    s = reducer(s, { type: 'BRAINING_SESSION_COMPLETE', reqId: 1, sec: 200, age: 30, isPrac: false, wrong: 0, opTimes: null, lang: 'en' });
  }

  const plays = 1 + Math.floor(rnd() * 6);
  for (let i = 0; i < plays; i++) s = challenge(s, pick(DIFFS), 1 + Math.floor(rnd() * 300));
  // A few Practice-tab runs, which must not appear in any of the three numbers.
  for (let i = 0; i < Math.floor(rnd() * 3); i++) s = challenge(s, null, 1 + Math.floor(rnd() * 300), true);

  const rows = projectDailyRows(s, { todayOnly: false }).filter((r) => r.mode === 'challenge');

  for (const r of rows) {
    // 1. The row is internally consistent.
    if (r.score !== Math.round(r.score_sum / r.attempt_count)) {
      fail('trial ' + trial + ' ' + r.difficulty + ': score ' + r.score + ' ≠ round(' + r.score_sum + '/' + r.attempt_count + ')');
    }
    if (!(r.attempt_count >= 1 && r.score_sum >= 0)) {
      fail('trial ' + trial + ' ' + r.difficulty + ': count ' + r.attempt_count + ' sum ' + r.score_sum);
    }

    // 2. The row agrees with what the player is shown.
    const shown = todayChallengeAvg(s.db, r.difficulty);
    if (shown.avg !== r.score) {
      fail('trial ' + trial + ' ' + r.difficulty + ': screen shows ' + shown.avg + ', server row says ' + r.score);
    }
    if (shown.count !== r.attempt_count || shown.sum !== r.score_sum) {
      fail('trial ' + trial + ' ' + r.difficulty + ': screen ' + shown.count + '/' + shown.sum
        + ' vs row ' + r.attempt_count + '/' + r.score_sum);
    }

    // 3. And with the chart, which averages the same sessions by a different route.
    const viaChart = dayAverage(todaySessionsFor(s.db, r.difficulty));
    if (viaChart !== r.score) {
      fail('trial ' + trial + ' ' + r.difficulty + ': chart ' + viaChart + ' vs row ' + r.score);
    }
  }

  // 4. At most one boosted attempt a day, and its inflation is provable from what is stored.
  let boostedToday = 0;
  for (const d of DIFFS) {
    for (const x of s.db[d].sessions) {
      if (x.boosted) {
        boostedToday++;
        if (!isValidBoost(x.rawScore, x.score)) {
          fail('trial ' + trial + ': ' + x.rawScore + ' → ' + x.score + ', expected ' + applyBrainingBoost(x.rawScore));
        }
      } else if (x.rawScore !== undefined) {
        fail('trial ' + trial + ': a raw score is stored without the boosted flag');
      }
    }
  }
  if (boostedToday > 1) fail('trial ' + trial + ': ' + boostedToday + ' boosted attempts in one day');
  if (withBoost && boostedToday === 1) boostedDays++;
}

console.log('ok    ' + TRIALS + ' random days: row score = sum ÷ count, and matches the screen and the chart');
console.log('ok    ' + boostedDays + ' of them spent a Braining boost, each provable from its stored raw score');

// ── The edge the averaging model made reachable ───────────────────────────────
// A day with a lot of plays is where rounding could quietly desynchronise the two computations,
// because they round at different moments: the projection sums integers and divides once, and the
// selector does the same — this asserts they still agree when there is plenty to disagree about.
{
  let s = { ...defaultState() };
  for (let i = 0; i < 50; i++) s = challenge(s, 'hard', 1 + i * 7);
  const row = projectDailyRows(s, { todayOnly: true }).find((r) => r.mode === 'challenge' && r.difficulty === 'hard');
  const shown = todayChallengeAvg(s.db, 'hard');
  if (!row || row.score !== shown.avg || row.attempt_count !== 50) {
    fail('50 plays in a day: row ' + JSON.stringify(row) + ' vs screen ' + JSON.stringify(shown));
  } else {
    console.log('ok    50 plays in one day still round to the same score everywhere (' + row.score + ')');
  }
}

// ── The score-based achievements that are not wired yet ───────────────────────
// To the Peak / Sky / Moon read a score, and every wired achievement deliberately reads how a run
// was PLAYED instead, so that the boost cannot buy one. When those three are wired they must read
// `rawScore`. This asserts the ingredient they need is actually on the session — if a future
// change stopped storing it, the only symptom would be three achievements quietly keying off the
// boosted number.
{
  let s = { ...defaultState() };
  s = reducer(s, { type: 'BRAINING_SESSION_COMPLETE', reqId: 1, sec: 200, age: 30, isPrac: false, wrong: 0, opTimes: null, lang: 'en' });
  s = challenge(s, 'easy', 96);
  const entry = s.db.easy.sessions[0];
  if (entry.rawScore !== 96) fail('the raw score a boosted run earned is not recorded');
  else if (entry.score !== applyBrainingBoost(96)) fail('the counted score is not the boosted one');
  else if (entry.score < 100 || entry.rawScore >= 100) fail('this fixture no longer straddles the 100-point line');
  else console.log('ok    a 96-point run boosted to ' + entry.score + ' still records 96, so To the Peak can be wired honestly');
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall checks passed');
await server.close();
process.exit(failed ? 1 : 0);
