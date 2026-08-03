// The app's view of the question engine.
//
// The generator itself no longer lives here — it moved to supabase/functions/_shared/generator.js
// so the server and the app could run literally the same code rather than two ports of it. What
// stays behind is everything that is about DISPLAY, which is the app's business and not the
// server's: number formatting in the device's locale, operation and difficulty names in the
// player's language, and the wrappers that hand those two things to the shared generator.
//
// Every export this file had before, it still has, with the same signature. Nothing that imports
// it had to change.

import { t } from '../i18n_data.js';
import {
  createEngine,
  digitsInQuestion,
  termsInQuestion,
  maxD,
  minD,
  DIFF_MULT,
  DIFFS_ENG,
  ALL_OPS,
} from '../../supabase/functions/_shared/generator.js';
import { OMULT, calcSc } from '../../supabase/functions/_shared/scoring.js';

export { digitsInQuestion, termsInQuestion, maxD, minD, DIFFS_ENG, OMULT, calcSc };

// `dm` is read straight off the shared table rather than restated here. It is the number the
// server multiplies by, and a second copy of it in the app would be a second opinion about what
// a Hard question is worth.
export const DIFFS = {
  easy: { label: 'Easy', ops: ALL_OPS, digits: [1, 2], terms: [2], neg: false, dec: false, dm: DIFF_MULT.easy, _diff: 'easy' },
  medium: { label: 'Medium', ops: ALL_OPS, digits: [1, 2], terms: [2], neg: false, dec: false, dm: DIFF_MULT.medium, _diff: 'medium' },
  hard: { label: 'Hard', ops: ALL_OPS, digits: [2, 3], terms: [2, 3], neg: true, dec: true, dm: DIFF_MULT.hard, _diff: 'hard' },
};

export const ONAME = { addition: 'Addition', subtraction: 'Subtraction', multiplication: 'Multiplication', division: 'Division', percentage: 'Percentage' };

export function diffLabel(lang, d) {
  return t(lang, 'diff_' + d);
}
export function diffInfoText(lang, d) {
  return t(lang, 'diffinfo_' + d);
}
export function opName(lang, op) {
  return t(lang, 'opname_' + op) || ONAME[op] || op;
}

// Ordinary randomness, for the parts of the app that are not server-verified and do not need to
// be reproducible: the Practice tab and the Tricks generators. Challenge and Braining go through
// a seeded generator instead, so that what they asked can be proved.
export function rn(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

// Number formatting in the DEVICE's locale, which is why it stayed here. A Russian phone renders
// a decimal as "12,5" and an English one as "12.5", and the server has no business deciding
// which of those a player sees — so the server sends a seed, and the number is formatted at the
// point it is drawn. See rng.js for the whole argument.
export function fn(n) {
  if (typeof n !== 'number' || isNaN(n)) return String(n);
  const r = Math.round(n * 10) / 10;
  if (Number.isInteger(r)) return r.toLocaleString();
  return r.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function negDisp(n) {
  return '(−' + fn(Math.abs(n)) + ')';
}
export function makeInt(d) {
  return rn(minD(d), maxD(d));
}

// An engine wired to this device: locale-aware formatting, the player's word for "of", and
// whichever source of randomness the caller wants.
//
// `seed` is what a server-issued set passes, and it is the whole point — given the same seed the
// server used, this produces the same questions the server recorded the answers to. Omit it and
// you get ordinary randomness, which is the offline and practice path.
export function engineFor(lang, seed) {
  return createEngine({ seed, fmt: fn, wordOf: t(lang, 'word_of') });
}

// One locally-generated question. Unchanged signature: the game hooks still call
// makeQ(lang, DIFFS[diff]) and get back {q, ans, op, digits, terms}.
//
// This is now the FALLBACK path rather than the only path — it runs for practice runs, which
// count for nothing and never needed verifying, and for a counting run that could not reach the
// server. A run played this way is recorded locally exactly as before and simply is not
// leaderboard-eligible. The alternative, refusing to deal a question until the network answers,
// would make a game rule depend on a request succeeding, which this app does not do.
export function makeQ(lang, cfg) {
  return engineFor(lang).challengeQ(cfg._diff || 'easy');
}
