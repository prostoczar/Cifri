// Marks a submitted attempt against the set the server issued, and records its own figure.
//
// This is the function the whole session exists to write. Every number it stores is one it
// computed; nothing the client sent is trusted except the two things only the client can know —
// what the player typed, and how long each answer took — and both of those are bounded by
// timestamps the client never holds either end of.
//
// THE ORDER OF OPERATIONS MATTERS, AND IT IS THIS:
//
//   1. Claim the set.      One atomic UPDATE. A set can be submitted exactly once, and it is
//                          consumed BEFORE anything is validated — otherwise a rejected
//                          submission could simply be retried with better-looking numbers until
//                          one got through, which would turn every check below into a hint.
//   2. Validate.           Structure and timing, against the server's own issued_at.
//   3. Mark and score.     Against the stored answer key, with the shared scoring module.
//   4. Consume the boost.  One atomic UPDATE against the server's own record of it.
//   5. Record.             Into verified_daily_results, which no client can write.
//
// Steps 2, 3 and 4's rules all live in ../_shared/*.js as pure functions with no database and no
// network in them, so scripts/check-anticheat.mjs can attack them directly. What is left here is
// plumbing.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { validateChallengeSubmission, validateBrainingSubmission } from '../_shared/validate.js';
import { scoreAttempt, applyBrainingBoost, BRAINING_TOLERANCE } from '../_shared/scoring.js';
import { brAge } from '../_shared/braining.js';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: 'unauthorized' }, 401);

  let setId = '', answers: Array<{ i: number; value: number; ms: number }> = [], claimedSec: number | null = null;
  try {
    const body = await req.json();
    setId = typeof body.setId === 'string' ? body.setId : '';
    answers = Array.isArray(body.answers) ? body.answers : [];
    claimedSec = Number.isFinite(body.claimedSec) ? body.claimedSec : null;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!setId) return json({ error: 'bad_request' }, 400);

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. Claim the set ────────────────────────────────────────────────────────
  //
  // A single conditional UPDATE, which is what makes this safe against two requests arriving at
  // once: both run the same statement, the database serialises them, and exactly one finds
  // submitted_at still null. A read-then-write would let both through.
  //
  // `submitted_at` is set from the database's own now(), not from anything in the request.
  const submittedAtIso = new Date().toISOString();
  const { data: claimedRows } = await admin
    .from('question_sets')
    .update({ submitted_at: submittedAtIso })
    .eq('id', setId)
    .eq('user_id', user.id)
    .is('submitted_at', null)
    .is('voided_at', null)
    .select('id, mode, difficulty, day, set_size, answer_key, issued_at');

  const set = claimedRows && claimedRows[0];

  if (!set) {
    // Nothing claimed. Either this set was already submitted, or it was voided by a newer one,
    // or it was never this player's. Look it up to tell those apart — but only for THIS player,
    // so the reply can never confirm that somebody else's set id exists.
    const { data: existing } = await admin
      .from('question_sets')
      .select('result, submitted_at, voided_at')
      .eq('id', setId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existing) return json({ error: 'set_not_found' }, 404);
    // A retry of a submission that already landed. Answer it with what was decided the first
    // time rather than refusing it — the reply to the original request may simply have been lost,
    // and the player did nothing wrong. See the note on question_sets.result in migration 0007.
    if (existing.result) return json(existing.result, existing.result.ok === false ? 422 : 200);
    if (existing.voided_at) return json({ ok: false, code: 'set_voided' }, 422);
    return json({ ok: false, code: 'set_already_submitted' }, 422);
  }

  const issuedAtMs = Date.parse(set.issued_at);
  const submittedAtMs = Date.parse(submittedAtIso);
  const key = set.answer_key as Array<{ a: number; o: string }>;

  // Records the verdict on the set, so a retry gets the same answer. Failures to write it are
  // swallowed: the result has already been recorded where it counts, and losing the receipt is
  // not a reason to fail a request that succeeded.
  const remember = async (payload: Record<string, unknown>) => {
    await admin.from('question_sets').update({ result: payload }).eq('id', set.id);
    return payload;
  };

  // ── 2. Validate ─────────────────────────────────────────────────────────────
  const verdict = set.mode === 'braining'
    ? validateBrainingSubmission({
        answers, setSize: set.set_size, claimedSec,
        issuedAt: issuedAtMs, submittedAt: submittedAtMs,
      })
    : validateChallengeSubmission({
        answers, setSize: set.set_size,
        issuedAt: issuedAtMs, submittedAt: submittedAtMs,
      });

  if (!verdict.ok) {
    return json(await remember({ ok: false, code: verdict.code, recorded: false }), 422);
  }

  // ── 3, 4, 5 ─────────────────────────────────────────────────────────────────
  if (set.mode === 'braining') {
    // Braining's rule is that every question must end correct — a wrong answer is corrected
    // rather than counted against you. So the marking that matters is whether the LAST attempt
    // at each question was right. A submission whose last word on a question is wrong did not
    // finish it, whatever the client claims about having reached the end.
    const lastByIndex = new Map<number, { value: number; ms: number }>();
    for (const a of answers) lastByIndex.set(a.i, a);
    let unresolved = 0;
    for (let i = 0; i < set.set_size; i++) {
      const a = lastByIndex.get(i);
      if (!a || !Number.isFinite(a.value) || Math.abs(a.value - key[i].a) >= BRAINING_TOLERANCE) unresolved++;
    }
    if (unresolved > 0) {
      return json(await remember({ ok: false, code: 'braining_unresolved_questions', recorded: false }), 422);
    }

    const sec = Math.round(claimedSec as number);
    const age = brAge(sec);

    const { data: row, error: recErr } = await admin.rpc('record_verified_braining', {
      p_user: user.id, p_day: set.day,
      p_time_sec: sec, p_brain_age: age,
      p_suspect: verdict.suspect,
    });
    if (recErr) {
      console.error('[submit-attempt] braining record failed:', recErr.message);
      return json({ ok: false, code: 'record_failed', recorded: false }, 500);
    }

    // The day's counting trial grants the Challenge boost. `do nothing` on conflict is what
    // makes it once a day rather than once a run: a second trial the same day finds the row
    // already there and grants nothing, exactly as the reducer's `isFirst` gate does on the
    // device. Whether the row already existed is not even worth reading back — either way, after
    // this statement the player has exactly one boost for today.
    await admin.from('braining_boosts')
      .upsert({ user_id: user.id, day: set.day }, { onConflict: 'user_id,day', ignoreDuplicates: true });

    return json(await remember({
      ok: true, recorded: true, mode: 'braining',
      timeSec: sec, brainAge: age,
      suspect: verdict.suspect, flags: verdict.flags,
      day: row?.day ?? set.day,
    }), 200);
  }

  // ── Challenge ───────────────────────────────────────────────────────────────
  const questions = key.map((k) => ({ ans: k.a, op: k.o }));
  const scored = scoreAttempt({ questions, answers, difficulty: set.difficulty });

  // A run that scored nothing is not recorded, and cannot spend a boost. This mirrors the
  // reducer exactly — `if (!diff || score <= 0)` returns before any session is stored — and it
  // has to, because the server's average and the player's average are supposed to be the same
  // number. Recording a zero here would drag their day's average below what their own screen
  // shows them.
  if (scored.rawScore <= 0) {
    return json(await remember({
      ok: true, recorded: false, mode: 'challenge',
      rawScore: 0, score: 0, boosted: false,
      correct: scored.correct, wrong: scored.wrong,
      suspect: verdict.suspect, flags: verdict.flags,
    }), 200);
  }

  // ── 4. The boost ────────────────────────────────────────────────────────────
  //
  // Not "did the client say it had a boost" — the client is not asked. This statement succeeds
  // only if the server's own record says a boost was granted today AND has not been spent, and
  // spending it is the same statement, so two attempts submitted at the same instant cannot both
  // be paid. There is no window between checking and consuming, because there is no checking.
  const { data: boostRows } = await admin
    .from('braining_boosts')
    .update({ consumed_at: submittedAtIso, consumed_set_id: set.id })
    .eq('user_id', user.id)
    .eq('day', set.day)
    .is('consumed_at', null)
    .select('day');

  const boosted = !!(boostRows && boostRows.length);
  const finalScore = boosted ? applyBrainingBoost(scored.rawScore) : scored.rawScore;

  // ── 5. Record ───────────────────────────────────────────────────────────────
  const { data: row, error: recErr } = await admin.rpc('record_verified_challenge', {
    p_user: user.id, p_day: set.day, p_difficulty: set.difficulty,
    p_score: finalScore, p_suspect: verdict.suspect,
  });
  if (recErr) {
    console.error('[submit-attempt] challenge record failed:', recErr.message);
    return json({ ok: false, code: 'record_failed', recorded: false }, 500);
  }

  return json(await remember({
    ok: true, recorded: true, mode: 'challenge',
    // Both figures, because they mean different things and both are read. `rawScore` is what the
    // run earned and is what every score-based achievement is wired against; `score` is what it
    // counted for. Returning only the second would put the achievements back in the position
    // this session exists to get them out of.
    rawScore: scored.rawScore,
    score: finalScore,
    boosted,
    correct: scored.correct,
    wrong: scored.wrong,
    breakdown: scored.breakdown,
    suspect: verdict.suspect,
    flags: verdict.flags,
    // The day as the server now has it, so the app can reconcile its own average against the
    // one that will actually be ranked.
    dayAverage: row?.score ?? null,
    dayAttempts: row?.attempt_count ?? null,
  }), 200);
});
