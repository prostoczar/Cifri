// Projects the app state into `daily_results` rows.
//
// This is the whole relationship between the two storage shapes: player_state stays the source
// of truth and keeps working exactly as it does, and these rows are DERIVED from it. Nothing
// here is a second, independent record that could drift out of agreement with the first — every
// value below is read out of the same session history the blob already carries.
//
// The point is what a future leaderboard has to do to find the top 10: read a sorted index,
// rather than download and parse every player's JSON.
//
// No game logic lives here. Which run counted for a day was already decided when it was played
// and stored on the session as `real`; this only reads that decision back out.

import { dayKey } from '../store/dates.js';

const DIFFS = ['easy', 'medium', 'hard'];

// The same rule the rest of the app uses: sessions saved before the flag existed count as real.
function isRecorded(s) {
  return s.real === true || typeof s.real === 'undefined';
}

function groupByDate(sessions) {
  const out = new Map();
  for (const s of sessions || []) {
    if (!s || !s.date) continue;
    if (!out.has(s.date)) out.set(s.date, []);
    out.get(s.date).push(s);
  }
  return out;
}

// Builds one row per player per day per mode per difficulty.
//
// `todayOnly` is the ordinary case: a player's past is already uploaded and does not change, so
// routine syncing rewrites only the day in progress. The full projection runs once, as a backfill.
export function projectDailyRows(state, { todayOnly = true } = {}) {
  const today = dayKey();
  const rows = [];

  // Streak values are only written onto TODAY's rows. `state.streak` is a single current value,
  // not a per-day history — stamping it onto past days would assert something that was never
  // measured. Backfilled days are left null instead, which is a gap a future query can see and
  // handle, rather than a wrong number it cannot detect.
  const streakFor = (day) => (day === today
    ? { streak: state.streak || 0, best_streak: state.bestStreakEver || 0 }
    : { streak: null, best_streak: null });

  // ── Challenge ────────────────────────────────────────────────────────────────
  for (const diff of DIFFS) {
    const bucket = (state.db && state.db[diff]) || { sessions: [] };
    for (const [day, sessions] of groupByDate(bucket.sessions)) {
      if (todayOnly && day !== today) continue;

      // The counting trial for a day, if there was one. Only the FIRST recorded run counts —
      // the same rule the game itself applies, since afterwards the day is already logged.
      const real = sessions.find(isRecorded);

      // Failing that, the day was practice only. The best of those is the representative score;
      // it is stored so the history is complete, but is_real=false keeps it out of any ranking.
      const chosen = real || sessions.reduce((b, s) => (b && b.score >= s.score ? b : s), null);
      if (!chosen || !Number.isFinite(chosen.score) || chosen.score < 0) continue;

      rows.push({
        day, mode: 'challenge', difficulty: diff,
        score: Math.round(chosen.score),
        time_sec: null, brain_age: null,
        is_real: !!real,
        ...streakFor(day),
      });
    }
  }

  // ── Braining ─────────────────────────────────────────────────────────────────
  // One tier only, so `difficulty` carries the constant 'standard' — the column is part of the
  // primary key and cannot be null.
  const brSessions = (state.brState && state.brState.sessions) || [];
  for (const [day, sessions] of groupByDate(brSessions)) {
    if (todayOnly && day !== today) continue;

    const real = sessions.find(isRecorded);
    // For Braining, lower is better, so the best practice run is the fastest one.
    const chosen = real || sessions.reduce((b, s) => (b && b.time <= s.time ? b : s), null);
    if (!chosen || !Number.isFinite(chosen.time) || chosen.time <= 0) continue;

    rows.push({
      day, mode: 'braining', difficulty: 'standard',
      score: null,
      time_sec: Math.round(chosen.time),
      brain_age: Number.isFinite(chosen.age) ? Math.round(chosen.age) : null,
      is_real: !!real,
      ...streakFor(day),
    });
  }

  return rows;
}
