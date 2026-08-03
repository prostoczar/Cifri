// Does the streak actually break when real time has passed?
//
// The streak is the retention mechanic, so a streak that survives an absence is not a cosmetic
// bug — it is the app lying about the one number players care most about. This walks every way an
// account can be picked up again (fresh device, same device, a stale local copy, a device carrying
// unsynced play) crossed with every gap length, and checks the rule that matters:
//
//   if nothing was played on the day after the last credited day, the streak is gone.
//
// It drives the REAL reducer through the REAL dispatch sequences the app performs on load, rather
// than re-implementing them here — a test that agreed with a private copy of the logic would prove
// nothing about the app.
//
// Run it with:  npm run check:streak

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { reducer, defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const { fromSyncPayload, toSyncPayload } = await server.ssrLoadModule('/src/lib/syncedState.js');

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const key = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };
const today = key(new Date());

// An account that last played `gap` days ago, with `streak` days banked at that point.
function playedDaysAgo(gap, streak) {
  return {
    ...defaultState(),
    db: {
      easy: { sessions: [{ date: ago(gap), score: 510, real: true }], best: 510, lastDay: ago(gap) },
      medium: { sessions: [], best: 0, lastDay: null },
      hard: { sessions: [], best: 0, lastDay: null },
    },
    brState: { sessions: [], lastDay: null, bestTime: null, bestAge: null },
    streak,
    streakCreditedForDay: ago(gap),
    // The day the break check last ran. On a device that was closed right after playing, this is
    // the day it was played. A device that was merely OPENED on a later day carries that day here
    // instead, which is the interesting case: it is what decides whether the guard skips the check.
    streakLastCheckedDay: ago(gap),
    bestStreakEver: streak,
    acctCreated: true,
    username: 'p',
  };
}

// The three ways the app loads an account, expressed as the dispatch sequence each one performs.
// Taken from AppStateContext's mount effect + adopt(), and from App.jsx's handleLogin.
const LOADS = {
  // Already signed in, opening the app. Mount check runs first against the local copy, then the
  // download lands. `deviceIsAhead` decides whether the server's progress is applied at all.
  'adopt (device behind)': (local, serverPayload) => {
    let s = reducer(local, { type: 'CHECK_STREAK_BREAK' });
    s = reducer(s, { type: 'ACCOUNT_LOADED', username: 'p', email: 'e', fullName: '', avatar: null, synced: fromSyncPayload(serverPayload) });
    return reducer(s, { type: 'CHECK_STREAK_BREAK' });
  },
  'adopt (device ahead — server withheld)': (local) => {
    let s = reducer(local, { type: 'CHECK_STREAK_BREAK' });
    s = reducer(s, { type: 'ACCOUNT_LOADED', username: 'p', email: 'e', fullName: '', avatar: null, synced: {} });
    return reducer(s, { type: 'CHECK_STREAK_BREAK' });
  },
  // Typing a password into the login screen. Same two dispatches, but the local state it lands on
  // is whatever this device happened to be holding — often a blank guest.
  'login on a fresh device': (local, serverPayload) => {
    let s = reducer({ ...defaultState() }, { type: 'CHECK_STREAK_BREAK' });
    s = reducer(s, { type: 'ACCOUNT_LOADED', username: 'p', email: 'e', fullName: '', avatar: null, synced: fromSyncPayload(serverPayload) });
    return reducer(s, { type: 'CHECK_STREAK_BREAK' });
  },
  // Logged out, played as a guest today, then logged back in. The device's own check has already
  // run today, so the guard on `streakLastCheckedDay` is live when the account's copy arrives.
  'login after playing as a guest today': (local, serverPayload) => {
    const guest = { ...defaultState(), streakLastCheckedDay: today, streak: 1, streakCreditedForDay: today };
    let s = reducer(guest, { type: 'CHECK_STREAK_BREAK' });
    s = reducer(s, { type: 'ACCOUNT_LOADED', username: 'p', email: 'e', fullName: '', avatar: null, synced: fromSyncPayload(serverPayload) });
    return reducer(s, { type: 'CHECK_STREAK_BREAK' });
  },
};

// Playing a counting Challenge run, which is what reveals a streak that only LOOKS broken.
function playChallenge(s) {
  return reducer(s, {
    type: 'CHALLENGE_SESSION_COMPLETE',
    reqId: 1, diff: 'easy', score: 50, isPrac: false, correct: 8, wrong: 1,
    origin: 'challenge', opTimes: null, breakdown: null, lang: 'en',
  });
}

let failed = 0;
const rows = [];

for (const gap of [1, 2, 3, 7, 30]) {
  const streak = 9;
  // A gap of 1 means "played yesterday" — the streak is alive and today is still available.
  // Anything more means a whole day went by untouched, and the streak is gone.
  const shouldBreak = gap >= 2;

  for (const [loadName, load] of Object.entries(LOADS)) {
    // What the account holds on the server, and what this device holds locally. Both describe the
    // same last-played day; they differ only in having been written by different devices.
    const account = playedDaysAgo(gap, streak);
    const serverPayload = toSyncPayload(account);

    // The local copy carries an extra wrinkle worth covering: a device that was OPENED today
    // before the account loaded has already stamped today as checked.
    for (const localVariant of ['closed since', 'opened today']) {
      const local = localVariant === 'closed since'
        ? account
        : { ...account, streakLastCheckedDay: today };

      const after = load(local, serverPayload);
      const streakOk = shouldBreak ? after.streak === 0 : after.streak === streak;

      // And then they play. A break that gets undone by the first game is not a break.
      const played = playChallenge(after);
      const wantAfterPlay = shouldBreak ? 1 : streak + 1;
      const playOk = played.streak === wantAfterPlay;

      const ok = streakOk && playOk;
      if (!ok) failed++;
      rows.push({
        gap, load: loadName, local: localVariant,
        wanted: (shouldBreak ? 'break to 0' : 'hold at ' + streak) + ', then ' + wantAfterPlay + ' after playing',
        got: 'streak ' + after.streak + ', then ' + played.streak,
        verdict: ok ? 'ok' : 'FAIL',
      });
    }
  }
}

const w = (s, n) => String(s).padEnd(n);
console.log(w('gap', 5) + w('load path', 42) + w('local copy', 15) + w('wanted', 42) + w('got', 26) + 'verdict');
console.log('-'.repeat(136));
for (const r of rows) {
  console.log(w(r.gap + 'd', 5) + w(r.load, 42) + w(r.local, 15) + w(r.wanted, 42) + w(r.got, 26) + r.verdict);
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + rows.length + ' checks passed');
await server.close();
process.exit(failed ? 1 : 0);
