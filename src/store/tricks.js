import { TRICKS, TRICKS_RU, GROUP_NAMES_RU } from './tricksData.js';
import { dayKey, dateStrToDate } from './dates.js';

// Flat index over the whole library, in display order. Trick of the Day cycles through this.
export const TRICKS_FLAT = TRICKS.flatMap((g, gi) => g.items.map((_, ti) => ({ gi, ti })));

export function trGroupName(lang, name) {
  if (lang === 'ru' && GROUP_NAMES_RU[name]) return GROUP_NAMES_RU[name];
  return name;
}

// Translated {name, explain, steps} for a trick, falling back to its English fields. Keyed by
// group and name together — a few trick names repeat across groups (e.g. "Round & adjust").
export function trTrick(lang, trick, groupName) {
  const key = groupName + '::' + trick.name;
  if (lang === 'ru' && TRICKS_RU[key]) return TRICKS_RU[key];
  return { name: trick.name, explain: trick.explain, steps: trick.steps };
}

// One trick per calendar day, the same for everyone — deterministic from the date, cycling
// through the whole library. The epoch is arbitrary; it only has to never change.
export function trickOfDayIndex() {
  const n = TRICKS_FLAT.length;
  if (!n) return 0;
  const epoch = new Date(2025, 0, 1);
  const today = dateStrToDate(dayKey());
  const days = Math.round((today.getTime() - epoch.getTime()) / 86400000);
  return ((days % n) + n) % n;
}

export function trickOfDayRef() {
  return TRICKS_FLAT[trickOfDayIndex()];
}
