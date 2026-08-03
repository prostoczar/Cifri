// The Test: a fixed set of the 20 hardest questions a given trick can ask.
//
// There is no difficulty concept anywhere in the tricks library. Each of the 47 tricks has a
// single gen() that draws from hardcoded ranges — `rn(20,80) + rn(11,59)`, `rn(12,49)²` — with no
// easy/hard axis to sort by. So "hardest" is not something that can be looked up here; it has to
// be defined.
//
// It is defined by SCORING each trick's own output and taking the top of it. Not one generator is
// touched, and nothing new is authored. A large pool is drawn from the real gen(), every candidate
// is scored by the same measure, and the best 20 are kept. Because the score only ever re-orders
// questions a trick already produces, it cannot invent a question that trick would never ask —
// that is the property that makes this safe to do generically across all 47 at once.
//
// The set is FIXED, not merely hard: the pool comes from a seeded generator keyed to the trick, so
// the same twenty questions appear for every player, on every device, every time. Selection runs
// against the English pool and stores INDICES, not text, so a Russian player gets the same twenty
// questions in their own language rather than a differently-chosen twenty.
//
// If curated questions ever replace generated ones, they replace them here: everything downstream
// asks this module for a list and does not care where the list came from.
import { TRICKS, setTricksLang } from './tricksData.js';

export const TEST_LENGTH = 20;
export const PRACTICE_LENGTH = 20;
// All 20, each right at the first attempt. The Test is a claim that you know the trick, and one
// wrong answer ends the attempt on the spot rather than letting it be absorbed by a margin — so
// reaching question twenty and passing are the same event. (This replaced a 16-of-20 pass mark;
// the constant kept its name because that is what the mark IS, not what it happens to equal.)
export const TEST_PASS_MARK = TEST_LENGTH;

// How many candidates to draw before ranking. Large enough that the top 20 are genuinely the tail
// of the distribution rather than whatever turned up, small enough to build in a few milliseconds.
const POOL_SIZE = 600;

// mulberry32 — small, fast, and stable across engines, which matters because the whole point is
// that every device produces the same twenty questions.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Two arbitrary large odd numbers; they only have to spread the 47 tricks apart and never change.
function seedFor(gi, ti) {
  return ((gi + 1) * 9973 + (ti + 1) * 611953) >>> 0;
}

// ── Difficulty ────────────────────────────────────────────────────────────────
//
// fn() formats numbers for display, so a question can read "1,620" or "1 620" depending on the
// device's locale. Left alone that parses as two small numbers instead of one large one, and a
// trick's hardest questions would be ranked as if they were its easiest.
function normalizeDigits(text) {
  return String(text).replace(/(\d)[\s,  ](?=\d)/g, '$1');
}

// Bigger operands, bigger answers, more of them, and numbers that resist mental shortcuts all
// push the score up. The weights matter far less than they look: this only ever ranks one trick's
// questions against each other, never one trick against another.
export function difficultyOf(q, ans) {
  const nums = (normalizeDigits(q).match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const answer = Math.abs(Number(ans) || 0);
  let score = 0;
  if (nums.length) {
    score += 2.0 * Math.log10(Math.max.apply(null, nums) + 1);
    score += 0.35 * nums.length;
    for (const n of nums) {
      if (!Number.isInteger(n)) score += 0.9;        // a decimal operand is the hardest kind
      else if (n % 10 && n % 5) score += 0.5;        // resists both the ×10 and ×5 shortcuts
      else if (n % 10) score += 0.2;                 // ends in 5: still easier than arbitrary
    }
  }
  score += 1.6 * Math.log10(answer + 1);
  if (!Number.isInteger(Number(ans))) score += 1.1;
  return score;
}

// ── Building a trick's pool ───────────────────────────────────────────────────
//
// The generators call rn() from questionEngine, and ten of them also call Math.random directly.
// Rather than edit 47 generators to accept a random source, Math.random is swapped for the seeded
// one for the duration of the draw and put back afterwards. The swap spans only synchronous
// calls, so nothing else can observe it.
function buildPool(gi, ti, lang) {
  const trick = TRICKS[gi].items[ti];
  const rand = mulberry32(seedFor(gi, ti));
  const realRandom = Math.random;
  const pool = [];
  setTricksLang(lang);
  try {
    Math.random = rand;
    for (let i = 0; i < POOL_SIZE; i++) {
      try {
        pool.push(trick.gen());
      } catch (e) {
        pool.push(null); // a generator that throws costs one candidate, not the whole Test
      }
    }
  } finally {
    Math.random = realRandom;
  }
  return pool;
}

// The indices of the hardest distinct questions, ranked. Computed from the English pool only, so
// the selection is one decision shared by every language rather than one per language.
const indexCache = {};
function hardestIndices(gi, ti) {
  const key = gi + '-' + ti;
  if (indexCache[key]) return indexCache[key];

  const pool = buildPool(gi, ti, 'en');
  const seen = {};
  const ranked = [];
  for (let i = 0; i < pool.length; i++) {
    const cand = pool[i];
    if (!cand || typeof cand.ans !== 'number' || !isFinite(cand.ans)) continue;
    // Two draws that produce the same question are the same question. Keeping only the first
    // index is what stops a Test being "20 questions" that are really six repeated.
    if (seen[cand.q]) continue;
    seen[cand.q] = true;
    ranked.push({ i, score: difficultyOf(cand.q, cand.ans) });
  }
  // Ties break on pool position, so the order is total and therefore reproducible.
  ranked.sort((a, b) => (b.score - a.score) || (a.i - b.i));

  const out = ranked.slice(0, TEST_LENGTH).map((r) => r.i);
  // A few tricks cannot produce 20 distinct questions at all — "Rule of 70" picks from 7 fixed
  // rates, "Fraction to decimal" from 14 fractions. Their hardest are cycled to fill the Test
  // rather than padding it with easier ones.
  if (out.length && out.length < TEST_LENGTH) {
    let n = 0;
    while (out.length < TEST_LENGTH) out.push(out[n++ % ranked.length]);
  }
  indexCache[key] = out;
  return out;
}

// The 20 questions of a trick's Test, in the player's language. Hardest first: a Test should open
// at full weight rather than easing in, and the order is as fixed as the set.
export function testQuestions(gi, ti, lang) {
  const idx = hardestIndices(gi, ti);
  const pool = buildPool(gi, ti, lang || 'en');
  return idx.map((i) => pool[i]).filter(Boolean);
}

// How many genuinely distinct questions a trick can produce — reported so a curation pass can see
// at a glance which tricks are too narrow to fill a Test on their own.
export function distinctPoolSize(gi, ti) {
  const pool = buildPool(gi, ti, 'en');
  const seen = {};
  let n = 0;
  for (const c of pool) {
    if (!c || seen[c.q]) continue;
    seen[c.q] = true;
    n++;
  }
  return n;
}
