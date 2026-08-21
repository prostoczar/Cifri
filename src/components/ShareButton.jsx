import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { useAppState } from '../store/AppStateContext.jsx';
import { avatarSpecFor } from '../store/avatar.js';
import { renderShareCard } from '../lib/shareCard.js';
import { canShareImages, shareFilename, shareImage } from '../lib/shareImage.js';
import { track } from '../lib/analytics.js';

// The one share button, used by both result screens and by the achievement popup.
//
// `build` is a function returning what to put on the card — { card, text, slug }. A function
// rather than an object so nothing is computed for a card nobody shares, and it is held in a ref
// so the caller can write it inline without the render below re-running on every parent update.
// `cacheKey` is what actually identifies the card: change it and the image is drawn again.
//
// ── Why the image is drawn before anyone asks for it ──────────────────────────
//
// navigator.share() only works while the browser still considers the tap to be in progress, and
// drawing the card involves awaiting a webfont and an icon decode. On iOS Safari that await can
// spend the tap, after which the share sheet never opens and there is nothing to see — the button
// simply appears dead. So the PNG is rendered in the background the moment this button appears,
// and the tap handler finds it already waiting. See lib/shareImage.js for the rest.
//
// The render is scheduled through requestIdleCallback for the same reason analytics is: this
// happens on a result screen, immediately after a game, on a phone. Drawing a 1080×1350 canvas is
// not free, and it must not compete with the screen animating in.
function scheduleIdle(fn) {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  // Safari only shipped requestIdleCallback in 16.4, and this app's audience is heavily iOS, so
  // this is a main path rather than a fallback.
  const id = setTimeout(fn, 300);
  return () => clearTimeout(id);
}

export default function ShareButton({ cacheKey, build, analytics, className }) {
  const { t } = useI18n();
  const { state } = useAppState();
  const blobRef = useRef(null);
  const buildRef = useRef(build);
  buildRef.current = build;
  const identityRef = useRef(null);
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  // Asked once. The answer cannot change during a session, and it decides what the button calls
  // itself — "Share" promises a share sheet, and a desktop browser must not make that promise.
  const shareable = useMemo(() => canShareImages(), []);

  // ── Who the card says it is from ────────────────────────────────────────────
  //
  // Added HERE rather than by each caller's build(). Three screens produce cards — both results
  // and the achievement popup — and the player's name is the one thing on the card that is the
  // same on all three regardless of what happened. Threading it through three sets of props gives
  // three chances for them to disagree about which avatar is current; taking it from state once,
  // in the component every card already goes through, gives none.
  //
  // avatarSpecFor() is the same resolver the header button uses, so an uncustomised avatar shows
  // the initial the player already sees rather than a placeholder — and a name that is still empty
  // (onboarding unfinished) yields null, which the renderer treats as "draw the card as before".
  const identity = useMemo(() => {
    const name = (state.username || '').trim();
    return name ? { name, spec: avatarSpecFor(state.avatar, name) } : null;
  }, [state.username, state.avatar]);

  // Part of what identifies a drawn card, for the same reason `cacheKey` is: change the avatar in
  // the profile sheet with a result screen still mounted and the cached PNG is now out of date.
  const identityKey = identity ? identity.name + ':' + JSON.stringify(identity.spec) : '';
  identityRef.current = identity;

  useEffect(() => {
    let alive = true;
    blobRef.current = null;
    const cancel = scheduleIdle(() => {
      let spec;
      try {
        spec = buildRef.current();
      } catch (e) {
        return;
      }
      renderShareCard({ ...spec.card, identity: identityRef.current }).then((blob) => {
        if (alive) blobRef.current = blob;
      });
    });
    return () => {
      alive = false;
      cancel();
    };
  }, [cacheKey, identityKey]);

  useEffect(() => {
    if (!note) return undefined;
    const id = setTimeout(() => setNote(null), 3200);
    return () => clearTimeout(id);
  }, [note]);

  async function onClick(e) {
    // The achievement popup dismisses on a tap anywhere, including this button.
    e.stopPropagation();
    if (busy) return;

    const method = shareable ? 'web_share' : 'download';
    track('share_initiated', { ...analytics, method });

    let spec;
    try {
      spec = buildRef.current();
    } catch (err) {
      setNote(t('share_failed'));
      track('share_failed', { ...analytics, method, reason: 'build' });
      return;
    }

    let blob = blobRef.current;
    if (!blob) {
      // The background render has not finished, or it failed. Drawing now costs the transient
      // activation on iOS — shareImage() catches that and saves the file instead, which is worse
      // than a share sheet and much better than nothing.
      setBusy(true);
      blob = await renderShareCard({ ...spec.card, identity: identityRef.current });
      blobRef.current = blob;
      setBusy(false);
    }

    const res = await shareImage({ blob, filename: shareFilename(spec.slug), text: spec.text });

    if (res.outcome === 'shared' || res.outcome === 'saved') {
      // One event for both, separated by a property rather than by name: they are the same moment
      // in the funnel — the player got the image out of the app — and splitting them into two
      // event names would mean every question about share rates had to remember to add them up.
      track('share_completed', { ...analytics, method: res.method, outcome: res.outcome });
    } else if (res.outcome === 'dismissed') {
      track('share_dismissed', { ...analytics, method: res.method });
    } else {
      track('share_failed', { ...analytics, method: res.method, reason: 'render' });
    }

    if (res.outcome === 'saved') setNote(res.linkCopied ? t('share_saved_copied') : t('share_saved'));
    if (res.outcome === 'failed') setNote(t('share_failed'));
  }

  return (
    <>
      <button className={'share-btn' + (className ? ' ' + className : '')} onClick={onClick}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="10.5" x2="15.4" y2="6.5" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
        </svg>
        <span>{shareable ? t('share_btn') : t('share_save_btn')}</span>
      </button>
      {note && <div className="share-note">{note}</div>}
    </>
  );
}
