// The question generator, shared verbatim between the server and the app.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THIS FILE IS THE ONLY GENERATOR. `src/store/questionEngine.js` and `src/store/braining.js`
// re-export from here rather than keeping copies. That is the point: the server has to be able
// to say what it asked, and the only way that claim is worth anything is if the code that asked
// it and the code that checks it are the same code, not two ports of one idea.
//
// It lives under supabase/functions/ because Deno will only reliably bundle what sits beneath
// it. Vite has no such restriction and reaches up into it happily, so the direction of the
// dependency is decided by the stricter of the two runtimes.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// WHAT CHANGED IN THE PORT, AND WHAT DID NOT
//
// Not one line decides anything differently. Every generator below picks the same numbers, in
// the same order, under the same retry conditions as the version this was lifted from. Three
// things that used to be reached for globally are now passed in:
//
//   rng     — was Math.random(). Now injectable, which is what lets a whole set be described by
//             a single seed. See rng.js for why that matters.
//   fmt     — was fn(). Number formatting is locale-dependent ("12.5" vs "12,5"), so it belongs
//             to whoever is DISPLAYING the question, not to whoever generated it.
//   wordOf  — was t(lang, 'word_of'). Same reasoning: "of" / "от" is a display concern.
//
// `ans` and `op` — the only two values scoring ever reads — are computed from numbers and never
// parsed back out of the formatted string, so neither can be moved by fmt or wordOf. That is
// what makes it safe for the server and the phone to format differently and still agree on what
// the answer was. check:parity proves it rather than assuming it.

import { makeRng } from './rng.js';

// ── Difficulty configuration ──────────────────────────────────────────────────

// The difficulty multiplier applied to every question's points. Part of scoring, but declared
// here because it is a property of the tier the generator is building for.
//
// THESE NUMBERS ARE NOT ARBITRARY, AND THEY ARE NOT THE ORIGINAL ONES.
//
// They were 1.0 / 1.3 / 1.6, and at those values the tiers were ordered BACKWARDS: the audit of
// 14 August 2026 measured a player scoring roughly 56% as much on Hard as on Easy for the same
// skill, because a tier that asks half as many questions in the same sixty seconds needs about
// double the per-question value merely to break even, and 1.6 is not double. A score-maximising
// player should have played Easy forever, which is the opposite of what a training app wants.
//
// The replacements pay a premium of about 20% per step up, measured on simulated play re-scored
// through this file's own scoreAttempt. A typical player's median now runs 181 / 219 / 265 across
// the three tiers, and the value of one question runs 9.8 / 16.6 / 28.9 points. Crucially the
// slope stays positive for weak players too (86 / 93 / 94) — an equalising table would have left
// beginners with no reason to ever move up. scripts/sim-difficulty.mjs is the model these came
// from; re-run it before changing them.
//
// One honest limit: the DIRECTION is robust to the timing model being wrong by ±25%, the exact
// figures are not. Per-question attempt data is already being collected, so these should be
// re-derived from real telemetry rather than from the model once there are players.
//
// Kept to one decimal place on purpose: ScoreBreakdown.jsx prints this with `toFixed(1)`, so a
// value like 4.15 would show a player "×4.2" beside a total computed from something else.
//
// REVISIT BEFORE THE CUTOVER. Changing these makes old scores and new scores incomparable — a
// Hard run recorded at ×1.6 sits in the same chart, daily average and personal best as one
// recorded at ×4.2. That was accepted here because this branch has no real player data. It will
// NOT be safe to rebalance this way again once it does: the main/react-rewrite cutover, and any
// later rebalance, need a migration plan for historical scores first.
export const DIFF_MULT = { easy: 1.0, medium: 1.9, hard: 4.2 };

export const DIFFS_ENG = {
  easy: {
    digits_addsub: [1, 2], min_addsub: 2,
    digits_other: [1, 2],
    terms: [2], neg: false, dec: false,
    ans_max: 999, mul_ans_max: 200, pct_min_base: 20,
  },
  medium: {
    digits_addsub: [2, 3], min_addsub: 10,
    digits_other: [1, 2],
    terms: [2, 3], neg: true, dec: false,
    ans_max: 9999, mul_ans_max: 500, pct_min_base: 10,
  },
  hard: {
    digits_addsub: [2, 3], min_addsub: 10,
    digits_other: [2, 3],
    terms: [2, 3, 4], neg: true, dec: true,
    ans_max: 9999, mul_ans_max: 5000, pct_min_base: 10,
  },
};

export const ALL_OPS = ['addition', 'subtraction', 'multiplication', 'division', 'percentage'];

// ── Question shape, for the attempt log only ──────────────────────────────────
//
// `digits` is the digit count of the largest number the player is shown. Commas are stripped
// first, and only the whole part of a decimal counts, so "1,234.5" reads as 4 digits.
//
// Note this reads the FORMATTED string, so it is the one derived value that a different locale
// can move. It feeds the attempt log and nothing else — never the answer, never the score, and
// never the random sequence — so the two sides disagreeing about it costs nothing. The server's
// reading is the one that gets stored, computed with the canonical formatter below.
export function digitsInQuestion(q) {
  const runs = String(q).replace(/,/g, '').match(/\d+/g);
  if (!runs) return 1;
  return runs.reduce((m, r) => Math.max(m, r.length), 1);
}

// How many values the player has to combine. Counts whole numbers, so "12.5 + 3" is two terms
// rather than three, and "47 + (8 × 6) − 12" is four.
export function termsInQuestion(q) {
  const nums = String(q).replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  return nums ? nums.length : 1;
}

export function maxD(d) {
  return Math.pow(10, d) - 1;
}
export function minD(d) {
  return d === 1 ? 1 : Math.pow(10, d - 1);
}

// The formatter the SERVER uses. Locale-independent on purpose: the server is not displaying
// anything to anyone, it only needs a stable string to measure `digits` against, and a stable
// one is the only kind that can be compared across runs.
//
// No operand any generator below produces ever reaches 1000 (every digit bound tops out at 3
// digits), so the thousands separator this omits would never have appeared anyway. The decimal
// point is the only part that does real work here.
export function canonicalFmt(n) {
  if (typeof n !== 'number' || isNaN(n)) return String(n);
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

// ── The engine ────────────────────────────────────────────────────────────────
//
// Everything below is closed over one rng/fmt/wordOf triple. Building it as a closure rather
// than threading three arguments through nine functions keeps the ported bodies looking like
// what they were lifted from, which is the only way a port this size stays reviewable.
// `seed` and `rng` are two ways of saying the same thing. A seed is what a server-issued set
// carries, and is what makes a set reproducible on both sides; passing neither falls back to
// ordinary randomness, which is the practice and offline path where reproducibility buys nothing.
export function createEngine({ rng: rngIn, seed, fmt = canonicalFmt, wordOf = 'of' } = {}) {
  const rng = rngIn || (seed === undefined || seed === null ? Math.random : makeRng(seed));
  const rn = (a, b) => Math.floor(rng() * (b - a + 1)) + a;
  const makeInt = (d) => rn(minD(d), maxD(d));
  const negDisp = (n) => '(−' + fmt(Math.abs(n)) + ')';

  function _makePctQ(ec) {
    const mxD = ec.digits_other[ec.digits_other.length - 1], mxB = maxD(mxD), mnB = ec.pct_min_base || 10;
    if (!ec.dec) {
      const defs = [{ p: 5, m: 20 }, { p: 10, m: 10 }, { p: 20, m: 5 }, { p: 25, m: 4 }, { p: 50, m: 2 }, { p: 75, m: 4 }];
      let att = 0, def, n, base, ans;
      do {
        def = defs[rn(0, defs.length - 1)];
        const mnN = Math.ceil(mnB / def.m), mxN = Math.floor(mxB / def.m);
        if (mxN < mnN) { att++; continue; }
        n = rn(mnN, mxN); base = n * def.m; ans = Math.round(base * def.p / 100); att++;
      } while ((base < mnB || ans <= 0) && att < 50);
      // digits comes from the base, not from digitsInQuestion: the percentage literal is also a
      // number in the string, and "5% of 20" is a 2-digit question, not a 1-digit one.
      return { q: def.p + '% ' + wordOf + ' ' + base + ' = ?', ans, op: 'percentage', digits: String(base).length, terms: 2 };
    }
    const pct = rn(1, 99), b2 = rn(Math.max(mnB, minD(mxD > 1 ? mxD - 1 : 1)), mxB);
    return { q: pct + '% ' + wordOf + ' ' + b2 + ' = ?', ans: parseFloat((b2 * pct / 100).toFixed(1)), op: 'percentage', digits: String(b2).length, terms: 2 };
  }

  function _makeDivQ(ec) {
    const mxD = ec.digits_other[ec.digits_other.length - 1], mxDiv = maxD(mxD), mnDiv = minD(mxD > 1 ? mxD - 1 : 1);
    let att = 0, div, quo, dvd;
    do {
      if (mxD <= 2) {
        div = rn(2, 12);
        const mq = Math.floor(mxDiv / div);
        if (mq < 2) { att++; continue; }
        quo = rn(2, Math.min(mq, 20));
      } else {
        div = rn(11, 30);
        const mq2 = Math.floor(mxDiv / div);
        if (mq2 < 11) { att++; continue; }
        quo = rn(11, Math.min(mq2, 50));
      }
      dvd = div * quo; att++;
    } while ((dvd > mxDiv || dvd < mnDiv) && att < 50);
    if (ec.dec && rng() > 0.55 && div > 1) {
      const rem = rn(1, div - 1), dd = dvd + rem;
      if (dd <= mxDiv) {
        const q = dd + ' ÷ ' + div + ' = ?';
        return { q, ans: parseFloat((dd / div).toFixed(1)), op: 'division', digits: digitsInQuestion(q), terms: 2 };
      }
    }
    const q = fmt(dvd) + ' ÷ ' + fmt(div) + ' = ?';
    return { q, ans: quo, op: 'division', digits: digitsInQuestion(q), terms: 2 };
  }

  function _makeAddQ(ec, tc) {
    const digits = ec.digits_addsub, neg = ec.neg, dec = ec.dec, mnV = ec.min_addsub || 1;
    let terms = [], qp = [], att = 0, ans;
    do {
      att++; terms = []; qp = [];
      const vals = [];
      for (let i = 0; i < tc; i++) {
        const d = digits[rn(0, digits.length - 1)];
        let v = makeInt(d);
        while (v < mnV) v = makeInt(d);
        if (dec && rng() > 0.5) v = parseFloat((v + rn(1, 9) / 10).toFixed(1));
        vals.push(v);
      }
      if (!neg && digits[0] === 1 && !vals.some((x) => Math.abs(x) >= 10)) vals[0] = rn(10, 99);
      terms.push(vals[0]); qp.push(fmt(vals[0]));
      for (let j = 1; j < tc; j++) {
        const v2 = vals[j];
        if (neg && rng() > 0.6) { terms.push(-v2); qp.push('+ ' + negDisp(v2)); }
        else { terms.push(v2); qp.push('+ ' + fmt(v2)); }
      }
      ans = terms.reduce((a, b) => a + b, 0);
      ans = dec ? parseFloat(ans.toFixed(1)) : Math.round(ans);
    } while (ans === 0 && att < 20);
    const q = qp.join(' ') + ' = ?';
    return { q, ans, op: 'addition', digits: digitsInQuestion(q), terms: tc };
  }

  function _makeSubQ(ec, tc) {
    const digits = ec.digits_addsub, neg = ec.neg, dec = ec.dec, mnV = ec.min_addsub || 1;
    let att = 0, terms, qp, ans;
    do {
      att++; terms = []; qp = [];
      const d0 = digits[rn(0, digits.length - 1)];
      let v0 = makeInt(d0);
      while (v0 < mnV) v0 = makeInt(d0);
      if (!neg && v0 < 10) v0 = rn(10, maxD(digits[digits.length - 1]));
      if (dec && rng() > 0.5) v0 = parseFloat((v0 + rn(1, 9) / 10).toFixed(1));
      terms.push(v0); qp.push(fmt(v0));
      for (let i = 1; i < tc; i++) {
        const d = digits[rn(0, digits.length - 1)];
        let v = makeInt(d);
        while (v < mnV) v = makeInt(d);
        if (!neg) {
          const m = Math.max(5, Math.floor(Math.abs(v0) * 0.1));
          while (v < m) v = rn(m, Math.max(m + 1, maxD(digits[digits.length - 1])));
        }
        if (dec && rng() > 0.5) v = parseFloat((v + rn(1, 9) / 10).toFixed(1));
        terms.push(-v); qp.push('− ' + fmt(v));
      }
      ans = terms.reduce((a, b) => a + b, 0);
      ans = dec ? parseFloat(ans.toFixed(1)) : Math.round(ans);
    } while (((!neg && ans <= 0) || ans === 0) && att < 50);
    if (!neg && ans <= 0) {
      const a = rn(20, maxD(digits[digits.length - 1])), b = rn(Math.max(5, Math.floor(a * 0.1)), a - 1);
      const qf = fmt(a) + ' − ' + fmt(b) + ' = ?';
      return { q: qf, ans: a - b, op: 'subtraction', digits: digitsInQuestion(qf), terms: 2 };
    }
    const q = qp.join(' ') + ' = ?';
    return { q, ans, op: 'subtraction', digits: digitsInQuestion(q), terms: tc };
  }

  function _makeMulQ(ec, tc) {
    const digits = ec.digits_other, neg = ec.neg, dec = ec.dec, mxA = ec.mul_ans_max;
    let att = 0, terms, qp, ans;
    do {
      att++; terms = []; qp = []; ans = 1;
      for (let i = 0; i < tc; i++) {
        const d = digits[rn(0, digits.length - 1)], dC = Math.min(d, 2);
        let v = rn(Math.max(2, minD(dC)), Math.min(maxD(dC), 20));
        if (neg && i > 0 && rng() > 0.75) v = -v;
        terms.push(v);
        const disp = v < 0 ? negDisp(v) : fmt(v);
        qp.push(i === 0 ? disp : '× ' + disp);
        ans *= v;
      }
      if (dec && rng() > 0.7 && tc === 2) {
        const idx = rn(0, terms.length - 1), orig = Math.abs(terms[idx]);
        const dv = parseFloat((orig + rn(1, 9) / 10).toFixed(1)) * (terms[idx] < 0 ? -1 : 1);
        terms[idx] = dv;
        qp[idx] = (idx === 0 ? '' : '× ') + (dv < 0 ? negDisp(dv) : fmt(dv));
        ans = parseFloat(terms.reduce((a, b) => a * b, 1).toFixed(1));
      }
      if (!dec) ans = Math.round(ans);
    } while (Math.abs(ans) > mxA && att < 40);
    if (Math.abs(ans) > mxA) {
      const a2 = rn(11, 19), b2 = rn(2, 9);
      const qf = fmt(a2) + ' × ' + fmt(b2) + ' = ?';
      return { q: qf, ans: a2 * b2, op: 'multiplication', digits: digitsInQuestion(qf), terms: 2 };
    }
    const q = qp.join(' ') + ' = ?';
    return { q, ans, op: 'multiplication', digits: digitsInQuestion(q), terms: tc };
  }

  // Mixed multi-term: 0 = pure +/- chain; 1 = A OP (B x C) [OP D]; 2 = A OP (B / C) [OP D]
  function _makeMixedQ(ec, tc) {
    const dec = ec.dec, asD = ec.digits_addsub, otD = ec.digits_other, neg = ec.neg, mnV = ec.min_addsub || 1;
    function pickAS(ad) {
      const d = asD[rn(0, asD.length - 1)];
      let v = makeInt(d);
      while (v < mnV) v = makeInt(d);
      if (ad && rng() > 0.5) v = parseFloat((v + rn(1, 9) / 10).toFixed(1));
      return v;
    }
    function pickFac() {
      const d = otD[rn(0, otD.length - 1)], dC = Math.min(d, 2);
      return rn(Math.max(2, minD(dC)), Math.min(maxD(dC), 20));
    }
    function pickExtra(ad) {
      const v = pickAS(ad);
      if (neg && rng() > 0.6) return { val: -v, opStr: '+' };
      if (rng() > 0.5) return { val: v, opStr: '+' };
      return { val: -v, opStr: '−' };
    }
    const st = rn(0, 2);

    if (st === 0) {
      let att = 0, ans0, t0 = [], qp0 = [];
      do {
        att++; t0 = []; qp0 = [];
        const v0 = pickAS(dec);
        t0.push(v0); qp0.push(fmt(v0));
        for (let i = 1; i < tc; i++) {
          const ex = pickExtra(dec);
          t0.push(ex.val);
          qp0.push(ex.opStr === '+' ? (ex.val < 0 ? '+ ' + negDisp(Math.abs(ex.val)) : '+ ' + fmt(ex.val)) : '− ' + fmt(Math.abs(ex.val)));
        }
        ans0 = t0.reduce((a, b) => a + b, 0);
        ans0 = dec ? parseFloat(ans0.toFixed(1)) : Math.round(ans0);
      } while ((ans0 === 0 || Math.abs(ans0) > ec.ans_max) && att < 30);
      if (ans0 === 0 || Math.abs(ans0) > ec.ans_max) return _makeAddQ(ec, 2);
      const q0 = qp0.join(' ') + ' = ?';
      return {
        q: q0, ans: ans0,
        op: t0.slice(1).some((x) => x > 0) ? 'addition' : 'subtraction',
        digits: digitsInQuestion(q0), terms: tc,
      };
    }
    if (st === 1) {
      let att1 = 0, res1, qs1;
      do {
        att1++;
        const A1 = pickAS(dec), B1 = pickFac(), C1 = pickFac();
        let bV1 = B1 * C1;
        if (Math.abs(bV1) > ec.mul_ans_max) continue;
        const bN1 = neg && rng() > 0.75;
        if (bN1) bV1 = -bV1;
        const bD1 = bN1 ? '(−' + fmt(B1) + ' × ' + fmt(C1) + ')' : '(' + fmt(B1) + ' × ' + fmt(C1) + ')';
        const op1 = rng() > 0.5 ? '+' : '−', sg1 = op1 === '+' ? 1 : -1;
        let run1 = A1 + sg1 * bV1, xD1 = '';
        if (tc >= 4) {
          const ex1 = pickExtra(dec);
          run1 += ex1.val;
          xD1 = ex1.opStr === '+' ? (ex1.val < 0 ? ' + ' + negDisp(Math.abs(ex1.val)) : '  + ' + fmt(ex1.val)) : ' − ' + fmt(Math.abs(ex1.val));
        }
        res1 = dec ? parseFloat(run1.toFixed(1)) : Math.round(run1);
        qs1 = fmt(A1) + ' ' + op1 + ' ' + bD1 + xD1 + ' = ?';
      } while ((res1 === 0 || Math.abs(res1) > ec.ans_max) && att1 < 30);
      if (res1 === 0 || Math.abs(res1) > ec.ans_max) return _makeAddQ(ec, 2);
      return { q: qs1, ans: res1, op: 'multiplication', digits: digitsInQuestion(qs1), terms: tc };
    }
    let att2 = 0, res2, qs2;
    do {
      att2++;
      const A2 = pickAS(dec), mDD = otD[otD.length - 1];
      let dv2, qo2;
      if (mDD <= 2) { dv2 = rn(2, 12); qo2 = rn(2, Math.min(Math.floor(maxD(mDD) / dv2), 20)); }
      else { dv2 = rn(11, 25); qo2 = rn(2, Math.min(Math.floor(maxD(mDD) / dv2), 30)); }
      const dd2 = dv2 * qo2;
      const bD2 = '(' + fmt(dd2) + ' ÷ ' + fmt(dv2) + ')', bV2 = qo2;
      const op2 = rng() > 0.5 ? '+' : '−', sg2 = op2 === '+' ? 1 : -1;
      let run2 = A2 + sg2 * bV2, xD2 = '';
      if (tc >= 4) {
        const ex2 = pickExtra(dec);
        run2 += ex2.val;
        xD2 = ex2.opStr === '+' ? (ex2.val < 0 ? ' + ' + negDisp(Math.abs(ex2.val)) : '  + ' + fmt(ex2.val)) : ' − ' + fmt(Math.abs(ex2.val));
      }
      res2 = dec ? parseFloat(run2.toFixed(1)) : Math.round(run2);
      qs2 = fmt(A2) + ' ' + op2 + ' ' + bD2 + xD2 + ' = ?';
    } while ((res2 === 0 || Math.abs(res2) > ec.ans_max) && att2 < 30);
    if (res2 === 0 || Math.abs(res2) > ec.ans_max) return _makeAddQ(ec, 2);
    return { q: qs2, ans: res2, op: 'division', digits: digitsInQuestion(qs2), terms: tc };
  }

  // One Challenge question at the given tier. `diff` is 'easy' | 'medium' | 'hard'.
  function challengeQ(diff) {
    const ec = DIFFS_ENG[diff] || DIFFS_ENG.easy;
    let tc = ec.terms[rn(0, ec.terms.length - 1)];
    const op = ALL_OPS[rn(0, ALL_OPS.length - 1)];
    if (tc > 2) {
      if (op === 'percentage') {
        tc = 2;
      } else {
        return _makeMixedQ(ec, tc);
      }
    }
    if (op === 'percentage') return _makePctQ(ec);
    if (op === 'division') return _makeDivQ(ec);
    if (op === 'multiplication') return _makeMulQ(ec, 2);
    if (op === 'addition') return _makeAddQ(ec, 2);
    return _makeSubQ(ec, 2);
  }

  // ── Braining ────────────────────────────────────────────────────────────────
  //
  // A separate, much simpler generator: fixed small numbers, four operations, no tiers. Ported
  // with the same three substitutions and no behavioural change.
  function brainingQ(op) {
    const terms = rng() < 0.5 ? 2 : 3;
    let q, ans;
    if (op === 'add') {
      const nums = [];
      for (let i = 0; i < terms; i++) nums.push(rng() < 0.5 ? rn(1, 9) : rn(10, 49));
      ans = nums.reduce((a, b) => a + b, 0);
      q = nums.join(' + ') + ' = ?';
      return { q, ans, op: 'Addition', digits: digitsInQuestion(q), terms };
    }
    if (op === 'sub') {
      // Starting number floor is 15 so there's always room for a meaningful subtraction.
      const first = rng() < 0.5 ? rn(20, 59) : rn(15, 25);
      const vals = [];
      for (let j = 1; j < terms; j++) {
        vals.push(rng() < 0.4 ? rn(10, Math.min(first - 1, 40)) : rn(1, 9));
      }
      ans = first;
      for (let k = 0; k < vals.length; k++) ans -= vals[k];
      // Safety net: the final answer is never exactly 0.
      if (ans === 0) {
        const li = vals.length - 1;
        vals[li] = vals[li] > 1 ? vals[li] - 1 : vals[li] + 1;
        ans = first;
        for (let k2 = 0; k2 < vals.length; k2++) ans -= vals[k2];
      }
      const qp = [String(first)];
      vals.forEach((v) => qp.push('− ' + v));
      const qs = qp.join(' ') + ' = ?';
      return { q: qs, ans, op: 'Subtraction', digits: digitsInQuestion(qs), terms };
    }
    if (op === 'mul') {
      let a, b, c;
      if (terms === 2) {
        const r = rng();
        if (r < 0.4) { a = rn(2, 9); b = rn(2, 9); }
        else if (r < 0.75) { a = rn(2, 9); b = rn(11, 19); }
        else { a = rn(11, 15); b = rn(2, 6); }
        ans = a * b;
        q = a + ' × ' + b + ' = ?';
      } else {
        a = rn(2, 9); b = rn(2, 9); c = rn(2, 5);
        ans = a * b * c;
        q = a + ' × ' + b + ' × ' + c + ' = ?';
      }
      return { q, ans, op: 'Multiplication', digits: digitsInQuestion(q), terms };
    }
    // div
    const div = rn(2, 9), quot = rng() < 0.6 ? rn(2, 9) : rn(2, 12), divd = div * quot;
    q = divd + ' ÷ ' + div;
    ans = quot;
    if (terms === 3) {
      const ex = rn(1, 9);
      if (rng() < 0.5) { q += ' + ' + ex; ans += ex; }
      else { q += ' − ' + ex; ans -= ex; }
    }
    const qd = q + ' = ?';
    return { q: qd, ans, op: 'Division', digits: digitsInQuestion(qd), terms };
  }

  function brainingSet(total) {
    const ops = ['add', 'sub', 'mul', 'div'];
    const qs = [];
    const perOp = Math.floor(total / ops.length);
    ops.forEach((op) => {
      for (let i = 0; i < perOp; i++) qs.push(brainingQ(op));
    });
    while (qs.length < total) qs.push(brainingQ(ops[rn(0, 3)]));
    for (let i = qs.length - 1; i > 0; i--) {
      const k = rn(0, i);
      const tmp = qs[i];
      qs[i] = qs[k];
      qs[k] = tmp;
    }
    return qs;
  }

  function challengeSet(diff, count) {
    const qs = [];
    for (let i = 0; i < count; i++) qs.push(challengeQ(diff));
    return qs;
  }

  return { challengeQ, challengeSet, brainingQ, brainingSet };
}

// ── Whole-set generation from a seed ──────────────────────────────────────────
//
// The two entry points the server and the client both call. Same seed in, same questions out,
// on either side — which is the entire contract this file exists to keep.

// How many questions a Challenge set carries.
//
// The 60-second clock is what actually ends a Challenge run, so this only has to be more than
// anybody can get through. The fastest recorded play is around 40; 80 leaves nearly double that
// as headroom, and running out would end a run early — a far worse failure than a slightly
// larger set. It costs nothing to send, because what travels is the seed, not the questions.
export const CHALLENGE_SET_SIZE = 80;

export function generateChallengeSet(seed, diff, { fmt, wordOf, count = CHALLENGE_SET_SIZE } = {}) {
  return createEngine({ rng: makeRng(seed), fmt, wordOf }).challengeSet(diff, count);
}

export function generateBrainingSet(seed, total, { fmt, wordOf } = {}) {
  return createEngine({ rng: makeRng(seed), fmt, wordOf }).brainingSet(total);
}
