import { useLayoutEffect, useState } from 'react';
import { impact, success } from '../lib/haptics.js';

// What the achievement and streak ceremonies share beyond the stylesheet: where the medallion sits,
// how far the flood must reach, where the pill flies to and where the reward lands — all measured
// from the real screen, never assumed — and the buzz at the big moment.

// An element's position inside `root`, ignoring transforms — so a piece can be measured at its
// resting place while it is still waiting, offset, to fade up into it.
function offsetWithin(el, root) {
  let x = 0, y = 0, e = el;
  while (e && e !== root) {
    x += e.offsetLeft;
    y += e.offsetTop;
    e = e.offsetParent;
  }
  return { x, y };
}

/**
 * The scene's layout as CSS custom properties (see "CEREMONIES" in index.css): --mx/--my the
 * medallion's centre, --R the flood's radius (to the farthest corner), --chip-y, --pill-dy (the
 * pill's flight up to the chip), and --fx/--fy (the reward's flight to the avatar circle).
 */
export function useCeremonyLayout(rootRef, avatarRef) {
  const [vars, setVars] = useState({});
  useLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      const W = root.clientWidth, H = root.clientHeight;
      const mx = W / 2;
      const my = Math.round(Math.max(160, Math.min(H * 0.29, H - 450)));
      const chipY = Math.max(18, my - 172);
      const R = Math.ceil(Math.max(Math.hypot(mx, my), Math.hypot(mx, H - my))) + 8;
      const v = {
        '--mx': mx + 'px', '--my': my + 'px', '--R': R + 'px', '--chip-y': chipY + 'px',
        '--pill-dy': (chipY + 14 - my) + 'px',
      };
      const av = avatarRef && avatarRef.current;
      if (av) {
        const o = offsetWithin(av, root);
        v['--fx'] = (o.x + av.offsetWidth / 2 - mx) + 'px';
        v['--fy'] = (o.y + av.offsetHeight / 2 - my) + 'px';
      }
      setVars(v);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return vars;
}

/** The haptic at a ceremony's big moment, by tier (spec Feature 5, "Haptics"). */
export function stampHaptic(tier) {
  if (tier === 'common') impact('light');
  else if (tier === 'uncommon' || tier === 'rare') impact('medium');
  else {
    impact('heavy');
    if (tier === 'legendary') setTimeout(success, 160);
  }
}
