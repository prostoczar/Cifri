// Do the per-mode streak pills report the truth?
//
// v16 item 2 put a second streak number on each mode's home screen: how many days in a row that
// mode alone has been played. It sits inches away from the header flame, which counts the UNIFIED
// streak, so the two are constantly available to be compared — and a wrong one is invisible. It
// does not throw, it does not look broken, it just quietly claims you played Challenge yesterday
// when you did not.
//
// Unlike the unified streak these are DERIVED, not stored: challengeStreak()/brainingStreak() read
// session history every time. That removes a whole class of bug (nothing to migrate, nothing to
// double-credit, nothing to miss at midnight) and creates exactly one in its place — the reading
// itself. This is the script for that reading.
//
// What it pins down:
//   * consecutive days count, gaps stop the count, and only the RUN ENDING NOW is "current"
//   * a streak credited yesterday is still alive today (it dies at tomorrow's midnight)
//   * practice runs never count, in either mode
//   * a Challenge day is a Challenge day at any difficulty, and mixing difficulties is one run
//   * the two modes are genuinely independent, and both are independent of the unified streak
//   * `best` is the longest run ANYWHERE in the record, not merely the current one
//
// Run it with:  npm run check:mode-streaks

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { challengeStreak, brainingStreak } = await server.ssrLoadModule('/src/store/selectors.js');

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const key = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };

// `offsets` are days-ago. `real: true` unless the entry says otherwise.
const chDb = (spec) => {
  const db = {
    easy: { sessions: [], best: 0, lastDay: null },
    medium: { sessions: [], best: 0, lastDay: null },
    hard: { sessions: [], best: 0, lastDay: null },
  };
  spec.forEach(({ diff = 'easy', ago: a, real = true }) => {
    db[diff].sessions.push({ date: ago(a), score: 100, correct: 5, real, ts: 0 });
  });
  return db;
};
const brSt = (spec) => ({
  sessions: spec.map(({ ago: a, real = true }) => ({ date: ago(a), time: 250, age: 30, real, ts: 0 })),
  lastDay: null, bestTime: null, bestAge: null,
});

const cases = [];
const push = (mode, name, got, wantCur, wantBest) => cases.push({
  mode, name,
  wanted: 'current ' + wantCur + ', best ' + wantBest,
  got: 'current ' + got.current + ', best ' + got.best,
  ok: got.current === wantCur && got.best === wantBest,
});

// ── The reading itself ──────────────────────────────────────────────────────────
const days = (...offs) => offs.map((a) => ({ ago: a }));

push('challenge', 'nothing ever played', challengeStreak(chDb([])), 0, 0);
push('challenge', 'today only', challengeStreak(chDb(days(0))), 1, 1);
push('challenge', 'three days ending today', challengeStreak(chDb(days(2, 1, 0))), 3, 3);

// The boundary that matters most. Yesterday's streak has NOT died just because today is young:
// the unified streak breaks on the day AFTER a missed day, and these must agree with it or the
// two numbers on screen contradict each other every morning.
push('challenge', 'ended yesterday, nothing today yet', challengeStreak(chDb(days(3, 2, 1))), 3, 3);
push('challenge', 'ended two days ago (dead)', challengeStreak(chDb(days(4, 3, 2))), 0, 3);

// "Current" is the run ending now, never the biggest one.
push('challenge', 'long old run, short live one', challengeStreak(chDb(days(9, 8, 7, 6, 5, 1, 0))), 2, 5);
push('challenge', 'gap in the middle', challengeStreak(chDb(days(6, 5, 4, 2, 1, 0))), 3, 3);

// Practice runs are excluded, the same way the chart and the day's score exclude them. A streak
// built on practice would disagree with every other number drawn from the same sessions.
push('challenge', 'practice only, never counted', challengeStreak(chDb([{ ago: 0, real: false }, { ago: 1, real: false }])), 0, 0);
push('challenge', 'practice does not bridge a gap', challengeStreak(chDb([{ ago: 0 }, { ago: 1, real: false }, { ago: 2 }])), 1, 1);

// Any difficulty is a Challenge day, and playing across difficulties is one run, not three.
push('challenge', 'mixed difficulties are one run', challengeStreak(chDb([
  { diff: 'hard', ago: 2 }, { diff: 'easy', ago: 1 }, { diff: 'medium', ago: 0 },
])), 3, 3);
// Twice in a day is one day.
push('challenge', 'two runs in a day count once', challengeStreak(chDb([{ ago: 1 }, { ago: 0 }, { ago: 0 }])), 2, 2);

// Legacy rows written before the `real` flag existed still count — same rule isRecordedSession
// applies everywhere else, and treating them as practice would erase old players' history.
push('challenge', 'pre-flag session still counts', challengeStreak({
  easy: { sessions: [{ date: ago(0), score: 100 }], best: 100, lastDay: ago(0) },
  medium: { sessions: [], best: 0, lastDay: null },
  hard: { sessions: [], best: 0, lastDay: null },
}), 1, 1);

// ── Braining reads the same way off its own history ─────────────────────────────
push('braining', 'nothing ever played', brainingStreak(brSt([])), 0, 0);
push('braining', 'four days ending today', brainingStreak(brSt(days(3, 2, 1, 0))), 4, 4);
push('braining', 'ended yesterday, nothing today yet', brainingStreak(brSt(days(2, 1))), 2, 2);
push('braining', 'ended two days ago (dead)', brainingStreak(brSt(days(3, 2))), 0, 2);
push('braining', 'retries are not counted', brainingStreak(brSt([{ ago: 0 }, { ago: 0, real: false }, { ago: 1 }])), 2, 2);
push('braining', 'practice only, never counted', brainingStreak(brSt([{ ago: 0, real: false }])), 0, 0);
push('braining', 'missing brState is not a crash', brainingStreak(undefined), 0, 0);

// ── The two modes must not leak into each other ─────────────────────────────────
// A week of Braining and no Challenge is the case the whole feature exists to distinguish: the
// header flame would read 7, and the Challenge pill must still read 0.
const brOnly = brSt(days(6, 5, 4, 3, 2, 1, 0));
push('challenge', 'a week of Braining leaves Challenge at 0', challengeStreak(chDb([])), 0, 0);
push('braining', 'a week of Braining reads 7', brainingStreak(brOnly), 7, 7);
push('challenge', 'a week of Challenge reads 7', challengeStreak(chDb(days(6, 5, 4, 3, 2, 1, 0))), 7, 7);
push('braining', 'a week of Challenge leaves Braining at 0', brainingStreak(brSt([])), 0, 0);

const w = (s, n) => String(s).padEnd(n);
console.log(w('mode', 11) + w('case', 44) + w('wanted', 26) + w('got', 26) + 'verdict');
console.log('-'.repeat(114));
let failed = 0;
for (const c of cases) {
  if (!c.ok) failed++;
  console.log(w(c.mode, 11) + w(c.name, 44) + w(c.wanted, 26) + w(c.got, 26) + (c.ok ? 'ok' : 'FAIL'));
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + cases.length + ' checks passed');
await server.close();
process.exit(failed ? 1 : 0);
