// Do the tags SURVIVE the moments that change who this subscription belongs to?
//
// `check:notify` asks whether the tags say the right thing. This asks whether anybody is still
// holding them afterwards, which is a different question and the one that was actually wrong.
//
// The bug it exists to prevent, found on a real phone on 25 August 2026: tags belong to the
// OneSignal USER, not to the subscription, and `login()` moves the subscription to a different
// user without carrying tags across. App.jsx publishes tags from a mount effect; the login waits
// on getSession(), which is asynchronous and therefore always lands second. So every launch wrote
// a full set of tags and then abandoned the user holding them. Permission stayed granted and the
// subscription stayed healthy — a notification sent by hand arrived perfectly well — but every
// automated campaign filters on tags, and the user those filters read had none.
//
// Nothing threw. `lastError` was null. This is the second bug in this file whose entire symptom
// was "tags silently absent" (the first was init being queued after addTags), which is why the
// ordering is now asserted rather than reasoned about.
//
// The fake SDK below MODELS THAT BEHAVIOUR: its login() and logout() both wipe the tag bag, the
// way OneSignal really does. That is the whole point — a stub that kept tags across login would
// pass while the app was broken.
//
// Run it with:  npm run check:notify-identity

import { createServer } from 'vite';

// notifications.js is a no-op without an App ID, and a no-op module would pass every check below
// while proving nothing. Set before Vite starts so import.meta.env carries it.
process.env.VITE_ONESIGNAL_APP_ID = process.env.VITE_ONESIGNAL_APP_ID || 'check-app-id';

// The module reaches for browser globals at import time and inside loadSdk(). None of them may
// touch the network: the fake SDK below is the only OneSignal this check ever sees.
globalThis.window = { OneSignalDeferred: undefined };
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ addEventListener() {}, setAttribute() {} }),
  head: { appendChild() {} },
};
// Node 24 defines `navigator` as a getter-only global, so it has to be replaced rather than assigned.
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node', maxTouchPoints: 0, serviceWorker: {} },
  configurable: true,
});
globalThis.PushManager = function PushManager() {};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const notif = await server.ssrLoadModule('/src/lib/notifications.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log('  ok    ' + name);
    return;
  }
  failures++;
  console.error('  FAIL  ' + name + (detail ? '\n        ' + detail : ''));
}

// ── The fake SDK ──────────────────────────────────────────────────────────────────────────────
let seq = 0;
const calls = [];
let user = { id: 'anon-0', tags: {} };

function newUser(kind) {
  // Both login() and logout() land the subscription on a DIFFERENT user with an EMPTY tag bag.
  // This is the real behaviour the app was getting wrong, restated as the thing under test.
  user = { id: kind + '-' + ++seq, tags: {} };
}

const fake = {
  init: async () => { calls.push('init'); },
  login: async (id) => { calls.push('login:' + id); newUser('user'); },
  logout: async () => { calls.push('logout'); newUser('anon'); },
  User: {
    addTags: async (t) => { calls.push('addTags'); Object.assign(user.tags, t); },
    getTags: () => user.tags,
    PushSubscription: { optedIn: true, optIn: async () => {}, optOut: async () => {} },
  },
  Notifications: { permission: true, requestPermission: async () => {} },
};

// The SDK drains its queue IN ORDER once loaded. Draining by hand is what lets this check see the
// order the app pushed things in, which is the property that was broken.
async function drain() {
  const q = globalThis.window.OneSignalDeferred || [];
  while (q.length) await q.shift()(fake);
}

const state = { ...defaultState(), streak: 4, username: 'ada' };

console.log('\nnotification identity\n');

// ── 1. init is first in the queue ─────────────────────────────────────────────────────────────
// The original bug in this file. Kept here so it cannot come back unnoticed.
{
  notif.syncTags(state);
  notif.identify('acct-1');
  await drain();
  check('init is queued before anything else', calls[0] === 'init', 'queue was: ' + calls.join(' → '));
}

// ── 2. THE REGRESSION TEST ────────────────────────────────────────────────────────────────────
// Tags published before sign-in must still be on the user the sender will filter on afterwards.
{
  check('tags survive login()', Object.keys(fake.User.getTags()).length > 0,
    'the identified user (' + user.id + ') holds no tags — a campaign filter cannot match it');
  check('the surviving tags are the ones we sent',
    fake.User.getTags().streak === '4' && fake.User.getTags().reminders !== undefined,
    JSON.stringify(fake.User.getTags()));
  const lastLogin = calls.lastIndexOf('login:acct-1');
  check('addTags is re-sent AFTER login, not only before',
    calls.indexOf('addTags', lastLogin) > lastLogin, 'queue was: ' + calls.join(' → '));
}

// ── 3. Sign-out must not hand the next person the last player's streak ────────────────────────
// The opposite conclusion from the same fact, and the reason this is not simply "re-publish on
// every identity change": re-attaching a departing player's tags would look like a fix and would
// be the bug forget() exists to prevent.
{
  calls.length = 0;
  notif.forget();
  await drain();
  check('logout leaves the fresh anonymous user with no tags',
    Object.keys(fake.User.getTags()).length === 0, JSON.stringify(fake.User.getTags()));

  // And the cleared value must not resurface on the next account to sign in on this device.
  notif.identify('acct-2');
  await drain();
  check('a later login does not resurrect the previous player\'s tags',
    Object.keys(fake.User.getTags()).length === 0,
    'user ' + user.id + ' inherited: ' + JSON.stringify(fake.User.getTags()));
}

// ── 4. A fresh publish after sign-out reaches the new user ────────────────────────────────────
// Clearing must not leave the device permanently untagged: the logout wipe changes the streak,
// which is one of the values App.jsx watches, so a publish follows on its own.
{
  notif.syncTags({ ...defaultState(), streak: 0 });
  await drain();
  check('syncTags after sign-out publishes to the current user',
    fake.User.getTags().streak === '0', JSON.stringify(fake.User.getTags()));
}

// ── 5. Every value still crosses as a string ──────────────────────────────────────────────────
// Restated here because it is the identity path that re-sends them, and a re-send that coerced
// numbers back would make a comparison lexicographic ("9" > "10") only for signed-in players.
{
  const bad = Object.entries(fake.User.getTags()).filter(([, v]) => typeof v !== 'string');
  check('all tag values are strings', bad.length === 0, JSON.stringify(bad));
}

await server.close();

if (failures) {
  console.error('\n' + failures + ' failure(s)\n');
  process.exit(1);
}
console.log('\n  all checks passed\n');
// Exited explicitly. Stubbing `window` and `document` for the module under test leaves Vite with
// something it does not release on close, and a check script that passes but never returns would
// hang `npm run check` — which is worse than the bug it is guarding against.
process.exit(0);
