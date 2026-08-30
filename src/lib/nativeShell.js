// Native shell setup — the handful of things a webview needs told that a browser tab does not.
//
// Everything here is a NO-OP in a browser. It is guarded by isNative() at the top and the plugin
// modules are imported dynamically, so a browser player never downloads a byte of it. That
// matters for the same reason analytics.js defers posthog-js: the web app is the one with real
// players today, and it must not pay for the wrapper.
//
// Nothing in this file is allowed to affect the game. Every call is individually wrapped, in the
// house style of analytics.js and notifications.js — a plugin that is missing, fails, or changes
// its API must cost a cosmetic detail, never a question the player was in the middle of.

import { isNative } from './platform.js';

// ── Why the status bar has to be pushed out of the way ────────────────────────────────────────
//
// index.html deliberately does NOT set `viewport-fit=cover`, and explains why: the header is
// `position: fixed; top: 0` and the bottom nav is pinned the same way, so painting under the
// system UI would slide both beneath it until every screen learned about safe-area insets. In a
// browser iOS honours that by letterboxing the app, and the decision costs nothing.
//
// The native wrapper does not letterbox. It hands the webview the whole screen including the
// notch, so the app's own header renders UNDER the Dynamic Island — the Cifri logo was visibly
// sliced in half by it on first run.
//
// Two ways out, and this is the one that does not reopen the decision above. Adding
// `viewport-fit=cover` plus safe-area padding would mean touching the web app's layout for the
// wrapper's benefit, on every fixed-position screen, exactly the work that comment declined.
// Telling the status bar not to overlay the webview instead confines the fix to native: iOS
// insets the webview below the status bar, the existing CSS is untouched, and the browser build
// is byte-for-byte unaffected.
async function configureStatusBar() {
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: false });
    // Style.Default follows the system's light/dark setting. The app's own dark mode is a STORED
    // preference rather than the system one (see App.jsx — the system is consulted once, to seed
    // it on first run), so the two can disagree, and matching them properly would mean this
    // module subscribing to app state. Deliberately not done: a wrapper that reaches into the
    // reducer to read a theme is a wrapper that can break a game rule. The visible cost is a
    // status bar that follows the phone rather than the app on the one screen where they differ.
    await StatusBar.setStyle({ style: Style.Default });
  } catch (e) {
    /* cosmetic only — a status bar that overlaps is worse than this failing quietly */
  }
}

// The grey bar of ^ v ✓ buttons iOS floats above the keyboard. It is for stepping between fields
// in a form, and this app's keypads are not fields — it appeared over the number pad offering
// navigation that leads nowhere. Hidden rather than styled, because there is nothing for it to do.
async function configureKeyboard() {
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch (e) {
    /* as above */
  }
}

/**
 * Called once from main.jsx, before the first render, and safe to call unconditionally — off
 * native it returns immediately without importing anything.
 *
 * Not awaited by the caller. These are presentation details, and a wrapper that made the first
 * paint wait on a plugin handshake would be trading the thing players notice for the thing they
 * do not.
 */
export function initNativeShell() {
  if (!isNative()) return;
  configureStatusBar();
  configureKeyboard();
}
