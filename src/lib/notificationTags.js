// What the notification sender is allowed to know about a player.
//
// ── Why this file is pure, and why it is not in the reducer ────────────────────────────────────
//
// A scheduled job that decided for itself whether a streak was about to break would be a SECOND
// implementation of the streak rule. CLAUDE.md warns about the three places a day's score is
// computed disagreeing; this is the same trap one room over, and it fails the same quiet way —
// nobody sees a crash, a player just gets told their streak is safe on the evening it dies.
//
// So the rule stays where it already lives, in the reducer, and this file only *reads* the state
// the reducer has already settled and converts it into absolute timestamps. The sender then does
// nothing but compare those timestamps to the current time. It owns no rules at all.
//
// Being a pure function of state — no clock beyond `dayKey()`, no network, no browser — is what
// lets `scripts/check-notification-tags.mjs` drive the real reducer and assert that what we would
// tell OneSignal matches what the app itself believes. A rule that can be proved headlessly is
// the standard the rest of this codebase is held to.
//
// ── Why timestamps rather than date strings ───────────────────────────────────────────────────
//
// The obvious tag would be `last_played_day: "2026-08-17"`, and it cannot work: a OneSignal
// segment compares a tag against a FIXED value, and "today" is not fixed. Storing the moment a
// thing expires turns every question into `now > x`, which is answerable at any hour without the
// sender knowing a single game rule.
//
// It also makes the timezone correct by construction. Day boundaries here are LOCAL — `dayKey()`
// and the midnight countdown both are — so a deadline computed on the player's own device already
// carries their timezone inside it. A server deriving the same deadline from a date string would
// have to guess where they are.
//
// The known cost: a player who flies to another timezone keeps the deadline their old device
// computed, so a nudge can land a few hours early or late until they next open the app. Wrong by
// hours on a rare event, versus wrong for everyone every day if the server guessed — an easy
// trade, but a real one, so it is written down rather than discovered later.

import { dayKey, addDaysStr, dateStrToDate } from '../store/dates.js';

// Absolute ms for local midnight at the START of `dateStr`. `dateStrToDate` builds a local-time
// Date from the parts, so this is midnight where the player is, not UTC.
function startOfDayMs(dateStr) {
  return dateStrToDate(dateStr).getTime();
}

// A local hour on a given day, expressed as the UTC hour it actually falls on. Built from a real
// local-time Date so the platform applies whatever offset — including a half-hour one like India's
// — rather than this doing arithmetic that assumes whole hours.
function localHourToUtcHour(dateStr, hour) {
  const d = dateStrToDate(dateStr);
  d.setHours(hour, 0, 0, 0);
  return d.getUTCHours();
}

// How long a restore offer stands. Mirrors the 24-hour window enforced in App.jsx, which is the
// only place that expires one. Duplicated as a constant rather than imported because App.jsx is a
// component module; if that window ever changes, `check:notify` fails and points here.
const RESTORE_WINDOW_MS = 24 * 3600 * 1000;

/**
 * The tag payload for a given app state. Pure: same state in, same tags out.
 *
 * Every value is a number or a short string. Deliberately no username, no email, no score and no
 * question data — OneSignal is a delivery service, not somewhere the player's work is kept, and a
 * tag set that cannot identify anybody is one that cannot leak anybody.
 */
export function notificationTags(state) {
  const today = dayKey();
  const credited = state.streakCreditedForDay || null;
  const streak = state.streak || 0;

  // ── Has today been banked? ──
  // The end of the last credited day. `now >= this` means today is not credited yet, which is the
  // condition behind the plain daily reminder. Works at streak 0 too — someone who has never
  // played, or whose streak just broke, still gets reminded.
  const creditedUntilMs = credited ? startOfDayMs(addDaysStr(credited, 1)) : 0;

  // ── When does the streak actually die? ──
  // The reducer breaks a streak when today is PAST the day after `streakCreditedForDay` and that
  // day had nothing played. So the day after the last credited day is still savable, and the
  // streak dies at the end of it — two days on from the credited one. Only a live streak has a
  // deadline; a streak of zero has nothing left to lose.
  const streakDeadlineMs = streak > 0 && credited ? startOfDayMs(addDaysStr(credited, 2)) : 0;

  // ── An unspent Braining boost ──
  // Spending the boost sets `brBoostDay` to null, so a value equal to today means one is sitting
  // there unspent. It dies at local midnight along with the day it belongs to.
  const boostExpiresMs = state.brBoostDay && state.brBoostDay === today ? startOfDayMs(addDaysStr(today, 1)) : 0;

  // ── A restore offer going to waste ──
  // Only worth a notification if it can actually be taken. `availableAtBreak` false means the
  // player had already spent their one restore, and the modal offers nothing but starting over —
  // telling them to hurry would be telling them to hurry towards a button that does not exist.
  const pr = state.pendingRestore;
  const restoreExpiresMs = pr && pr.availableAtBreak && pr.brokenAtMs ? pr.brokenAtMs + RESTORE_WINDOW_MS : 0;

  // `settings` can arrive without `notif` at all: loading does `Object.assign(base, parsed)`, so
  // saved data written before this field existed replaces the default object wholesale rather than
  // merging into it. Every reader has to tolerate `undefined`, this one included.
  const notif = (state.settings && state.settings.notif) || {};

  const hour = typeof notif.hour === 'number' ? notif.hour : 19;

  return {
    streak,
    credited_until_ms: creditedUntilMs,
    streak_deadline_ms: streakDeadlineMs,
    boost_expires_ms: boostExpiresMs,
    restore_expires_ms: restoreExpiresMs,
    // The hour the player chose, and whether they want a reminder at all. Carried as tags so the
    // sender needs no database row to know when to send — which is what lets a guest, who has no
    // row anywhere, be reminded exactly like anyone else.
    remind_hour: hour,
    reminders: notif.enabled ? '1' : '0',
    // The same hour expressed in UTC, and the tag the sender actually filters on.
    //
    // Without it, an hourly job would have to work out which players are currently at their chosen
    // LOCAL hour — which means knowing every subscriber's timezone and fanning out one send per
    // offset, around forty calls an hour. The device already knows its own offset, so it converts
    // once and the job becomes a single filter: "whose hour is it right now?"
    //
    // Recomputed on every publish, so a player who moves timezone or crosses a daylight-saving
    // boundary is corrected the next time they open the app. Until then their reminder can be an
    // hour out — the cost of the device owning the conversion, and much the smaller error than a
    // server guessing where everybody is.
    nudge_utc_hour: localHourToUtcHour(today, hour),
    // Which language to send in. The app is bilingual and a reminder in the wrong one is worse
    // than no reminder. Defaults to English only when nothing has been chosen.
    lang: (state.settings && state.settings.lang) || 'en',
  };
}
