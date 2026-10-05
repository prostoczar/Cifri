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

// ── The Finish screen's yellow, edge to edge ──────────────────────────────────────────────────
//
// The Finish screen can turn the whole screen yellow (docs/finish-animation-spec.md, "Where web
// and phone differ"). In a browser its fixed layer already fills the viewport. In the wrapper two
// strips sit outside the page: the status bar, which configureStatusBar() above keeps OUT of the
// webview, and on iPhone the home-indicator strip, which the page does not lay out into because
// index.html deliberately has no viewport-fit=cover.
//
// So both are painted from here rather than by changing that layout decision: the status bar gets
// the plugin's own background colour and dark icons, and the home-indicator strip — which iOS
// fills with the page's root background — gets the body's. Everything is put back exactly as it
// was found, read from getInfo() at the moment of painting rather than assumed, so this cannot
// fight configureStatusBar() over what "normal" is.
//
// Android's navigation bar is not tinted: the status-bar plugin has no API for it, and adding a
// second plugin for one strip was deferred (decided 5 Oct 2026).

let paintedFrom = null;

export async function paintSystemBarsYellow(on) {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    if (on && !paintedFrom) {
      const info = await StatusBar.getInfo();
      paintedFrom = { style: info.style, color: info.color, body: document.body.style.backgroundColor };
      document.body.style.backgroundColor = '#ffd166';
      await StatusBar.setStyle({ style: Style.Light }); // dark icons, for a light background
      // Not available on Android 15+, where the app is drawn edge to edge anyway; the throw is
      // caught below and the yellow layer underneath the bar shows through instead.
      await StatusBar.setBackgroundColor({ color: '#ffd166' });
    } else if (!on && paintedFrom) {
      const was = paintedFrom;
      paintedFrom = null;
      document.body.style.backgroundColor = was.body;
      await StatusBar.setStyle({ style: was.style });
      if (was.color) await StatusBar.setBackgroundColor({ color: was.color });
    }
  } catch {
    /* cosmetic only — a status bar that stays its usual colour is not worth a broken finish */
  }
}

// ── Android's back button ─────────────────────────────────────────────────────────────────────
//
// While the Finish screen is up, the hardware back button means Continue — never "leave the app
// in the middle of the game flow". Registered only for as long as the Finish screen asks, because
// a registered listener replaces Android's default handling everywhere else in the app as well.
//
// Returns a function that removes it. Off native, does nothing (a browser's back button is
// handled by the Finish screen itself, through the page's own history).
export function onNativeBackButton(handler) {
  if (!isNative()) return () => {};
  let handle = null;
  let removed = false;
  import('@capacitor/app')
    .then(({ App }) => App.addListener('backButton', handler))
    .then((h) => {
      handle = h;
      if (removed) h.remove();
    })
    .catch(() => { /* without the plugin, back keeps its default behaviour */ });
  return () => {
    removed = true;
    if (handle) handle.remove();
  };
}
