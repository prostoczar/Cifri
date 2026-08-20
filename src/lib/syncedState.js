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
