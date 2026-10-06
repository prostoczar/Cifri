// The tier palette shared by achievement ceremonies (by rarity) and streak milestone ceremonies (by
// milestone) — docs/launch-celebrations-spec.md, "Shared foundations". One palette, five tiers, so
// a rare achievement and a red streak day are the same red, and the achievements list's rarity
// chips (index.css, .ms-rarity) are drawn from the same values.
//
//   bg         the flood
//   title      the name and the big number — yellow on green, never white
//   body       description and milestone text
//   chipBg/Tx  the chip at the top
//   ring       the ring around the medallion; `ring2` is epic's inner ring
//   sym/shadow the medallion's symbol colour, and the solid shadow under it
//   edge       a burning flame's dark edge on this background
//   dot        the streak ceremony's ring of dots, filled
export const TIERS = {
  common: {
    bg: '#e3dfda', title: '#2b2b2b', body: '#6b6259', chipBg: '#6b6259', chipTx: '#ffffff',
    ring: '#a39d96', sym: '#6b6259', shadow: '#bdb7b0', edge: '#5a554f', dot: '#6b6259', sparks: 0,
  },
  uncommon: {
    bg: '#efdcc0', title: '#3d2c14', body: '#7a6040', chipBg: '#8a6a3e', chipTx: '#ffffff',
    ring: '#b08a55', sym: '#8a6a3e', shadow: '#d2b78e', edge: '#7a5a2e', dot: '#8a6a3e', sparks: 10,
  },
  rare: {
    bg: '#d65a3a', title: '#ffffff', body: '#fbe1d8', chipBg: '#ffffff', chipTx: '#b8462a',
    ring: '#f2a58f', sym: '#d65a3a', shadow: '#a8412a', edge: '#7a2e1a', dot: '#ffd166', sparks: 16,
  },
  epic: {
    bg: '#0f9d6c', title: '#ffd166', body: '#dff3ea', chipBg: '#ffd166', chipTx: '#3d2a00',
    ring: '#ffffff', ring2: '#ffd166', sym: '#0f9d6c', shadow: '#0a7a54', edge: '#0a5c40', dot: '#ffd166', sparks: 24,
  },
  legendary: {
    bg: '#ffd166', title: '#3d2a00', body: '#6b4c00', chipBg: '#3d2a00', chipTx: '#ffd166',
    ring: '#d65a3a', sym: '#c48a00', shadow: '#c49030', edge: '#7a5200', dot: '#d65a3a', sparks: 34,
  },
};

export const TIER_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Epic and legendary are big enough to shake the screen.
export function tierShakes(tier) {
  return tier === 'epic' || tier === 'legendary';
}

// The CSS custom properties a scene paints itself with, so one stylesheet serves all five tiers.
export function tierVars(tier) {
  const p = TIERS[tier] || TIERS.common;
  return {
    '--t-bg': p.bg, '--t-title': p.title, '--t-body': p.body, '--t-chip-bg': p.chipBg, '--t-chip-tx': p.chipTx,
    '--t-ring': p.ring, '--t-ring2': p.ring2 || p.ring, '--t-sym': p.sym, '--t-shadow': p.shadow,
    '--t-edge': p.edge, '--t-dot': p.dot,
  };
}
