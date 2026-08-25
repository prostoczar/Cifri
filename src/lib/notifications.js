// Push notifications (OneSignal).
//
// Built on the same rules as analytics.js, for the same reason: nothing here is allowed to affect
// the game. Every entry point swallows its own errors, so if OneSignal is blocked, offline, or was
// never configured, the player answers the next question and never finds out. It is a plain module
// rather than a React provider because half the moments that matter — sign-in, sign-out, a day
// being credited — happen in functions with no component to hang off.
//
// It is never imported by the reducer. `src/store/AppStateContext.jsx` holds every game rule and
// is driven directly by the scripts in `scripts/`; a reducer that opened network connections would
// stop being a pure function of its inputs and `npm run check` would start subscribing to push.
//
// It also computes nothing. What we tell OneSignal comes from `notificationTags.js`, which is a
// pure read of state the reducer has already settled.
//
// ── THE ORDERING RULE, learned the hard way ───────────────────────────────────────────────────
//
// `OneSignalDeferred` is a queue the SDK drains IN ORDER once it loads, and `OneSignal.init()`
// must be the first thing in it. The first version of this file queued `init` inside
// `loadSdk().then(...)` — so it was pushed only after the script had downloaded, while the
// tag-publishing effect pushed its callback immediately on mount. The queue came out as
// [addTags, init], addTags ran against an uninitialised SDK, threw, and was swallowed by the
// very error handling that is meant to protect the game. The result was a subscriber with no
// tags: notifications could be delivered by hand, but no filter could ever match them, and
// nothing anywhere reported a problem.
//
// So `ensureInit()` queues init SYNCHRONOUSLY, and every public function below calls it before
// pushing anything of its own. Do not make init conditional on the script having loaded — the
// queue is what makes pushing early safe, and it is the whole point of it.

import { notificationTags } from './notificationTags.js';

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

// False when the App ID is absent — a contributor's checkout, or a build where it was never
// configured. Everything below then becomes a no-op rather than an error, which also means a
// `npm run dev` on a machine that never set the variable cannot register real subscribers against
// the live OneSignal app.
const configured = !!APP_ID;

let initQueued = false;

// ── Diagnostics ───────────────────────────────────────────────────────────────────────────────
//
// Swallowing every error is right — a push failure must never reach the game — but it is also how
// the ordering bug above stayed invisible. These record what actually happened so it can be read
// back from the console on a real device, where the failure was, without changing behaviour.
let lastError = null;
let lastTagsSent = null;
let lastTagsAt = null;

// Which account this device is already identified as, so a second identify() for the same one is
// not a second login(). See identify() for why that matters more than it looks.
let identifiedAs = null;

/** Read from the browser console: `window.__cifriNotif()`. Never used by the app itself. */
export function notificationDiagnostics() {
  return {
    configured,
    initQueued,
    sdkPresent: typeof window !== 'undefined' && !!window.OneSignal,
    capability: pushCapability(),
    installed: isInstalled(),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
    lastTagsSent,
    lastTagsAt,
    identifiedAs,
    lastError: lastError ? String(lastError) : null,
  };
}

function note(e) {
  lastError = e;
}

// The SDK is loaded on demand rather than from a <script> tag in index.html. A tag would fetch it
// on every page load for every visitor, including the ones who will never be asked for permission,
// and would hardcode the App ID into the repo — breaking the convention .env.example sets, where
// an unset key disables a service entirely.
function loadSdk() {
  return new Promise((resolve, reject) => {
    if (window.OneSignal) return resolve();
    const existing = document.querySelector('script[data-onesignal]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    s.defer = true;
    s.setAttribute('data-onesignal', '');
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', reject);
    document.head.appendChild(s);
  });
}

// The SDK's own queue. Anything pushed here runs once the script has loaded, in push order.
function withOneSignal(fn) {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

/**
 * Queue `init` and start the download. Idempotent, and called by every entry point below rather
 * than only from App.jsx — React runs hook effects in declaration order, and a hook that reads
 * this module can therefore run before the effect that would have initialised it. Making every
 * caller responsible for ensuring init removes that ordering from the list of things that have to
 * stay true.
 *
 * Initialising asks for nothing and subscribes nobody. The dashboard's own prompt is switched off
 * deliberately: a browser permission dialog, once denied, cannot be reopened from inside the app,
 * so it must never be spent on someone who has not already said yes to a question of ours that
 * they could answer with "not now".
 */
function ensureInit() {
  if (!configured) return false;
  if (initQueued) return true;
  initQueued = true;

  // Pushed synchronously, BEFORE the script is even requested, so nothing can jump ahead of it.
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.init({
        appId: APP_ID,
        // Lets the SDK run against the dev server. Without it every check below reports
        // "unsupported" on localhost and none of this can be tested before deploying.
        allowLocalhostAsSecureOrigin: true,
        // Matches what the dashboard was set to, and is the setting that keeps a second copy of
        // the app from opening. This app has no router — every screen is the same URL with the
        // view switched in state — so "navigate" would reload whatever tab it found and throw
        // away a game in progress, and a new tab would mean two reducers writing the same
        // localStorage key. Focus an existing tab, change nothing.
        notificationClickHandlerMatch: 'origin',
        notificationClickHandlerAction: 'focus',
      });
    } catch (e) {
      note(e);
    }
  });

  loadSdk().catch(note);
  return true;
}

/** Public name for the same thing, called once from App.jsx on mount. */
export function initNotifications() {
  ensureInit();
}

/**
 * Can this browser receive push at all, and if not, is that fixable by the player?
 *
 * Three answers rather than a boolean, because the middle one is the whole reason the PWA work
 * exists. Apple delivers web push only to a site added to the Home Screen and opened from there —
 * in a normal iPhone browser tab the permission prompt cannot even be shown. That is not a
 * failure to report, it is an instruction to give.
 */
export function pushCapability() {
  try {
    if (!configured) return 'unsupported';
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      // iPadOS reports itself as MacIntel, so the touch-point count is what tells a real Mac from
      // an iPad pretending to be one. Without it every iPad user would be told push is impossible.
      const isIOS =
        /iP(hone|ad|od)/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      return isIOS ? 'needs-install' : 'unsupported';
    }
    return 'ready';
  } catch (e) {
    return 'unsupported';
  }
}

/** True when the app is running as an installed Home Screen app rather than in a browser tab. */
export function isInstalled() {
  try {
    return (
      window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    );
  } catch (e) {
    return false;
  }
}

/**
 * Ask the browser for permission. Only ever call this from a real tap on our own opt-in card,
 * after the player has already said yes to us — see ensureInit() for why.
 *
 * Resolves to true if the player is now subscribed.
 */
export async function requestPermission() {
  if (!ensureInit()) return false;
  return new Promise((resolve) => {
    withOneSignal(async (OneSignal) => {
      try {
        await OneSignal.Notifications.requestPermission();
        // Permission granted is not the same as subscribed: someone who opted out earlier keeps
        // their browser permission but no live subscription, so the opt-in has to be explicit.
        if (OneSignal.Notifications.permission) {
          await OneSignal.User.PushSubscription.optIn();
        }
        resolve(!!OneSignal.Notifications.permission);
      } catch (e) {
        note(e);
        resolve(false);
      }
    });
  });
}

/** Whether this DEVICE currently has a live push subscription. Never synced — see below. */
export async function isSubscribed() {
  if (!ensureInit()) return false;
  return new Promise((resolve) => {
    withOneSignal((OneSignal) => {
      try {
        resolve(!!OneSignal.Notifications.permission && !!OneSignal.User.PushSubscription.optedIn);
      } catch (e) {
        note(e);
        resolve(false);
      }
    });
  });
}

/** Stop sending to this device, without touching the browser permission. Reversible. */
export function optOut() {
  if (!ensureInit()) return;
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.User.PushSubscription.optOut();
    } catch (e) {
      note(e);
    }
  });
}

/** Resume sending to a device that had opted out. */
export function optIn() {
  if (!ensureInit()) return;
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.User.PushSubscription.optIn();
    } catch (e) {
      note(e);
    }
  });
}

/**
 * Publish what the sender is allowed to know. Called from a read-only effect watching state.
 *
 * This is the only thing that makes guest reminders possible. A guest has no row on the server —
 * that is the entire point of guests — so if the SERVER had to decide who to remind, guests could
 * never be reminded, and fixing that would mean mirroring guest progress server-side, which is
 * exactly the architecture this app is built to avoid. The device already knows the answer; it
 * just publishes it.
 */
export function syncTags(state) {
  if (!ensureInit()) return;
  withOneSignal(async (OneSignal) => {
    try {
      const tags = notificationTags(state);
      // The timezone is environmental rather than game state, so it is added here rather than in
      // the pure function. It lets a campaign fall back to local-time delivery if we ever want it.
      let tz = '';
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch (e) {
        /* older browser — the ms deadlines already carry local time, so this is only a nicety */
      }
      // Every value goes over as a string: OneSignal stores tags as strings, and letting it coerce
      // numbers itself is how a comparison silently becomes lexicographic ("9" > "10").
      const out = {};
      for (const k of Object.keys(tags)) out[k] = String(tags[k]);
      if (tz) out.tz = tz;
      await OneSignal.User.addTags(out);
      lastTagsSent = out;
      lastTagsAt = new Date().toISOString();
    } catch (e) {
      note(e);
    }
  });
}

/**
 * Link this subscription to a signed-in account, so the same person on a phone and a laptop is one
 * user rather than two. Guests deliberately have no external ID — they are a device with tags, and
 * that is enough to remind them.
 */
export function identify(userId) {
  if (!userId || !ensureInit()) return;
  const id = String(userId);

  // ── Once per account, not once per caller ─────────────────────────────────────────────────
  //
  // Two places call this for the same sign-in — the startup path and the guest-conversion
  // bootstrap — because each of them independently establishes who the player is, and neither can
  // assume the other ran. That is right for analytics and for the attempt log, which are
  // idempotent. It is not right for login().
  //
  // A second login() is a second identity operation against a subscription that is already being
  // moved by the first. OneSignal answers the loser with 409 Conflict on every subsequent write —
  // and its SDK marks those ops "no retry", so the tags are dropped silently and the device stays
  // untaggable until its local state is cleared. Which is exactly the state one real iPhone was
  // found in on 25 August 2026.
  //
  // Compared synchronously, before anything is queued, so two calls in the same tick cannot both
  // get through. Cleared on failure so a genuine retry is still possible, and by forget(), which
  // is the only thing that legitimately makes this device a different person.
  if (identifiedAs === id) return;
  identifiedAs = id;

  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.login(id);
      // ── Why the tags are sent AGAIN, immediately after login ──────────────────────────────
      //
      // TAGS BELONG TO THE USER, NOT TO THE SUBSCRIPTION, and `login()` moves this subscription
      // to a different user — OneSignal does not carry tags across from the anonymous one.
      //
      // That is guaranteed to bite on every single launch, because of the order the app runs in:
      // App.jsx publishes tags from a mount effect, while this call waits on getSession(), which
      // is asynchronous and therefore always lands second. So every launch wrote a full set of
      // tags and then abandoned the user holding them. The subscription stayed healthy and
      // permission stayed granted — a notification sent by hand arrived — but every automated
      // campaign filters on tags, and the user those filters read had none.
      //
      // Re-published INSIDE this callback rather than from a second effect, because the SDK's
      // queue is drained in order and that is the only ordering guarantee available here. A
      // separate effect would be racing the login it needs to follow.
      //
      // `lastTagsSent` is whatever syncTags() last published, not a recomputation — this module
      // still computes nothing (see the header). The deadlines in it are absolute timestamps, so
      // re-sending the same values later cannot make them stale.
      if (lastTagsSent) await OneSignal.User.addTags(lastTagsSent);
    } catch (e) {
      // Released, so a later attempt is not suppressed by a login that never actually happened.
      identifiedAs = null;
      note(e);
    }
  });
}

/**
 * Unlink on sign-out. Not optional politeness: without it the next person to use this browser
 * inherits the previous player's identity, and would be sent their streak warnings.
 */
export function forget() {
  if (!ensureInit()) return;
  // Released synchronously, mirroring the way identify() claims it: from the app's point of view
  // this device stops being that account the moment sign-out happens, not whenever the queue gets
  // to it. It also means a logout that fails still leaves the next sign-in able to try.
  identifiedAs = null;
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.logout();
      // Cleared, and deliberately NOT re-published the way identify() does.
      //
      // logout() also moves the subscription to a fresh user, so the same reasoning applies —
      // but the conclusion is the opposite one. This function exists so that the next person to
      // use this browser does not inherit the last player's identity; re-attaching the departing
      // player's streak to the new anonymous user would recreate exactly the bug it is here to
      // prevent, and would do it while looking like a fix.
      //
      // Clearing rather than leaving the value in place matters for the same reason: a later
      // identify() on this device must not top up a new account with the previous player's
      // numbers. The next syncTags() publishes the wiped state from scratch, which the logout
      // wipe triggers on its own by changing the streak this module is watched through.
      lastTagsSent = null;
      lastTagsAt = null;
    } catch (e) {
      note(e);
    }
  });
}
