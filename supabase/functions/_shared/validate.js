// Is this submission something a person could actually have done?
//
// Every function here is pure: given a submission and two server timestamps, it returns a
// verdict. Nothing reads the database, the network, or the clock. That is deliberate and it is
// the whole testing strategy — the Edge Function does auth and storage and then calls these,
// so scripts/check-anticheat.mjs can drive the real rules headlessly and adversarially, in the
// same spirit as the check scripts that already guard the reducer.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// REJECT vs FLAG, AND WHY BOTH EXIST
//
// Voiding an honest player's real game is a worse failure than letting a marginal one through.
// A rejected run is somebody who played for a minute and got nothing; a flagged run is stored,
// counts for the player exactly as normal, and is merely marked so a future leaderboard can
// decline to rank it.
//
// So REJECT is reserved for the physically impossible — claims that contradict the server's own
// clock or the set it issued — and FLAG carries everything that is merely improbable. A single
// odd timestamp from a phone that stuttered should never cost somebody their run.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { CHALLENGE_DURATION_SEC } from './scoring.js';

// ── The tuning figures, all in one place ──────────────────────────────────────

// How long an issued set stays playable. Past this it is assumed abandoned rather than in
// progress, which is what stops sets being hoarded: you cannot pull a pile of them, solve them
// at leisure, and submit them later.
// It is MODE-AWARE, because the two modes have genuinely different honest durations.
//
// A Challenge run is sixty seconds and is submitted within a couple of minutes of being issued;
// fifteen leaves generous room. A Braining trial is fifty questions with every wrong answer
// corrected before moving on, and the brain-age scale's worst bucket is literally "Over 10 min" —
// so a slow first-timer, or anyone who takes a phone call part-way, genuinely passes fifteen
// minutes. Under one shared TTL their honest run expired and went unverified, which is the same
// class of failure as the phone-call case above: it only ever punishes real players.
//
// Raising it for Braining gives nothing away, and the reason is worth stating because it is not
// obvious. The expiry is not what secures this mode — the claimed-time-against-wall-clock check
// is. A longer-lived set cannot buy a better result, because the claim still has to account for
// very nearly the whole window the server watched; all it buys is the chance to finish. And the
// client already holds the answers, having drawn them from the seed, so a set living longer
// exposes nothing it did not expose in its first second.
export const CHALLENGE_SET_TTL_MS = 15 * 60 * 1000;
export const BRAINING_SET_TTL_MS = 45 * 60 * 1000;

// The outer bound on any single answer's reported time, used before the mode is even considered.
export const MAX_ANSWER_MS = BRAINING_SET_TTL_MS;

// Beyond this a run is stored but flagged. A backgrounded phone genuinely can stretch a
// 60-second game out, so this is generous — it is looking for a set that sat around, not for a
// player who took a phone call.
export const WALL_SUSPECT_MS = 5 * 60 * 1000;

// How much the server's wall clock is allowed to fall short of the play the client claims.
// It should never fall short at all — the wall clock brackets the play by definition — so this
// only absorbs sub-second measurement differences between two machines.
export const WALL_SLACK_MS = 3000;

// The fastest a person can plausibly read a question, work it out, tap at least one digit and
// tap submit. Answers below this are flagged, not rejected: the floor is a judgement about
// human beings, not a fact about the server's clock, and judgements are the wrong thing to
// void a run over.
export const FAST_ANSWER_FLOOR_MS = 250;

// A DIFFERENT floor, doing a different job, which is why it is a separate number.
//
// FAST_ANSWER_FLOOR_MS above asks "is this how fast people are?" and only flags, because that is
// an opinion. This one asks "could this many answers fit in the window the server watched?",
// which is arithmetic — so it rejects.
//
// It was added because the adversarial suite found the hole: sixty answers each claiming one
// millisecond, submitted two hundred milliseconds after issue, passed every check there was.
// Each answer was individually flagged as too fast, but nothing compared the NUMBER of answers
// against the window they were supposed to have happened in, so the run was recorded. Sixty
// questions in a fifth of a second is not improbable, it is impossible, and impossible is what
// rejection is for.
//
// Set well below the human floor on purpose. It is not trying to be a second opinion about how
// fast people are — it only has to be a bound nobody honest can approach.
export const ABSOLUTE_FLOOR_MS = 100;

// A run where nearly every answer takes the same length of time is not how people play. Applied
// only once there are enough answers for the spread to mean anything.
export const UNIFORM_MIN_ANSWERS = 8;
export const UNIFORM_STDEV_MS = 60;

// The point past which taking longer stops changing anything.
//
// calcSc's speed curve is `max(1, round(10 - ((elapsed - 2) / 10) * 9))`, which reaches its floor
// of 1 at about twelve seconds. An answer that took twelve seconds and one that took five minutes
// earn exactly the same points, so time beyond this cannot be part of any attack — it is
// self-punishing, and a cheater's whole interest is in claiming times that are SHORTER.
//
// It matters because of a case that would otherwise reject honest players: a phone that suspends
// JavaScript during a call. The game's own clock stops with it, but the question's timer is read
// from Date.now(), so the interrupted question comes back reporting five minutes. Summed raw,
// that sails past the sixty-second mode limit and a real run is thrown away.
//
// So the mode-limit sum below counts each answer at no more than this. A genuine run never comes
// near the cap; an interrupted one contributes twelve seconds instead of three hundred; and the
// attack the limit exists for — claiming more questions than a minute can hold — is untouched,
// because forty questions still cost forty times their capped value.
export const SCORING_FLOOR_MS = 12000;

// Braining is untimed and its whole result IS the elapsed time, so the server can bracket it
// far more tightly than a Challenge run: the claimed time has to account for very nearly the
// entire window between the set being issued and the answers arriving.
export const BRAINING_WALL_SLACK_MS = 30 * 1000;

// ── Verdict helpers ───────────────────────────────────────────────────────────

const reject = (code, detail) => ({ ok: false, code, detail: detail || null, suspect: false, flags: [] });
const accept = (flags) => ({ ok: true, code: null, detail: null, suspect: flags.length > 0, flags });

function stdev(xs) {
  if (xs.length < 2) return Infinity;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / xs.length);
}

// ── Shared structural checks ──────────────────────────────────────────────────

// Every answer has to name a question in the set that was actually issued, and say how long it
// took in a number that is a number. This runs before anything is scored, so a malformed
// payload can never reach the arithmetic.
function checkAnswerShape(answers, setSize) {
  if (!Array.isArray(answers)) return reject('answers_not_array');
  if (answers.length === 0) return reject('answers_empty');
  if (answers.length > setSize * 4) return reject('answers_too_many');

  for (const a of answers) {
    if (!a || typeof a !== 'object') return reject('answer_malformed');
    if (!Number.isInteger(a.i) || a.i < 0 || a.i >= setSize) return reject('answer_index_out_of_range', a.i);
    if (!Number.isFinite(a.ms) || a.ms < 0 || a.ms > MAX_ANSWER_MS) return reject('answer_time_invalid', a.ms);
    // A missing or non-numeric value is allowed through as a wrong answer rather than rejected:
    // the keypad cannot produce one, but a submission that lost a field should cost the player a
    // question, not the whole run.
  }
  return null;
}

// ── Challenge ─────────────────────────────────────────────────────────────────

// Challenge asks its questions strictly in order and never revisits one. So a valid submission
// answers 0, 1, 2, … with no gaps and no repeats — which is a far stronger statement than
// "every index is in range". It means a client cannot cherry-pick the easy questions out of the
// set it was given and answer only those.
export function validateChallengeSubmission({ answers, setSize, issuedAt, submittedAt }) {
  const shape = checkAnswerShape(answers, setSize);
  if (shape) return shape;

  if (answers.length > setSize) return reject('answers_exceed_set');
  for (let i = 0; i < answers.length; i++) {
    if (answers[i].i !== i) return reject('answers_out_of_sequence', i);
  }

  const wallMs = submittedAt - issuedAt;
  if (!Number.isFinite(wallMs) || wallMs < 0) return reject('wall_clock_invalid', wallMs);
  if (wallMs > CHALLENGE_SET_TTL_MS) return reject('set_expired', wallMs);

  const playMs = answers.reduce((a, x) => a + x.ms, 0);

  // The mode's own limit. Forty questions at three seconds each is two minutes of play, and the
  // game ends after one — no amount of skill produces that, only a rewritten clock.
  //
  // Measured against the CAPPED sum, for the reason set out at SCORING_FLOOR_MS: a single answer
  // interrupted by a phone call reports minutes, earns the same one point it would have earned at
  // twelve seconds, and must not cost an honest player their run.
  const cappedPlayMs = answers.reduce((a, x) => a + Math.min(x.ms, SCORING_FLOOR_MS), 0);
  if (cappedPlayMs > CHALLENGE_DURATION_SEC * 1000 + WALL_SLACK_MS) {
    return reject('play_time_exceeds_mode', cappedPlayMs);
  }

  // The server's own clock, which the client does not hold either end of. Claiming a minute of
  // play inside a window the server watched last two seconds is the direct signature of tampered
  // timing, and this is the check that catches it.
  if (playMs > wallMs + WALL_SLACK_MS) {
    return reject('play_time_exceeds_wall_clock', { playMs, wallMs });
  }

  // The count against the window. The check above compares the time the client CLAIMS to the
  // window; this compares how many questions it says it got through to the same window, which is
  // the thing a client that simply reports tiny times would otherwise walk past.
  if (wallMs < answers.length * ABSOLUTE_FLOOR_MS) {
    return reject('answers_impossible_in_window', { answers: answers.length, wallMs });
  }

  const flags = [];
  if (wallMs > WALL_SUSPECT_MS) flags.push('slow_wall_clock');

  const times = answers.map((a) => a.ms);
  if (times.some((ms) => ms < FAST_ANSWER_FLOOR_MS)) flags.push('inhuman_answer_speed');
  if (times.length >= UNIFORM_MIN_ANSWERS && stdev(times) < UNIFORM_STDEV_MS) flags.push('uniform_timing');

  return accept(flags);
}

// ── Braining ──────────────────────────────────────────────────────────────────

// Braining differs in two ways that matter here. A wrong answer must be corrected before the
// player moves on, so one question can produce several answers and indices repeat. And the
// result is not a score but a duration — which means the server can check it directly, because
// it saw both ends of that duration itself.
export function validateBrainingSubmission({ answers, setSize, claimedSec, issuedAt, submittedAt }) {
  const shape = checkAnswerShape(answers, setSize);
  if (shape) return shape;

  // Non-decreasing, starting at 0, advancing one at a time. Repeats are the corrections; a jump
  // is a question that was never answered.
  //
  // `answeredCurrent` is what makes the first index have to be 0. Without it a submission could
  // open at question 1 — the "advance by one" arm would happily accept it — and skip the first
  // question entirely.
  let expected = 0;
  let answeredCurrent = false;
  for (const a of answers) {
    if (a.i === expected) { answeredCurrent = true; continue; }
    if (a.i === expected + 1 && answeredCurrent) { expected++; continue; }
    return reject('answers_out_of_sequence', a.i);
  }
  if (!answeredCurrent || expected !== setSize - 1) return reject('braining_incomplete', expected + (answeredCurrent ? 1 : 0));

  const wallMs = submittedAt - issuedAt;
  if (!Number.isFinite(wallMs) || wallMs < 0) return reject('wall_clock_invalid', wallMs);
  if (wallMs > BRAINING_SET_TTL_MS) return reject('set_expired', wallMs);

  if (!Number.isFinite(claimedSec) || claimedSec <= 0) return reject('claimed_time_invalid', claimedSec);
  const claimedMs = claimedSec * 1000;

  // You cannot have taken longer than the window you were inside.
  if (claimedMs > wallMs + WALL_SLACK_MS) return reject('claimed_time_exceeds_wall_clock', { claimedMs, wallMs });

  // And you cannot have taken very much LESS, either — which is the cheat this mode actually
  // has, since a smaller number is a better result. The only honest gap between the window and
  // the claim is the 3-2-1 countdown plus the round trip at each end.
  if (wallMs - claimedMs > BRAINING_WALL_SLACK_MS) {
    return reject('claimed_time_far_below_wall_clock', { claimedMs, wallMs });
  }

  // The same count-against-the-window bound Challenge applies. Fifty questions plus corrections
  // cannot happen in a window too small to hold them, whatever times are attached to them.
  if (wallMs < answers.length * ABSOLUTE_FLOOR_MS) {
    return reject('answers_impossible_in_window', { answers: answers.length, wallMs });
  }

  const flags = [];
  const times = answers.map((a) => a.ms);
  if (times.some((ms) => ms < FAST_ANSWER_FLOOR_MS)) flags.push('inhuman_answer_speed');
  if (times.length >= UNIFORM_MIN_ANSWERS && stdev(times) < UNIFORM_STDEV_MS) flags.push('uniform_timing');

  return accept(flags);
}

// Did this Braining run actually finish?
//
// Braining's rule is that a wrong answer is corrected rather than counted against you, so the
// only marking that means anything is whether the LAST word on each question was right. A
// submission whose final answer to question 31 is wrong did not complete question 31, whatever
// it claims about having reached the end.
//
// This lived inline in the Edge Function until Braining was wired, which quietly made it the one
// rule in the whole design that no test could reach — every other decision sits in this file
// precisely so check-anticheat.mjs can attack it. It is the rule standing between a fabricated
// run and a 5% boost, so it is the last one that should have been sitting somewhere unreachable.
//
// `key` is the server's own answer key: [{a, o}, ...]. `answers` is what was submitted.
export function markBrainingCompletion({ answers, key, tolerance }) {
  const lastByIndex = new Map();
  for (const a of answers) lastByIndex.set(a.i, a);

  let unresolved = 0;
  for (let i = 0; i < key.length; i++) {
    const a = lastByIndex.get(i);
    if (!a || !Number.isFinite(a.value) || Math.abs(a.value - key[i].a) >= tolerance) unresolved++;
  }
  return { complete: unresolved === 0, unresolved };
}
