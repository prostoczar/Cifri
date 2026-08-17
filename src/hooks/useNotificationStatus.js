import { useCallback, useEffect, useState } from 'react';
import { pushCapability, isSubscribed, requestPermission, optOut, optIn } from '../lib/notifications.js';

// What this DEVICE can do about reminders, as opposed to what the player has asked for.
//
// The two are deliberately separate. The preference — on/off and the hour — lives in
// `settings.notif` and syncs between devices, because a player who wants an 8pm nudge wants it
// everywhere. Whether push actually works here does not sync and cannot: a browser permission is
// granted to one browser, and an iPhone only allows it at all once the app is on the Home Screen.
//
// Reading the device state rather than storing it is the point. A stored "subscribed: true" goes
// stale the moment someone revokes permission in their browser settings, and the app would then
// show a confident green toggle for notifications that can never arrive.
// Has the player blocked notifications in the browser itself? This is the one state the app cannot
// talk its way out of — `requestPermission()` returns immediately with no dialog once it is set —
// so the settings screen has to say so plainly rather than offering a toggle that does nothing.
function isBlocked() {
  try {
    return typeof Notification !== 'undefined' && Notification.permission === 'denied';
  } catch (e) {
    return false;
  }
}

export function useNotificationStatus() {
  const [status, setStatus] = useState({
    capability: 'unsupported',
    subscribed: false,
    blocked: false,
    busy: false,
  });

  const refresh = useCallback(async () => {
    const capability = pushCapability();
    const subscribed = capability === 'ready' ? await isSubscribed() : false;
    setStatus((s) => ({ ...s, capability, subscribed, blocked: isBlocked() }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const capability = pushCapability();
      const subscribed = capability === 'ready' ? await isSubscribed() : false;
      if (!cancelled) setStatus({ capability, subscribed, blocked: isBlocked(), busy: false });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ask for permission. Only ever called from a real tap — a browser will refuse a permission
  // request that did not come from a user gesture, and a denial cannot be taken back from inside
  // the app, so it must never be spent on somebody who has not already said yes to us.
  const enable = useCallback(async () => {
    setStatus((s) => ({ ...s, busy: true }));
    const granted = await requestPermission();
    const subscribed = granted ? await isSubscribed() : false;
    setStatus((s) => ({ ...s, subscribed, blocked: isBlocked(), busy: false }));
    return subscribed;
  }, []);

  // Stop sending here without touching the browser permission, so turning it back on later is one
  // tap rather than a trip into browser settings.
  const disable = useCallback(async () => {
    optOut();
    setStatus((s) => ({ ...s, subscribed: false }));
  }, []);

  // Someone who opted out on this device still holds permission, so resuming needs no dialog.
  const resume = useCallback(async () => {
    optIn();
    setStatus((s) => ({ ...s, subscribed: true }));
  }, []);

  return { ...status, enable, disable, resume, refresh };
}
