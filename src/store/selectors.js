import { dayKey } from './dates.js';

function isRecordedSession(s) {
  return s.real === true || typeof s.real === 'undefined';
}

// Every attempt (real trial + practice/retries) dated today for a given difficulty.
export function todaySessionsFor(db, diff) {
  const d = db[diff];
  const today = dayKey();
  return (d.sessions || []).filter((s) => s.date === today);
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

// Today's REAL recorded score (the real:true entry dated today, if it already happened).
export function getTodayChallengeScore(db, diff) {
  const d = db[diff];
  if (!d || !d.sessions || !d.sessions.length) return null;
  const today = dayKey();
  for (let i = d.sessions.length - 1; i >= 0; i--) {
    const s = d.sessions[i];
    if (s.date === today && isRecordedSession(s)) return s.score;
  }
  return null;
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
