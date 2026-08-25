// Which parts of the app state belong to the account, and which stay on the device.
//
// Kept in one place so the upload (signup / ongoing sync) and the download (login on a new
// device) can never disagree about what "your progress" means.

// Everything that follows the player between devices. This is deliberately the game- and
// preference-related state only.
export const SYNCED_KEYS = [
  // Challenge + Braining history and bests
  'db',
  'brState',
  // The unified streak, including its restore state
  'streak',
  'streakCreditedForDay',
  'streakRestoreAvailable',
  'streakLastCheckedDay',
  'pendingRestore',
  'bestStreakEver',
  // The unspent Braining boost. Synced so finishing Braining on a phone and then playing
  // Challenge on a laptop still spends it — a boost that only existed on the device that earned
  // it would make where you played matter, which is exactly what accounts exist to stop.
  'brBoostDay',
  // Unlocked achievements (still called `milestones` in saved data — see store/achievements.js)
  'milestones',
  // Per-trick practice counts, test counts and which tests have been passed. Synced because
  // Graduation is earned across all 47 tricks and a player may work through them on two devices.
  'trickStats',
  // Dark mode, font size, language, sound
  'settings',
  // Small view preferences — cheap to carry and annoying to lose
  'selDiff',
  'chRange',
  'brChartRange',
  'brChartType',
  'totdLastViewed',
  // Onboarding history, so a returning player is not re-tutorialised on a new device
  'tutorialShown',
  'firstOpenDate',
];

// Which SYNCED_KEYS are something a player DID — history that cannot be recreated if lost —
// versus a device/view preference that costs little to lose. Used only by hasUnsyncedProgress()
// below, to decide, when two devices' writes to player_state collide, whether the write that
// lost the race was worth defending or safe to drop in favor of whatever the other device left
// on the server. (streak, streakCreditedForDay and streakRestoreAvailable are deliberately not
// here even though they are real state — see the comment on hasUnsyncedProgress below.)
export const PROGRESS_KEYS = [
  'db', 'brState',
  'streak', 'streakCreditedForDay', 'streakRestoreAvailable', 'pendingRestore', 'bestStreakEver',
  'brBoostDay',
  'milestones',
  'trickStats',
];

function sessionKey(s) {
  return s.attemptId || `${s.date}|${s.score ?? s.time}|${s.correct ?? s.age}`;
}
// True when `localList` has a session `freshList` does not — matched by attemptId where present,
// falling back to date+score+correct (or date+time+age for Braining) for older saved sessions
// that predate attemptId.
function hasNewSessions(localList, freshList) {
  const freshKeys = new Set((freshList || []).map(sessionKey));
  return (localList || []).some((s) => !freshKeys.has(sessionKey(s)));
}
function hasNewInArray(localArr, freshArr) {
  const freshSet = new Set(freshArr || []);
  return (localArr || []).some((x) => !freshSet.has(x));
}
// True when `localMap` has a higher count than `freshMap` for at least one key — used for
// practice/test attempt counters, where only a count going UP is something local did.
function hasHigherCount(localMap, freshMap) {
  return Object.entries(localMap || {}).some(([k, v]) => (v || 0) > ((freshMap || {})[k] || 0));
}

// True when `local` holds progress that `fresh` (a payload just downloaded from the server)
// does not — the case a sync conflict must never resolve by quietly taking `fresh` over it.
//
// Deliberately NOT "the two payloads differ on a PROGRESS_KEYS field": that would also fire the
// other way round, when `fresh` is the one ahead — exactly the case a device that lost a write
// race is in, sitting on an empty `db` while the fresh copy already holds the run that beat it
// there. Comparing for mere inequality would make THAT look like local progress worth defending
// and cause a second, now-successful overwrite of the very history this function exists to
// protect — a real bug caught by a live two-device repro, not a hypothetical. So every field
// below is checked in the one direction that actually means "local did something fresh missed":
// a session id fresh doesn't have, an achievement or trick-pass fresh doesn't have, a count that
// went up, a personal best that improved. The reverse direction is never progress lost — it is
// simply picked up when `fresh` is adopted.
//
// streak / streakCreditedForDay / streakRestoreAvailable are deliberately not compared here even
// though they are in PROGRESS_KEYS: they are pure functions of db/brState history plus the
// calendar date (see CHECK_STREAK_BREAK's own comment on why re-deriving them is always safe),
// so once db and brState are reconciled correctly, re-running that check after adopting `fresh`
// reproduces them without needing an independent, harder-to-get-right comparison of its own.
export function hasUnsyncedProgress(local, fresh) {
  const l = local || {};
  const f = fresh || {};
  const lDb = l.db || {};
  const fDb = f.db || {};
  for (const diff of ['easy', 'medium', 'hard']) {
    if (hasNewSessions((lDb[diff] || {}).sessions, (fDb[diff] || {}).sessions)) return true;
  }
  if (hasNewSessions(l.brState?.sessions, f.brState?.sessions)) return true;
  if (hasNewInArray(l.milestones?.achievedLog, f.milestones?.achievedLog)) return true;
  if (hasNewInArray(l.trickStats?.testPassed, f.trickStats?.testPassed)) return true;
  if (hasHigherCount(l.trickStats?.practiceDone, f.trickStats?.practiceDone)) return true;
  if (hasHigherCount(l.trickStats?.testDone, f.trickStats?.testDone)) return true;
  if ((l.bestStreakEver || 0) > (f.bestStreakEver || 0)) return true;
  // One-shot flags: only defend a value THIS device set that fresh has not recorded. Adopting a
  // value fresh already has and local lacks is not a loss, it is just picking it up.
  if (l.brBoostDay && l.brBoostDay !== f.brBoostDay) return true;
  if (l.pendingRestore && JSON.stringify(l.pendingRestore) !== JSON.stringify(f.pendingRestore)) return true;
  return false;
}

// Deliberately NOT synced:
//   username / avatar        — they live in the `profiles` table instead
//   acctData                 — the password field disappears entirely under real auth
//   acctCreated / _loggedOut — derived from whether a real session exists
//   guest-conversion flags   — only ever read while `!acctCreated`, so meaningless on an account
//   anything starting with _ — transient per-render values (_lastSessionResult and friends)

// What stays on the device when an account signs out. Everything else in SYNCED_KEYS goes.
//
// Derived from SYNCED_KEYS rather than written out as its own list, so a new piece of synced
// progress cannot be added later and then quietly survive a sign-out. If it belongs to the
// account — which is what putting it in SYNCED_KEYS says — then it leaves with the account.
//
// `settings` is the one exception, and it is a real one: dark mode, text size and language
// describe the phone in someone's hand, not the person holding it. Flipping a Russian speaker's
// app back to English because they signed out would be a bug wearing a privacy feature's costume.
export const KEEP_ON_SIGN_OUT = ['settings'];

export function signOutResetKeys() {
  return SYNCED_KEYS.filter((k) => !KEEP_ON_SIGN_OUT.includes(k));
}

// The payload to store on the server for this state.
export function toSyncPayload(state) {
  const out = {};
  for (const k of SYNCED_KEYS) {
    if (state[k] !== undefined) out[k] = state[k];
  }
  return out;
}

// The patch to apply locally when progress is downloaded. Filtered through SYNCED_KEYS on the
// way back in too, so a malformed or outdated server row can never inject unexpected keys
// (least of all a `_`-prefixed one) into the store.
export function fromSyncPayload(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const k of SYNCED_KEYS) {
    if (data[k] !== undefined) out[k] = data[k];
  }
  return out;
}

// True when two payloads are identical, used to skip pointless network writes. Key order is
// stable because both sides are built by iterating SYNCED_KEYS.
export function sameSyncPayload(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
