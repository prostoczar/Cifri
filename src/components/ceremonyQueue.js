// Which ceremonies to play, and in what order, for one batch of unlocked cards
// (docs/launch-celebrations-spec.md, Feature 5, "When and in what order").
//
// Pure, and kept apart from the screens that play it, so scripts/check-ceremonies.mjs can drive it
// with every awkward batch there is — four achievements at once, the first-streak prompt, a streak
// card with no catalogue row — and prove the order, rather than anyone having to earn five
// achievements in one run to see it.
//
// A card is what the reducer hands back (see AchievementPopup for the two shapes): a catalogue
// `{ key }`, or an ad-hoc `{ nameKey, … }`. The result is a list of items, each played in turn:
//
//   { kind: 'streak', days, tier, textKey, ach } a streak milestone ceremony; `ach` is set only when
//                                              that day's achievement was unlocked just now
//   { kind: 'lit',    card }                   "You've lit a streak!" — grey, flame, sign-up ask
//   { kind: 'ach',    card, ach, tier }        one achievement's ceremony, in its catalogue rarity
//   { kind: 'more',   entries: [ach…], tier }  the closing "+{n} more" card
//   { kind: 'legacy', card, queue: [card] }    any other ad-hoc card, shown as the simple old card
//
// Order: a streak milestone first, then the sign-up prompt (lowest, and never folded away — it is
// the one card that asks for something), then achievements from lowest rarity to highest so the
// run builds to its biggest moment, then "+{n} more", then anything left on the simple card.
//
// ── Streak days (spec Feature 6, and the decisions recorded at the end of the spec) ──
//
// App.jsx adds one synthetic card, `{ streakStep: { from, to } }`, when a game has just moved the
// streak. The ceremony is DERIVED from that step and from the cards, never stored, so it plays every
// time a game takes the streak onto a milestone day — a new streak reaching 7 again celebrates again
// — with the reward row only when the day's achievement is genuinely new.
//
//   - a milestone day that is also a streak achievement (7, 14, 30, 60, 90, 365): the streak
//     ceremony, carrying the achievement's reward row; no separate achievement ceremony
//   - a milestone day with no achievement (120, 150, 183, 210 … 330): the streak ceremony alone,
//     taking the place of the plain "{n}-day streak" card the game would otherwise show
//   - 180: not a milestone day, so its achievement plays the normal ceremony, in its rarity
//   - 360: no ceremony at all; it keeps the simple card (decided 6 Oct 2026)
//   - every day the game counts after 365 (390, 420 …): the gold flame ceremony, no reward row

import { ACHIEVEMENT_BY_KEY, RARITIES, streakMilestoneThreshold } from '../store/achievements.js';

// The fourteen milestone days and their tiers (grey, beige, red, green, gold).
export const STREAK_MILESTONES = {
  7: 'common', 14: 'common', 30: 'common',
  60: 'uncommon', 90: 'uncommon', 120: 'uncommon',
  150: 'rare', 183: 'rare', 210: 'rare',
  240: 'epic', 270: 'epic', 300: 'epic',
  330: 'legendary', 365: 'legendary',
};

/** The streak ceremony a streak length earns — { tier, textKey } — or null. */
export function streakCeremonyFor(n) {
  if (STREAK_MILESTONES[n]) return { tier: STREAK_MILESTONES[n], textKey: 'sm_' + n };
  if (n > 365 && streakMilestoneThreshold(n)) return { tier: 'legendary', textKey: 'ms_streak_desc' };
  return null;
}

// The streak length a reducer card celebrates: a catalogue `streak_N`, or the plain ad-hoc card.
function streakCardDay(card) {
  const m = card.key && /^streak_(\d+)$/.exec(card.key);
  if (m) return Number(m[1]);
  if (card.nameKey === 'ms_streak_name' && card.vars) return Number(card.vars.n) || null;
  return null;
}

export const MAX_CEREMONIES = 3;

export function buildCeremonies(cards) {
  const achs = [];
  const legacy = [];
  let lit = null;

  // The streak first: from the game's own step, or failing that from a streak card in the batch.
  let streakDay = null;
  for (const card of cards || []) {
    if (card && card.streakStep && card.streakStep.to > card.streakStep.from && streakCeremonyFor(card.streakStep.to)) {
      streakDay = card.streakStep.to;
    }
  }
  for (const card of cards || []) {
    const d = card && !card.streakStep ? streakCardDay(card) : null;
    if (d && streakDay === null && streakCeremonyFor(d)) streakDay = d;
  }
  let streakAch = null;

  for (const card of cards || []) {
    if (!card || card.streakStep) continue;
    // A card for the milestone day itself is folded into the streak ceremony — as its reward row,
    // if it is an achievement.
    if (streakDay !== null && streakCardDay(card) === streakDay) {
      if (card.key && ACHIEVEMENT_BY_KEY[card.key]) streakAch = ACHIEVEMENT_BY_KEY[card.key];
      continue;
    }
    const ach = card && card.key ? ACHIEVEMENT_BY_KEY[card.key] : null;
    if (ach) achs.push({ kind: 'ach', card, ach, tier: ach.rarity });
    else if (card && card.nameKey === 'ms_streaklit_name') lit = { kind: 'lit', card, tier: 'common' };
    else if (card) legacy.push({ kind: 'legacy', card, queue: [card] });
  }

  // Lowest rarity first. The index rides along so equal rarities keep the order they were earned
  // in, rather than depending on the sort being stable.
  const ranked = achs
    .map((it, i) => ({ it, i }))
    .sort((a, b) => RARITIES.indexOf(a.it.tier) - RARITIES.indexOf(b.it.tier) || a.i - b.i)
    .map((x) => x.it);

  // More than three at once: the three highest get ceremonies, the rest share one closing card in
  // the colour of the highest of them.
  let shown = ranked;
  let rest = [];
  if (ranked.length > MAX_CEREMONIES) {
    shown = ranked.slice(-MAX_CEREMONIES);
    rest = ranked.slice(0, -MAX_CEREMONIES);
  }

  const items = [];
  if (streakDay !== null) {
    const sc = streakCeremonyFor(streakDay);
    items.push({ kind: 'streak', days: streakDay, tier: sc.tier, textKey: sc.textKey, ach: streakAch });
  }
  if (lit) items.push(lit);
  items.push(...shown);
  if (rest.length) {
    items.push({ kind: 'more', entries: rest.map((r) => r.ach), tier: rest[rest.length - 1].tier });
  }
  items.push(...legacy);
  return items;
}
