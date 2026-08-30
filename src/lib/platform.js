// Which shell is this code running inside — a browser tab, or the native wrapper?
//
// One module, because three separate files need the answer and a second copy of this test could
// only ever disagree with this one. The failure mode is not theoretical: analytics.js decides
// whether a session counts as real data from it, appUrl.js decides what address is printed onto
// every shared image from it, and notifications.js decides whether to load a push SDK that cannot
// work here. Three different ideas of "are we native" would produce three different bugs, each
// invisible in a different way.
//
// ── Why the injected global rather than importing @capacitor/core ─────────────────────────────
//
// Capacitor's native bridge defines `window.Capacitor` in the webview before any app code runs,
// so the global is available at the first tick and is exactly as authoritative as the package —
// the package reads the same global. Importing @capacitor/core instead would put ~15 kB of
// bridge code into the WEB bundle, which every browser player downloads to be told "you are not
// native". This app already defers posthog-js for that reason (see analytics.js), so shipping
// bytes to browser players purely to detect their absence would be arguing against a decision
// this codebase has already made carefully.
//
// It also keeps the check scripts working. They boot Vite in Node with no window at all; every
// function here answers "web" in that case rather than throwing, so a script that happens to
// pull in one of the three callers above cannot be broken by this file.
//
// A plugin that genuinely needs the bridge should still import @capacitor/core normally. This is
// for detection only.

/** True only inside a real native wrapper (iOS or Android). False in every browser. */
export function isNative() {
  try {
    const c = window.Capacitor;
    if (!c) return false;
    // isNativePlatform() is the documented answer. The `platform` string is checked as well
    // because it is the older shape of the same fact, and a bridge that ever ships one without
    // the other should still be recognised rather than silently treated as a browser — being
    // wrong in that direction is what would put native players in the discarded analytics bucket.
    if (typeof c.isNativePlatform === 'function') return !!c.isNativePlatform();
    return c.platform === 'ios' || c.platform === 'android';
  } catch (e) {
    return false;
  }
}

/** 'ios' | 'android' | 'web'. Safe to call before the bridge exists, and off a browser entirely. */
export function platformName() {
  try {
    const c = window.Capacitor;
    if (!c) return 'web';
    if (typeof c.getPlatform === 'function') return c.getPlatform() || 'web';
    return c.platform || 'web';
  } catch (e) {
    return 'web';
  }
}

// ── Bundled build, or a live-reload build pointed at a dev server? ─────────────────────────────
//
// Capacitor's live reload (`server.url` in capacitor.config.json) leaves the native shell intact
// but serves the web assets from a laptop's Vite server, so the webview's address becomes
// something like http://192.168.1.20:5173. Everything above still reports "native" — correctly,
// it IS the native app — but it is a development session, not a player.
//
// A shipped build always serves its bundled assets from the wrapper's own origin, whose hostname
// is `localhost` on both platforms (capacitor://localhost on iOS, https://localhost on Android).
// So the hostname is what separates the two, and it cannot be forgotten or left stale the way a
// build-time flag could — which is the same argument analytics.js makes for detecting its
// environment from the hostname rather than from an env var.
export function isBundledNativeBuild() {
  if (!isNative()) return false;
  try {
    return window.location.hostname === 'localhost';
  } catch (e) {
    // Native but unreadable location. Treated as NOT a shipped build, because the alternative is
    // filing unknown sessions as production — the one direction the analytics allowlist must not
    // be wrong in.
    return false;
  }
}

// The app's canonical public address, used when the running origin is not a usable one.
//
// Written down here, and nowhere else, despite appUrl.js's rule that the address is always
// DERIVED and never hardcoded. That rule holds because in a browser the current origin is by
// definition an address the player's browser can reach. Inside the wrapper that stops being true:
// the origin is capacitor://localhost, which is openable by nobody and resolves to nothing. There
// is no derivation left to do, so the canonical domain has to be stated — and it is stated once,
// here, rather than at each of the places that need it.
export const CANONICAL_APP_URL = 'https://cifri.app';
