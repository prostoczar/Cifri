// Avatar system — the colour combinations, icon set and symbol list are copied verbatim from
// the reference prototype, so the picker's output is identical.
//
// The four colour combinations map onto CSS variables that already exist in the app, and each
// carries the shadow shade already used elsewhere for that same background (light-green chips,
// yellow chips, light-terracotta chips, grey buttons). That colour-matched shadow is applied in
// exactly one place — avatarStyle() below — so the header button, profile sheet, account screens
// and the picker's own preview can never drift apart.

export const AVATAR_COLORS = {
  green:{bg:'var(--GL2)',fg:'var(--GDK)',shadow:'#a8d8cc'},
  yellow:{bg:'var(--YL)',fg:'var(--YLT)',shadow:'#c49030'},
  terracotta:{bg:'var(--TCL)',fg:'var(--TC)',shadow:'#d4b0a4'},
  grey:{bg:'var(--card-grey)',fg:'var(--txt)',shadow:'var(--border2)'}
};
// Exact icon set from the approved sandbox file, copied as given.
export const AVATAR_ICONS = {
  flame:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  weights:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="10" width="3" height="4" rx="1"/><rect x="19" y="10" width="3" height="4" rx="1"/><rect x="5" y="8" width="3" height="8" rx="1"/><rect x="16" y="8" width="3" height="8" rx="1"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  drop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.32 0z"/></svg>',
  house:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 11 12 4 20 11"/><rect x="6" y="11" width="12" height="9" rx="1"/><rect x="10" y="14" width="4" height="6"/></svg>',
  plane:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 21 4 14 20 11 13 3 11"/><line x1="11" y1="13" x2="21" y2="4"/></svg>',
  bike:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="3.5"/><circle cx="18" cy="17" r="3.5"/><line x1="6" y1="17" x2="10" y2="9"/><line x1="10" y1="9" x2="15" y2="9"/><line x1="10" y1="9" x2="14" y2="17"/><line x1="14" y1="17" x2="18" y2="17"/><line x1="15" y1="9" x2="18" y2="17"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/></svg>',
  person:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/></svg>',
  briefcase:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg>',
  book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h6v18H6a2 2 0 0 1-2-2z"/><path d="M20 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 0 2-2z"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 5H4a3 3 0 0 0 3 5"/><path d="M17 5h3a3 3 0 0 1-3 5"/><line x1="12" y1="13" x2="12" y2="17"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="9" y1="17" x2="15" y2="17"/></svg>',
  gift:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 12h18"/><path d="M12 8v13"/><path d="M8 8c-1.5 0-2.5-1-2.5-2.5S6.5 3 8 3c2 0 4 3 4 5"/><path d="M16 8c1.5 0 2.5-1 2.5-2.5S17.5 3 16 3c-2 0-4 3-4 5"/></svg>',
  moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.5A9 9 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.2" y1="4.2" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"/><line x1="4.2" y1="19.8" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.8" y2="4.2"/></svg>',
  rocket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c3 2 5 6 5 10 0 2-1 4-2 5l-3 3-3-3c-1-1-2-3-2-5 0-4 2-8 5-10z"/><circle cx="12" cy="10" r="2"/><path d="M8 15l-3 1 1-3"/><path d="M16 15l3 1-1-3"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>',
  crown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17h18M4 17V9l4 3.5L12 6l4 6.5 4-3.5v8"/><circle cx="4" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="4" r="1.3" fill="currentColor" stroke="none"/><circle cx="20" cy="7" r="1.3" fill="currentColor" stroke="none"/></svg>'
};
export const AVATAR_SYMBOLS = ['+','−','×','÷','%','=','√','∞','Σ','π','Δ','α','β','Ω','∫','±','≠','≈','°','½','∅','≤','≥','∴'];

// The spec to actually render: the saved avatar once customized, otherwise a live fallback that
// always tracks the current username's first letter (the pre-picker behaviour).
export function avatarSpecFor(avatar, username) {
  if (avatar && avatar.customized) return avatar;
  return { type: 'letters', value: (username || '?')[0].toUpperCase(), color: 'green', size: 55 };
}

// Content is sized relative to a 96px reference — the diameter the picker's slider values are
// defined against — so an avatar looks the same at 36px in the header as at 96px in the preview.
export function avatarContentPx(spec, diameterPx) {
  return Math.round((spec.size || 55) * (diameterPx / 96));
}

export function avatarStyle(spec, diameterPx) {
  const c = AVATAR_COLORS[spec.color] || AVATAR_COLORS.green;
  return {
    width: diameterPx, height: diameterPx, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, overflow: 'hidden',
    background: c.bg, color: c.fg,
    boxShadow: '0 2px 0 ' + c.shadow,
    fontWeight: 900,
  };
}

// Shrinking an SVG's width/height also shrinks its stroke proportionally, because the viewBox
// scales with it — at header size that rendered icons as thin anti-aliased lines that read grey
// rather than solid. Floor the on-screen stroke so icons stay crisp at every size.
export function avatarIconStrokeWidth(contentPx) {
  const targetScreenStroke = 2.4, viewBoxUnits = 24;
  return Math.max(2, (targetScreenStroke * viewBoxUnits) / Math.max(contentPx, 1)).toFixed(2);
}
