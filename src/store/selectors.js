import { dayKey } from './dates.js';

function isRecordedSession(s) {
  return s.real === true || typeof s.real === 'undefined';
}

// Every attempt dated today for a given difficulty, counting or not.
export function todaySessionsFor(db, diff) {
  const d = db[diff];
  const today = dayKey();
  return (d.sessions || []).filter((s) => s.date === today);
}

// ── What a day's Challenge score IS ────────────────────────────────────────────
//
// The one definition, used by the chart, the home screen, the result screen and the
// daily_results projection alike, so none of them can disagree about a player's score.
//
//   a day's score = the average of that day's COUNTING sessions
//
// Restricting it to counting sessions is what makes the rule work backwards as well as
// forwards. Under the old model a day had exactly one counting session and the rest were
// practice, so its average is that single score — the same number it has always shown,
// with nothing rewritten. Under the new model every Challenge play counts, so the average
// is the average of all of them. One rule, two eras, no cutover date to get wrong.

export function countingSessions(sessions) {
  return (sessions || []).filter(isRecordedSession);
}

// The average as a whole number, or null on a day with nothing to average.
export function dayAverage(sessions) {
  const counted = countingSessions(sessions);
  if (!counted.length) return null;
  const sum = counted.reduce((a, s) => a + s.score, 0);
  return Math.round(sum / counted.length);
}

// Today's official Challenge score for one difficulty, and the two numbers it comes from.
// `count` is what the "N attempts today" line reports; `sum` is what gets stored server-side
// so the average never needs a row per play to recompute.
export function todayChallengeAvg(db, diff) {
  const counted = countingSessions(todaySessionsFor(db, diff));
  if (!counted.length) return { avg: null, count: 0, sum: 0 };
  const sum = counted.reduce((a, s) => a + s.score, 0);
  return { avg: Math.round(sum / counted.length), count: counted.length, sum };
}

// The best SINGLE score today — not the average. Every play feeds this, which is also why
// personal best is unaffected by the averaging: it was never an average to begin with.
export function todayChallengeHigh(db, diff) {
  const list = todaySessionsFor(db, diff);
  if (!list.length) return null;
  return list.reduce((b, s) => (s.score > b ? s.score : b), list[0].score);
}

// Most recent RECORDED score for this difficulty on a day BEFORE today.
export function getYestChallengeScore(db, diff) {
  const d = db[diff];
  if (!d || !d.sessions || !d.sessions.length) return null;
  const today = dayKey();
  for (let i = d.sessions.length - 1; i >= 0; i--) {
    const s = d.sessions[i];
    if (s.date !== today && isRecordedSession(s)) return s.score;
  }
  return null;
}

// Today's official score so far — the running average of the plays already banked. Shown
// mid-game as the "Today:" target, which under the new model is the number the run in
// progress is about to move, up or down.
export function getTodayChallengeScore(db, diff) {
  const d = db[diff];
  if (!d || !d.sessions || !d.sessions.length) return null;
  return todayChallengeAvg(db, diff).avg;
}

export function computeOpSummary(opTimes) {
  if (!opTimes) return null;
  const ops = Object.keys(opTimes).filter((k) => opTimes[k] && opTimes[k].length > 0);
  if (ops.length < 2) return null;
  const avgs = ops.map((op) => {
    const arr = opTimes[op];
    const sum = arr.reduce((a, b) => a + b, 0);
    return { op, avg: sum / arr.length };
  });
  avgs.sort((a, b) => a.avg - b.avg);
  return { fastest: avgs[0], slowest: avgs[avgs.length - 1] };
}
