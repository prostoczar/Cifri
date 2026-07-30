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
  // Unlocked milestones
  'milestones',
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
