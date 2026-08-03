// The server and the phone must ask the same questions and score them the same way.
//
// This is the check the whole anti-cheat design rests on. The server does not send questions —
// it sends a seed, keeps the answers, and later re-marks what the player typed against its own
// copy. If the phone's generator and the server's generator ever diverged by one question, an
// honest player's run would be rejected as fabricated: they would have answered question 14 and
// the server would be marking them against a different question 14.
//
// Three claims are proved here.
//
//   1. Same seed, same questions. Index for index, the answer and the operation match.
//   2. Locale cannot move them. The phone formats "12.5" and a Russian phone formats "12,5";
//      both must still be the same question with the same answer. This is what makes it safe
//      for display to stay on the device while marking moves to the server.
//   3. The server's scoreAttempt agrees with the arithmetic the game loop performs on screen —
//      the speed curve, the operation and difficulty multipliers, the −2 for a wrong answer,
//      and the running total's clamp at zero.
//
// On claim 3, one honest limitation: useChallengeGame is a React hook and cannot be driven
// without React, so the comparison is against a reimplementation of its loop written below from
// the same description. That is two independent implementations agreeing rather than the shipped
// one being executed — weaker than the other check scripts, and worth knowing. What it does
// still catch is the failure that matters: scoreAttempt drifting away from the rule the screen
// shows the player.
//
// Run it with:  npm run check:parity

import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

// The app's side, loaded through Vite exactly as the browser would resolve it.
const { engineFor, DIFFS, calcSc, fn } = await server.ssrLoadModule('/src/store/questionEngine.js');
const { brMakeSession } = await server.ssrLoadModule('/src/store/braining.js');
const appScoring = await server.ssrLoadModule('/src/store/scoring.js');

// The server's side, imported the way an Edge Function imports it.
const { createEngine, generateChallengeSet, generateBrainingSet, canonicalFmt, CHALLENGE_SET_SIZE } =
  await import('../supabase/functions/_shared/generator.js');
const srvScoring = await import('../supabase/functions/_shared/scoring.js');
const { scoreAttempt, BRAINING_BOOST_PCT, applyBrainingBoost } = srvScoring;

let failed = 0;
const fail = (msg) => { failed++; console.log('FAIL  ' + msg); };
const ok = (msg) => console.log('ok    ' + msg);

// Deterministic seeds, so a failure names a number that reproduces it.
let s = 987654321;
const nextSeed = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s >>> 0; };

// A stand-in for a Russian device: comma for the decimal, thin space for thousands. It never
// touches the arithmetic, which is the entire point of proving it here.
const ruFmt = (n) => {
  if (typeof n !== 'number' || isNaN(n)) return String(n);
  const r = Math.round(n * 10) / 10;
  const str = Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

// ── 1 & 2. Same seed, same questions, whatever the locale ─────────────────────

console.log('\nChallenge — seed determines the questions');
{
  const TRIALS = 400;
  let mismatches = 0, decimalsSeen = 0, opsSeen = new Set();

  for (let trial = 0; trial < TRIALS; trial++) {
    const seed = nextSeed();
    for (const diff of ['easy', 'medium', 'hard']) {
      // What the server would store.
      const srv = generateChallengeSet(seed, diff);
      // What an English phone draws, through the app's own module.
      const app = engineFor('en', seed).challengeSet(diff, CHALLENGE_SET_SIZE);
      // What a Russian phone draws.
      const ru = createEngine({ seed, fmt: ruFmt, wordOf: 'от' }).challengeSet(diff, CHALLENGE_SET_SIZE);

      if (srv.length !== app.length || srv.length !== ru.length) {
        fail(`seed ${seed} ${diff}: set lengths differ`);
        mismatches++;
        continue;
      }
      for (let i = 0; i < srv.length; i++) {
        opsSeen.add(srv[i].op);
        if (!Number.isInteger(srv[i].ans)) decimalsSeen++;
        if (srv[i].ans !== app[i].ans || srv[i].op !== app[i].op || srv[i].terms !== app[i].terms) {
          fail(`seed ${seed} ${diff} q${i}: server ${srv[i].op}/${srv[i].ans} vs app ${app[i].op}/${app[i].ans}`);
          mismatches++;
        }
        if (srv[i].ans !== ru[i].ans || srv[i].op !== ru[i].op) {
          fail(`seed ${seed} ${diff} q${i}: locale moved the answer — ${srv[i].ans} vs ${ru[i].ans}`);
          mismatches++;
        }
      }
    }
  }
  if (!mismatches) {
    ok(`${TRIALS * 3 * CHALLENGE_SET_SIZE} questions across 3 difficulties: server, English phone and Russian phone agree`);
    ok(`${opsSeen.size} of 5 operations exercised, ${decimalsSeen} of them with decimal answers`);
    if (opsSeen.size !== 5) fail(`only ${opsSeen.size} operations were generated — the sweep is not covering the engine`);
    if (decimalsSeen === 0) fail('no decimal answers generated — the locale claim was never actually tested');
  }
}

console.log('\nChallenge — a different seed is a different set');
{
  // A seeded generator that ignored its seed would sail through the check above. This is the
  // control: two seeds must not produce the same questions.
  const a = generateChallengeSet(11111, 'hard');
  const b = generateChallengeSet(22222, 'hard');
  const same = a.every((q, i) => q.ans === b[i].ans && q.op === b[i].op);
  if (same) fail('two different seeds produced identical sets — the seed is being ignored');
  else ok('two seeds, two different sets');

  const c = generateChallengeSet(11111, 'hard');
  const repeatable = a.every((q, i) => q.ans === c[i].ans && q.op === c[i].op);
  if (!repeatable) fail('the same seed produced different sets on two calls — generation is not deterministic');
  else ok('the same seed twice gives the same set');
}

console.log('\nBraining — seed determines the questions');
{
  let mismatches = 0;
  for (let trial = 0; trial < 200; trial++) {
    const seed = nextSeed();
    const srv = generateBrainingSet(seed, 50);
    const app = brMakeSession(50, seed);
    if (srv.length !== 50 || app.length !== 50) { fail(`seed ${seed}: braining set is not 50 questions`); mismatches++; continue; }
    for (let i = 0; i < 50; i++) {
      if (srv[i].ans !== app[i].ans || srv[i].op !== app[i].op || srv[i].q !== app[i].q) {
        fail(`seed ${seed} q${i}: braining mismatch — ${srv[i].q}=${srv[i].ans} vs ${app[i].q}=${app[i].ans}`);
        mismatches++;
      }
    }
  }
  if (!mismatches) ok('10,000 Braining questions: server and app agree, question text included');

  // Braining's own rule: an equal share of each operation, then shuffled.
  const counts = {};
  for (const q of generateBrainingSet(4242, 50)) counts[q.op] = (counts[q.op] || 0) + 1;
  const spread = Math.max(...Object.values(counts)) - Math.min(...Object.values(counts));
  if (Object.keys(counts).length !== 4 || spread > 2) fail(`operation mix is uneven: ${JSON.stringify(counts)}`);
  else ok('a 50-question set is an even mix of the four operations');
}

// ── 3. Scoring agrees with what the screen showed ─────────────────────────────

console.log('\nScoring — the server reproduces the on-screen arithmetic');
{
  // The game loop, as useChallengeGame performs it: mark, award, add to a total clamped at zero.
  // Written out independently so that agreeing with scoreAttempt means something.
  function onScreenScore(questions, answers, dm) {
    let score = 0, correct = 0, wrong = 0;
    for (const a of answers) {
      const q = questions[a.i];
      const okAns = Math.abs(a.value - q.ans) < 0.055;
      const pts = calcSc(okAns, a.ms / 1000, q.op, dm);
      score = Math.max(0, score + pts);
      if (okAns) correct++; else wrong++;
    }
    return { score, correct, wrong };
  }

  let mismatches = 0, zeroClampsSeen = 0, totalAnswers = 0;
  for (let trial = 0; trial < 500; trial++) {
    const seed = nextSeed();
    const diff = ['easy', 'medium', 'hard'][trial % 3];
    const questions = generateChallengeSet(seed, diff);

    // A plausible run: some right, some wrong, a spread of times. Deliberately weighted towards
    // wrong answers early on, because that is what drives the score into the clamp at zero —
    // the one branch a happy-path test never reaches.
    const n = 5 + Math.floor((nextSeed() / 0x7fffffff) * 30);
    const answers = [];
    for (let i = 0; i < n; i++) {
      const r = nextSeed() / 0x7fffffff;
      const rightAnswer = i < 3 ? r < 0.15 : r < 0.75;
      answers.push({
        i,
        value: rightAnswer ? questions[i].ans : questions[i].ans + 7,
        ms: 400 + Math.floor((nextSeed() / 0x7fffffff) * 6000),
      });
    }
    totalAnswers += n;

    const srv = scoreAttempt({ questions, answers, difficulty: diff });
    const screen = onScreenScore(questions, answers, DIFFS[diff].dm);
    if (srv.breakdown.floorAbsorbed !== 0) zeroClampsSeen++;

    if (srv.rawScore !== screen.score || srv.correct !== screen.correct || srv.wrong !== screen.wrong) {
      fail(`seed ${seed} ${diff}: server ${srv.rawScore}/${srv.correct}r/${srv.wrong}w vs screen ${screen.score}/${screen.correct}r/${screen.wrong}w`);
      mismatches++;
    }
  }
  if (!mismatches) ok(`500 runs, ${totalAnswers} answers: server score equals the on-screen score exactly`);
  if (zeroClampsSeen === 0) fail('no run ever hit the zero clamp — the branch is untested');
  else ok(`${zeroClampsSeen} of 500 runs went through the clamp at zero`);
}

console.log('\nThe boost is one number, not two');
{
  // The app imports the percentage to print it; the server imports it to apply it. They have to
  // be the same import, or a retune would move the label without moving the payout.
  if (appScoring.BRAINING_BOOST_PCT !== BRAINING_BOOST_PCT) {
    fail(`the app prints ${appScoring.BRAINING_BOOST_PCT}% but the server pays ${BRAINING_BOOST_PCT}%`);
  } else {
    ok(`both sides read ${BRAINING_BOOST_PCT}% from the same constant`);
  }
  // Object identity would be the obvious test and is not available: the app's copy is loaded
  // through Vite's module registry and the server's through Node's, so the same file yields two
  // distinct function objects either way. The claim is therefore checked at the source instead —
  // that src/store/scoring.js defines nothing and only forwards — and then behaviourally.
  const scoringSrc = await readFile(new URL('../src/store/scoring.js', import.meta.url), 'utf8');
  const code = scoringSrc.replace(/\/\/.*$/gm, '');
  if (/\b(export\s+(function|const|let|var)|=)/.test(code)) {
    fail('src/store/scoring.js has grown a definition of its own — it must only re-export');
  } else if (!/from\s+'\.\.\/\.\.\/supabase\/functions\/_shared\/scoring\.js'/.test(code)) {
    fail('src/store/scoring.js no longer forwards to the shared server module');
  } else {
    ok('src/store/scoring.js defines nothing and forwards to the shared module');
  }

  let behaviourDiffs = 0;
  for (let raw = -50; raw <= 500; raw++) {
    if (appScoring.applyBrainingBoost(raw) !== applyBrainingBoost(raw)) behaviourDiffs++;
  }
  if (behaviourDiffs) fail(`${behaviourDiffs} raw scores boost differently on the two sides`);
  else ok('the app and the server boost all 551 test scores identically');
  // And the rounding, which is as much a part of the rule as the percentage.
  let roundingWrong = 0;
  for (let raw = 0; raw <= 400; raw++) {
    if (applyBrainingBoost(raw) !== Math.round(raw * 1.05)) roundingWrong++;
  }
  if (roundingWrong) fail(`${roundingWrong} raw scores boost to something other than round(raw × 1.05)`);
  else ok('every raw score 0–400 boosts to exactly round(raw × 1.05)');
}

console.log('\nThe canonical formatter never reaches four digits');
{
  // canonicalFmt drops the thousands separator on the grounds that no operand can reach 1000.
  // That is an assumption about the generators, so it is checked rather than asserted.
  let biggest = 0;
  for (let trial = 0; trial < 300; trial++) {
    for (const q of generateChallengeSet(nextSeed(), 'hard')) {
      for (const run of String(q.q).match(/\d+/g) || []) biggest = Math.max(biggest, run.length);
    }
  }
  if (biggest > 3) fail(`a ${biggest}-digit operand appeared — canonicalFmt would need a thousands separator`);
  else ok(`largest operand seen across 24,000 Hard questions is ${biggest} digits`);
  if (canonicalFmt(12.5) !== '12.5' || canonicalFmt(7) !== '7') fail('canonicalFmt is not formatting as documented');
  else ok('canonicalFmt is stable and locale-independent');
  if (fn(7) !== '7') fail('the app formatter changed shape for whole numbers');
}

await server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
