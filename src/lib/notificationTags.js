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
// the reducer has already settled and converts it into an absolute timestamp. The sender then does
// nothing but compare that timestamp to the current time. It owns no rules at all.
//
// Being a pure function of state — no clock beyond `dayKey()`, no network, no browser — is what
// lets `scripts/check-notification-tags.mjs` drive the real reducer and assert that what we would
// tell OneSignal matches what the app itself believes. A rule that can be proved headlessly is
// the standard the rest of this codebase is held to.
//
// ── Why two tags, not ten ─────────────────────────────────────────────────────────────────────
//
// The OneSignal plan this app is on rejects a tag write outright once a user holds more tags than
// the plan allows — as a 409 that reads like an identity conflict but is actually billing
// (`entitlements-tag-limit`; see the notifications memory). Ten tags (streak, credited_until_ms,
// streak_deadline_ms, boost_expires_ms, restore_expires_ms, remind_hour, reminders, nudge_utc_hour,
// lang, tz) meant every write was refused wholesale, so nothing was ever deliverable. The design
// going forward is one nudge only — "play a session today to keep your streak going" — which needs
// exactly two facts: when to send it, and whether today is already done.
//
//   w — the hour (in UTC) and language to send in, packed into one exact-match string, e.g. "15en".
//       "" when the player has reminders off at all — OneSignal deletes a tag when it is set to the
//       empty string, so turning reminders off removes the tag rather than leaving a stale value an
//       old filter could still match.
//   c — credited_until_ms, see below. Still its own tag rather than folded into `w`, because the
//       sender needs to compare it numerically (`<` / `>`) and OneSignal tags are plain strings —
//       packing it into an exact-match string would make that comparison impossible.
//
// ── Why a timestamp rather than a date string, for `c` ────────────────────────────────────────
//
// The obvious tag would be `last_played_day: "2026-08-17"`, and it cannot work: a OneSignal
// segment compares a tag against a FIXED value, and "today" is not fixed. Storing the moment a
// thing expires turns the question into `now > x`, which is answerable at any hour without the
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

/**
 * The tag payload for a given app state. Pure: same state in, same tags out.
 *
 * Only two values, both short strings. Deliberately no username, no email, no score and no
 * question data — OneSignal is a delivery service, not somewhere the player's work is kept, and a
 * tag set that cannot identify anybody is one that cannot leak anybody.
 */
export function notificationTags(state) {
  const today = dayKey();
  const credited = state.streakCreditedForDay || null;

  // ── Has today been banked? ──
  // The end of the last credited day. `now >= this` means today is not credited yet, which is the
  // condition the nudge fires on. Works with no streak at all, or a broken one — anyone who has not
  // played today gets reminded, regardless of what their streak is doing.
  const creditedUntilMs = credited ? startOfDayMs(addDaysStr(credited, 1)) : 0;

  // `settings` can arrive without `notif` at all: loading does `Object.assign(base, parsed)`, so
  // saved data written before this field existed replaces the default object wholesale rather than
  // merging into it. Every reader has to tolerate `undefined`, this one included.
  const notif = (state.settings && state.settings.notif) || {};
  const lang = (state.settings && state.settings.lang) || 'en';
  const hour = typeof notif.hour === 'number' ? notif.hour : 19;

  return {
    // OneSignal tag names, not descriptive keys — kept short because they are what actually ships
    // as the tag. `c` = credited_until_ms: `now >= c` means today is not banked yet.
    c: creditedUntilMs,
    // `w` = the chosen local hour, converted to UTC (the sender compares in UTC), packed with the
    // language into one exact-match value. Empty string when reminders are off, which is how
    // OneSignal is told to forget the tag rather than match a stale one.
    w: notif.enabled ? String(localHourToUtcHour(today, hour)) + lang : '',
  };
}
