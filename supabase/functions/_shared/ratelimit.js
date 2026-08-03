// How often a player may ask for questions.
//
// The thing being rate limited is not really requests — it is DICE ROLLS. Every set is a fresh
// random draw, so without a cap the cheapest attack on the whole design needs no code at all:
// ask for sets until one looks easy, and play that one. Capping the rate makes fishing for a
// favourable set cost more time than simply playing.
//
// Submissions need no cap of their own. A submission requires a live set, a set is single-use,
// and only one can be live at a time, so the ceiling on submissions is already the ceiling on
// issues. Limiting the one limits the other.
//
// Pure, like everything else in _shared: the caller counts the rows and this decides what the
// counts mean, which is what lets check-anticheat.mjs drive the real rule.

// Enough headroom that nobody playing normally will ever see it. A Challenge run takes a minute
// plus a result screen, so a genuine player asks for two or three sets a minute at the very most
// — and that is somebody replaying as fast as the game physically allows.
export const ISSUES_PER_MINUTE = 10;

// A day's ceiling, per mode. Two hundred Challenge runs is three and a half hours of unbroken
// play; nobody reaches it by accident, and somebody who does is not being stopped from playing,
// only from being ranked on the far side of it.
export const CHALLENGE_ISSUES_PER_DAY = 200;

// Braining is one counting trial a day, and practice runs never need a server set at all. Ten
// leaves room for retries after a dropped connection and is otherwise unreachable.
export const BRAINING_ISSUES_PER_DAY = 10;

export const RATE_WINDOW_MS = 60 * 1000;

export function dailyCapFor(mode) {
  return mode === 'braining' ? BRAINING_ISSUES_PER_DAY : CHALLENGE_ISSUES_PER_DAY;
}

// `recentCount` is how many sets this player was issued in the last RATE_WINDOW_MS; `todayCount`
// is how many in this mode today. Returns null when the request is allowed, or a verdict naming
// which ceiling was reached and how long to wait.
export function checkIssueRate({ mode, recentCount, todayCount }) {
  if (recentCount >= ISSUES_PER_MINUTE) {
    return { ok: false, code: 'rate_limited_per_minute', retryAfterSec: 60 };
  }
  if (todayCount >= dailyCapFor(mode)) {
    // No retry hint: the answer is tomorrow, and saying "86400 seconds" would be a worse way of
    // saying so than saying nothing.
    return { ok: false, code: 'rate_limited_per_day', retryAfterSec: null };
  }
  return null;
}

// The day a set claims has to be a day it could plausibly be. It comes from the device, because
// the app's day boundary is local midnight rather than UTC's — but that is a reason to accept a
// timezone's worth of slack, not a reason to accept 2019.
//
// Without this, a submission could be filed against any date at all, and an old day's row could
// be inflated long after anyone would think to look at it.
export function isPlausibleDay(dayStr, nowMs) {
  if (typeof dayStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) return false;
  const day = Date.parse(dayStr + 'T00:00:00Z');
  if (!Number.isFinite(day)) return false;
  // A full day either side of UTC covers every real timezone, which run from UTC−12 to UTC+14.
  const dayMs = 24 * 60 * 60 * 1000;
  const todayUtc = Math.floor(nowMs / dayMs) * dayMs;
  return Math.abs(day - todayUtc) <= dayMs;
}
