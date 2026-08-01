// Checks the rows the app will send to `daily_results`, without needing a network or a database.
//
// This is the arithmetic the whole Challenge scoring model rests on: a day's score is the average
// of that day's counting runs, and `attempt_count`/`score_sum` are the two numbers it is derived
// from. A mistake here would not crash anything — it would quietly record wrong scores — so it is
// worth having a check that fails loudly instead.
//
// Run it with:  npm run check:projection

import { projectDailyRows } from '../src/lib/dailyResults.js';
import { applyBrainingBoost, isValidBoost, BRAINING_BOOST_PCT } from '../src/store/scoring.js';

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const key = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
const today = key(new Date());

// A history that deliberately spans both scoring eras, because the interesting property is that
// one rule covers them both.
const state = {
  db: {
    easy: {
      sessions: [
        // A day played under the OLD rule: one counting trial, two uncounted practice runs. The
        // practice runs must not move the day's score, in either direction.
        { date: ago(3), score: 52, real: true },
        { date: ago(3), score: 31, real: false },
        { date: ago(3), score: 80, real: false },
        // A day of practice only — the counting trial never happened.
        { date: ago(2), score: 44, real: false },
        // A day written before the `real` flag existed at all.
        { date: ago(1), score: 55 },
        // Today, under the NEW rule: four counting plays.
        { date: today, score: 41, real: true },
        { date: today, score: 68, real: true },
        { date: today, score: 97, real: true },
        { date: today, score: 253, real: true },
      ],
      best: 253, lastDay: today,
    },
    // Today on Medium, with the Braining boost spent. `score` is the value that counts — the
    // boosted one — and `rawScore` is what the run actually earned. Storing both is what lets
    // the boost be re-derived and checked instead of taken on trust, which is the property the
    // invariants at the bottom of this file exercise.
    medium: {
      sessions: [
        { date: today, score: 60, real: true },
        { date: today, score: applyBrainingBoost(100), rawScore: 100, boosted: true, real: true },
      ],
      best: 105, lastDay: today,
    },
    hard: { sessions: [], best: 0, lastDay: null },
  },
  brState: { sessions: [{ date: today, time: 149, age: 20, real: true }], lastDay: today },
  streak: 5, bestStreakEver: 5,
  brBoostDay: null, // granted by today's Braining trial, and already spent by the Medium run above
};

const rows = projectDailyRows(state, { todayOnly: false });

const cases = [
  ['a day under the old rule still scores its one counting trial',
    (r) => r.day === ago(3) && r.mode === 'challenge',
    { score: 52, attempt_count: 1, score_sum: 52, is_real: true }],
  ['a practice-only day is kept, flagged not-real, and still carries count/sum',
    (r) => r.day === ago(2) && r.mode === 'challenge',
    { score: 44, attempt_count: 1, score_sum: 44, is_real: false }],
  ['a session saved before the real flag existed counts',
    (r) => r.day === ago(1) && r.mode === 'challenge',
    { score: 55, attempt_count: 1, score_sum: 55, is_real: true }],
  ['today averages all four plays',
    (r) => r.day === today && r.mode === 'challenge' && r.difficulty === 'easy',
    { score: 115, attempt_count: 4, score_sum: 459, is_real: true }],
  // The boost's effect on a day, stated in the only place it can actually be observed: the sum.
  // Expected values are computed from the constant rather than written out, so retuning the
  // percentage retunes this check with it instead of failing it.
  ['a boosted attempt contributes its boosted value to the day, not its raw one',
    (r) => r.day === today && r.mode === 'challenge' && r.difficulty === 'medium',
    {
      score: Math.round((60 + applyBrainingBoost(100)) / 2),
      attempt_count: 2,
      score_sum: 60 + applyBrainingBoost(100),
      is_real: true,
    }],
  ['a Braining row carries no average (the constraint rejects one that does)',
    (r) => r.mode === 'braining',
    { time_sec: 149, brain_age: 20, attempt_count: null, score_sum: null, is_real: true }],
];

let failed = 0;
for (const [name, find, want] of cases) {
  const row = rows.find(find);
  if (!row) { console.log('FAIL  ' + name + ' — no such row'); failed++; continue; }
  const wrong = Object.keys(want).filter((k) => row[k] !== want[k]);
  if (wrong.length) {
    failed++;
    console.log('FAIL  ' + name);
    wrong.forEach((k) => console.log('        ' + k + ': got ' + row[k] + ', wanted ' + want[k]));
  } else {
    console.log('ok    ' + name);
  }
}

// The invariant the database is trusting the client to uphold: a Challenge row's score really is
// the average of the two numbers stored beside it. There is no constraint enforcing this yet —
// see the note at the end of migration 0006 — so this is where it gets checked.
// This still holds with the boost in play, and it is worth being clear about why. The boost is
// applied to an attempt when it is recorded, so the value stored on the session already IS the
// value that counts. A boosted day therefore has a larger sum, not a different formula — the
// score is the average of the numbers beside it exactly as before.
for (const r of rows.filter((x) => x.mode === 'challenge')) {
  if (!(r.attempt_count >= 1 && r.score_sum >= 0
        && r.score === Math.round(r.score_sum / r.attempt_count))) {
    failed++;
    console.log('FAIL  ' + r.day + ': score is not its own sum ÷ count');
  }
}

// ── The boost's own rules ──────────────────────────────────────────────────────
//
// A larger sum is only legitimate if the attempt that inflated it says so and shows its working.
// These walk the stored sessions rather than the projected rows, because that is where the raw
// value and the boosted flag live — and checking them here is what makes "one attempt's
// contribution may be its boosted value" an enforced rule rather than a loophole that hides any
// discrepancy at all. The next session re-runs this reasoning server-side; this is the same
// arithmetic, stated where it can be run without a database.
const boostedPerDay = new Map();
for (const diff of ['easy', 'medium', 'hard']) {
  for (const s of state.db[diff].sessions) {
    if (!s.boosted) {
      // A raw score tagging along without the flag would quietly count as a plain score.
      if (s.rawScore !== undefined) {
        failed++;
        console.log('FAIL  ' + s.date + ' (' + diff + '): carries a raw score but is not flagged boosted');
      }
      continue;
    }
    if (!isValidBoost(s.rawScore, s.score)) {
      failed++;
      console.log('FAIL  ' + s.date + ' (' + diff + '): ' + s.rawScore + ' boosted to ' + s.score
        + ', but ' + BRAINING_BOOST_PCT + '% of ' + s.rawScore + ' is ' + applyBrainingBoost(s.rawScore));
    }
    boostedPerDay.set(s.date, (boostedPerDay.get(s.date) || 0) + 1);
  }
}
// One boost a day, across every difficulty — playing Easy and then Hard must not find two.
for (const [day, n] of boostedPerDay) {
  if (n > 1) {
    failed++;
    console.log('FAIL  ' + day + ': ' + n + ' boosted attempts, but a day grants at most one');
  }
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall checks passed (' + rows.length + ' rows)');
process.exit(failed ? 1 : 0);
