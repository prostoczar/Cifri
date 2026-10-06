import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AVATAR_ICONS } from '../store/avatar.js';

// The streak flame, in every state it has: the header pill's and the Finish screen's. One
// component for both, so the flame that flies from the Finish screen into the header lands on
// itself rather than on a lookalike — and so there is exactly one burning flame to keep cheap.
//
// The states (docs/finish-animation-spec.md, "Flame icon"):
//   unlit     outline only, warm grey
//   cold      solid grey with a slightly darker grey edge — a flame that has gone out, or is yet to
//             catch (the streak ceremonies, docs/launch-celebrations-spec.md Features 6 and 7)
//   catching  terracotta revealed from the bottom up, over whatever was showing
//   lit       solid, in the pill's own text colour (currentColor)
//   burning   a white → yellow → terracotta → white gradient flowing upward, a slow wave, and a
//             thin dark edge in a darker shade of the pill
//
// Props: `base` ('unlit' | 'lit' | 'cold') is what shows before anything happens; `catching`, `lit` and
// `burning` switch the later states on; `edge` is the dark-edge colour; `paused` holds a burning
// flame lit and still (the header does this while a game is being played). `coolMs`, on a burning
// flame, cools it: grey drains down through it from the top over that many ms while its edge greys
// and its wave slows to a stop (the streak-lost scene, docs/launch-celebrations-spec.md Feature 7).
//
// Reduced motion: a burning flame is drawn still — solid in the pill's colour, with its dark edge,
// no wave and no colour flow. That is also what the Finish screen's reduced-motion version ends on,
// so the two agree at the hand-over into the header.

// The flame is the header's original icon, read out of avatar.js rather than retyped, so every
// flame in the app is the same shape.
const FLAME_D = (AVATAR_ICONS.flame.match(/ d="([^"]+)"/) || [])[1] || '';

// One cycle of each loop, shared by every flame on screen (see the phase lock below).
const FLOW_MS = 1600;
const WAVE_MS = 1300;

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

function readReduced() {
  try {
    return !!(window.matchMedia && window.matchMedia(REDUCE_QUERY).matches);
  } catch {
    return false;
  }
}

// Follows the setting live, so turning Reduce Motion on mid-session stills the header at once.
function useReducedMotion() {
  const [reduced, setReduced] = useState(readReduced);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(REDUCE_QUERY);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

const COLD_FILL = '#d9d1c6';
const COLD_EDGE = '#b9b0a4';

export default function Flame({ base = 'lit', catching = false, lit = false, burning = false, edge, paused = false, coolMs = 0 }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradId = 'flame-grad-' + uid;
  const coolId = 'flame-cool-' + uid;
  const reduced = useReducedMotion();
  const burnRef = useRef(null);
  const coolRectRef = useRef(null);

  // A paused flame is a lit one. A still one (reduced motion) keeps its dark edge.
  const moving = burning && !paused && !reduced;
  const still = burning && !paused && reduced;
  const showLit = (lit || (burning && paused)) && !moving && !still;
  const showBase = !lit && !burning;

  // ── Phase lock ──
  //
  // Each SVG runs its own animation clock from the moment it is inserted, so two burning flames
  // mounted at different times flicker out of step. That would show exactly once, and at the worst
  // moment: the hand-over at the end of the Finish screen, where the flying copy cross-fades into
  // the real header flame. Pinning both loops to the page's clock puts every flame in the app in
  // the same phase, so any two of them are interchangeable mid-flicker.
  useLayoutEffect(() => {
    const svg = burnRef.current;
    if (!moving || !svg) return;
    const now = performance.now();
    svg.style.animationDelay = -(now % WAVE_MS) + 'ms';
    try {
      if (svg.setCurrentTime) svg.setCurrentTime((now % FLOW_MS) / 1000);
    } catch {
      /* cosmetic: an unsynchronised flame is still a flame */
    }
  }, [moving]);

  // ── Cooling ──
  //
  // Inside the burning flame's own SVG, so the grey waves with the flame it is covering rather than
  // sitting still on top of a shape that is still moving. Driven frame by frame because the grey is
  // a clip rectangle's height, which not every browser will animate from CSS. The wave is slowed
  // through the same frames, to a standstill as the grey reaches the bottom.
  const cooling = coolMs > 0 && moving;
  useEffect(() => {
    if (!cooling) return undefined;
    const rect = coolRectRef.current;
    const svg = burnRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / coolMs);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      if (rect) rect.setAttribute('height', (26 * e).toFixed(2));
      if (svg && svg.getAnimations) svg.getAnimations().forEach((a) => { a.playbackRate = Math.max(0.0001, 1 - p); });
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cooling, coolMs]);

  return (
    <span className={'flame' + (moving ? ' burn' : '')}>
      <svg className={'flame-l flame-unlit' + (showBase && base === 'unlit' ? ' on' : '')} viewBox="0 0 24 24" aria-hidden="true">
        <path d={FLAME_D} />
      </svg>
      <svg className={'flame-l flame-cold' + (showBase && base === 'cold' ? ' on' : '')} viewBox="0 0 24 24" aria-hidden="true">
        <path d={FLAME_D} />
      </svg>
      <svg className={'flame-l flame-lit' + ((showBase && base === 'lit') || showLit ? ' on' : '')} viewBox="0 0 24 24" aria-hidden="true">
        <path d={FLAME_D} />
      </svg>
      <svg className={'flame-l flame-catch' + (catching && !lit && !burning ? ' on' : '')} viewBox="0 0 24 24" aria-hidden="true">
        <path d={FLAME_D} />
      </svg>
      <svg className={'flame-l flame-burn' + (moving || still ? ' on' : '')} viewBox="0 0 24 24" ref={burnRef} aria-hidden="true">
        <defs>
          {/* White → yellow → terracotta → white, repeating, so a one-cycle shift upward is
              seamless and can loop forever. userSpaceOnUse makes "one cycle" exactly the
              icon's 24-unit height. */}
          <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1="0" y1="24" x2="0" y2="0" spreadMethod="repeat">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".33" stopColor="#ffd166" />
            <stop offset=".66" stopColor="#d65a3a" />
            <stop offset="1" stopColor="#ffffff" />
            {/* Only mounted while moving, so a paused, still or hidden flame costs nothing. */}
            {moving && (
              <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="0 -24" dur={FLOW_MS / 1000 + 's'} repeatCount="indefinite" />
            )}
          </linearGradient>
          {cooling && (
            <clipPath id={coolId}>
              <rect ref={coolRectRef} x="-2" y="-1" width="28" height="0" />
            </clipPath>
          )}
        </defs>
        {/* The thin dark edge: a back copy 4 wide in a darker shade of the pill, and the front
            copy 2 wide on top, leaving a rim about one unit wide. */}
        <path
          d={FLAME_D} fill={edge} stroke={edge} strokeWidth="4"
          style={cooling ? { fill: COLD_EDGE, stroke: COLD_EDGE, transition: 'fill ' + coolMs + 'ms, stroke ' + coolMs + 'ms' } : undefined}
        />
        <path
          d={FLAME_D}
          fill={still ? 'currentColor' : 'url(#' + gradId + ')'}
          stroke={still ? 'currentColor' : 'url(#' + gradId + ')'}
          strokeWidth="2"
        />
        {cooling && (
          <path d={FLAME_D} fill={COLD_FILL} stroke={COLD_FILL} strokeWidth="2" clipPath={'url(#' + coolId + ')'} />
        )}
      </svg>
    </span>
  );
}
