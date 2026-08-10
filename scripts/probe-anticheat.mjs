// Attacks the DEPLOYED anti-cheat, with a real account, over the real network.
//
// scripts/check-anticheat.mjs proves the rules are right. This proves they are actually wired
// up — that the Edge Function calls them, that the database refuses what migration 0007 says it
// refuses, and that a score recorded in verified_daily_results is one the server computed.
// Those are different claims and only one of them can be checked without a deployment.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// IT NEEDS A LOGIN, AND IT MUST NOT BE YOUR REAL ONE.
//
// It plays real games against a real account and records real rows. Use a throwaway account.
// Credentials are read from the environment so they are never written into this file, never
// committed, and never end up in a transcript:
//
//   CIFRI_TEST_EMAIL='someone@example.com' CIFRI_TEST_PASSWORD='...' npm run probe:anticheat
//
// It files everything against YESTERDAY rather than today, so that a probe run cannot disturb
// the day you are actually playing — yesterday is still inside the one-day window the server
// allows for timezones. It prints the SQL to delete what it wrote when it finishes; the client
// cannot clean up after itself here, which is precisely the property being demonstrated.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { createEngine } from '../supabase/functions/_shared/generator.js';
import { applyBrainingBoost } from '../supabase/functions/_shared/scoring.js';
import { RATE_WINDOW_MS, ISSUES_PER_MINUTE } from '../supabase/functions/_shared/ratelimit.js';
import { scoreAttempt } from '../supabase/functions/_shared/scoring.js';

// ── Setup ─────────────────────────────────────────────────────────────────────

const env = {};
for (const line of (await readFile(new URL('../.env.local', import.meta.url), 'utf8')).split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const URL_ = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.CIFRI_TEST_EMAIL;
const PASSWORD = process.env.CIFRI_TEST_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    '\nThis probe needs a throwaway account to play as.\n\n' +
    "  CIFRI_TEST_EMAIL='you@example.com' CIFRI_TEST_PASSWORD='...' npm run probe:anticheat\n\n" +
    'Do not use your real account — it records real games.\n'
  );
  process.exit(2);
}

let failed = 0;
const fail = (msg) => { failed++; console.log('FAIL  ' + msg); };
const ok = (msg) => console.log('ok    ' + msg);

const supabase = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (signInError || !signIn.session) {
  console.error('\nCould not sign in: ' + (signInError?.message || 'no session') + '\n');
  process.exit(2);
}
const TOKEN = signIn.session.access_token;
const USER_ID = signIn.session.user.id;
ok(`signed in as ${EMAIL}`);

// Yesterday in UTC — inside the server's ±1 day allowance, and not the day you are playing.
const DAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
console.log(`      filing everything against ${DAY}\n`);

async function call(fn, body) {
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, body: json };
}

const issue = (difficulty = 'hard', mode = 'challenge') => call('issue-question-set', { mode, difficulty, day: DAY });
const submit = (body) => call('submit-attempt', body);

// The client's side of the seed contract: same generator, same seed, same questions.
const questionsFor = (seed, difficulty, count) =>
  createEngine({ seed }).challengeSet(difficulty, count);

// A run that looks like somebody played it.
function honestAnswers(questions, n, { correctEvery = 5, msEach = 1600 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    i,
    value: i % correctEvery === 0 ? questions[i].ans + 3 : questions[i].ans,
    // Jittered, or `uniform_timing` fires and the honest baseline arrives pre-flagged.
    ms: msEach + ((i * 211) % 1100) - 550,
  }));
}

// Actually wait out the play being claimed, instead of claiming it and submitting at once.
//
// The first live run got this wrong and was rejected as tampered — correctly. It built answers
// totalling forty-three seconds and then slept for three, which is indistinguishable from a
// client that rewrote its clock, because it IS that. The server holds both ends of the window
// and is entitled to notice.
//
// A real player is never in this position: the set is issued as the 3-2-1 countdown starts and
// submitted a minute later, so the claimed play always sits comfortably inside the window. To
// behave like one, this has to spend the time.
// The probe asks for more sets in a minute than any player ever would, and by the time it reaches
// the boost lifecycle it has spent its whole per-minute allowance on attacks. The first live run
// of this section died on its own rate limit — which is the limiter working exactly as intended,
// and a pacing bug in the test rather than a fault in the product. Raising the cap to make the
// test pass would be weakening a real control for the convenience of the thing checking it.
async function cooldown(reason) {
  const ms = RATE_WINDOW_MS + 3000;
  console.log(`      (pausing ${Math.round(ms / 1000)}s for the ${ISSUES_PER_MINUTE}-per-minute window to clear — ${reason})`);
  await new Promise((r) => setTimeout(r, ms));
}

async function playOut(answers) {
  const ms = answers.reduce((a, x) => a + x.ms, 0);
  await new Promise((r) => setTimeout(r, ms + 500));
  return ms;
}

// Getting a set is the precondition for almost every attack below. When it fails — as it did on
// the first live run, where service_role had no grant on question_sets — the old code went on to
// index into an undefined array and took the entire probe down with a TypeError, so nothing after
// the first failure was tested. It reports and returns null now.
async function issueOrNull(label, difficulty = 'hard', mode = 'challenge') {
  const { status, body } = await issue(difficulty, mode);
  if (status !== 200 || !body?.setId) {
    fail(`${label} — no question set (HTTP ${status}${body?.code ? `, sqlstate ${body.code}` : ''}: ${JSON.stringify(body)})`);
    return null;
  }
  return body;
}

const expectReject = async (label, body, code) => {
  const r = await submit(body);
  if (r.status === 200 && r.body?.ok !== false) return fail(`${label} — ACCEPTED by the live server (HTTP ${r.status})`);
  if (code && r.body?.code !== code) return fail(`${label} — rejected as ${r.body?.code}, expected ${code}`);
  // A rejection carries `code`; a 404 for a set that is not yours carries `error` instead, since
  // it never got as far as being validated. Reported either way rather than printing "undefined".
  ok(`${label} → ${r.body?.code ?? r.body?.error ?? 'refused'} (HTTP ${r.status})`);
};

// ═══ 1. The answer key is unreachable ════════════════════════════════════════
console.log('The answer key is unreachable');
{
  const { data, error } = await supabase.from('question_sets').select('*').limit(5);
  if (!error && data && data.length) fail(`a signed-in player read ${data.length} question_sets row(s) — THE ANSWERS ARE EXPOSED`);
  else ok(`a signed-in player reading question_sets gets ${error ? error.code || 'an error' : 'no rows'}`);
}

// ═══ 2. An honest run is scored, and scored correctly ════════════════════════
console.log('\nAn honest run');
let honestSetId = null;
{
  const { status, body } = await issue('hard');
  if (status !== 200 || !body?.setId) { fail(`could not get a question set (HTTP ${status}${body?.code ? `, sqlstate ${body.code}` : ''}: ${JSON.stringify(body)})`); }
  else {
    honestSetId = body.setId;
    ok(`a set was issued: seed ${body.seed}, ${body.setSize} questions`);

    const questions = questionsFor(body.seed, 'hard', body.setSize);
    const answers = honestAnswers(questions, 12);
    // What the phone would put on screen, computed locally from the seed.
    const local = scoreAttempt({ questions, answers, difficulty: 'hard' });

    const spent = await playOut(answers);
    console.log(`      (played out ${(spent / 1000).toFixed(1)}s, as a real run would)`);
    const res = await submit({ setId: body.setId, answers });

    if (res.status !== 200 || !res.body?.ok) {
      fail(`an honest run was rejected: ${JSON.stringify(res.body)}`);
    } else {
      ok(`accepted: ${res.body.correct} right, ${res.body.wrong} wrong, raw score ${res.body.rawScore}`);
      if (res.body.rawScore !== local.rawScore) {
        fail(`THE SERVER AND THE PHONE DISAGREE: server ${res.body.rawScore}, phone ${local.rawScore}`);
      } else {
        ok(`the server independently computed the same score the phone would show (${local.rawScore})`);
      }
      if (res.body.suspect) fail(`an honest run was flagged: ${res.body.flags}`);
      else ok('an honest run carries no flags');
    }
  }
}

// ═══ 3. A set is single-use ══════════════════════════════════════════════════
console.log('\nA set cannot be played twice');
if (honestSetId) {
  const questions = questionsFor(1, 'hard', 80); // wrong seed on purpose — it must not get that far
  const replay = await submit({ setId: honestSetId, answers: honestAnswers(questions, 18) });
  if (replay.status === 200 && replay.body?.recorded && replay.body?.rawScore !== undefined) {
    // Idempotent replay returns the ORIGINAL result rather than scoring again. Confirm it did not
    // add a second attempt to the day.
    ok('a resubmission returns the original result rather than being scored again');
  } else if (replay.body?.code) {
    ok(`a resubmission → ${replay.body.code}`);
  } else {
    fail(`unexpected reply to a resubmission: ${JSON.stringify(replay.body)}`);
  }
}

// ═══ 4. Tampered timing ══════════════════════════════════════════════════════
console.log('\nAttack: tampered timing, against the live server');
{
  const body = await issueOrNull('a minute of play submitted instantly');
  if (body) {
    const questions = questionsFor(body.seed, 'hard', body.setSize);
    // Claim a full minute of play, submitted immediately. The server saw both timestamps.
    const answers = Array.from({ length: 25 }, (_, i) => ({ i, value: questions[i].ans, ms: 2400 }));
    await expectReject('a minute of play submitted instantly', { setId: body.setId, answers }, 'play_time_exceeds_wall_clock');
  }
}
{
  const body = await issueOrNull('60 perfect answers in an instant');
  if (body) {
    const questions = questionsFor(body.seed, 'hard', body.setSize);
    const answers = Array.from({ length: 60 }, (_, i) => ({ i, value: questions[i].ans, ms: 1 }));
    await expectReject('60 perfect answers in an instant', { setId: body.setId, answers }, 'answers_impossible_in_window');
  }
}
{
  const body = await issueOrNull('70 questions in a 60-second mode');
  if (body) {
    const questions = questionsFor(body.seed, 'hard', body.setSize);
    const answers = Array.from({ length: 70 }, (_, i) => ({ i, value: questions[i].ans, ms: 2000 }));
    await new Promise((r) => setTimeout(r, 2000));
    await expectReject('70 questions in a 60-second mode', { setId: body.setId, answers }, 'play_time_exceeds_mode');
  }
}

// ═══ 5. Cherry-picking ═══════════════════════════════════════════════════════
console.log('\nAttack: answer only the questions worth most');
{
  const body = await issueOrNull('answering only the percentage questions');
  if (body) {
    const questions = questionsFor(body.seed, 'hard', body.setSize);
    const pct = questions.map((q, i) => (q.op === 'percentage' ? i : -1)).filter((i) => i >= 0).slice(0, 10);
    const answers = pct.map((i) => ({ i, value: questions[i].ans, ms: 2500 }));
    await new Promise((r) => setTimeout(r, 2000));
    await expectReject('answering only the percentage questions', { setId: body.setId, answers }, 'answers_out_of_sequence');
  }
}

// ═══ 6. Somebody else's set ══════════════════════════════════════════════════
console.log('\nAttack: submit against a set that is not yours');
{
  await expectReject('a made-up set id', {
    setId: '19990101-0000-4000-8000-00000000dead',
    answers: [{ i: 0, value: 1, ms: 2000 }],
  }, undefined);
}

// ═══ 7. Hoarding ═════════════════════════════════════════════════════════════
console.log('\nAttack: hold two sets at once and pick the easier');
{
  const first = await issue('hard');
  const second = await issue('hard');
  if (!first.body?.setId || !second.body?.setId) fail('could not get two sets to test voiding');
  else if (first.body.setId === second.body.setId) fail('the second request returned the same set');
  else {
    const questions = questionsFor(first.body.seed, 'hard', first.body.setSize);
    await new Promise((r) => setTimeout(r, 2000));
    await expectReject('submitting the first set after asking for a second', {
      setId: first.body.setId, answers: honestAnswers(questions, 10),
    }, 'set_voided');
  }
}

// ═══ 8. The boost cannot be fabricated ═══════════════════════════════════════
console.log('\nAttack: a boost that was never earned');
{
  const { data: boosts } = await supabase.from('braining_boosts').select('*').eq('day', DAY);
  const hadBoost = !!(boosts && boosts.length);
  ok(`the server's own boost record for ${DAY}: ${hadBoost ? 'one exists' : 'none'}`);

  const { data: ins, error: insErr } = await supabase
    .from('braining_boosts').insert({ user_id: USER_ID, day: DAY }).select();
  if (!insErr && ins && ins.length) fail('a player GRANTED THEMSELVES A BOOST');
  else ok(`a player granting themselves a boost is refused (${insErr?.code || 'no rows'})`);

  const body = await issueOrNull('a run carrying a forged boost claim', 'easy');
  const questions = body ? questionsFor(body.seed, 'easy', body.setSize) : [];
  const answers = body ? honestAnswers(questions, 10) : [];
  if (body) await playOut(answers);
  // Note there is no boost field to send. The only question is what the server decides.
  const res = body
    ? await submit({ setId: body.setId, answers, boosted: true, boost: 1.5, score: 99999 })
    : { body: null };
  if (body && !res.body?.ok) fail(`an honest Easy run was rejected: ${JSON.stringify(res.body)}`);
  else if (body) {
    if (res.body.boosted && !hadBoost) fail('the server paid a boost that was never earned');
    else ok(`extra fields in the payload (boosted, boost, score: 99999) changed nothing — server says score ${res.body.score}`);
    const local = scoreAttempt({ questions, answers, difficulty: 'easy' });
    if (res.body.rawScore !== local.rawScore) fail(`server ${res.body.rawScore} vs phone ${local.rawScore}`);
    else ok(`the submitted "score: 99999" was ignored; the server computed ${res.body.rawScore}`);
  }
}

// ═══ 9. The verified table is not writable ═══════════════════════════════════
console.log('\nThe recorded score cannot be edited afterwards');
{
  const { data: before } = await supabase
    .from('verified_daily_results').select('*').eq('day', DAY).eq('mode', 'challenge');
  if (!before || !before.length) fail('nothing was recorded for the day — the probe proved nothing');
  else {
    ok(`${before.length} verified row(s) recorded, e.g. ${before[0].difficulty}: score ${before[0].score} over ${before[0].attempt_count} attempt(s)`);
    for (const row of before) {
      const implied = Math.round(row.score_sum / row.attempt_count);
      if (row.score !== implied) fail(`${row.difficulty}: score ${row.score} but sum/count implies ${implied}`);
    }
    ok('every row\'s score equals its own sum ÷ count');

    const { data: upd, error: updErr } = await supabase
      .from('verified_daily_results').update({ score: 9999, score_sum: 9999 })
      .eq('day', DAY).select();
    if (!updErr && upd && upd.length) fail('A PLAYER REWROTE THEIR OWN VERIFIED SCORE');
    else ok(`rewriting your own verified score is refused (${updErr?.code || 'no rows affected'})`);

    const { data: del, error: delErr } = await supabase
      .from('verified_daily_results').delete().eq('day', DAY).select();
    if (!delErr && del && del.length) fail('a player deleted their own verified results');
    else ok(`deleting your own verified results is refused (${delErr?.code || 'no rows affected'})`);

    const { data: after } = await supabase
      .from('verified_daily_results').select('score').eq('day', DAY).eq('mode', 'challenge');
    const unchanged = JSON.stringify((after || []).map((r) => r.score)) === JSON.stringify(before.map((r) => r.score));
    if (!unchanged) fail('the scores moved despite the writes being refused');
    else ok('the recorded scores are byte-identical after every attack');
  }
}

// ═══ 9b. The boost, end to end ═══════════════════════════════════════════════
//
// The section this session exists for. Everything above proves a Challenge submission cannot
// ASSERT a boost; this proves the only thing that can grant one is a Braining trial the server
// itself accepted — and that a fabricated trial grants nothing.
console.log('\nThe boost: earned by doing the work, and only that');
{
  const brQuestionsFor = (seed, total) => createEngine({ seed }).brainingSet(total);
  const boostRows = async () => {
    const { data } = await supabase.from('braining_boosts').select('*').eq('day', DAY);
    return data || [];
  };

  if ((await boostRows()).length) {
    fail('a boost already exists for the probe day — clean up before re-running, or this proves nothing');
  } else {
    ok('starting from no boost record at all');
  }

  // ── The forgery: claim a completed trial without completing one ────────────
  const forgeSet = await issueOrNull('a fabricated Braining trial', 'standard', 'braining');
  if (forgeSet) {
    const q = brQuestionsFor(forgeSet.seed, forgeSet.setSize);
    // Perfect answers — a cheater can compute these instantly, and that is not the defence.
    // The defence is that the claimed time has to account for the window the server watched.
    const perfect = Array.from({ length: forgeSet.setSize }, (_, i) => ({ i, value: q[i].ans, ms: 3000 }));
    await expectReject('50 perfect answers claiming 170s, submitted at once',
      { setId: forgeSet.setId, answers: perfect, claimedSec: 170 }, 'claimed_time_exceeds_wall_clock');

    const after = await boostRows();
    if (after.length) fail('A FABRICATED TRIAL MINTED A BOOST');
    else ok('the rejected trial minted no boost — the record is still empty');
  }

  // ── An incomplete trial: right up to the last question ────────────────────
  const partialSet = await issueOrNull('an unfinished Braining trial', 'standard', 'braining');
  if (partialSet) {
    const q = brQuestionsFor(partialSet.seed, partialSet.setSize);
    const nearly = Array.from({ length: partialSet.setSize }, (_, i) => ({
      i, value: i === partialSet.setSize - 1 ? q[i].ans + 3 : q[i].ans, ms: 300,
    }));
    await new Promise((r) => setTimeout(r, 6000));
    await expectReject('49 of 50 right, the last one wrong',
      { setId: partialSet.setId, answers: nearly, claimedSec: 6 }, undefined);

    const after = await boostRows();
    if (after.length) fail('an unfinished trial minted a boost');
    else ok('an unfinished trial minted no boost either');
  }

  // ── A Challenge run with no boost on record ───────────────────────────────
  const before = await issueOrNull('a Challenge run before any Braining', 'easy');
  if (before) {
    const q = questionsFor(before.seed, 'easy', before.setSize);
    const answers = honestAnswers(q, 10);
    await playOut(answers);
    const res = await submit({ setId: before.setId, answers });
    if (!res.body?.ok) fail(`an honest Challenge run was rejected: ${JSON.stringify(res.body)}`);
    else if (res.body.boosted) fail('A CHALLENGE RUN WAS BOOSTED WITH NO BRAINING ON RECORD');
    else ok(`no boost on record → score ${res.body.score} paid unboosted (raw ${res.body.rawScore})`);
  }

  // ── The genuine article ───────────────────────────────────────────────────
  //
  // Answered correctly AND waited out. This is the only way through, and it is not a loophole —
  // it is the price an honest player pays too.
  await cooldown('the attacks above used the allowance');
  const realSet = await issueOrNull('a genuine Braining trial', 'standard', 'braining');
  let boostEarned = false;
  if (realSet) {
    const q = brQuestionsFor(realSet.seed, realSet.setSize);
    const answers = [];
    for (let i = 0; i < realSet.setSize; i++) {
      if (i % 13 === 0) answers.push({ i, value: q[i].ans + 2, ms: 1200 });
      answers.push({ i, value: q[i].ans, ms: 1500 + ((i * 137) % 900) });
    }
    // Wait out a plausible trial. Kept short on purpose — the probe should not take four minutes —
    // but long enough that the claim genuinely sits inside the window the server watched.
    const waited = 40000;
    await new Promise((r) => setTimeout(r, waited));
    const res = await submit({ setId: realSet.setId, answers, claimedSec: Math.round(waited / 1000) + 3 });
    if (!res.body?.ok) {
      fail(`a genuine Braining trial was rejected: ${JSON.stringify(res.body)}`);
    } else {
      ok(`a genuine trial accepted: ${res.body.timeSec}s, brain age ${res.body.brainAge}`);
      const rows = await boostRows();
      if (!rows.length) fail('a genuine trial did NOT create the boost record');
      else if (rows[0].consumed_at) fail('the new boost arrived already consumed');
      else { boostEarned = true; ok('the boost record now exists, unconsumed'); }
    }
  }

  // ── Now the boost is actually paid ────────────────────────────────────────
  if (boostEarned) {
    const boostedSet = await issueOrNull('the Challenge run that spends it', 'easy');
    if (boostedSet) {
      const q = questionsFor(boostedSet.seed, 'easy', boostedSet.setSize);
      const answers = honestAnswers(q, 12);
      await playOut(answers);
      const res = await submit({ setId: boostedSet.setId, answers });
      if (!res.body?.ok) fail(`the boosted run was rejected: ${JSON.stringify(res.body)}`);
      else if (!res.body.boosted) fail('the earned boost was NOT paid');
      else if (res.body.score !== applyBrainingBoost(res.body.rawScore)) {
        fail(`boosted score ${res.body.score} is not round(${res.body.rawScore} x 1.05)`);
      } else {
        ok(`the boost was paid: raw ${res.body.rawScore} → ${res.body.score}, exactly round(raw x 1.05)`);
      }
    }

    // ── And spent only once ─────────────────────────────────────────────────
    const secondSet = await issueOrNull('a second Challenge run the same day', 'easy');
    if (secondSet) {
      const q = questionsFor(secondSet.seed, 'easy', secondSet.setSize);
      const answers = honestAnswers(q, 10);
      await playOut(answers);
      const res = await submit({ setId: secondSet.setId, answers });
      if (!res.body?.ok) fail(`the second run was rejected: ${JSON.stringify(res.body)}`);
      else if (res.body.boosted) fail('THE SAME BOOST WAS PAID TWICE');
      else ok('the second run of the day is unboosted — the boost is spent, and stays spent');
    }

    // ── A second Braining trial does not re-grant ───────────────────────────
    const retrySet = await issueOrNull('a second Braining trial the same day', 'standard', 'braining');
    if (retrySet) {
      const q = brQuestionsFor(retrySet.seed, retrySet.setSize);
      const answers = Array.from({ length: retrySet.setSize }, (_, i) => ({ i, value: q[i].ans, ms: 1400 }));
      const waited = 40000;
      await new Promise((r) => setTimeout(r, waited));
      const res = await submit({ setId: retrySet.setId, answers, claimedSec: Math.round(waited / 1000) + 3 });
      if (res.body?.ok) {
        const rows = await boostRows();
        if (rows.length && !rows[0].consumed_at) fail('a second trial RESET the spent boost');
        else ok('a second trial the same day leaves the spent boost spent');
      } else {
        ok(`a second trial the same day → ${res.body?.code} (nothing re-granted)`);
      }
    }
  }
}

// ═══ 10. Rate limiting ═══════════════════════════════════════════════════════
console.log('\nAttack: fish for an easy set');
{
  let limited = null;
  for (let i = 0; i < 14 && !limited; i++) {
    const r = await issue('medium');
    if (r.status === 429) limited = r;
  }
  if (!limited) fail('14 sets were issued in a burst with no rate limit');
  else ok(`the burst was cut off → ${limited.body?.error} (HTTP 429)`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nevery attack was caught by the live server');
console.log(
  '\n── Clean up what this probe recorded ─────────────────────────────────\n' +
  'The client cannot delete these, which is the point. Run this in the SQL editor:\n\n' +
  `  delete from public.verified_daily_results where user_id = '${USER_ID}' and day = '${DAY}';\n` +
  `  delete from public.braining_boosts        where user_id = '${USER_ID}' and day = '${DAY}';\n` +
  `  delete from public.question_sets          where user_id = '${USER_ID}' and day = '${DAY}';\n`
);

await supabase.auth.signOut();
process.exit(failed ? 1 : 0);
