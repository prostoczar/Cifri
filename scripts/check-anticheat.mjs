// Attacks the anti-cheat rules and reports what got through.
//
// Every other check script in this repo asks "does the honest path work". This one asks the
// opposite question, and it is written from the cheater's side of the table: each case below is
// an attempt to record a score that was not earned, and each has to be caught by name.
//
// It drives the REAL rules — the same _shared/*.js modules the deployed Edge Function imports,
// not a description of them. That is why those modules are pure: validation, scoring and the
// rate limit make no database or network calls, so the decisions can be attacked here at full
// speed, and the Edge Function is left holding nothing but plumbing.
//
// WHAT THIS CANNOT PROVE, said plainly:
//
//   • That the deployed function wires these rules up correctly. That is what
//     supabase/verification/0009_server_tables_rls.sql and scripts/probe-anticheat.mjs are for,
//     and they need a real deployment and a real account.
//   • That the tables refuse a client's writes. Same — RLS is a database claim and only the
//     database can be asked about it.
//   • That a solver bot cannot play. It can. Nothing here or anywhere else in this design stops
//     somebody reading the question off their own screen and answering it with code; what it
//     stops is every cheaper attack than that. See the flags for what is left.
//
// Run it with:  npm run check:anticheat

import {
  validateChallengeSubmission,
  validateBrainingSubmission,
  SET_TTL_MS,
  FAST_ANSWER_FLOOR_MS,
  WALL_SLACK_MS,
  BRAINING_WALL_SLACK_MS,
  ABSOLUTE_FLOOR_MS,
  SCORING_FLOOR_MS,
} from '../supabase/functions/_shared/validate.js';
import { scoreAttempt, applyBrainingBoost, CHALLENGE_DURATION_SEC } from '../supabase/functions/_shared/scoring.js';
import { generateChallengeSet, generateBrainingSet, CHALLENGE_SET_SIZE } from '../supabase/functions/_shared/generator.js';
import { checkIssueRate, isPlausibleDay, ISSUES_PER_MINUTE, CHALLENGE_ISSUES_PER_DAY } from '../supabase/functions/_shared/ratelimit.js';

let failed = 0;
const fail = (msg) => { failed++; console.log('FAIL  ' + msg); };
const ok = (msg) => console.log('ok    ' + msg);

// `caught` reads as the attack being stopped; `allowed` as honest play being let through. Both
// are asserted, because a check that rejects everything is not a check.
function caught(label, verdict, expectedCode) {
  if (verdict.ok) return fail(`${label} — GOT THROUGH (expected ${expectedCode})`);
  if (expectedCode && verdict.code !== expectedCode) {
    return fail(`${label} — caught, but as ${verdict.code} rather than ${expectedCode}`);
  }
  ok(`${label} → ${verdict.code}`);
}
function allowed(label, verdict) {
  if (!verdict.ok) return fail(`${label} — HONEST PLAY REJECTED as ${verdict.code}`);
  ok(label);
}
function flagged(label, verdict, expectedFlag) {
  if (!verdict.ok) return fail(`${label} — rejected outright; it should be recorded and flagged`);
  if (verdict.flags.indexOf(expectedFlag) === -1) {
    return fail(`${label} — not flagged (${expectedFlag} missing; got [${verdict.flags}])`);
  }
  ok(`${label} → flagged ${expectedFlag}`);
}

const ISSUED = 1_700_000_000_000; // a fixed "issued_at", so every case reads the same clock

// A run somebody actually played: answers in order, human-looking times, most of them right.
function honestRun(questions, { n = 20, msEach = 2200, wrongEvery = 6 } = {}) {
  const answers = [];
  for (let i = 0; i < n; i++) {
    const right = i % wrongEvery !== 0;
    answers.push({
      i,
      value: right ? questions[i].ans : questions[i].ans + 3,
      // Jittered, or the uniform-timing flag would fire on the honest baseline and every case
      // below would be testing the wrong thing.
      ms: msEach + ((i * 137) % 900) - 450,
    });
  }
  return answers;
}

const chQuestions = generateChallengeSet(42424242, 'hard');
const baseline = honestRun(chQuestions);
const baseSubmittedAt = ISSUED + 3000 + baseline.reduce((a, x) => a + x.ms, 0) + 800;

// ═══ The honest baseline ══════════════════════════════════════════════════════
console.log('\nHonest play is not rejected');
{
  allowed('a normal 20-question Hard run', validateChallengeSubmission({
    answers: baseline, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: baseSubmittedAt,
  }));

  // The fastest plausible human run: lots of questions, all quick, still inside the minute.
  const fast = honestRun(chQuestions, { n: 40, msEach: 1200, wrongEvery: 99 });
  allowed('a very fast 40-question run, all correct', validateChallengeSubmission({
    answers: fast, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 3000 + fast.reduce((a, x) => a + x.ms, 0) + 500,
  }));

  // Somebody who answered three questions and gave up.
  const short = honestRun(chQuestions, { n: 3, msEach: 5000 });
  allowed('a three-question run', validateChallengeSubmission({
    answers: short, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 3000 + 60000,
  }));

  // A phone that took a while to send. Legitimate, and must not be voided.
  allowed('a run submitted four minutes after issue', validateChallengeSubmission({
    answers: baseline, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 4 * 60 * 1000,
  }));
}

// ═══ Attack 1 — the impossible score ══════════════════════════════════════════
console.log('\nAttack: submit a score that was not earned');
{
  // The direct version does not exist any more, and that is the point worth stating first: there
  // is no score field in a submission. The only way to ask for points is to answer questions.
  const wrongEverything = baseline.map((a, i) => ({ ...a, value: chQuestions[i].ans + 1000 }));
  const scored = scoreAttempt({ questions: chQuestions, answers: wrongEverything, difficulty: 'hard' });
  if (scored.rawScore !== 0) fail(`20 wrong answers scored ${scored.rawScore}, not 0`);
  else ok('20 deliberately wrong answers score 0 — a submission has no score field to inflate');

  // Claiming the maximum possible speed on every question is not forbidden by scoring — it is
  // forbidden by the clock. Instant answers cannot add up to a real minute of play.
  const instant = Array.from({ length: 60 }, (_, i) => ({ i, value: chQuestions[i].ans, ms: 1 }));
  const instantScore = scoreAttempt({ questions: chQuestions, answers: instant, difficulty: 'hard' });
  // This one found a real hole when it was first written. Every individual answer was flagged as
  // too fast, but nothing checked whether sixty answers could fit in a fifth of a second at all,
  // so the run was recorded. ABSOLUTE_FLOOR_MS exists because of this case.
  caught(`60 instant correct answers in a 200ms window (would have scored ${instantScore.rawScore})`, validateChallengeSubmission({
    answers: instant, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 200,
  }), 'answers_impossible_in_window');

  // The boundary of that bound, from both sides. The claimed times have to be tiny here, or the
  // wall-clock check fires first and these two cases would be quietly testing that instead.
  const twenty = Array.from({ length: 20 }, (_, i) => ({ i, value: chQuestions[i].ans, ms: 1 }));
  allowed('20 answers in a window exactly wide enough to hold them', validateChallengeSubmission({
    answers: twenty, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 20 * ABSOLUTE_FLOOR_MS,
  }));
  caught('20 answers in a window one millisecond too narrow', validateChallengeSubmission({
    answers: twenty, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 20 * ABSOLUTE_FLOOR_MS - 1,
  }), 'answers_impossible_in_window');

  // The same attack, but padding the wall clock by waiting before submitting. Now the timing
  // adds up — and it is the per-answer floor that has to catch it.
  flagged('60 instant answers, submitted after a plausible wait', validateChallengeSubmission({
    answers: instant, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 70000,
  }), 'inhuman_answer_speed');

  // Answering more questions than a minute allows, each at a believable speed.
  const marathon = Array.from({ length: 70 }, (_, i) => ({ i, value: chQuestions[i].ans, ms: 2000 }));
  caught('70 questions at 2s each — 140 seconds of play in a 60-second mode', validateChallengeSubmission({
    answers: marathon, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 150000,
  }), 'play_time_exceeds_mode');

  // Cherry-picking: answer only the percentage questions, which pay 1.5x.
  const pctIdx = chQuestions.map((q, i) => (q.op === 'percentage' ? i : -1)).filter((i) => i >= 0);
  if (pctIdx.length < 3) fail('the fixture set has too few percentage questions to test cherry-picking');
  const cherry = pctIdx.slice(0, 8).map((i) => ({ i, value: chQuestions[i].ans, ms: 2500 }));
  caught('answering only the percentage questions, skipping the rest', validateChallengeSubmission({
    answers: cherry, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 40000,
  }), 'answers_out_of_sequence');

  // Answering the same easy question forty times.
  const repeat = Array.from({ length: 40 }, () => ({ i: 0, value: chQuestions[0].ans, ms: 1200 }));
  caught('the same question answered forty times', validateChallengeSubmission({
    answers: repeat, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 60000,
  }), 'answers_out_of_sequence');

  // Pointing at questions that were never in the set.
  caught('an answer to question 500 of an 80-question set', validateChallengeSubmission({
    answers: [{ i: 500, value: 1, ms: 2000 }], setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 10000,
  }), 'answer_index_out_of_range');

  // And the scorer's own guard, in case validation is ever bypassed: an index with no question
  // behind it must score nothing rather than being marked as a wrong answer, which would let a
  // cheater farm away real penalties with junk indices.
  const junk = scoreAttempt({
    questions: chQuestions,
    answers: [{ i: 0, value: chQuestions[0].ans + 5, ms: 2000 }, { i: 9999, value: 0, ms: 2000 }],
    difficulty: 'hard',
  });
  if (junk.wrong !== 1) fail(`the scorer counted ${junk.wrong} wrong answers; the junk index should be ignored entirely`);
  else ok('an out-of-range index is ignored by the scorer, not counted as a wrong answer');
}

// ═══ Attack 2 — tampered timing ═══════════════════════════════════════════════
console.log('\nAttack: rewrite the clock');
{
  // The purest form: real answers, but every time divided by ten so the speed bonus is maximal.
  const speedHack = baseline.map((a) => ({ ...a, ms: Math.round(a.ms / 10) }));
  const honestScore = scoreAttempt({ questions: chQuestions, answers: baseline, difficulty: 'hard' }).rawScore;
  const hackedScore = scoreAttempt({ questions: chQuestions, answers: speedHack, difficulty: 'hard' }).rawScore;
  if (hackedScore <= honestScore) fail('dividing every time by ten did not raise the score — the fixture proves nothing');
  else ok(`dividing every answer time by 10 would lift ${honestScore} to ${hackedScore} — worth catching`);

  // Worth being precise about which check does the work here, because the obvious answer is
  // wrong. Shrinking the times makes the claimed play SMALLER than the wall clock, and the
  // wall-clock test only objects to claims that are too LARGE — so it does not fire, and was
  // never going to. What catches this is the human-speed floor.
  const shrunk = validateChallengeSubmission({
    answers: speedHack, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: baseSubmittedAt,
  });
  flagged('shrinking every answer time is caught by the human-speed floor', shrunk, 'inhuman_answer_speed');

  // Inflating times instead — pretending a minute of play happened inside a two-second window.
  caught('a minute of answers submitted two seconds after issue', validateChallengeSubmission({
    answers: baseline, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 2000,
  }), 'play_time_exceeds_wall_clock');

  // Negative and absurd times.
  caught('a negative answer time', validateChallengeSubmission({
    answers: [{ i: 0, value: 1, ms: -5000 }], setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 10000,
  }), 'answer_time_invalid');
  caught('a submission timestamped before its own set was issued', validateChallengeSubmission({
    answers: baseline, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED - 60000,
  }), 'wall_clock_invalid');

  // Hoarding: solve the set at leisure and submit tomorrow.
  caught('a set submitted twenty minutes after issue', validateChallengeSubmission({
    answers: baseline, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + SET_TTL_MS + 1000,
  }), 'set_expired');

  // A bot's signature: correct, fast enough to be legal, and metronomic.
  const bot = Array.from({ length: 25 }, (_, i) => ({ i, value: chQuestions[i].ans, ms: 1500 }));
  flagged('25 answers at exactly 1.5s each', validateChallengeSubmission({
    answers: bot, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + 45000,
  }), 'uniform_timing');

  // The boundary itself, from both sides.
  const atFloor = [{ i: 0, value: chQuestions[0].ans, ms: FAST_ANSWER_FLOOR_MS }];
  const belowFloor = [{ i: 0, value: chQuestions[0].ans, ms: FAST_ANSWER_FLOOR_MS - 1 }];
  const args = { setSize: CHALLENGE_SET_SIZE, issuedAt: ISSUED, submittedAt: ISSUED + 20000 };
  if (validateChallengeSubmission({ answers: atFloor, ...args }).flags.length !== 0) {
    fail(`an answer at exactly ${FAST_ANSWER_FLOOR_MS}ms is flagged; the floor should be inclusive`);
  } else ok(`an answer at exactly ${FAST_ANSWER_FLOOR_MS}ms is accepted unflagged`);
  flagged(`an answer at ${FAST_ANSWER_FLOOR_MS - 1}ms`, validateChallengeSubmission({ answers: belowFloor, ...args }), 'inhuman_answer_speed');

  // The mode limit's boundary. Measured in CAPPED time — each answer counts for at most
  // SCORING_FLOOR_MS — so the boundary is a number of answers rather than one long one.
  const atLimit = Array.from({ length: 5 }, (_, i) => ({ i, value: chQuestions[i].ans, ms: SCORING_FLOOR_MS }));
  const overLimit = Array.from({ length: 6 }, (_, i) => ({ i, value: chQuestions[i].ans, ms: SCORING_FLOOR_MS }));
  allowed('5 answers at the scoring floor — 60s of capped play', validateChallengeSubmission({
    answers: atLimit, setSize: CHALLENGE_SET_SIZE, issuedAt: ISSUED, submittedAt: ISSUED + 70000,
  }));
  caught('6 of them — 72s, past what a 60-second game can hold', validateChallengeSubmission({
    answers: overLimit, setSize: CHALLENGE_SET_SIZE, issuedAt: ISSUED, submittedAt: ISSUED + 80000,
  }), 'play_time_exceeds_mode');

  // ── The phone call ──────────────────────────────────────────────────────────
  //
  // The false positive that prompted the cap. A phone suspends JavaScript during a call; the
  // game's clock stops with it, but the interrupted question's timer is read from Date.now() and
  // comes back reporting minutes. Summed raw it exceeds the mode limit and an honest run is
  // thrown away — the worst failure this system can have, because it punishes only real players.
  const interrupted = honestRun(chQuestions, { n: 12, msEach: 2500 });
  interrupted[4].ms = 180000; // took a call on question 5
  const interruptedPlay = interrupted.reduce((a, x) => a + x.ms, 0);
  allowed('a run interrupted by a three-minute phone call', validateChallengeSubmission({
    answers: interrupted, setSize: CHALLENGE_SET_SIZE,
    issuedAt: ISSUED, submittedAt: ISSUED + interruptedPlay + 4000,
  }));

  // And the cap must not become a way through. Forty questions at three seconds each is under the
  // cap on every single answer, so capping changes nothing about the attack it exists to stop.
  const stillCaught = Array.from({ length: 40 }, (_, i) => ({ i, value: chQuestions[i].ans, ms: 3000 }));
  caught('40 answers at 3s each, none of them near the cap', validateChallengeSubmission({
    answers: stillCaught, setSize: CHALLENGE_SET_SIZE, issuedAt: ISSUED, submittedAt: ISSUED + 130000,
  }), 'play_time_exceeds_mode');
}

// ═══ Attack 3 — the fabricated boost ══════════════════════════════════════════
console.log('\nAttack: claim a boost that was never earned');
{
  // The submission has no boost field, which is the first half of the answer: there is nothing
  // to fabricate. The second half is that the server decides from its own record.
  //
  // That record is a single conditional UPDATE, modelled here exactly as the function performs
  // it — the point being that the check and the spend are one statement, so there is no window
  // between them for a second attempt to slip through.
  function makeBoostTable(grantedDays) {
    const rows = new Map(grantedDays.map((d) => [d, { consumed: false }]));
    return {
      // update … where day = ? and consumed_at is null … returning *
      consume(day) {
        const row = rows.get(day);
        if (!row || row.consumed) return false;
        row.consumed = true;
        return true;
      },
      grant(day) { if (!rows.has(day)) rows.set(day, { consumed: false }); },
    };
  }

  const raw = 96;
  const today = '2026-08-04';

  const noBoost = makeBoostTable([]);
  if (noBoost.consume(today)) fail('a boost was paid on a day Braining was never completed');
  else ok('no Braining trial recorded → no boost, whatever the client believes');

  const withBoost = makeBoostTable([today]);
  if (!withBoost.consume(today)) fail('an earned boost was refused');
  else ok(`a genuine boost is paid: ${raw} → ${applyBrainingBoost(raw)}`);

  if (withBoost.consume(today)) fail('the same boost was spent twice');
  else ok('the second attempt that day finds it already spent');

  // Yesterday's unspent boost, replayed today.
  const stale = makeBoostTable(['2026-08-03']);
  if (stale.consume(today)) fail("yesterday's boost was spent today");
  else ok("yesterday's unspent boost cannot be spent today — the row is keyed by day");

  // Two attempts submitted at the same instant. Only one row exists and only one UPDATE can find
  // consumed_at still null, so exactly one is paid.
  const race = makeBoostTable([today]);
  const results = [race.consume(today), race.consume(today)];
  if (results.filter(Boolean).length !== 1) fail(`a simultaneous double submission was paid ${results.filter(Boolean).length} times`);
  else ok('two simultaneous attempts, exactly one boost paid');

  // And the arithmetic itself, since a boost applied to the wrong number is the other way to
  // overpay. Achievements read the raw score precisely so the boost cannot buy them.
  const boostedScore = applyBrainingBoost(raw);
  if (boostedScore !== 101) fail(`a 96-point run boosted to ${boostedScore}, expected 101`);
  else ok('a 96-point run boosts to 101, and 96 is still what the achievements are shown');
  if (applyBrainingBoost(0) !== 0) fail('a zero score boosts to something other than zero');
  else ok('a zero score cannot be boosted into a positive one');
}

// ═══ Attack 4 — Braining ══════════════════════════════════════════════════════
console.log('\nAttack: a Braining time that was not run');
{
  const brQuestions = generateBrainingSet(777777, 50);
  // Braining makes you correct a wrong answer before advancing, so one question can produce
  // several attempts. An honest run: a few corrections, the rest first time.
  const brAnswers = [];
  for (let i = 0; i < 50; i++) {
    if (i % 11 === 0) brAnswers.push({ i, value: brQuestions[i].ans + 2, ms: 3000 });
    brAnswers.push({ i, value: brQuestions[i].ans, ms: 4000 + ((i * 313) % 1500) });
  }
  const brPlayMs = brAnswers.reduce((a, x) => a + x.ms, 0);
  const brSec = Math.round(brPlayMs / 1000) + 4;

  allowed('a genuine 50-question trial with corrections', validateBrainingSubmission({
    answers: brAnswers, setSize: 50, claimedSec: brSec,
    issuedAt: ISSUED, submittedAt: ISSUED + brSec * 1000 + 3000,
  }));

  // The cheat this mode actually has: a lower time is a better result, so claim a lower one.
  caught('claiming 150s for a run the server watched take ten minutes', validateBrainingSubmission({
    answers: brAnswers, setSize: 50, claimedSec: 150,
    issuedAt: ISSUED, submittedAt: ISSUED + 600 * 1000,
  }), 'claimed_time_far_below_wall_clock');

  // The boundary of the allowance for countdown plus round trip.
  const wall = 400 * 1000;
  allowed('a claim that is short by exactly the permitted slack', validateBrainingSubmission({
    answers: brAnswers, setSize: 50, claimedSec: (wall - BRAINING_WALL_SLACK_MS) / 1000,
    issuedAt: ISSUED, submittedAt: ISSUED + wall,
  }));
  caught('a claim one second shorter than that', validateBrainingSubmission({
    answers: brAnswers, setSize: 50, claimedSec: (wall - BRAINING_WALL_SLACK_MS) / 1000 - 1,
    issuedAt: ISSUED, submittedAt: ISSUED + wall,
  }), 'claimed_time_far_below_wall_clock');

  // Claiming longer than the window is nonsense in the other direction.
  caught('claiming more time than the window it happened in', validateBrainingSubmission({
    answers: brAnswers, setSize: 50, claimedSec: 900,
    issuedAt: ISSUED, submittedAt: ISSUED + 300 * 1000,
  }), 'claimed_time_exceeds_wall_clock');

  // Skipping questions. Braining is fifty or it is nothing.
  const partial = brAnswers.filter((a) => a.i < 30);
  caught('a 30-question run submitted as a completed trial', validateBrainingSubmission({
    answers: partial, setSize: 50, claimedSec: 120,
    issuedAt: ISSUED, submittedAt: ISSUED + 125 * 1000,
  }), 'braining_incomplete');

  const skipFirst = brAnswers.filter((a) => a.i !== 0);
  caught('a run that never answered question 1', validateBrainingSubmission({
    answers: skipFirst, setSize: 50, claimedSec: brSec,
    issuedAt: ISSUED, submittedAt: ISSUED + brSec * 1000 + 3000,
  }), 'answers_out_of_sequence');

  const jump = brAnswers.filter((a) => a.i !== 25);
  caught('a run that skipped question 26 in the middle', validateBrainingSubmission({
    answers: jump, setSize: 50, claimedSec: brSec,
    issuedAt: ISSUED, submittedAt: ISSUED + brSec * 1000 + 3000,
  }), 'answers_out_of_sequence');

  caught('a claimed time of zero seconds', validateBrainingSubmission({
    answers: brAnswers, setSize: 50, claimedSec: 0,
    issuedAt: ISSUED, submittedAt: ISSUED + 200 * 1000,
  }), 'claimed_time_invalid');
}

// ═══ Attack 5 — fishing and flooding ══════════════════════════════════════════
console.log('\nAttack: ask for sets until an easy one turns up');
{
  if (checkIssueRate({ mode: 'challenge', recentCount: 0, todayCount: 0 })) fail('a first request was rate limited');
  else ok('the first set of the day is issued');

  if (checkIssueRate({ mode: 'challenge', recentCount: ISSUES_PER_MINUTE - 1, todayCount: 5 })) {
    fail(`request ${ISSUES_PER_MINUTE} in a minute was refused; the cap should be inclusive`);
  } else ok(`${ISSUES_PER_MINUTE} sets in a minute is allowed`);

  const burst = checkIssueRate({ mode: 'challenge', recentCount: ISSUES_PER_MINUTE, todayCount: 5 });
  if (!burst) fail('an eleventh set inside one minute was issued');
  else ok(`the ${ISSUES_PER_MINUTE + 1}th set in a minute → ${burst.code}`);

  const daily = checkIssueRate({ mode: 'challenge', recentCount: 0, todayCount: CHALLENGE_ISSUES_PER_DAY });
  if (!daily) fail(`set ${CHALLENGE_ISSUES_PER_DAY + 1} of the day was issued`);
  else ok(`set ${CHALLENGE_ISSUES_PER_DAY + 1} of the day → ${daily.code}`);

  // Braining's cap is far tighter, because there is only one counting trial to serve.
  const br = checkIssueRate({ mode: 'braining', recentCount: 0, todayCount: 10 });
  if (!br) fail('an eleventh Braining set was issued in one day');
  else ok(`the 11th Braining set of the day → ${br.code}`);

  // Backdating, to inflate a day nobody is looking at any more.
  const now = Date.parse('2026-08-04T12:00:00Z');
  if (isPlausibleDay('2019-01-01', now)) fail('a submission dated 2019 was accepted');
  else ok('a day seven years ago is refused');
  if (isPlausibleDay('2030-01-01', now)) fail('a submission dated 2030 was accepted');
  else ok('a day four years hence is refused');
  if (!isPlausibleDay('2026-08-04', now)) fail("today's date was refused");
  else ok("today's date is accepted");
  // A timezone's worth of slack either side is genuinely needed: the app's day boundary is local
  // midnight, so a player in Auckland or Honolulu is legitimately on a different date to UTC.
  if (!isPlausibleDay('2026-08-05', now)) fail('tomorrow-in-UTC was refused, breaking players east of UTC');
  else ok('one day either side of UTC is accepted, for the timezones that need it');
  if (isPlausibleDay('2026-08-07', now)) fail('a day three ahead was accepted');
  else ok('three days ahead is refused');
  if (isPlausibleDay('not-a-date', now) || isPlausibleDay('', now) || isPlausibleDay(null, now)) {
    fail('a malformed day was accepted');
  } else ok('a malformed day is refused');
}

// ═══ Malformed payloads ═══════════════════════════════════════════════════════
console.log('\nMalformed submissions cannot reach the arithmetic');
{
  const args = { setSize: CHALLENGE_SET_SIZE, issuedAt: ISSUED, submittedAt: ISSUED + 30000 };
  caught('answers sent as a string', validateChallengeSubmission({ answers: 'lots', ...args }), 'answers_not_array');
  caught('an empty submission', validateChallengeSubmission({ answers: [], ...args }), 'answers_empty');
  caught('a null in the answers list', validateChallengeSubmission({ answers: [null], ...args }), 'answer_malformed');
  caught('a fractional question index', validateChallengeSubmission({ answers: [{ i: 1.5, value: 1, ms: 2000 }], ...args }), 'answer_index_out_of_range');
  caught('a negative question index', validateChallengeSubmission({ answers: [{ i: -1, value: 1, ms: 2000 }], ...args }), 'answer_index_out_of_range');
  caught('a NaN answer time', validateChallengeSubmission({ answers: [{ i: 0, value: 1, ms: NaN }], ...args }), 'answer_time_invalid');
  caught('an answer time of a fortnight', validateChallengeSubmission({ answers: [{ i: 0, value: 1, ms: 1e12 }], ...args }), 'answer_time_invalid');

  // A missing value is a wrong answer, not a rejection — the keypad cannot produce one, but a
  // dropped field should cost a question rather than the run.
  const missing = validateChallengeSubmission({ answers: [{ i: 0, ms: 2000 }], ...args });
  if (!missing.ok) fail(`a missing answer value was rejected as ${missing.code}; it should score as wrong`);
  else ok('a missing answer value is allowed through, to be marked wrong');
  const scoredMissing = scoreAttempt({ questions: chQuestions, answers: [{ i: 0, ms: 2000 }], difficulty: 'hard' });
  if (scoredMissing.wrong !== 1 || scoredMissing.rawScore !== 0) fail('a missing value was not marked wrong');
  else ok('…and it is marked wrong, scoring nothing');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall attacks were caught');
process.exit(failed ? 1 : 0);
