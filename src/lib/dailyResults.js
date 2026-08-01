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
// No game logic lives here. Which runs counted for a day was already decided when they were
// played and stored on each session as `real`; this only reads those decisions back out and
// summarises them — for Challenge, into the average and the count and sum behind it.

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
  //
  // A day's score is the AVERAGE of that day's counting runs, and `attempt_count`/`score_sum`
  // are the two numbers it is derived from. Sending those rather than the individual scores is
  // what keeps one row per day the whole story however often somebody plays: a fifth play is a
  // count of 5 and a bigger sum, never a fifth row.
  //
  // Averaging only the COUNTING runs is also what makes this safe to run over a player's whole
  // history. Days played under the old rule hold exactly one counting run and a pile of practice
  // runs, so their average is that single score and their count is 1 — identical to what was
  // already stored for them. No past day's score moves because the rule changed.
  for (const diff of DIFFS) {
    const bucket = (state.db && state.db[diff]) || { sessions: [] };
    for (const [day, sessions] of groupByDate(bucket.sessions)) {
      if (todayOnly && day !== today) continue;

      const counted = sessions.filter(isRecorded).filter((s) => Number.isFinite(s.score) && s.score >= 0);

      if (counted.length) {
        const sum = counted.reduce((a, s) => a + Math.round(s.score), 0);
        rows.push({
          day, mode: 'challenge', difficulty: diff,
          score: Math.round(sum / counted.length),
          attempt_count: counted.length,
          score_sum: sum,
          time_sec: null, brain_age: null,
          is_real: true,
          ...streakFor(day),
        });
        continue;
      }

      // Nothing counted that day — under the old model, a day of practice with the real trial
      // never played. Kept so the history has no holes, with the best run standing for the day
      // and is_real=false keeping it out of any ranking. The count and sum still have to be
      // filled in because the table now requires them of every Challenge row; describing one
      // representative run as "1 attempt" is the honest reading of a day that never counted.
      const best = sessions.reduce((b, s) => (b && b.score >= s.score ? b : s), null);
      if (!best || !Number.isFinite(best.score) || best.score < 0) continue;

      rows.push({
        day, mode: 'challenge', difficulty: diff,
        score: Math.round(best.score),
        attempt_count: 1,
        score_sum: Math.round(best.score),
        time_sec: null, brain_age: null,
        is_real: false,
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
      // Explicitly null, for two reasons. Braining keeps its one-official-trial rule and has no
      // average to report — the database now REFUSES a Braining row that carries these, which is
      // the guard rail against the new rule leaking across modes. And the upload sends rows in
      // batches, which requires every row in a batch to name the same columns, so they have to be
      // stated rather than left out.
      attempt_count: null,
      score_sum: null,
      time_sec: Math.round(chosen.time),
      brain_age: Number.isFinite(chosen.age) ? Math.round(chosen.age) : null,
      is_real: !!real,
      ...streakFor(day),
    });
  }

  return rows;
}
