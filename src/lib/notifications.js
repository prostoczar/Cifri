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

import { notificationTags } from './notificationTags.js';

const APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

// False when the App ID is absent — a contributor's checkout, or a build where it was never
// configured. Everything below then becomes a no-op rather than an error, which also means a
// `npm run dev` on a machine that never set the variable cannot register real subscribers against
// the live OneSignal app.
const configured = !!APP_ID;

let initStarted = false;

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

// The SDK's own queue. Anything pushed here runs once `init` has completed, so callers never have
// to know whether the script has finished loading.
function withOneSignal(fn) {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
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
 * Load and initialise the SDK. Safe to call more than once.
 *
 * Initialising does NOT ask for permission and does not subscribe anybody. The dashboard's own
 * prompt is switched off deliberately: a browser permission dialog, once denied, cannot be
 * reopened from inside the app, so it must never be spent on someone who has not already said yes
 * to a question of ours that they could answer with "not now".
 */
export function initNotifications() {
  if (!configured || initStarted) return;
  initStarted = true;
  loadSdk()
    .then(() => {
      withOneSignal(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId: APP_ID,
            // Lets the SDK run against the dev server. Without it every check below reports
            // "unsupported" on localhost and none of this can be tested before deploying.
            allowLocalhostAsSecureOrigin: true,
            // Matches what the dashboard was set to, and is the setting that keeps a second copy
            // of the app from opening. This app has no router — every screen is the same URL with
            // the view switched in state — so "navigate" would reload whatever tab it found and
            // throw away a game in progress, and a new tab would mean two reducers writing the
            // same localStorage key. Focus an existing tab, change nothing.
            notificationClickHandlerMatch: 'origin',
            notificationClickHandlerAction: 'focus',
          });
        } catch (e) {
          /* never let a push failure reach the game */
        }
      });
    })
    .catch(() => {
      /* blocked, offline, or the CDN is down — the app carries on regardless */
    });
}

/**
 * Ask the browser for permission. Only ever call this from a real tap on our own opt-in card,
 * after the player has already said yes to us — see initNotifications() for why.
 *
 * Resolves to true if the player is now subscribed.
 */
export async function requestPermission() {
  if (!configured) return false;
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
        resolve(false);
      }
    });
  });
}

/** Whether this DEVICE currently has a live push subscription. Never synced — see below. */
export async function isSubscribed() {
  if (!configured) return false;
  return new Promise((resolve) => {
    withOneSignal((OneSignal) => {
      try {
        resolve(!!OneSignal.Notifications.permission && !!OneSignal.User.PushSubscription.optedIn);
      } catch (e) {
        resolve(false);
      }
    });
  });
}

/** Stop sending to this device, without touching the browser permission. Reversible. */
export function optOut() {
  if (!configured) return;
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.User.PushSubscription.optOut();
    } catch (e) {
      /* ignore */
    }
  });
}

/** Resume sending to a device that had opted out. */
export function optIn() {
  if (!configured) return;
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.User.PushSubscription.optIn();
    } catch (e) {
      /* ignore */
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
  if (!configured) return;
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
    } catch (e) {
      /* ignore */
    }
  });
}

/**
 * Link this subscription to a signed-in account, so the same person on a phone and a laptop is one
 * user rather than two. Guests deliberately have no external ID — they are a device with tags, and
 * that is enough to remind them.
 */
export function identify(userId) {
  if (!configured || !userId) return;
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.login(String(userId));
    } catch (e) {
      /* ignore */
    }
  });
}

/**
 * Unlink on sign-out. Not optional politeness: without it the next person to use this browser
 * inherits the previous player's identity, and would be sent their streak warnings.
 */
export function forget() {
  if (!configured) return;
  withOneSignal(async (OneSignal) => {
    try {
      await OneSignal.logout();
    } catch (e) {
      /* ignore */
    }
  });
}
