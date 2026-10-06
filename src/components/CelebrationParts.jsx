import { useEffect, useRef } from 'react';
import { AVATAR_ICONS, avatarIconStrokeWidth } from '../store/avatar.js';
import { TIERS } from './celebrateTiers.js';

// Pieces shared by the full-screen celebrations (docs/launch-celebrations-spec.md): the reward
// glyph, the tier ring around a medallion, and the burst of sparks. Each draws itself at the centre
// of whatever positioned box it is placed in; the scene positions that box.

/** A reward — an avatar symbol (text) or icon (SVG) — at `px`, in the current text colour. */
export function RewardGlyph({ reward, px }) {
  if (!reward) return null;
  if (reward.type === 'icon' && AVATAR_ICONS[reward.value]) {
    const svg = AVATAR_ICONS[reward.value]
      .replace('<svg', `<svg width="${px}" height="${px}" stroke-width="${avatarIconStrokeWidth(px)}"`);
    return <span className="cel-glyph" style={{ width: px, height: px }} dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  return <span className="cel-glyph" style={{ fontSize: px, width: px, height: px }}>{reward.value}</span>;
}

// Points on a circle, as [x, y], starting at 12 o'clock.
function around(n, r, offsetDeg = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ((i / n) * 360 + offsetDeg - 90) * (Math.PI / 180);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}
function rays(n, r0, lens, width, color, offsetDeg = 0) {
  return (
    <g>
      {around(n, 1, offsetDeg).map(([x, y], i) => {
        const len = lens[i % lens.length];
        return (
          <line key={i} x1={x * r0} y1={y * r0} x2={x * (r0 + len)} y2={y * (r0 + len)}
            stroke={color} strokeWidth={width} strokeLinecap="round" />
        );
      })}
    </g>
  );
}
function twinkles(n, color, r0, r1) {
  return around(n, 1, 17).map(([x, y], i) => {
    const r = r0 + ((i * 37) % 100) / 100 * (r1 - r0);
    return (
      <g key={i} transform={`translate(${(x * r).toFixed(1)} ${(y * r).toFixed(1)})`}>
        <path className="cel-twinkle" style={{ animationDelay: (i * 0.37).toFixed(2) + 's' }}
          d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z" fill={color} />
      </g>
    );
  });
}

// A group turning forever about the ring's centre. SVG's own animation rather than CSS, because a
// CSS rotation's pivot inside an SVG is resolved differently across browsers, and this one is
// stated outright as (0, 0). Not mounted at all when still (reduced motion).
function Turn({ secs, back, still, children, opacity }) {
  return (
    <g opacity={opacity}>
      {!still && (
        <animateTransform attributeName="transform" type="rotate" from="0 0 0" to={(back ? -360 : 360) + ' 0 0'}
          dur={secs + 's'} repeatCount="indefinite" />
      )}
      {children}
    </g>
  );
}

/**
 * The ring around a medallion, growing with the tier (spec Feature 5, "The ring grows with
 * rarity"). Drawn in a 300 × 300 box centred on the medallion (radius 58); the scene opens it with
 * `spinIn`, and its turning parts go on turning — through a skip, too. `still` (reduced motion)
 * draws it without any movement.
 */
export function TierRing({ tier, still = false }) {
  const p = TIERS[tier] || TIERS.common;
  let body = null;
  if (tier === 'common') {
    body = <circle r="70" fill="none" stroke={p.ring} strokeWidth="3" />;
  } else if (tier === 'uncommon') {
    body = (
      <Turn secs={40} still={still}>
        {around(16, 78).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill={p.ring} />)}
      </Turn>
    );
  } else if (tier === 'rare') {
    body = <Turn secs={30} still={still}>{rays(12, 70, [26, 14], 9, p.ring)}</Turn>;
  } else if (tier === 'epic') {
    body = (
      <>
        <Turn secs={24} still={still}>{rays(16, 78, [30], 7, p.ring)}</Turn>
        <Turn secs={16} back still={still}>{rays(8, 63, [9], 6, p.ring2, 22.5)}</Turn>
        {twinkles(7, p.ring2, 96, 132)}
      </>
    );
  } else {
    // Legendary: soft white beams behind, the logo-style terracotta sunburst, orbiting dots, twinkles.
    body = (
      <>
        <Turn secs={36} back still={still} opacity="0.4">
          {around(8, 1).map(([x, y], i) => {
            const a = Math.atan2(y, x), w = 0.13;
            const pt = (ang, r) => `${(Math.cos(ang) * r).toFixed(1)} ${(Math.sin(ang) * r).toFixed(1)}`;
            return <path key={i} d={`M0 0 L${pt(a - w, 146)} L${pt(a + w, 146)} Z`} fill="#ffffff" />;
          })}
        </Turn>
        <Turn secs={28} still={still}>{rays(24, 72, [30, 18], 9, p.ring)}</Turn>
        <Turn secs={12} still={still}>
          {around(10, 118).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4.5" fill="#ffffff" />)}
        </Turn>
        {twinkles(8, '#ffffff', 100, 140)}
      </>
    );
  }
  return (
    <svg className="cel-ring" viewBox="-150 -150 300 300" aria-hidden="true">{body}</svg>
  );
}

/**
 * Sparks bursting outward from the centre: small dots that fly out and fade (the `burst` easing,
 * 750 ms). Played by the Web Animations API when `go` turns true, and never on a skip — a burst
 * that has already happened is not shown happening.
 */
export function Sparks({ n, colors, go, distance = 150 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!go || !ref.current) return;
    [...ref.current.children].forEach((el, i) => {
      const a = (i / n) * 360 + (i % 3) * 9;
      const d = distance * (0.7 + ((i * 53) % 30) / 100);
      // Written as a list of CSS functions rather than one string, as FinishScreen does.
      const at = (dist, k) => ['rotate(' + a + 'deg)', 'translateX(' + dist + 'px)', 'scale(' + k + ')'].join(' ');
      el.animate([
        { transform: at(0, 1), opacity: 1 },
        { transform: at(d, 0.4), opacity: 0 },
      ], { duration: 750, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
    });
  }, [go, n, distance]);
  if (!n) return null;
  return (
    <div className="cel-sparks" ref={ref} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="cel-spark" style={{ background: colors[i % colors.length] }} />
      ))}
    </div>
  );
}

/** The legendary ∞: a green and a white line drawing a lemniscate round the medallion. */
export function InfinityDraw() {
  const d = [];
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2, s = Math.sin(t), c = Math.cos(t), k = 1 + s * s;
    d.push(`${i ? 'L' : 'M'}${((140 * c) / k).toFixed(1)} ${((140 * s * c) / k).toFixed(1)}`);
  }
  return (
    <svg className="cel-inf" viewBox="-150 -150 300 300" aria-hidden="true">
      <path d={d.join('') + 'Z'} pathLength="1" fill="none" stroke="#0f9d6c" strokeWidth="9" strokeLinecap="round" />
      <path d={d.join('') + 'Z'} pathLength="1" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
