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
//   { kind: 'lit',    card }                   "You've lit a streak!" — grey, flame, sign-up ask
//   { kind: 'ach',    card, ach, tier }        one achievement's ceremony, in its catalogue rarity
//   { kind: 'more',   entries: [ach…], tier }  the closing "+{n} more" card
//   { kind: 'legacy', card, queue: [card] }    any other ad-hoc card, shown as the simple old card
//
// Order: the sign-up prompt (lowest, and never folded away — it is the one card that asks for
// something), then achievements from lowest rarity to highest so the run builds to its biggest
// moment, then "+{n} more", then anything left on the simple card.

import { ACHIEVEMENT_BY_KEY, RARITIES } from '../store/achievements.js';

export const MAX_CEREMONIES = 3;

export function buildCeremonies(cards) {
  const achs = [];
  const legacy = [];
  let lit = null;
  for (const card of cards || []) {
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
  if (lit) items.push(lit);
  items.push(...shown);
  if (rest.length) {
    items.push({ kind: 'more', entries: rest.map((r) => r.ach), tier: rest[rest.length - 1].tier });
  }
  items.push(...legacy);
  return items;
}
