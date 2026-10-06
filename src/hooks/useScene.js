import { useCallback, useEffect, useRef, useState } from 'react';
import { impact } from '../lib/haptics.js';
import { onNativeBackButton } from '../lib/nativeShell.js';

// The timing and tap rules every full-screen celebration shares — achievement and streak
// ceremonies, the streak-lost scene, the account scenes (docs/launch-celebrations-spec.md, "Tap
// pattern"). The same rules as the Finish screen, which keeps its own copy because it predates this
// and is already proven; these scenes share this one.
//
// A scene is a list of [ms, step] pairs. Each step reached becomes an `s-<step>` class on the scene's
// root and the CSS does the moving, so "skip to the end" is simply "every step at once" — and a
// step's sound and buzz are played by the same timer that adds its class, so a skip, which cancels
// the timers, can never play one late.
//
//   - Taps are ignored for the first 400 ms.
//   - A tap while animating jumps to the final state (one light buzz, no late sounds).
//   - A tap once `ready` is reached continues. So does Android's back button, from any point.
//   - Enter or Space does what a tap does.
//   - Sent to the background mid-animation, the scene is at its final state on return.
//
// Reduced motion: every visual step lands at `collapseAt` (the CSS fades the final layout in), while
// sounds and haptics keep their own times. `ready` follows 300 ms later.

const TAP_GUARD_MS = 400;

export function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/**
 * @param steps      [[ms, name], …] — must include 'ready' for a scene that waits for a tap
 * @param cue        (name) => void, the sound and haptic for a step reached in time
 * @param onContinue called once, by a tap (or back) after `ready`
 * @param reduced    reduced motion (read once by the caller, so a setting flipped mid-scene does
 *                   not leave half a timeline in each mode)
 * @param collapseAt ms at which, in reduced motion, every visual step lands
 * @param tappable   false for a scene that moves on by itself (it then ignores taps entirely)
 */
export function useScene({ steps, cue, onContinue, reduced = false, collapseAt = 300, tappable = true }) {
  const [reached, setReached] = useState({});
  const [phase, setPhase] = useState('anim'); // anim → ready → done
  const [skipped, setSkipped] = useState(false);
  const phaseRef = useRef('anim');
  const timersRef = useRef([]);
  const mountAtRef = useRef(0);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const cbRef = useRef({ cue, onContinue });
  cbRef.current = { cue, onContinue };

  const clear = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const allSteps = () => {
    const all = {};
    stepsRef.current.forEach(([, name]) => { all[name] = true; });
    return all;
  };

  const jumpToEnd = useCallback((byTap) => {
    if (phaseRef.current !== 'anim') return;
    clear();
    if (byTap) impact('light');
    setReached(allSteps());
    setSkipped(true);
    phaseRef.current = 'ready';
    setPhase('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(() => {
    if (phaseRef.current === 'done') return;
    clear();
    phaseRef.current = 'done';
    setPhase('done');
    if (cbRef.current.onContinue) cbRef.current.onContinue();
  }, []);

  const onTap = useCallback(() => {
    if (!tappable) return;
    if (performance.now() - mountAtRef.current < TAP_GUARD_MS) return;
    if (phaseRef.current === 'anim') jumpToEnd(true);
    else if (phaseRef.current === 'ready') finish();
  }, [tappable, jumpToEnd, finish]);

  // ── Timeline ──
  useEffect(() => {
    mountAtRef.current = performance.now();
    const at = (ms, fn) => timersRef.current.push(setTimeout(fn, ms));
    const list = stepsRef.current;
    const hasReady = list.some(([, n]) => n === 'ready');
    if (reduced) {
      at(collapseAt, () => {
        const all = {};
        list.forEach(([, n]) => { if (n !== 'ready') all[n] = true; });
        setReached((r) => ({ ...r, ...all }));
      });
      list.forEach(([ms, name]) => {
        if (name === 'ready') return;
        if (ms < collapseAt) at(ms, () => setReached((r) => ({ ...r, [name]: true })));
        at(ms, () => { if (cbRef.current.cue) cbRef.current.cue(name); });
      });
      if (hasReady) {
        at(collapseAt + 300, () => {
          setReached((r) => ({ ...r, ready: true }));
          if (phaseRef.current === 'anim') { phaseRef.current = 'ready'; setPhase('ready'); }
        });
      }
      return clear;
    }
    list.forEach(([ms, name]) => at(ms, () => {
      setReached((r) => ({ ...r, [name]: true }));
      if (cbRef.current.cue) cbRef.current.cue(name);
      if (name === 'ready' && phaseRef.current === 'anim') {
        phaseRef.current = 'ready';
        setPhase('ready');
      }
    }));
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Back, keyboard, background ──
  useEffect(() => {
    if (!tappable) return undefined;
    const offBack = onNativeBackButton(() => {
      if (phaseRef.current === 'anim') jumpToEnd(false);
      finish();
    });
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTap();
      }
    };
    const onVis = () => { if (document.visibilityState === 'hidden') jumpToEnd(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      offBack();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [tappable, onTap, jumpToEnd, finish]);

  const classes = Object.keys(reached).map((k) => 's-' + k)
    .concat(skipped ? ['skip'] : [])
    .concat(reduced ? ['reduced'] : [])
    .concat(phase === 'ready' ? ['is-ready'] : []);

  return { reached, phase, skipped, onTap, jumpToEnd, finish, classes };
}
