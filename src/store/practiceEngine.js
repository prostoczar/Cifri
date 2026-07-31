// Practice-mode question generator.
//
// This is deliberately SEPARATE from the difficulty-tier engine in questionEngine.js. That one
// derives everything from a difficulty key and ignores the caller's parameters, which is why the
// Practice tab's settings previously had no effect. Nothing here is shared with it, so Challenge,
// the Challenge warm-up practice, and Braining are unaffected.
//
// Questions are built CONSTRUCTIVELY — chosen backwards from a valid answer — rather than by
// guessing and retrying, so the player's settings are satisfied by construction rather than by
// luck. (The single exception is a bounded retry when a question happens to come out to exactly
// zero, which is a degenerate value rather than a constraint.)
//
// Guarantees, given a config {ops, digits, terms, neg, dec}:
//   · only the selected operations appear
//   · every operand the player is shown is sized from the selected digit counts
//     — except a division's dividend, which is derived so the division always comes out even
//   · the count of values equals one of the selected term counts
//     — except percentage, which is always "P% of N"; it has no multi-term form
//   · neg=false  → no negative operand, no negative running total, no negative answer
//   · dec=false  → no decimal anywhere, including intermediate values and the answer
//   · dec=true   → decimals may appear, always to exactly one decimal place
//
// Multiplicative chains are evaluated in exact integer arithmetic (BigInt, scaled by ten to carry
// the single decimal place). Plain JS numbers lose integer exactness above ~9×10^15, which four
// quad-digit terms can reach — that silently produced fractional results and answers that did not
// match the question shown.
import { rn, fn, minD, maxD, negDisp, digitsInQuestion, termsInQuestion } from './questionEngine.js';
import { t } from '../i18n_data.js';

const pick = (arr) => arr[rn(0, arr.length - 1)];
const r1 = (x) => Math.round(x * 10) / 10; // snap to 1dp, killing binary-float drift
const isAdditive = (op) => op === 'addition' || op === 'subtraction';
const isMultiplicative = (op) => op === 'multiplication' || op === 'division';

function gcd(a, b) {
  while (b) { const tmp = b; b = a % b; a = tmp; }
  return a;
}

const intOfDigits = (d) => rn(minD(d), maxD(d));
const intFrom = (digits) => intOfDigits(pick(digits));

// Format a BigInt carrying one implied decimal place, exactly — Number would round large values.
function fmtScaled(scaled) {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = (abs / 10n).toString();
  const frac = abs % 10n;
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const body = frac === 0n ? grouped : grouped + '.' + frac.toString();
  return negative ? '-' + body : body;
}

// Scoring/badge operation for a question that used several: the most "valuable" one wins, so a
// question containing a multiplication is scored as multiplication.
const OP_RANK = { addition: 0, subtraction: 0, multiplication: 1, division: 1, percentage: 2 };
function dominantOp(usedOps) {
  return usedOps.reduce((best, op) => (OP_RANK[op] > OP_RANK[best] ? op : best), usedOps[0]);
}

// ── PERCENTAGE ────────────────────────────────────────────
// Always "P% of N" regardless of term count. The percentage and base are chosen together so the
// answer lands exactly on an integer (dec off) or exactly one decimal place (dec on).
function pctQuestion(lang, cfg) {
  const baseDigits = pick(cfg.digits);
  const lo = minD(baseDigits), hi = maxD(baseDigits);
  // Answer = base·pct/100. Requiring base to be a multiple of k makes that exact:
  //   dec off → base·pct divisible by 100      dec on → divisible by 10 (one place)
  const divisor = cfg.dec ? 10 : 100;
  const candidates = cfg.dec
    ? [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80]
    : [5, 10, 20, 25, 50, 75];

  const feasible = candidates
    .map((pct) => ({ pct, k: divisor / gcd(pct, divisor) }))
    .filter(({ k }) => Math.floor(hi / k) >= Math.max(1, Math.ceil(lo / k)));

  // 50% has k=2, which always has a multiple in any digit range, so this is never empty.
  const { pct, k } = feasible.length ? pick(feasible) : { pct: 50, k: 2 };
  const base = k * rn(Math.max(1, Math.ceil(lo / k)), Math.floor(hi / k));
  const ans = cfg.dec ? r1((base * pct) / 100) : Math.round((base * pct) / 100);
  return { q: pct + '% ' + t(lang, 'word_of') + ' ' + fn(base) + ' = ?', ans, op: 'percentage' };
}

// ── MULTIPLICATIVE GROUP ──────────────────────────────────
// `count` numbers joined by × and ÷ from `ops`, exact at every step.
//
// Exactness comes from folding every divisor into the leading number: with lead = q·d1·d2…, each
// ÷ step divides evenly whatever order the steps appear in. That makes the dividend a derived
// value rather than one drawn from the digit settings — the price of division always coming out
// even. A decimal, when wanted, is applied to the quotient base *before* the divisors are folded
// in, so divisibility is preserved and the result stays at one place.
function multiplicativeGroup(cfg, count, ops, minValue) {
  const seq = [];
  for (let i = 0; i < count - 1; i++) seq.push(pick(ops));

  const divisors = [];
  const factors = [];
  seq.forEach((op) => {
    const v = Math.max(2, intFrom(cfg.digits)); // never 0 or 1 — those make trivial steps
    if (op === 'division') divisors.push(v);
    else factors.push(v);
  });

  // Quotient base, as a BigInt scaled by ten so it can carry one decimal place.
  let q = Math.max(2, intFrom(cfg.digits));
  // When this group leads a chain of subtractions it has to be big enough to stay positive.
  // Raising q is only legitimate when there are divisors: then q is the hidden answer, folded
  // into the derived dividend. With no divisors q is the displayed first factor and must keep
  // to the selected digit sizes — but a product of two operands is always large enough anyway.
  if (minValue && divisors.length) {
    const factorProduct = factors.reduce((a, b) => a * b, 1);
    if (q * factorProduct < minValue) q = Math.ceil(minValue / factorProduct);
  }
  let qScaled = BigInt(q) * 10n;
  if (cfg.dec && Math.random() > 0.5) qScaled += BigInt(rn(1, 9));
  if (cfg.neg && Math.random() > 0.75) qScaled = -qScaled;

  let leadScaled = qScaled;
  divisors.forEach((d) => { leadScaled *= BigInt(d); });

  let value = leadScaled;
  const parts = [fmtScaled(leadScaled).startsWith('-')
    ? negDisp(Number(fmtScaled(leadScaled).slice(1).replace(/,/g, '')))
    : fmtScaled(leadScaled)];

  let di = 0, fi = 0;
  seq.forEach((op) => {
    if (op === 'division') {
      const d = divisors[di++];
      value /= BigInt(d); // exact: every divisor was folded into the lead
      parts.push('÷ ' + fn(d));
    } else {
      let f = factors[fi++];
      if (cfg.neg && Math.random() > 0.8) f = -f;
      value *= BigInt(f);
      parts.push('× ' + (f < 0 ? negDisp(f) : fn(f)));
    }
  });

  return {
    parts,
    // Unscale in BigInt when the result is a whole number, so large products stay exact — going
    // through Number first would multiply the magnitude by ten and overflow exact integer range.
    value: value % 10n === 0n ? Number(value / 10n) : Number(value) / 10,
    usedOps: seq.length ? seq : ['multiplication'],
    isGroup: count > 1,
  };
}

// ── ADDITIVE CHAIN ────────────────────────────────────────
// Joins units with + and −. A unit is either a plain number or a parenthesised ×/÷ group.
//
// With negatives off this does not subtract and hope: each subtrahend is drawn inside a running
// budget derived from what precedes it, so the running total is positive at every step and the
// answer can never come out negative or zero — no candidates discarded, no fallbacks.
function additiveChain(cfg, unitCount, addOps, buildUnit) {
  const units = [];
  for (let i = 0; i < unitCount; i++) units.push(buildUnit(i));

  const seq = [];
  for (let i = 0; i < unitCount - 1; i++) seq.push(pick(addOps));

  if (!cfg.neg && seq.indexOf('subtraction') !== -1) {
    // Give the leading value room to absorb the subtractions. Only a plain leading number is
    // re-drawn — a group's value is already fixed, and rewriting it would destroy a term.
    if (!units[0].isGroup) {
      const maxDigit = Math.max(...cfg.digits);
      const top = maxD(maxDigit);
      units[0].value = rn(Math.max(minD(maxDigit), Math.ceil(top / 2)), top);
      units[0].parts = [fn(units[0].value)];
    }
    // Walk forward, drawing each subtrahend small enough that the running total stays positive.
    let running = Math.abs(units[0].value);
    for (let i = 0; i < seq.length; i++) {
      const u = units[i + 1];
      if (seq[i] !== 'subtraction') {
        running += Math.abs(u.value);
        continue;
      }
      const stepsLeft = seq.slice(i).filter((o) => o === 'subtraction').length;
      const per = Math.floor(Math.max(0, running - 1) / stepsLeft);
      const fits = cfg.digits.filter((d) => minD(d) <= per);
      // The leading value is sized so that at least the smallest selected digit size always
      // fits; this guard is belt-and-braces, and never picks a number outside the selection.
      const d = fits.length ? pick(fits) : Math.min(...cfg.digits);
      let v = rn(minD(d), Math.max(minD(d), Math.min(maxD(d), per)));
      // Take the decimal off the value rather than adding to it, so the subtrahend never grows
      // past its budget — and only when the whole part stays inside the chosen digit size.
      if (cfg.dec && Math.random() > 0.6 && v - 1 >= minD(d)) v = r1(v - rn(1, 9) / 10);
      u.value = v;
      u.parts = [fn(v)];
      running -= v;
    }
  }

  // A ×/÷ group is always parenthesised, including in the leading position. Precedence alone
  // would give the right answer, but "(2 × 58) + 2" cannot be misread the way "2 × 58 + 2" can,
  // and a misread here costs the player the question.
  const render = (u) => (u.isGroup ? '(' + u.parts.join(' ') + ')' : u.parts[0]);

  let value = units[0].value;
  const parts = [render(units[0])];
  const usedOps = [...(units[0].usedOps || [])];

  seq.forEach((op, i) => {
    const u = units[i + 1];
    usedOps.push(op, ...(u.usedOps || []));
    const shown = render(u);
    // Groups carry their own sign (a negative factor inside makes the group negative), so they
    // must be combined signed — taking the magnitude would disagree with the printed expression.
    if (op === 'subtraction') {
      value -= u.value;
      parts.push('− ' + shown);
    } else if (cfg.neg && !u.isGroup && Math.random() > 0.7) {
      // Negatives on: occasionally add a negative rather than subtract a positive.
      value -= u.value;
      parts.push('+ ' + negDisp(u.value));
    } else {
      value += u.value;
      parts.push('+ ' + shown);
    }
  });

  return { parts, value: r1(value), usedOps };
}

function plainUnit(cfg) {
  let v = intFrom(cfg.digits);
  if (cfg.dec && Math.random() > 0.6) v = r1(v + rn(1, 9) / 10);
  return { parts: [fn(v)], value: v, usedOps: [], isGroup: false };
}

function build(lang, cfg) {
  const { ops, terms } = cfg;
  const hasPct = ops.indexOf('percentage') !== -1;
  const others = ops.filter((o) => o !== 'percentage');
  // Percentage takes its even share of questions; if it is the only selection, every question.
  if (hasPct && (!others.length || rn(1, ops.length) === 1)) return pctQuestion(lang, cfg);

  const tc = pick(terms);
  const addOps = others.filter(isAdditive);
  const mulOps = others.filter(isMultiplicative);

  // Only × and ÷ — the whole question is one multiplicative chain, no parentheses needed.
  if (!addOps.length) {
    const g = multiplicativeGroup(cfg, tc, mulOps);
    return { q: g.parts.join(' ') + ' = ?', ans: g.value, op: dominantOp(g.usedOps) };
  }

  // Only + and − — a flat additive chain of plain numbers.
  if (!mulOps.length) {
    const chain = additiveChain(cfg, tc, addOps, () => plainUnit(cfg));
    return { q: chain.parts.join(' ') + ' = ?', ans: chain.value, op: dominantOp(chain.usedOps) };
  }

  // Both kinds selected. Two terms leaves room for only one operator, so pick one.
  if (tc < 3) {
    const op = pick(others);
    if (isMultiplicative(op)) {
      const g = multiplicativeGroup(cfg, 2, [op]);
      return { q: g.parts.join(' ') + ' = ?', ans: g.value, op: dominantOp(g.usedOps) };
    }
    const chain = additiveChain(cfg, 2, [op], () => plainUnit(cfg));
    return { q: chain.parts.join(' ') + ' = ?', ans: chain.value, op: dominantOp(chain.usedOps) };
  }

  // Three or more terms: two of them form a parenthesised ×/÷ group, the rest are plain numbers
  // joined by + and −, e.g. "47 + (8 × 6) − 12". With negatives off the group leads, so that the
  // subtractions that follow can be budgeted against it and the total stays positive.
  const groupAt = cfg.neg ? rn(0, tc - 2) : 0;
  // With negatives off the leading group has to cover every subtraction that can follow it, at
  // the smallest operand the digit selection permits, or there would be no legal value to
  // subtract. Worst case: every remaining unit is subtracted.
  const smallestOperand = Math.min(...cfg.digits.map(minD));
  const minLead = cfg.neg ? 0 : 1 + (tc - 2) * smallestOperand;
  const chain = additiveChain(cfg, tc - 1, addOps, (i) =>
    i === groupAt ? multiplicativeGroup(cfg, 2, mulOps, minLead) : plainUnit(cfg)
  );
  return { q: chain.parts.join(' ') + ' = ?', ans: chain.value, op: dominantOp(chain.usedOps) };
}

// ── ENTRY POINT ───────────────────────────────────────────
export function makePracticeQ(lang, cfg) {
  const conf = {
    ops: cfg.ops && cfg.ops.length ? cfg.ops : ['addition'],
    digits: cfg.digits && cfg.digits.length ? cfg.digits : [1],
    terms: cfg.terms && cfg.terms.length ? cfg.terms : [2],
    neg: !!cfg.neg,
    dec: !!cfg.dec,
  };
  // An answer of exactly zero is a degenerate outcome rather than a constraint violation — the
  // app never poses one. Redraw a few times; with negatives off it cannot happen at all.
  let res;
  for (let i = 0; i < 25; i++) {
    res = build(lang, conf);
    if (res.ans !== 0) return withMeta(res);
  }
  return withMeta(res);
}

// Attaches the attempt-log metadata at the single entry point rather than at each of build()'s
// six return sites. Read off the finished question string, so it describes what the player was
// actually shown — and so nothing inside the chain builders had to be disturbed to report it.
function withMeta(res) {
  return { ...res, digits: digitsInQuestion(res.q), terms: termsInQuestion(res.q) };
}
