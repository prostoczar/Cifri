import { dayKey, addDaysStr } from './dates.js';

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

// ── PER-MODE STREAKS (v16 item 2) ──────────────────────────────────────────────
//
// The header flame is the UNIFIED streak: one number, earned by playing either mode, with its
// own stored counter and its own restore mechanic. None of that is touched here. These are a
// second, separate reading — how many days in a row you have played THIS mode — and they exist
// only to fill the stat pill on each mode's home screen.
//
// DERIVED, NOT STORED. The obvious implementation was three new saved fields per mode (current,
// best, creditedForDay), a migration to fill them in for existing players, and a load-time check
// to notice when one had died overnight. All of that was rejected for one reason: session history
// in this app is never pruned, so the answer is already in the saved data, exactly, and a stored
// counter could only ever be a cache of it that might drift. A derived value cannot be
// double-credited by playing twice, cannot miss a break because the app was closed at midnight,
// cannot disagree with the chart drawn from the same sessions, and needs no migration — an
// account created before this existed reads back its true streak the first time it loads.
//
// It also means these follow a player between devices for free: `db` and `brState` are already
// in SYNCED_KEYS, so nothing new crosses the sync boundary.
//
// NO RESTORE. The unified streak can be resurrected across a gap with a refill; these cannot.
// A refill is a stored fact about one streak, and honouring it here would mean storing state
// again. "Days in a row you played this mode" stays a plain reading of the record.

// Every distinct day on which this mode had at least one COUNTING session, as a lookup.
// Practice runs are excluded on purpose: they are the same runs the chart and the day's score
// already ignore, so a streak built on them would disagree with everything else on the screen.
function countedDaySet(sessionLists) {
  const days = new Set();
  sessionLists.forEach((list) => {
    (list || []).forEach((s) => { if (isRecordedSession(s)) days.add(s.date); });
  });
  return days;
}

// The Challenge session lists — all three difficulties, since a Challenge day is a Challenge day
// whichever difficulty it was played at. Matches chDoneToday()/chCompletedOnDate() in the reducer.
function challengeLists(db) {
  return ['easy', 'medium', 'hard'].map((d) => (db && db[d] ? db[d].sessions : []));
}

// How many days in a row up to now.
//
// Starting from YESTERDAY when today is empty is the part worth stating: a streak credited
// yesterday is still alive all through today — it dies at tomorrow's midnight, not at the moment
// you wake up. That is the same boundary the unified streak breaks on, so the two numbers can
// never tell contradictory stories about the same day.
function currentFrom(days) {
  const today = dayKey();
  let cursor;
  if (days.has(today)) cursor = today;
  else if (days.has(addDaysStr(today, -1))) cursor = addDaysStr(today, -1);
  else return 0;

  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDaysStr(cursor, -1);
  }
  return n;
}

// The longest run anywhere in the record. Sorted rather than walked from today, because the best
// run is usually not the current one.
function bestFrom(days) {
  const sorted = Array.from(days).sort();
  let best = 0, run = 0, prev = null;
  sorted.forEach((d) => {
    run = prev !== null && addDaysStr(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  });
  return best;
}

export function challengeStreak(db) {
  const days = countedDaySet(challengeLists(db));
  return { current: currentFrom(days), best: bestFrom(days) };
}

export function brainingStreak(brState) {
  const days = countedDaySet([brState ? brState.sessions : []]);
  return { current: currentFrom(days), best: bestFrom(days) };
}
