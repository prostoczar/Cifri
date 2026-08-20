// What signing out does to the device — the two outcomes, and the line between them.
//
// A sign-out either wipes this device or leaves it exactly as it was, and getting that backwards
// is silent in both directions:
//
//   wiped when it should not have been  → a player's history is deleted off the only device
//                                         holding it. Nothing throws; the data is simply gone.
//   left when it should have been wiped → the next nickname on this phone inherits the last
//                                         account's streak, scores and achievements and looks
//                                         like a veteran on day one. That was the live bug.
//
// The decision itself — "does the server already hold everything here?" — is confirmProgressSaved()
// in AppStateContext, and it needs a live session and a network, so it cannot run here. What CAN be
// pinned down headlessly is the half that actually mutates the device: given that answer, does the
// reducer do the right thing? So this drives the real reducer with `wipeProgress` both ways.
//
// The list of what gets wiped is derived from SYNCED_KEYS rather than restated, so the interesting
// case is a NEW synced key added later: it must be reset by a wipe automatically, or fail here.
//
// Run it with:  npm run check:signout

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { reducer, defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const { SYNCED_KEYS, KEEP_ON_SIGN_OUT, signOutResetKeys } = await server.ssrLoadModule('/src/lib/syncedState.js');

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const key = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };

// A signed-in account with a real history behind it — the state that made the bug visible. Every
// field here is something the next player must NOT inherit.
function veteran() {
  const base = defaultState();
  return {
    ...base,
    acctCreated: true,
    acctData: { email: 'someone@example.com', fullName: 'Someone Real' },
    username: 'someone',
    avatar: { type: 'icon', value: 'rocket', color: 'green', size: 55, customized: true },
    db: {
      easy: { sessions: [{ date: ago(1), score: 510, real: true }], best: 510, lastDay: ago(1) },
      medium: { sessions: [{ date: ago(2), score: 320, real: true }], best: 320, lastDay: ago(2) },
      hard: { sessions: [], best: 0, lastDay: null },
    },
    brState: { sessions: [{ date: ago(1), age: 27, time: 240, real: true }], lastDay: ago(1), bestTime: 240, bestAge: 27 },
    streak: 9,
    bestStreakEver: 14,
    streakCreditedForDay: ago(1),
    streakLastCheckedDay: ago(1),
    milestones: { ...base.milestones, achievedLog: ['first_challenge', 'streak_7'], trickCount: 6 },
    trickStats: { ...base.trickStats, practiceDone: { '0-0': 3 }, testPassed: ['0-0'] },
    totdLastViewed: ago(1),
    firstOpenDate: ago(40),
    tutorialShown: true,
    brBoostDay: ago(1),
    // Device-scoped, and deliberately NOT the account's to take away.
    settings: { sound: false, dark: true, fontSize: 'large', lang: 'ru', notif: { enabled: true, hour: 8 } },
    notifAskedDay: ago(3),
    // Guest-conversion flags, left over from before this player signed up.
    savePromptShown: true,
    anyGuestPromptDismissed: true,
    guestBannerLastShownDay: ago(2),
  };
}

const rows = [];
let failed = 0;
const check = (group, name, ok, detail) => {
  if (!ok) failed++;
  rows.push({ group, name, verdict: ok ? 'ok' : 'FAIL', detail: detail || '' });
};

const fresh = defaultState();
const before = veteran();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── The upload could not be confirmed: nothing may be touched ────────────────────────────────
//
// This is the offline sign-out, and it is the dangerous direction. The account identity goes, but
// every scrap of progress has to survive — it is the only copy in existence.
{
  const after = reducer(before, { type: 'ACCOUNT_SIGNED_OUT', wipeProgress: false });

  check('unconfirmed', 'signed out', after.acctCreated === false && after._loggedOut === true);
  check('unconfirmed', 'account details cleared', after.acctData.email === '' && after.acctData.fullName === '');

  const kept = SYNCED_KEYS.filter((k) => same(after[k], before[k]));
  check('unconfirmed', 'all ' + SYNCED_KEYS.length + ' synced keys survive', kept.length === SYNCED_KEYS.length,
    kept.length === SYNCED_KEYS.length ? '' : 'lost: ' + SYNCED_KEYS.filter((k) => !kept.includes(k)).join(' '));
  check('unconfirmed', 'username and avatar survive', after.username === before.username && same(after.avatar, before.avatar));
  check('unconfirmed', 'the 9-day streak survives', after.streak === 9 && after.bestStreakEver === 14);
}

// ── The upload was confirmed: the device starts over ─────────────────────────────────────────
{
  const after = reducer(before, { type: 'ACCOUNT_SIGNED_OUT', wipeProgress: true });

  check('wiped', 'signed out', after.acctCreated === false && after._loggedOut === true);
  check('wiped', 'account details cleared', after.acctData.email === '' && after.acctData.fullName === '');

  // The derived list is the point: a synced key added later and forgotten shows up here.
  const stale = signOutResetKeys().filter((k) => !same(after[k], fresh[k]));
  check('wiped', 'every synced key back to default', stale.length === 0,
    stale.length ? 'still carrying: ' + stale.join(' ') : signOutResetKeys().length + ' keys');

  check('wiped', 'no streak inherited', after.streak === fresh.streak && after.bestStreakEver === fresh.bestStreakEver,
    'streak ' + after.streak + ', best ' + after.bestStreakEver);
  check('wiped', 'no achievements inherited', same(after.milestones, fresh.milestones));
  check('wiped', 'no scores inherited', same(after.db, fresh.db) && same(after.brState, fresh.brState));
  check('wiped', 'no trick history inherited', same(after.trickStats, fresh.trickStats));
  check('wiped', 'name and avatar cleared', after.username === fresh.username && same(after.avatar, fresh.avatar));
  check('wiped', 'guest prompts reset', after.savePromptShown === fresh.savePromptShown
    && after.anyGuestPromptDismissed === fresh.anyGuestPromptDismissed
    && after.guestBannerLastShownDay === fresh.guestBannerLastShownDay);

  // The two deliberate survivors, each for its own reason.
  check('wiped', 'device settings survive', same(after.settings, before.settings),
    'lang ' + after.settings.lang + ', dark ' + after.settings.dark + ', size ' + after.settings.fontSize);
  check('wiped', 'notifAskedDay survives (a Block cannot be un-spent)', after.notifAskedDay === before.notifAskedDay);

  // The headline: a wiped device has to be indistinguishable from one the app has never run on.
  // Compared against a genuinely fresh state across every key a new player could notice.
  const visible = [...signOutResetKeys(), 'username', 'avatar', 'savePromptShown', 'anyGuestPromptDismissed'];
  const differs = visible.filter((k) => !same(after[k], fresh[k]));
  check('wiped', 'reads as a brand-new install', differs.length === 0,
    differs.length ? 'differs at: ' + differs.join(' ') : visible.length + ' keys compared');
}

// ── The boundary itself ──────────────────────────────────────────────────────────────────────
//
// KEEP_ON_SIGN_OUT is what stops the derived list from wiping everything. If it ever grew to
// cover progress, the wipe would quietly stop wiping and the original bug would be back.
{
  check('boundary', 'keep-list holds only device preferences', same(KEEP_ON_SIGN_OUT, ['settings']),
    'keeping: ' + KEEP_ON_SIGN_OUT.join(' '));
  check('boundary', 'reset list is the rest of SYNCED_KEYS',
    signOutResetKeys().length === SYNCED_KEYS.length - KEEP_ON_SIGN_OUT.length,
    signOutResetKeys().length + ' of ' + SYNCED_KEYS.length);
  // Absent `wipeProgress` entirely — an older call site, or a new one that forgets it — must fall
  // to the safe side rather than deleting anything.
  const after = reducer(before, { type: 'ACCOUNT_SIGNED_OUT' });
  check('boundary', 'a missing wipeProgress keeps the data', after.streak === 9 && same(after.db, before.db));
}

const w = (s, n) => String(s).padEnd(n);
console.log('\nSign-out');
console.log(w('case', 14) + w('rule', 52) + w('verdict', 9) + 'detail');
console.log('-'.repeat(120));
for (const r of rows) console.log(w(r.group, 14) + w(r.name, 52) + w(r.verdict, 9) + r.detail);

console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + rows.length + ' checks passed');
await server.close();
process.exit(failed ? 1 : 0);
