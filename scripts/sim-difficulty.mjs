// What is a Challenge tier actually worth, and are its score achievements reachable?
//
// This is NOT a check script. It asserts nothing and `npm run check` does not run it — it is a
// measuring instrument, kept in the repo because the last time these numbers were derived the tool
// that derived them was thrown away, and the next person had to rebuild and re-fit it from the
// figures quoted in a report. That cost a session. It should not cost another one.
//
//   node scripts/sim-difficulty.mjs            # 8,000 runs per cell, about a minute
//   node scripts/sim-difficulty.mjs 40000      # the resolution the thresholds were set at
//
// WHAT IS REAL AND WHAT IS MODELLED — the only thing that matters when reading the output.
//
//   Real:      the question sets (the shipped generator, from real seeds) and every point awarded
//              (the shipped scoreAttempt, difficulty multipliers read live from generator.js).
//   Modelled:  how long a human takes over a question, and how often they get it wrong. There is
//              no player telemetry yet, so this is an assumption, and it is the one assumption
//              every absolute number below rests on.
//
// So RATIOS BETWEEN TIERS ARE ROBUST — all three tiers run through the same model, and the tier
// ratios are not fitted, they fall out of the generator's own question mix. ABSOLUTE SCORES ARE
// NOT: the sensitivity section shifts the whole speed model ±25% precisely so the output says how
// much they move. Per-question attempt data is already being collected; once there is enough of it,
// PARAMS and PROFILES below should be replaced by measurements and this becomes a real instrument
// rather than a careful guess.

import { readFileSync } from 'node:fs';
import { generateChallengeSet, CHALLENGE_SET_SIZE, DIFF_MULT } from '../supabase/functions/_shared/generator.js';
import { scoreAttempt } from '../supabase/functions/_shared/scoring.js';

const RUNS = Number(process.argv[2]) || 8000;
const DIFFS = ['easy', 'medium', 'hard'];
const DURATION_SEC = 60;

// ── The model ─────────────────────────────────────────────────────────────────
//
// One question's time is MULTIPLICATIVE in the features the generator already records, because
// cognitive load compounds rather than adds: a 3-digit four-term sum with a decimal answer is not
// "3-digit cost plus decimal cost", it is every one of those applied to the same piece of work.
//
// T0, termExtra and decimal are FITTED — to the questions-answered counts published in
// AUDIT-2026-08-14.md, so that this file runs the same player that report ran and its conclusions
// remain comparable. The op factors mirror OMULT, which scoring.js says was itself set from how
// much longer each operation takes. The digit and negative factors are judgement calls the fit was
// not allowed to move.
export const PARAMS = {
  T0: 1.0750,        // seconds for the baseline question: 2-term, 2-digit, integer addition
  op: { addition: 1.00, subtraction: 1.05, multiplication: 1.35, division: 1.40, percentage: 1.50 },
  digits: { 1: 0.80, 2: 1.00, 3: 1.32 },
  termExtra: 0.4075, // each term past the second costs this fraction more
  decimal: 1.1362,   // a non-integer answer: harder arithmetic AND a decimal point to type
  negative: 1.12,    // a negative operand shown, or a negative answer
  noiseSigma: 0.30,  // lognormal spread over one question, one player
};

// A skill continuum. `speed` multiplies every question's time; `err` is the error rate on a
// BASELINE question, which then rises with the square root of complexity.
//
// The 0.5 exponent is not a guess. The audit's own published accuracies imply it: its error rates
// rise 1.43× from easy to hard while its times rise 2.00×, and ln(1.43)/ln(2.00) = 0.52.
//
// `novice`, `typical` and `ceiling` are the audit's "error-prone", "realistic play" and "perfect
// play", fitted to its numbers. `practised` and `strong` were interpolated for this work, because
// three points were not enough to place nine achievement rungs between them.
export const PROFILES = [
  { name: 'novice', speed: 3.4329, err: 0.20457 },
  { name: 'typical', speed: 2.3845, err: 0.07549 },
  { name: 'practised', speed: 1.8000, err: 0.04500 },
  { name: 'strong', speed: 1.4000, err: 0.02200 },
  { name: 'ceiling', speed: 1.0000, err: 0.00000 },
];

function complexity(q, p = PARAMS) {
  const dig = p.digits[Math.min(3, Math.max(1, q.digits || 2))] ?? 1.0;
  let c = p.T0 * (p.op[q.op] ?? 1.0) * dig * (1 + p.termExtra * ((q.terms || 2) - 2));
  if (!Number.isInteger(q.ans)) c *= p.decimal;
  if (q.ans < 0 || String(q.q).includes('(−')) c *= p.negative;
  return c;
}

// Deterministic, and kept separate from the generator's seed so the same set can be replayed by
// different players. A failure or an odd number is reproducible rather than a story about a run
// that will never happen again.
function makeRnd(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function lognormal(rnd, sigma) {
  // Box-Muller, then exp, then de-biased so the MEAN is 1 rather than the median.
  const u = Math.max(1e-12, rnd()), v = rnd();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(z * sigma - (sigma * sigma) / 2);
}

// One Challenge run, returned in the exact shape the shipped scorer takes.
function playRun(questions, profile, rnd, shift = 1) {
  const answers = [];
  let t = 0;
  for (let i = 0; i < questions.length; i++) {
    const c = complexity(questions[i]);
    const ms = c * (profile.speed / shift) * lognormal(rnd, PARAMS.noiseSigma) * 1000;
    // The clock ends the run. A question still being held when it runs out is never submitted,
    // which is what the real hook does.
    if (t + ms > DURATION_SEC * 1000) break;
    t += ms;
    const pErr = Math.min(0.6, profile.err * Math.sqrt(c / PARAMS.T0));
    const wrong = rnd() < pErr;
    answers.push({ i, value: wrong ? questions[i].ans + 1 : questions[i].ans, ms });
  }
  return answers;
}

function simulate(diff, profile, { shift = 1, runs = RUNS } = {}) {
  const scores = [];
  let answered = 0, correct = 0, wrong = 0, twenty = 0;
  for (let r = 0; r < runs; r++) {
    const questions = generateChallengeSet((77003 + r * 104729) >>> 0, diff, { count: CHALLENGE_SET_SIZE });
    const rnd = makeRnd((Math.round(profile.speed * 1e6) + r * 15485863) >>> 0);
    const answers = playRun(questions, profile, rnd, shift);
    const res = scoreAttempt({ questions, answers, difficulty: diff });
    scores.push(res.rawScore);
    answered += answers.length; correct += res.correct; wrong += res.wrong;
    if (res.correct >= 20) twenty++;
  }
  scores.sort((a, b) => a - b);
  return {
    scores,
    answered: answered / runs,
    acc: (100 * correct) / (correct + wrong || 1),
    twenty: twenty / runs,
  };
}

const pct = (s, p) => s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))];
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
// Expected attempts to first reach a score — the unit an achievement is actually experienced in.
// A percentile of ONE run is the wrong unit: the rate limit allows 200 Challenge sets a day and any
// single run fires the achievement, so a threshold at the 90th percentile is not "a 1-in-10 day",
// it is certain inside a fortnight.
const attempts = (s, X) => { const n = s.reduce((a, v) => a + (v >= X ? 1 : 0), 0); return n === 0 ? Infinity : s.length / n; };
const fa = (a) => (a === Infinity ? 'never' : a < 1.2 ? 'every' : a < RUNS ? Math.round(a) + '×' : 'never');

// ── The thresholds, read out of the reducer rather than copied ────────────────
//
// Same reasoning as check-achievements.mjs: a hand-maintained copy of the nine numbers would drift
// the moment one was tuned, and drift in exactly the direction that makes this file lie about the
// thing it exists to measure. So the ladder is parsed out of the source that awards it.
function ladderFromReducer() {
  const src = readFileSync(new URL('../src/store/AppStateContext.jsx', import.meta.url), 'utf8');
  const out = [];
  let diff = null;
  for (const line of src.split('\n')) {
    const d = line.match(/if \(diff === '(easy|medium|hard)'\)/);
    if (d) diff = d[1];
    const r = line.match(/if \(score >= (\d+)\) earn\(m, unlocked, '([a-z_]+)'\)/);
    if (r && diff) out.push({ diff, at: Number(r[1]), key: r[2] });
  }
  return out.sort((a, b) => DIFFS.indexOf(a.diff) - DIFFS.indexOf(b.diff) || a.at - b.at);
}

// ── Report ────────────────────────────────────────────────────────────────────

console.log(`Cifri difficulty simulation — ${RUNS} runs per cell`);
console.log(`DIFF_MULT as shipped: ${JSON.stringify(DIFF_MULT)}`);

// 1. What each tier asks, with no model in it at all.
console.log('\n── What each tier asks (sampled from the real generator, model-free) ──');
console.log('                    easy   medium     hard');
{
  const N = Math.max(20000, RUNS);
  const stats = DIFFS.map((d) => {
    let nonInt = 0, four = 0, dig3 = 0, count = 0, cx = 0;
    for (let r = 0; count < N; r++) {
      for (const q of generateChallengeSet((900001 + r * 7919) >>> 0, d, { count: CHALLENGE_SET_SIZE })) {
        if (!Number.isInteger(q.ans)) nonInt++;
        if ((q.terms || 2) >= 4) four++;
        if ((q.digits || 2) >= 3) dig3++;
        cx += complexity(q);
        if (++count >= N) break;
      }
    }
    return { nonInt: nonInt / count, four: four / count, dig3: dig3 / count, cx: cx / count };
  });
  const row = (label, f) => console.log(label.padEnd(20) + stats.map((s) => f(s).padStart(8)).join(' '));
  row('3-digit operand', (s) => (100 * s.dig3).toFixed(1) + '%');
  row('4 terms', (s) => (100 * s.four).toFixed(1) + '%');
  row('non-integer answer', (s) => (100 * s.nonInt).toFixed(1) + '%');
  row('relative work/question', (s) => (s.cx / stats[0].cx).toFixed(2) + '×');
  console.log('\n  The last row is what a multiplier has to make up for: a tier asking twice the work');
  console.log('  per question fits half as many into sixty seconds, so it needs about double the');
  console.log('  per-question value merely to break even. This is the row the 2026-08-14 audit');
  console.log('  called "needed just to break even", and it is not fitted to anything.');
}

// 2. Does the model still reproduce the audit? If this drifts, nothing below is comparable to it.
console.log('\n── Reproducing AUDIT-2026-08-14.md Phase 3 (the model\'s own calibration check) ──');
{
  const AUDIT = {
    ceiling: { easy: [44.4, 539], medium: [31.8, 508], hard: [22.4, 420] },
    typical: { easy: [18.4, 177], medium: [13.2, 149], hard: [9.2, 100] },
    novice: { easy: [12.6, 85], medium: [8.9, 62], hard: [6.2, 33] },
  };
  // The audit ran DIFF_MULT 1.0/1.3/1.6, so its medians are only reproducible against those. They
  // are restored for the length of this section and put straight back — scoreAttempt reads the
  // object at call time, so this really does re-score through the shipped scorer under the old
  // numbers rather than reimplementing them. Without this the section would compare medians across
  // two different multiplier tables and report a 180% "deviation" that means nothing.
  const live = { ...DIFF_MULT };
  Object.assign(DIFF_MULT, { easy: 1.0, medium: 1.3, hard: 1.6 });
  console.log('profile    tier     answered sim/audit    median sim/audit');
  let worst = 0;
  try {
    for (const name of ['ceiling', 'typical', 'novice']) {
      const profile = PROFILES.find((p) => p.name === name);
      for (const d of DIFFS) {
        const r = simulate(d, profile);
        const [aq, am] = AUDIT[name][d];
        const med = pct(r.scores, 50);
        worst = Math.max(worst, Math.abs(med - am) / am);
        console.log(`${name.padEnd(10)} ${d.padEnd(7)} ${r.answered.toFixed(1).padStart(9)} / ${String(aq).padEnd(6)} ` +
          `${String(med).padStart(9)} / ${am}`);
      }
    }
  } finally {
    Object.assign(DIFF_MULT, live);
  }
  console.log(`\n  worst median deviation from the audit: ${(worst * 100).toFixed(1)}%`);
  console.log('  Under about 5% means this file is still running the player that report ran, and its');
  console.log('  conclusions remain comparable. If this drifts, the model changed and nothing below');
  console.log('  can be read against the audit any more.');
}

// 3. Value per unit of effort — the headline the whole exercise is about.
console.log('\n── Value per unit of effort, under the SHIPPED multipliers ──');
console.log('profile    tier    questions   median  vs easy  pts/question');
for (const profile of PROFILES) {
  const easy = simulate('easy', profile);
  const easyMed = pct(easy.scores, 50);
  for (const d of DIFFS) {
    const r = d === 'easy' ? easy : simulate(d, profile);
    const med = pct(r.scores, 50);
    console.log(`${profile.name.padEnd(10)} ${d.padEnd(7)} ${r.answered.toFixed(1).padStart(9)} ` +
      `${String(med).padStart(8)} ${(med / easyMed).toFixed(2).padStart(7)}× ${(med / r.answered).toFixed(1).padStart(13)}`);
  }
}
console.log('\n  Every tier must read higher than the one above it in the "vs easy" column, on every');
console.log('  profile. If a tier reads below 1.00× a player is being punished for training harder,');
console.log('  which is the defect this file was written to catch.');

// 4. The achievement rungs.
const LADDER = ladderFromReducer();
console.log(`\n── The ${LADDER.length} score-achievement rungs, as expected attempts to first reach ──`);
console.log('tier    score  key                ' + PROFILES.map((p) => p.name.padStart(10)).join(''));
{
  const byDiff = {};
  for (const d of DIFFS) byDiff[d] = PROFILES.map((p) => simulate(d, p).scores);
  for (const r of LADDER) {
    console.log(`${r.diff.padEnd(7)} ${String(r.at).padStart(5)}  ${r.key.padEnd(18)} ` +
      byDiff[r.diff].map((s) => fa(attempts(s, r.at)).padStart(10)).join(''));
  }
  console.log('\n  Each rung was calibrated on one profile: the lowest on a novice, the middle on a');
  console.log('  practised player, the top on a strong one. "never" in every column means a rung no');
  console.log('  player can reach; "every" in the column it was calibrated for means a free one.');
}

// 5. Anything not keyed off the score, for contrast.
console.log('\n── For contrast: the 20-correct bar (Speed Demon, Triple Crown) ──');
console.log('  Multiplier-independent — these read how the run was PLAYED, not what it scored.');
console.log('profile         easy   medium     hard');
for (const profile of PROFILES) {
  console.log(profile.name.padEnd(12) + DIFFS.map((d) =>
    ((100 * simulate(d, profile).twenty).toFixed(1) + '%').padStart(8)).join(' '));
}

// 6. Sensitivity — how much of the above survives the model being wrong.
console.log('\n── Sensitivity: the whole speed model shifted ±25% ──');
console.log('shift          easy  medium    hard   med/easy  hard/med');
for (const shift of [0.75, 1.0, 1.25]) {
  const profile = PROFILES.find((p) => p.name === 'typical');
  const m = DIFFS.map((d) => pct(simulate(d, profile, { shift }).scores, 50));
  const label = shift === 1 ? 'as modelled' : shift < 1 ? '25% slower' : '25% faster';
  console.log(label.padEnd(14) + m.map((v) => String(v).padStart(6)).join('  ') +
    `  ${(m[1] / m[0]).toFixed(2).padStart(8)}× ${(m[2] / m[1]).toFixed(2).padStart(8)}×`);
}
console.log('\n  The tier ORDERING should survive every shift — that conclusion is robust. The absolute');
console.log('  thresholds do not: a ±25% error moves a rung between "reachable" and "never". Treat');
console.log('  the ordering as settled and the nine numbers as provisional until there is telemetry.');
void mean;
