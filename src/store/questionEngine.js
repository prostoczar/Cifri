// Question generation engine — ported verbatim (logic unchanged) from the reference prototype.
import { t } from '../i18n_data.js';

export const DIFFS = {
  easy: { label: 'Easy', ops: ['addition', 'subtraction', 'multiplication', 'division', 'percentage'], digits: [1, 2], terms: [2], neg: false, dec: false, dm: 1.0, _diff: 'easy' },
  medium: { label: 'Medium', ops: ['addition', 'subtraction', 'multiplication', 'division', 'percentage'], digits: [1, 2], terms: [2], neg: false, dec: false, dm: 1.3, _diff: 'medium' },
  hard: { label: 'Hard', ops: ['addition', 'subtraction', 'multiplication', 'division', 'percentage'], digits: [2, 3], terms: [2, 3], neg: true, dec: true, dm: 1.6, _diff: 'hard' },
};

export const OMULT = { addition: 1.0, subtraction: 1.0, multiplication: 1.3, division: 1.3, percentage: 1.5 };
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

export function rn(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
export function fn(n) {
  if (typeof n !== 'number' || isNaN(n)) return String(n);
  const r = Math.round(n * 10) / 10;
  if (Number.isInteger(r)) return r.toLocaleString();
  return r.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
export function maxD(d) {
  return Math.pow(10, d) - 1;
}
export function minD(d) {
  return d === 1 ? 1 : Math.pow(10, d - 1);
}
export function negDisp(n) {
  return '(−' + fn(Math.abs(n)) + ')';
}
export function makeInt(d) {
  return rn(minD(d), maxD(d));
}

function _makePctQ(lang, ec) {
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
    return { q: def.p + '% ' + t(lang, 'word_of') + ' ' + base + ' = ?', ans, op: 'percentage' };
  } else {
    const pct = rn(1, 99), b2 = rn(Math.max(mnB, minD(mxD > 1 ? mxD - 1 : 1)), mxB);
    return { q: pct + '% ' + t(lang, 'word_of') + ' ' + b2 + ' = ?', ans: parseFloat((b2 * pct / 100).toFixed(1)), op: 'percentage' };
  }
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
  if (ec.dec && Math.random() > 0.55 && div > 1) {
    const rem = rn(1, div - 1), dd = dvd + rem;
    if (dd <= mxDiv) return { q: dd + ' ÷ ' + div + ' = ?', ans: parseFloat((dd / div).toFixed(1)), op: 'division' };
  }
  return { q: fn(dvd) + ' ÷ ' + fn(div) + ' = ?', ans: quo, op: 'division' };
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
      if (dec && Math.random() > 0.5) v = parseFloat((v + rn(1, 9) / 10).toFixed(1));
      vals.push(v);
    }
    if (!neg && digits[0] === 1 && !vals.some((x) => Math.abs(x) >= 10)) vals[0] = rn(10, 99);
    terms.push(vals[0]); qp.push(fn(vals[0]));
    for (let j = 1; j < tc; j++) {
      const v2 = vals[j];
      if (neg && Math.random() > 0.6) { terms.push(-v2); qp.push('+ ' + negDisp(v2)); }
      else { terms.push(v2); qp.push('+ ' + fn(v2)); }
    }
    ans = terms.reduce((a, b) => a + b, 0);
    ans = dec ? parseFloat(ans.toFixed(1)) : Math.round(ans);
  } while (ans === 0 && att < 20);
  return { q: qp.join(' ') + ' = ?', ans, op: 'addition' };
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
    if (dec && Math.random() > 0.5) v0 = parseFloat((v0 + rn(1, 9) / 10).toFixed(1));
    terms.push(v0); qp.push(fn(v0));
    for (let i = 1; i < tc; i++) {
      const d = digits[rn(0, digits.length - 1)];
      let v = makeInt(d);
      while (v < mnV) v = makeInt(d);
      if (!neg) {
        const m = Math.max(5, Math.floor(Math.abs(v0) * 0.1));
        while (v < m) v = rn(m, Math.max(m + 1, maxD(digits[digits.length - 1])));
      }
      if (dec && Math.random() > 0.5) v = parseFloat((v + rn(1, 9) / 10).toFixed(1));
      terms.push(-v); qp.push('− ' + fn(v));
    }
    ans = terms.reduce((a, b) => a + b, 0);
    ans = dec ? parseFloat(ans.toFixed(1)) : Math.round(ans);
  } while (((!neg && ans <= 0) || ans === 0) && att < 50);
  if (!neg && ans <= 0) {
    const a = rn(20, maxD(digits[digits.length - 1])), b = rn(Math.max(5, Math.floor(a * 0.1)), a - 1);
    return { q: fn(a) + ' − ' + fn(b) + ' = ?', ans: a - b, op: 'subtraction' };
  }
  return { q: qp.join(' ') + ' = ?', ans, op: 'subtraction' };
}

function _makeMulQ(ec, tc) {
  const digits = ec.digits_other, neg = ec.neg, dec = ec.dec, mxA = ec.mul_ans_max;
  let att = 0, terms, qp, ans;
  do {
    att++; terms = []; qp = []; ans = 1;
    for (let i = 0; i < tc; i++) {
      const d = digits[rn(0, digits.length - 1)], dC = Math.min(d, 2);
      let v = rn(Math.max(2, minD(dC)), Math.min(maxD(dC), 20));
      if (neg && i > 0 && Math.random() > 0.75) v = -v;
      terms.push(v);
      const disp = v < 0 ? negDisp(v) : fn(v);
      qp.push(i === 0 ? disp : '× ' + disp);
      ans *= v;
    }
    if (dec && Math.random() > 0.7 && tc === 2) {
      const idx = rn(0, terms.length - 1), orig = Math.abs(terms[idx]);
      const dv = parseFloat((orig + rn(1, 9) / 10).toFixed(1)) * (terms[idx] < 0 ? -1 : 1);
      terms[idx] = dv;
      qp[idx] = (idx === 0 ? '' : '× ') + (dv < 0 ? negDisp(dv) : fn(dv));
      ans = parseFloat(terms.reduce((a, b) => a * b, 1).toFixed(1));
    }
    if (!dec) ans = Math.round(ans);
  } while (Math.abs(ans) > mxA && att < 40);
  if (Math.abs(ans) > mxA) {
    const a2 = rn(11, 19), b2 = rn(2, 9);
    return { q: fn(a2) + ' × ' + fn(b2) + ' = ?', ans: a2 * b2, op: 'multiplication' };
  }
  return { q: qp.join(' ') + ' = ?', ans, op: 'multiplication' };
}

// Mixed multi-term: 0 = pure +/- chain; 1 = A OP (B x C) [OP D]; 2 = A OP (B / C) [OP D]
function _makeMixedQ(ec, tc) {
  const dec = ec.dec, asD = ec.digits_addsub, otD = ec.digits_other, neg = ec.neg, mnV = ec.min_addsub || 1;
  function pickAS(ad) {
    const d = asD[rn(0, asD.length - 1)];
    let v = makeInt(d);
    while (v < mnV) v = makeInt(d);
    if (ad && Math.random() > 0.5) v = parseFloat((v + rn(1, 9) / 10).toFixed(1));
    return v;
  }
  function pickFac() {
    const d = otD[rn(0, otD.length - 1)], dC = Math.min(d, 2);
    return rn(Math.max(2, minD(dC)), Math.min(maxD(dC), 20));
  }
  function pickExtra(ad) {
    const v = pickAS(ad);
    if (neg && Math.random() > 0.6) return { val: -v, opStr: '+' };
    if (Math.random() > 0.5) return { val: v, opStr: '+' };
    return { val: -v, opStr: '−' };
  }
  const st = rn(0, 2);

  if (st === 0) {
    let att = 0, ans0, t0 = [], qp0 = [];
    do {
      att++; t0 = []; qp0 = [];
      const v0 = pickAS(dec);
      t0.push(v0); qp0.push(fn(v0));
      for (let i = 1; i < tc; i++) {
        const ex = pickExtra(dec);
        t0.push(ex.val);
        qp0.push(ex.opStr === '+' ? (ex.val < 0 ? '+ ' + negDisp(Math.abs(ex.val)) : '+ ' + fn(ex.val)) : '− ' + fn(Math.abs(ex.val)));
      }
      ans0 = t0.reduce((a, b) => a + b, 0);
      ans0 = dec ? parseFloat(ans0.toFixed(1)) : Math.round(ans0);
    } while ((ans0 === 0 || Math.abs(ans0) > ec.ans_max) && att < 30);
    if (ans0 === 0 || Math.abs(ans0) > ec.ans_max) return _makeAddQ(ec, 2);
    return { q: qp0.join(' ') + ' = ?', ans: ans0, op: t0.slice(1).some((x) => x > 0) ? 'addition' : 'subtraction' };
  }
  if (st === 1) {
    let att1 = 0, res1, qs1;
    do {
      att1++;
      const A1 = pickAS(dec), B1 = pickFac(), C1 = pickFac();
      let bV1 = B1 * C1;
      if (Math.abs(bV1) > ec.mul_ans_max) continue;
      const bN1 = neg && Math.random() > 0.75;
      if (bN1) bV1 = -bV1;
      const bD1 = bN1 ? '(−' + fn(B1) + ' × ' + fn(C1) + ')' : '(' + fn(B1) + ' × ' + fn(C1) + ')';
      const op1 = Math.random() > 0.5 ? '+' : '−', sg1 = op1 === '+' ? 1 : -1;
      let run1 = A1 + sg1 * bV1, xD1 = '';
      if (tc >= 4) {
        const ex1 = pickExtra(dec);
        run1 += ex1.val;
        xD1 = ex1.opStr === '+' ? (ex1.val < 0 ? ' + ' + negDisp(Math.abs(ex1.val)) : '  + ' + fn(ex1.val)) : ' − ' + fn(Math.abs(ex1.val));
      }
      res1 = dec ? parseFloat(run1.toFixed(1)) : Math.round(run1);
      qs1 = fn(A1) + ' ' + op1 + ' ' + bD1 + xD1 + ' = ?';
    } while ((res1 === 0 || Math.abs(res1) > ec.ans_max) && att1 < 30);
    if (res1 === 0 || Math.abs(res1) > ec.ans_max) return _makeAddQ(ec, 2);
    return { q: qs1, ans: res1, op: 'multiplication' };
  }
  let att2 = 0, res2, qs2;
  do {
    att2++;
    const A2 = pickAS(dec), mDD = otD[otD.length - 1];
    let dv2, qo2;
    if (mDD <= 2) { dv2 = rn(2, 12); qo2 = rn(2, Math.min(Math.floor(maxD(mDD) / dv2), 20)); }
    else { dv2 = rn(11, 25); qo2 = rn(2, Math.min(Math.floor(maxD(mDD) / dv2), 30)); }
    const dd2 = dv2 * qo2;
    const bD2 = '(' + fn(dd2) + ' ÷ ' + fn(dv2) + ')', bV2 = qo2;
    const op2 = Math.random() > 0.5 ? '+' : '−', sg2 = op2 === '+' ? 1 : -1;
    let run2 = A2 + sg2 * bV2, xD2 = '';
    if (tc >= 4) {
      const ex2 = pickExtra(dec);
      run2 += ex2.val;
      xD2 = ex2.opStr === '+' ? (ex2.val < 0 ? ' + ' + negDisp(Math.abs(ex2.val)) : '  + ' + fn(ex2.val)) : ' − ' + fn(Math.abs(ex2.val));
    }
    res2 = dec ? parseFloat(run2.toFixed(1)) : Math.round(run2);
    qs2 = fn(A2) + ' ' + op2 + ' ' + bD2 + xD2 + ' = ?';
  } while ((res2 === 0 || Math.abs(res2) > ec.ans_max) && att2 < 30);
  if (res2 === 0 || Math.abs(res2) > ec.ans_max) return _makeAddQ(ec, 2);
  return { q: qs2, ans: res2, op: 'division' };
}

// makeQ — bridges the old game flow (passes DIFFS[diff] cfg) to the engine above.
// Returns {q, ans, op}. cfg needs a `_diff` key ('easy'|'medium'|'hard').
export function makeQ(lang, cfg) {
  const diff = cfg._diff || 'easy';
  const ec = DIFFS_ENG[diff] || DIFFS_ENG.easy;
  let tc = ec.terms[rn(0, ec.terms.length - 1)];
  const ops = ['addition', 'subtraction', 'multiplication', 'division', 'percentage'];
  const op = ops[rn(0, ops.length - 1)];
  if (tc > 2) {
    if (op === 'percentage') {
      tc = 2;
    } else {
      return _makeMixedQ(ec, tc);
    }
  }
  let res;
  if (op === 'percentage') res = _makePctQ(lang, ec);
  else if (op === 'division') res = _makeDivQ(ec);
  else if (op === 'multiplication') res = _makeMulQ(ec, 2);
  else if (op === 'addition') res = _makeAddQ(ec, 2);
  else res = _makeSubQ(ec, 2);
  return res;
}

export function calcSc(ok, elapsed, op, dm) {
  if (!ok) return -2;
  const speed = Math.max(1, Math.round(10 - Math.max(0, ((elapsed - 2) / 10) * 9)));
  return Math.round(speed * (OMULT[op] || 1) * dm);
}
