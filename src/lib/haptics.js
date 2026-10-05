// Haptics — the phone's vibration motor, for the Finish screen's cues.
//
// Phones only, and silent everywhere else. The web gets none at all, by decision rather than by
// accident: iPhone browsers block the Vibration API outright, so offering it on Android browsers
// alone would make the web app feel different depending on which phone it was opened on
// (docs/finish-animation-spec.md, "Where web and phone differ").
//
// The same rules as nativeShell.js. Guarded by isNative() and loaded with a dynamic import, so a
// browser player never downloads the plugin; and every call is wrapped, so a plugin that is
// missing or fails costs a buzz, never a frame of the game. Nothing here is awaited by a caller.
//
// Not tied to the sound setting. Sound and touch are separate senses, and a player who has muted
// the app on a bus has not asked for the phone to stop answering their thumb.

import { isNative } from './platform.js';

let pluginPromise = null;

function plugin() {
  if (!isNative()) return Promise.resolve(null);
  if (!pluginPromise) pluginPromise = import('@capacitor/haptics').catch(() => null);
  return pluginPromise;
}

function run(fn) {
  plugin()
    .then((mod) => (mod ? fn(mod) : null))
    .catch(() => { /* cosmetic only */ });
}

/** A tap of the motor. `weight` is 'light' | 'medium' | 'heavy'. */
export function impact(weight) {
  run(({ Haptics, ImpactStyle }) => {
    const style = weight === 'heavy' ? ImpactStyle.Heavy : weight === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
    return Haptics.impact({ style });
  });
}

/** The system's "success" pattern — the flame lighting. */
export function success() {
  run(({ Haptics, NotificationType }) => Haptics.notification({ type: NotificationType.Success }));
}

/**
 * The lightest tick the phone has, the one a picker wheel makes — Continue into results. The
 * plugin only exposes it as part of a selection gesture, so this is a gesture one tick long.
 */
export function selection() {
  run(async ({ Haptics }) => {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  });
}
