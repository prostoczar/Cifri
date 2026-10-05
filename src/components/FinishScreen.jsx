import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import Flame from './Flame.jsx';
import { StreakPill } from './Header.jsx';
import {
  bestShimmer, fillTicks, finishBell, flameLit, floodSwell, ignite, phrasePop, ringLand, toResults,
} from '../store/sound.js';
import { impact, selection, success } from '../lib/haptics.js';
import { onNativeBackButton, paintSystemBarsYellow } from '../lib/nativeShell.js';
import { isNative } from '../lib/platform.js';

// The Finish screen — the beat between the end of a game and its result screen. The whole design
// lives in docs/finish-animation-spec.md; this file is that spec's Timeline table turned into
// timers, and the CSS under "FINISH SCREEN" in index.css is its Visual elements section.
//
// It decides NOTHING about the game. Whether the run was a new best, and what the streak pill
// looked like before and after it, arrive in `data` already settled by the reducer — App.jsx reads
// them off the state, never recomputes them. A second copy of "was this a new best" here could
// only ever disagree with the result screen it leads into.
//
// `data` shape:
//   mode       'challenge' | 'braining'
//   number     the final figure in the ring (score, or brain age)
//   countFrom  where the count starts (0 for a score; the oldest age on the scale for Braining)
//   fill       0..1, how much of the ring the arc fills
//   label      the line under the number before any new-best moment
//   best       true when this run is a new best (the same flag the result screen celebrates)
//   pill       { from, to, numFrom, numTo } — the header streak pill before and after the game,
//              as 'grey' | 'one' | 'both', and its number before and after
//   phraseKey  the i18n key of the phrase to show (chosen by pickFinishPhrase in finishPhrase.js)
//   target     where the result screen keeps what the flights land on: { container, head, score }
//              as selectors (.rscr/.rh/.rsco for Challenge, .br-rscr/.br-rh/.br-age-n for Braining)

const RING_R = 48;
const RING_C = 2 * Math.PI * RING_R;

// ── Variants ─────────────────────────────────────────────────────────────────────────────────
//
// Read straight off the pill's before/after states. `lights` is what the flame does: 'green' for
// the day's first counted game (V1/V3), 'gold' for the game that completes both modes (V2/V4),
// null when the run changed nothing (V5).
//
// A V5 run can still be a new best — a Challenge replay or a Braining retry sets a real record —
// and then it celebrates the ring without touching the flame (decided 5 Oct 2026, so the Finish
// screen agrees with the result screen's ribbon). Practice never arrives here with `best` set.
function finishVariant(pill, best) {
  const lights = pill.to !== pill.from && pill.to !== 'grey'
    ? (pill.to === 'both' ? 'gold' : 'green')
    : null;
  const name = lights
    ? (lights === 'gold' ? (best ? 'V4' : 'V2') : (best ? 'V3' : 'V1'))
    : 'V5';
  return { lights, best: !!best, name };
}

// The spec's Timeline table, as [ms, step] pairs. Each step is added to the root as an `s-<step>`
// class and the CSS does the moving, so "skip to the end" is simply "add every class at once".
function timelineFor(v) {
  const s = [[200, 'phraseIn'], [1050, 'up'], [1300, 'body'], [2160, 'land']];
  if (v.best) s.push([2160, 'best'], [2300, 'engulf'], [2860, 'yellow']);
  if (v.lights) {
    // After a new best the flame waits for the engulf to finish: everything shifts by 600 ms.
    const d = v.best ? 600 : 0;
    s.push([2250 + d, 'catch'], [2600 + d, 'lit'], [3100 + d, 'burn']);
    // In V4 the engulf already was the yellow moment, so the gold pill does not also flood.
    if (v.lights === 'gold' && !v.best) s.push([3100, 'flood']);
  }
  // Tap prompt times from the spec. V5 with a new best is the one case the spec does not time:
  // it has the engulf but no flame steps, so it is ready shortly after the yellow lands.
  const ready = v.lights
    ? (v.best ? 4000 : v.lights === 'gold' ? 3800 : 3400)
    : (v.best ? 3200 : 2400);
  s.push([ready, 'ready']);
  return s.sort((a, b) => a[0] - b[0]);
}

// Players are mid-keypress when time runs out, so a stray tap must not skip the finish.
const TAP_GUARD_MS = 400;

// Sound and touch for each step (the spec's "Sound, haptics" table). Played by the same timers
// that add the step's class, so a skip — which cancels the timers — can never play one late.
// Haptics are no-ops off a phone (src/lib/haptics.js). `fillTicks` is not here: it is scheduled
// on the audio clock at 'body' and has its own cancel.
const CUES = {
  phraseIn: (snd) => { phrasePop(snd); impact('light'); },
  land: (snd) => { ringLand(snd); impact('medium'); },
  catch: (snd) => { ignite(snd); },
  engulf: (snd) => { bestShimmer(snd); impact('heavy'); },
  lit: (snd, v) => { flameLit(snd, v.lights === 'gold'); success(); },
  flood: (snd) => { floodSwell(snd); impact('medium'); },
};

// ── Reduced motion ──
//
// Same information, no movement (the spec's "Reduced motion"). Read once when the screen opens:
// a setting flipped mid-finish would leave half a timeline in each mode. The steps still happen —
// sounds and haptics keep their times — but everything visual lands at once, straight after the
// game fades out, the yellow crossfades in, and the prompt appears at 600 ms without pulsing.
const REDUCED_SHOW_MS = 220;
const REDUCED_READY_MS = 600;
const REDUCED_LEAVE_MS = 250;
function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

// ── The browser's back button ──
//
// Browser back means Continue, like Android's hardware back. A browser has no back event of its
// own, so the Finish screen puts one entry on the page's history while it is up and treats that
// entry being popped as the press. The count exists for React's development double-mount: the
// screen unmounts and remounts at once, and the entry must neither be pushed twice nor be taken
// back by the departing copy while the new one is relying on it.
const HISTORY_MARK = 'cifriFinish';
let liveFinishScreens = 0;

// The move into results (the spec's "option B"). Times from the Continue tap.
const EASE_TRAVEL = 'cubic-bezier(.5,0,.15,1)';
const EASE_DROP = 'cubic-bezier(.55,0,.8,.4)';
const EASE_FILL = 'cubic-bezier(.2,.7,.2,1)';
const SCORE_FLIGHT_MS = 520;
const PILL_FLIGHT_MS = 560;
const STAGGER_START_MS = 380;
const STAGGER_STEP_MS = 60;
const RISE_MS = 280;
// Five groups enter (avatar and badges, the result's own headline, the stat boxes, everything
// below them, the nav): 380 + 4 × 60 + 280 = 900, the "about 900 ms" the spec gives.
const ENTRANCE_MS = STAGGER_START_MS + 4 * STAGGER_STEP_MS + RISE_MS;

export default function FinishScreen({ data, soundOn, onCovered, onContinue, onEntered }) {
  const { t } = useI18n();
  const variant = finishVariant(data.pill, data.best);
  const [reduced] = useState(prefersReducedMotion);

  const [reached, setReached] = useState({});
  const [phase, setPhase] = useState('anim'); // anim → ready → leaving
  const [skipped, setSkipped] = useState(false);

  const rootRef = useRef(null);
  const titleRef = useRef(null);
  const phrasePosRef = useRef(null);
  const pillRef = useRef(null);
  const ringRef = useRef(null);
  const numRef = useRef(null);
  const flyScoreRef = useRef(null);
  const flyPillRef = useRef(null);
  const timersRef = useRef([]);
  const rafRef = useRef(0);
  const mountAtRef = useRef(0);
  const phaseRef = useRef('anim');
  const coveredRef = useRef(false);
  const stopTicksRef = useRef(() => {});
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  // Read through refs so the timeline effect can run exactly once without going stale.
  const cbRef = useRef({ onCovered, onContinue, onEntered });
  cbRef.current = { onCovered, onContinue, onEntered };
  const dataRef = useRef(data);
  dataRef.current = data;

  const setNumber = (n) => { if (numRef.current) numRef.current.textContent = String(n); };

  const cover = () => {
    if (coveredRef.current) return;
    coveredRef.current = true;
    if (cbRef.current.onCovered) cbRef.current.onCovered();
  };

  const clearAll = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    cancelAnimationFrame(rafRef.current);
    stopTicksRef.current();
    stopTicksRef.current = () => {};
  };

  // The score counts up (or the brain age counts down) with an ease-out-cubic, in step with the
  // arc's own 850 ms fill. Written straight into the DOM so the count does not re-render the
  // whole screen sixty times a second.
  const runCount = () => {
    const { countFrom, number } = dataRef.current;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 850);
      const e = 1 - Math.pow(1 - p, 3);
      setNumber(Math.round(countFrom + (number - countFrom) * e));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  // Skip: the variant's final state, immediately. Pending steps are cancelled rather than run
  // late, and so are their sounds — a skipped sound is never played late. `byTap` is false when
  // the app is being sent to the background, which should not buzz.
  const jumpToEnd = useCallback((byTap) => {
    if (phaseRef.current !== 'anim') return;
    clearAll();
    cover();
    if (byTap) impact('light');
    const all = {};
    timelineFor(finishVariant(dataRef.current.pill, dataRef.current.best)).forEach(([, name]) => { all[name] = true; });
    // Reduced motion has no engulf; its yellow crossfades instead (see the CSS).
    if (reduced) delete all.engulf;
    setReached(all);
    setSkipped(true);
    setNumber(dataRef.current.number);
    phaseRef.current = 'ready';
    setPhase('ready');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToResults = useCallback(() => {
    if (phaseRef.current !== 'ready') return;
    // Anything still pending is cancelled: in reduced motion the prompt arrives at 600 ms, while
    // later sounds are still waiting their turn, and those are skipped sounds like any other.
    clearAll();
    phaseRef.current = 'leaving';
    setPhase('leaving');
    toResults(soundRef.current);
    selection();
    cbRef.current.onContinue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTap = useCallback(() => {
    if (performance.now() - mountAtRef.current < TAP_GUARD_MS) return;
    if (phaseRef.current === 'anim') jumpToEnd(true);
    else goToResults();
  }, [jumpToEnd, goToResults]);

  // Back — Android's hardware button, or the browser's — is always Continue, from any point. It is
  // a deliberate press rather than a stray tap, so it skips the guard, and if the animation is
  // still running it jumps to the end first so the flights start from the final state.
  const handleBack = useCallback(() => {
    if (phaseRef.current === 'anim') jumpToEnd(false);
    goToResults();
  }, [jumpToEnd, goToResults]);

  // ── Timeline ──
  useEffect(() => {
    mountAtRef.current = performance.now();
    setNumber(dataRef.current.countFrom);
    const v = finishVariant(dataRef.current.pill, dataRef.current.best);
    const at = (ms, fn) => timersRef.current.push(setTimeout(fn, ms));
    const cue = (name) => { if (CUES[name]) CUES[name](soundRef.current, v); };

    // Time 0, the finish line. On a timer of its own rather than played here, so that React's
    // development double-mount (which cancels this effect's timers) cannot ring it twice.
    at(0, () => { finishBell(soundRef.current); impact('heavy'); });

    // The game screen, header and nav fade out under the cover for 220 ms; then App can unmount
    // them.
    at(220, cover);

    if (reduced) {
      // Everything visual at once, as the cover completes; sounds and haptics on their usual times.
      at(REDUCED_SHOW_MS, () => {
        const all = {};
        timelineFor(v).forEach(([, name]) => { if (name !== 'ready' && name !== 'engulf') all[name] = true; });
        setReached(all);
        setNumber(dataRef.current.number);
      });
      at(REDUCED_READY_MS, () => {
        setReached((r) => ({ ...r, ready: true }));
        phaseRef.current = 'ready';
        setPhase('ready');
      });
      timelineFor(v).forEach(([ms, name]) => at(ms, () => {
        cue(name);
        if (name === 'body') stopTicksRef.current = fillTicks(soundRef.current, dataRef.current.fill, 850);
      }));
      return clearAll;
    }

    timelineFor(v).forEach(([ms, name]) => at(ms, () => {
      setReached((r) => ({ ...r, [name]: true }));
      cue(name);
      if (name === 'body') {
        runCount();
        stopTicksRef.current = fillTicks(soundRef.current, dataRef.current.fill, 850);
      }
      if (name === 'ready') {
        phaseRef.current = 'ready';
        setPhase('ready');
      }
    }));
    return clearAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Back button: Android's hardware one, and the browser's ──
  useEffect(() => {
    liveFinishScreens++;
    const offNative = onNativeBackButton(() => handleBack());
    // A browser only. In the wrapper the hardware button above is the back button, and pushing
    // history there would give Android's default handling a page to go back to.
    const useHistory = !isNative();
    const onPop = () => handleBack();
    if (useHistory) {
      if (!(window.history.state && window.history.state[HISTORY_MARK])) {
        window.history.pushState({ [HISTORY_MARK]: true }, '');
      }
      window.addEventListener('popstate', onPop);
    }
    return () => {
      liveFinishScreens--;
      offNative();
      if (!useHistory) return;
      window.removeEventListener('popstate', onPop);
      // Take our entry back off the history once no Finish screen is left — but only if it is
      // still the current one (a back press has already consumed it). Deferred, so that a
      // development remount can claim it first.
      setTimeout(() => {
        if (liveFinishScreens === 0 && window.history.state && window.history.state[HISTORY_MARK]) {
          window.history.back();
        }
      }, 0);
    };
  }, [handleBack]);

  // ── The yellow reaches the phone's own status bar and home-indicator strip ──
  //
  // On while the yellow layer is up; off again once it has dropped away on the way to results,
  // or whenever the screen goes. A no-op in a browser (see paintSystemBarsYellow).
  const yellowOn = (!!reached.yellow || !!reached.flood) && phase !== 'leaving';
  useEffect(() => {
    if (!yellowOn) return undefined;
    paintSystemBarsYellow(true);
    return () => {
      // Leaving: wait for the yellow to finish dropping (420 ms, or the reduced crossfade).
      setTimeout(() => paintSystemBarsYellow(false), reduced ? REDUCED_LEAVE_MS : 420);
    };
  }, [yellowOn, reduced]);

  // ── The move into results ──
  //
  // Runs in the same commit that mounts the result screen (App switches the screen in the same
  // tap that sets 'leaving' here), and before the browser paints it — so the result screen's
  // pieces can be hidden before they are ever seen, and both ends of every flight can be measured
  // from the real layout rather than guessed.
  //
  // Everything is the Web Animations API on transform and opacity, and nothing is left behind:
  // the result screen's elements are animated in place with fill modes that end in their own
  // styles, so the result screen needs no knowledge of how it was entered.
  useLayoutEffect(() => {
    if (phase !== 'leaving') return;
    const root = rootRef.current;
    const tgt = dataRef.current.target;
    const at = (ms, fn) => timersRef.current.push(setTimeout(fn, ms));
    const anim = (el, keyframes, opts) => { if (el) el.animate(keyframes, opts); };

    // Reduced motion: a plain 250 ms crossfade into a result screen that is already fully there.
    // No flights, no stagger — and so nothing on the result screen is hidden either.
    if (reduced) {
      anim(root, [{ opacity: 1 }, { opacity: 0 }], { duration: REDUCED_LEAVE_MS, easing: 'linear', fill: 'forwards' });
      at(REDUCED_LEAVE_MS, () => { if (cbRef.current.onEntered) cbRef.current.onEntered(); });
      return;
    }
    const hold = (el, ms) => anim(el, [{ opacity: 0 }, { opacity: 0 }], { duration: ms });

    const container = document.querySelector(tgt.container);
    const head = document.querySelector(tgt.head);
    const scoreEl = document.querySelector(tgt.score);
    const hdrPill = document.getElementById('hdr-streak-pill');

    // The real score and header pill stay hidden until their flying copies land on them.
    hold(scoreEl, SCORE_FLIGHT_MS);
    hold(hdrPill, PILL_FLIGHT_MS);

    // Everything else fades in while rising 14 px, a group at a time, 60 ms apart.
    const groups = [[], [], [], [], []];
    groups[0].push(document.querySelector('.hdr .prof-btn'), document.querySelector('.hdr .refill-pill'));
    if (head) [...head.children].forEach((el) => { if (el !== scoreEl) groups[1].push(el); });
    if (container) {
      [...container.children].filter((el) => el !== head).forEach((el, i) => groups[i === 0 ? 2 : 3].push(el));
    }
    groups[4].push(document.querySelector('.bnav'));
    groups.forEach((els, i) => els.forEach((el) => anim(el, [
      { opacity: 0, transform: 'translateY(14px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: RISE_MS, delay: STAGGER_START_MS + i * STAGGER_STEP_MS, easing: EASE_FILL, fill: 'backwards' })));

    // The Finish screen's own pieces leave. Its beige gives way to the page underneath.
    const fadeOut = { duration: 240, easing: 'ease-in', fill: 'forwards' };
    anim(root, [{ backgroundColor: getComputedStyle(root).backgroundColor }, { backgroundColor: 'transparent' }], fadeOut);
    anim(phrasePosRef.current.parentElement, [{ opacity: 1 }, { opacity: 0 }], fadeOut);
    anim(root.querySelector('.fin-tap'), [{ opacity: getComputedStyle(root.querySelector('.fin-tap')).opacity }, { opacity: 0 }], fadeOut);
    anim(ringRef.current, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.15)' }], fadeOut);
    anim(root.querySelector('.fin-yellow'), [{ transform: 'translateY(0)' }, { transform: 'translateY(105%)' }], { duration: 420, easing: EASE_DROP, fill: 'forwards' });

    const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    // A move-and-scale transform. Built in one place, as a list of CSS functions, so the flights
    // below all describe their end points the same way.
    const xf = (dx, dy, k) => ['translate(' + dx + 'px,' + dy + 'px)', 'scale(' + k + ')'].join(' ');

    // The score flies from the ring's centre onto the result screen's score: a copy, because the
    // ring it sits in is fading out. Same text, same size and colour to start with, so the
    // hand-over from the real one is invisible; it ends at the target's size and colour.
    const src = numRef.current;
    const fly = flyScoreRef.current;
    if (src && fly && scoreEl) {
      const sr = src.getBoundingClientRect();
      const cs = getComputedStyle(src);
      const ts = getComputedStyle(scoreEl);
      fly.textContent = src.textContent;
      Object.assign(fly.style, {
        display: 'block', left: sr.left + 'px', top: sr.top + 'px',
        fontSize: cs.fontSize, color: cs.color, fontVariantNumeric: ts.fontVariantNumeric,
        letterSpacing: ts.letterSpacing,
      });
      src.style.visibility = 'hidden';
      const fr = fly.getBoundingClientRect();
      const tr = scoreEl.getBoundingClientRect();
      const a = centre(fr), b = centre(tr);
      const k = tr.height / fr.height;
      anim(fly, [
        { transform: 'translate(0,0) scale(1)', color: cs.color },
        { transform: xf(b.x - a.x, b.y - a.y, k), color: ts.color },
      ], { duration: SCORE_FLIGHT_MS, easing: EASE_TRAVEL, fill: 'forwards' });
      // Left sitting exactly on the real score a moment past the hand-over, rather than removed
      // on the same tick, so there is never a frame with neither on screen.
      at(SCORE_FLIGHT_MS + 80, () => { fly.style.display = 'none'; });
    }

    // The flame pill flies onto the header pill. The two are drawn to different proportions
    // (padding, gap and icon size are not a scaled copy of one another), so no single transform
    // could land one exactly on the other. Instead two copies fly the same path and cross-fade:
    // the Finish screen's own pill, and a copy of the header's, which ends pixel-identical to the
    // real header pill it is replaced by. Both are transform and opacity only.
    const big = pillRef.current;
    const small = flyPillRef.current;
    if (big && small && hdrPill) {
      const hr = hdrPill.getBoundingClientRect();
      Object.assign(small.style, { visibility: 'visible', left: hr.left + 'px', top: hr.top + 'px' });
      const br = big.getBoundingClientRect();
      const a = centre(br), b = centre(hr);
      const kBig = hr.height / br.height;
      const kSmall = br.height / hr.height;
      const move = { duration: PILL_FLIGHT_MS, easing: EASE_TRAVEL, fill: 'forwards' };
      // The cross-fade is its own linear animation, so it runs on the clock rather than on the
      // flight's easing: the big pill carries the first half of the trip, the header copy the end.
      const fade = { duration: PILL_FLIGHT_MS, easing: 'linear', fill: 'forwards' };
      const there = xf(b.x - a.x, b.y - a.y, kBig);
      const back = xf(a.x - b.x, a.y - b.y, kSmall);
      anim(big, [{ transform: 'translate(0,0) scale(1)' }, { transform: there }], move);
      anim(big, [{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], fade);
      anim(small, [{ transform: back }, { transform: 'translate(0,0) scale(1)' }], move);
      anim(small, [{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], fade);
      at(PILL_FLIGHT_MS + 80, () => { small.style.visibility = 'hidden'; });
    }

    at(ENTRANCE_MS, () => { if (cbRef.current.onEntered) cbRef.current.onEntered(); });
  }, [phase, reduced]);

  // ── Sizing ──
  //
  // Reference sizes are for a 288 px wide screen. Everything scales by --k, capped so the ring
  // never exceeds 300 px, and by height so a short or landscape screen still fits the group.
  // The phrase's start offset (--dy, from its resting place up top to screen centre) and the
  // flame pill's centre (--fx/--fy, where the V2 flood grows from) are measured, not guessed.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = () => {
      const k = Math.min(window.innerWidth / 288, 300 / 230, window.innerHeight / 500);
      root.style.setProperty('--k', String(k));
      // offsetTop ignores transforms, so this reads the resting place even mid-glide.
      const title = titleRef.current;
      const pos = phrasePosRef.current;
      const cy = title.offsetTop + pos.offsetTop + pos.offsetHeight / 2;
      root.style.setProperty('--dy', root.clientHeight / 2 - cy + 'px');
      // The longest phrases ("Getting better and better!") are nearly a full 375 px screen wide at
      // full size, and wider than a 320 px one. Shrunk to keep a 16 px gutter each side — only
      // when needed, so short phrases keep the spec's sizes exactly — at both ends of the glide.
      const fit = Math.min(1, (root.clientWidth - 32) / pos.offsetWidth);
      root.style.setProperty('--p0', fit.toFixed(3));
      root.style.setProperty('--p1', Math.min(0.72, fit).toFixed(3));
      const pr = pillRef.current.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      root.style.setProperty('--fx', pr.left - rr.left + pr.width / 2 + 'px');
      root.style.setProperty('--fy', pr.top - rr.top + pr.height / 2 + 'px');
      // The engulf's end width. The spec's 250 assumes a 288 px screen; on a tall phone the stroke
      // stops short of the corners and they would snap to yellow at 2860 instead of being covered.
      // So it is the width that reaches the farthest corner from the ring's centre, never less
      // than 250. offsetWidth ignores the ring's own entrance scale.
      const ring = ringRef.current;
      const rg = ring.getBoundingClientRect();
      const cx = rg.left + rg.width / 2 - rr.left;
      const cy2 = rg.top + rg.height / 2 - rr.top;
      const far = Math.max(Math.hypot(cx, cy2), Math.hypot(rr.width - cx, cy2),
        Math.hypot(cx, rr.height - cy2), Math.hypot(rr.width - cx, rr.height - cy2));
      const unitsPerPx = 110 / ring.offsetWidth;
      const width = Math.max(250, 2 * (far * unitsPerPx - RING_R) + 4);
      root.style.setProperty('--engulf-w', width.toFixed(1) + 'px');
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Keyboard, and the app being sent to the background ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTap();
      }
    };
    // Timers are throttled or frozen in a background tab, so an animation left running would
    // resume half-finished. Jumping to the end the moment the app is hidden means the player
    // comes back to the final state, as the spec asks.
    const onVis = () => {
      if (document.visibilityState === 'hidden') jumpToEnd(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [handleTap, jumpToEnd]);

  // ── What to draw, derived from the steps reached ──
  const { pill } = data;
  const isLit = !variant.lights || !!reached.lit;
  const pillState = isLit ? pill.to : pill.from;
  const pillNum = isLit ? pill.numTo : pill.numFrom;
  // A grey pill never burns: a burning flame would claim the day counts when it does not.
  const flameBase = pill.from === 'grey' ? 'unlit' : 'lit';
  const burning = variant.lights ? !!reached.burn : pill.to !== 'grey';
  const edge = pillState === 'both' ? '#7a5200' : '#0a5c40';

  const phrase = t(data.phraseKey);
  const label = data.best && reached.best ? t('finish_new_best') : data.label;
  const arcOffset = reached.body ? RING_C * (1 - Math.max(0, Math.min(1, data.fill))) : RING_C;

  // Four or more digits shrink to fit within 70% of the ring's width. 0.64em is Nunito 900's
  // tabular digit width, near enough.
  const digits = String(data.number).length;
  const scorePx = Math.min(70, (0.7 * 230) / (digits * 0.64));

  const cls = ['fin']
    .concat(reduced ? ['reduced'] : [])
    .concat(Object.keys(reached).map((k) => 's-' + k))
    .concat(skipped ? ['skip'] : [])
    .concat(phase === 'ready' ? ['is-ready'] : [])
    .join(' ');

  return (
    <>
    <div className={cls} ref={rootRef} onClick={handleTap}>
      <div className={'fin-yellow' + (variant.lights === 'gold' && !variant.best ? ' flood' : '')} aria-hidden="true" />

      <div className="fin-title" ref={titleRef}>
        <div className="fin-phrase-pos" ref={phrasePosRef}>
          {/* Always in the layout (only its opacity waits for the pop), so its size can be
              measured from the first frame. */}
          <div className={'fin-phrase' + (phrase.length > 16 ? ' long' : '')} aria-hidden="true">{phrase}</div>
        </div>
        {/* The phrase is announced once, politely, at the moment it pops in. Everything else here
            is a preview of the result screen, which announces itself normally, so it is hidden
            from screen readers rather than read out twice. */}
        <span className="fin-sr" role="status" aria-live="polite">{reached.phraseIn ? phrase : ''}</span>
      </div>

      <div className="fin-group" aria-hidden="true">
        <div className={'fin-pill ' + pillState + (reached.lit && variant.lights && !skipped ? ' pop' : '')} ref={pillRef}>
          <Flame
            base={flameBase}
            catching={!!reached.catch}
            lit={!!variant.lights && !!reached.lit}
            burning={burning}
            edge={edge}
          />
          <span className="fin-pill-n">{pillNum}</span>
        </div>

        <div className="fin-ring" ref={ringRef}>
          <div className="fin-ring-pulse">
            <svg viewBox="0 0 110 110">
              <circle className="fin-track" cx="55" cy="55" r={RING_R} />
              <circle
                className={'fin-arc' + (data.fill > 0 ? '' : ' empty')}
                cx="55" cy="55" r={RING_R}
                transform="rotate(-90 55 55)"
                strokeDasharray={RING_C}
                style={{ strokeDashoffset: arcOffset }}
              />
            </svg>
            <div className="fin-center">
              <span className="fin-score" ref={numRef} style={{ fontSize: 'calc(var(--k) * ' + scorePx.toFixed(1) + 'px)' }} />
              <span className="fin-label">{label}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="fin-tap" aria-hidden="true">{t('finish_tap')}</div>
    </div>
    {/* Outside .fin, so they keep their own fonts and are untouched by its fade. */}
    <span className="fin-fly-score" ref={flyScoreRef} aria-hidden="true" />
    {/* The header's own pill component, so the copy that lands on the header is the header's
        pill — burning flame included, in phase with the real one (see Flame.jsx). */}
    <StreakPill state={pill.to} streak={pill.numTo} className="fin-fly-pill" ref={flyPillRef} />
    </>
  );
}
