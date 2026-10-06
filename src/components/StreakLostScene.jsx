import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { useAppState } from '../store/AppStateContext.jsx';
import { tPlural } from '../i18n_data.js';
import { freshTone, streakCool, streakRelight } from '../store/sound.js';
import { impact, success } from '../lib/haptics.js';
import { onNativeBackButton } from '../lib/nativeShell.js';
import { prefersReducedMotion } from '../hooks/useScene.js';
import { Sparks } from './CelebrationParts.jsx';
import Flame from './Flame.jsx';

// The streak-lost scene (docs/launch-celebrations-spec.md, Feature 7): the player's lit streak cools
// down into embers in front of them, then they choose. It replaces the LOOK of the old restore modal
// and nothing else — when it appears, whether a restore is on offer, and what Restore and Start fresh
// do are all decided exactly where they always were (the reducer, and App.jsx's handlers, which this
// calls the moment a button is tapped).
//
// Hard rule from the spec: the flame and the streak number stay on screen for the whole scene. They
// change colour; they never disappear until the final flight into the header.
//
// `data` is a snapshot taken when the scene opened — { brokenValue, available } — because the
// reducer clears `pendingRestore` the moment a choice is made, while this scene still has two
// seconds of its own to play. `onExited` is called once it has handed over to the home screen.
//
// After a restore the flame lands in the header pill as it really is: grey, showing the restored
// number. Restoring does not count as playing today, and a green pill would claim the day was done
// (decided 6 Oct 2026, decision C).

// The spec's timelines, in ms. `in` and the cooling are from the scene opening; the rest from a tap.
const COOL_AT = 1000;
const COOL_MS = 1200;
const COLD_AT = 2300;
const RESTORE = { relight: 200, lit: 560, exit: 2300 };
const FRESH = { exit: 1700 };
const FLIGHT_MS = 560;
const HOME_FADE_AT = 420;
const HOME_FADE_MS = 260;
// Reduced motion: no draining, smoke or embers; a 300 ms crossfade into the result of a choice, and
// a crossfade home.
const REDUCED_EXIT = 1300;
const REDUCED_FADE = 250;

export default function StreakLostScene({ data, onRestore, onStartOver, onExited }) {
  const { t, lang } = useI18n();
  const { state } = useAppState();
  const soundRef = useRef(state.settings.sound);
  soundRef.current = state.settings.sound;
  const [reduced] = useState(prefersReducedMotion);
  const [reached, setReached] = useState(reduced ? { in: true, cold: true } : { in: true });
  const [choice, setChoice] = useState(null); // null | 'restore' | 'fresh'
  const timers = useRef([]);
  const rootRef = useRef(null);
  const flameRef = useRef(null);
  const numRef = useRef(null);
  const n = data.brokenValue;

  const at = (ms, fn) => timers.current.push(setTimeout(fn, ms));
  const reach = (name) => setReached((r) => ({ ...r, [name]: true }));

  // ── The scene opening: lit, then cooling into embers ──
  useEffect(() => {
    if (!reduced) {
      at(COOL_AT, () => { reach('cool'); streakCool(soundRef.current); });
      at(COLD_AT, () => reach('cold'));
    } else {
      at(COOL_AT, () => streakCool(soundRef.current));
    }
    // Android's back button must not leave the app mid-decision; it does nothing here.
    const offBack = onNativeBackButton(() => {});
    const list = timers.current;
    return () => {
      list.forEach(clearTimeout);
      offBack();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── The hand-over: the flame flies into the header pill and the home screen fades in ──
  // `kind` is passed in rather than read from state: this runs from a timer set before the choice
  // re-rendered the scene, so the state it could see is the old one.
  const exit = (kind) => {
    const root = rootRef.current;
    const fl = flameRef.current;
    if (reduced || !root || !fl) {
      if (root) root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REDUCED_FADE, fill: 'forwards' });
      at(REDUCED_FADE, onExited);
      return;
    }
    reach('exit');
    const pill = document.getElementById('hdr-streak-pill');
    const target = pill && (pill.querySelector('.flame') || pill.querySelector('svg'));
    if (target) {
      // A cold flame sits at 0.92×; the flight starts from wherever it is.
      const s0 = kind === 'restore' ? 1 : 0.92;
      const a = fl.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const k = (b.height / a.height) * s0;
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const to = ['translate(' + dx + 'px,' + dy + 'px)', 'scale(' + k + ')'].join(' ');
      fl.animate([
        { transform: 'translate(0,0) scale(' + s0 + ')', opacity: 1 },
        { transform: to, opacity: 1, offset: 0.8 },
        { transform: to, opacity: 0 },
      ], { duration: FLIGHT_MS, easing: 'cubic-bezier(.5,0,.15,1)', fill: 'forwards' });
    }
    root.animate([{ backgroundColor: getComputedStyle(root).backgroundColor }, { backgroundColor: 'transparent' }],
      { duration: HOME_FADE_MS, delay: HOME_FADE_AT, easing: 'ease-out', fill: 'forwards' });
    at(Math.max(FLIGHT_MS, HOME_FADE_AT + HOME_FADE_MS), onExited);
  };

  const restore = () => {
    if (choice || !data.available) return;
    setChoice('restore');
    onRestore();
    if (reduced) {
      at(RESTORE.relight, () => { streakRelight(soundRef.current); impact('medium'); });
      at(RESTORE.lit, success);
      at(REDUCED_EXIT, () => exit('restore'));
      return;
    }
    at(RESTORE.relight, () => { reach('relight'); streakRelight(soundRef.current); impact('medium'); });
    at(RESTORE.lit, () => { reach('lit'); success(); });
    at(RESTORE.exit, () => exit('restore'));
  };

  const startFresh = () => {
    if (choice) return;
    setChoice('fresh');
    onStartOver();
    freshTone(soundRef.current);
    at(reduced ? REDUCED_EXIT : FRESH.exit, () => exit('fresh'));
  };

  // Start fresh: the number counts down to 0 over 600 ms (at once, with reduced motion).
  useEffect(() => {
    if (choice !== 'fresh' || !numRef.current) return undefined;
    const el = numRef.current;
    if (reduced) { el.textContent = '0'; return undefined; }
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 600);
      el.textContent = String(Math.round(n * (1 - k)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [choice, reduced, n]);

  // ── The flame, by step ──
  const restored = choice === 'restore';
  const relit = restored && (reduced || reached.relight);
  const lit = restored && (reduced || reached.lit);
  const burning = (!reached.cold && !reduced) || lit;

  const title = restored && (reduced || reached.lit) ? t('lost_restored')
    : choice === 'fresh' ? t('lost_fresh_title')
    : t('lost_title');

  const cls = ['sl']
    .concat(Object.keys(reached).map((k) => 's-' + k))
    .concat(choice ? ['chose', 'chose-' + choice] : [])
    .concat(reduced ? ['reduced'] : [])
    .join(' ');

  return (
    <div className={cls} ref={rootRef} role="dialog" aria-modal="true" aria-label={t('lost_title')}>
      <div className="sl-missed">{t('lost_missed')}</div>

      <div className="sl-stage">
        <div className="sl-disc" />
        {!reduced && reached.cool && !reached.cold && (
          <div className="sl-smoke" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => <span key={i} style={{ animationDelay: i * 110 + 'ms', left: ((i * 7) % 15) - 7 + 'px' }} />)}
          </div>
        )}
        {!reduced && reached.cold && !choice && (
          <div className="sl-embers" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <span key={i} style={{
                animationDelay: i * 220 + 'ms', left: ((i * 11) % 23) - 11 + 'px',
                background: i % 2 ? '#ffd166' : '#d65a3a',
              }} />
            ))}
          </div>
        )}
        <div className="sl-sparks"><Sparks n={20} colors={['#ffd166', '#0f9d6c', '#d65a3a']} go={!!lit && !reduced} distance={120} /></div>
        <div className="sl-flame" ref={flameRef}>
          <Flame
            base="cold"
            catching={relit}
            burning={burning}
            edge="#0a5c40"
            coolMs={reached.cool && !reached.cold ? COOL_MS : 0}
          />
        </div>
      </div>

      <div className="sl-num" ref={numRef}>{n}</div>
      <div className="sl-label">{tPlural(lang, 'lost_label', n)}</div>
      <div className={'sl-title' + (title !== t('lost_title') ? ' changed' : '')} key={title}>{title}</div>
      <div className="sl-text">{data.available ? tPlural(lang, 'lost_body', n) : t('lost_none')}</div>
      <div className="sl-btns">
        {data.available ? (
          <button className="sl-btn grn" onClick={restore}>{t('lost_restore_btn')}</button>
        ) : (
          <button className="sl-btn off" disabled>{t('lost_none_btn')}</button>
        )}
        <button className="sl-plain" onClick={startFresh}>{t('lost_fresh_btn')}</button>
      </div>
    </div>
  );
}
