// Challenge scoring — the single definition, shared by the server and the app.
//
// `src/store/scoring.js` re-exports this file rather than keeping a copy. That matters more here
// than anywhere else in the project: the server now recomputes every score and stores its own
// answer, so if the two sides rounded differently by even one point, the server would reject
// honest play. There is no drift to guard against when there is only one definition to drift
// from — and check:parity re-proves that claim over thousands of runs rather than trusting it.

import { DIFF_MULT } from './generator.js';

// ── The adjustable balance figures ────────────────────────────────────────────

// Completing Braining earns a single 5% boost, spent by the very next Challenge attempt played
// that day. The percentage lives here rather than inline where it is applied, because it is a
// balance figure that will be tuned, and a number that appears in two places eventually
// disagrees with itself.
//
// THIS FILE IS THE SERVER'S COPY, and the server is the only thing that gets to apply it. The
// app imports the same constant, but only ever to DISPLAY "+5%" on the breakdown — the boost
// that actually lands in a stored score is applied here, on the server's own raw number, after
// the server has satisfied itself that a boost was genuinely available. A modified client can
// change what it prints; it cannot change what it is paid.
export const BRAINING_BOOST_PCT = 5;

// The multiplier that percentage implies. Derived, never written out separately.
export const BRAINING_BOOST_MULT = 1 + BRAINING_BOOST_PCT / 100;

// How long a Challenge run lasts. Used by the game as a countdown and by the server as the
// outer bound on how much play a single submission is allowed to claim.
export const CHALLENGE_DURATION_SEC = 60;

// Per-operation multipliers — the difficulty equaliser. A percentage question is worth half as
// much again as an addition because it takes about that much longer to do.
export const OMULT = { addition: 1.0, subtraction: 1.0, multiplication: 1.3, division: 1.3, percentage: 1.5 };

// How close counts as right. A player answering "12.5" to a question whose answer is 12.5 must
// not lose to floating-point noise, and the gap to the next plausible answer (12.4 or 12.6) is
// far wider than this. Braining uses its own slightly tighter figure — see BRAINING_TOLERANCE.
export const ANSWER_TOLERANCE = 0.055;
export const BRAINING_TOLERANCE = 0.05;

// ── The boost ─────────────────────────────────────────────────────────────────
//
// The ROUNDING is as much a part of the rule as the percentage. A boosted score has to be a
// whole number — it is summed and averaged alongside ordinary scores, and stored in an integer
// column — so exactly one rounding step is defined here and everything else calls it.

export function applyBrainingBoost(rawScore) {
  return Math.round(rawScore * BRAINING_BOOST_MULT);
}

// True when `boostedScore` really is what the boost does to `rawScore`. Used by the projection
// check to verify stored attempts rather than trusting them, and written as its own function so
// the check cannot drift from the calculation it is checking.
export function isValidBoost(rawScore, boostedScore) {
  return Number.isFinite(rawScore)
    && Number.isFinite(boostedScore)
    && boostedScore === applyBrainingBoost(rawScore);
}

// ── One question's points ─────────────────────────────────────────────────────
//
// A wrong answer is a flat −2 whatever it was and however long it took. A right one is worth
// 10 points answered instantly, decaying to a floor of 1 by about twelve seconds, multiplied by
// the operation and then by the difficulty tier.
export function calcSc(ok, elapsed, op, dm) {
  if (!ok) return -2;
  const speed = Math.max(1, Math.round(10 - Math.max(0, ((elapsed - 2) / 10) * 9)));
  return Math.round(speed * (OMULT[op] || 1) * dm);
}

// ── A whole attempt ───────────────────────────────────────────────────────────
//
// The server's independent recomputation of what a Challenge run was worth. It is deliberately
// the same shape as the loop inside useChallengeGame's submitAnswer — the running total, the
// clamp at zero, the per-operation tally — because the two have to produce identical numbers
// from identical inputs, and the surest way to make two things agree is to make them the same
// thing written once.
//
// `questions` is the server's own stored key: [{ans, op}, ...]. `answers` is what the client
// submitted: [{i, value, ms}, ...]. Nothing the client sent is trusted except the value typed
// and the time taken — which are the two things only the client can know, and which the timing
// checks in validate.js are there to bound.
export function scoreAttempt({ questions, answers, difficulty }) {
  const dm = DIFF_MULT[difficulty] || 1.0;

  let score = 0, correct = 0, wrong = 0, penalty = 0, floorAbsorbed = 0;
  const ops = {};
  const opTimes = {};

  for (const a of answers) {
    const q = questions[a.i];
    // Guarded rather than assumed: validate.js rejects an out-of-range index before this runs,
    // but a scoring function that could be handed one and would silently score it as a wrong
    // answer is a scoring function that can be fed junk to farm penalties away.
    if (!q) continue;

    const elapsed = a.ms / 1000;
    const ok = Number.isFinite(a.value) && Math.abs(a.value - q.ans) < ANSWER_TOLERANCE;
    const pts = calcSc(ok, elapsed, q.op, dm);

    const bo = (ops[q.op] = ops[q.op] || { asked: 0, correct: 0, points: 0 });
    bo.asked++;
    if (ok) { bo.correct++; bo.points += pts; } else { penalty += pts; }

    const before = score;
    score = Math.max(0, score + pts);
    floorAbsorbed += score - before - pts;

    if (ok) {
      correct++;
      (opTimes[q.op] = opTimes[q.op] || []).push(elapsed);
    } else {
      wrong++;
    }
  }

  return {
    rawScore: score,
    correct,
    wrong,
    opTimes,
    // The same breakdown the result screen draws, computed from the server's own marking. It is
    // returned so a future session can show a player a breakdown that was never in their
    // client's hands, rather than one their client asserted.
    breakdown: { ops, wrong, penalty, floorAbsorbed, dm },
  };
}
