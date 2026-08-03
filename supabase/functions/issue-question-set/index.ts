// Issues a set of questions and keeps the answers.
//
// This is half of the anti-cheat design; submit-attempt is the other half. Between them the
// server knows what it asked, when it asked, and what the answers were — none of which it knew
// before, and all of which a score has to be checkable against.
//
// WHAT COMES BACK IS A SEED, NOT QUESTIONS.
//
// The seed is fed to the same generator on the phone, which draws exactly the questions this
// function recorded the answers to. That keeps number formatting on the device where it belongs
// (a Russian phone must still render "12,5"), keeps the response small enough that the prefetch
// disappears into the 3-2-1 countdown, and means the client has the answers immediately — which
// it needs, because it draws the "+7 pts" and the "Answer: 42" itself.
//
// Sending the answers is not the hole it first looks like. Every question here is arithmetic the
// player can see; anything able to cheat with the answer key could just as easily compute it.
// What the key does NOT let a client do is decide what it was asked or what that was worth,
// because this function wrote both down before the client saw anything.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Everything that makes a decision lives in ../_shared/*.js as pure functions, and this file
// only does auth, database work, and plumbing. That split is what lets scripts/check-anticheat.mjs
// drive the real rules adversarially without a server, a container, or a network.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';
import { generateChallengeSet, generateBrainingSet, CHALLENGE_SET_SIZE } from '../_shared/generator.js';
import { randomSeed } from '../_shared/rng.js';
import { checkIssueRate, isPlausibleDay, RATE_WINDOW_MS } from '../_shared/ratelimit.js';

// A Braining trial is always fifty questions. Practice runs are twenty and never come here —
// they record nothing, so there is nothing about them to verify, and generating them locally is
// what keeps the practice button instant.
const BRAINING_SET_SIZE = 50;

const DIFFICULTIES = ['easy', 'medium', 'hard'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Who is asking. The token is verified by Supabase itself rather than being parsed here — the
  // user id comes back from getUser(), never from anything in the request body, so a client
  // cannot ask for a set on somebody else's behalf.
  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) return json({ error: 'unauthorized' }, 401);

  let mode = '', difficulty = '', day = '';
  try {
    const body = await req.json();
    mode = typeof body.mode === 'string' ? body.mode : '';
    difficulty = typeof body.difficulty === 'string' ? body.difficulty : '';
    day = typeof body.day === 'string' ? body.day : '';
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (mode !== 'challenge' && mode !== 'braining') return json({ error: 'bad_mode' }, 400);
  if (mode === 'challenge' && DIFFICULTIES.indexOf(difficulty) === -1) return json({ error: 'bad_difficulty' }, 400);
  if (mode === 'braining') difficulty = 'standard';
  if (!isPlausibleDay(day, Date.now())) return json({ error: 'bad_day' }, 400);

  // service_role from here on: question_sets has no RLS policies at all, because it holds the
  // answers and there is no version of "the player may read their own row" that is safe for a
  // table like that.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────
  //
  // Counted rather than tracked: two cheap head-only queries against an index, rather than a
  // counter table that would need its own concurrency story.
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const [recent, today] = await Promise.all([
    admin.from('question_sets').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('issued_at', since),
    admin.from('question_sets').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('mode', mode).eq('day', day),
  ]);
  const limited = checkIssueRate({
    mode,
    recentCount: recent.count ?? 0,
    todayCount: today.count ?? 0,
  });
  if (limited) {
    const headers: Record<string, string> = { ...corsHeaders, 'Content-Type': 'application/json' };
    if (limited.retryAfterSec) headers['Retry-After'] = String(limited.retryAfterSec);
    return new Response(JSON.stringify({ error: limited.code }), { status: 429, headers });
  }

  // ── Void whatever set is still live ─────────────────────────────────────────
  //
  // At most one unsubmitted set per player per mode, enforced by a partial unique index. Asking
  // for a new one abandons the old one, which is what stops sets being stockpiled and solved at
  // leisure. Done before the insert so the index has room for the new row.
  await admin.from('question_sets')
    .update({ voided_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('mode', mode)
    .is('submitted_at', null).is('voided_at', null);

  // ── Generate ────────────────────────────────────────────────────────────────
  const seed = randomSeed();
  const setSize = mode === 'braining' ? BRAINING_SET_SIZE : CHALLENGE_SET_SIZE;
  const questions = mode === 'braining'
    ? generateBrainingSet(seed, BRAINING_SET_SIZE)
    : generateChallengeSet(seed, difficulty);

  // The key is stored as well as the seed, so that marking never depends on regenerating
  // anything — see the note in migration 0007. Compact keys because this is written and read on
  // every single game played.
  const answerKey = questions.map((q: { ans: number; op: string }) => ({ a: q.ans, o: q.op }));

  const { data: inserted, error: insertError } = await admin
    .from('question_sets')
    .insert({
      user_id: user.id,
      mode, difficulty, day,
      seed, set_size: setSize,
      answer_key: answerKey,
    })
    .select('id, issued_at')
    .single();

  if (insertError || !inserted) {
    console.error('[issue-question-set] insert failed:', insertError?.code, insertError?.message);
    // The five-character SQLSTATE goes back to the caller; the message does not.
    //
    // That split is deliberate and was learned the hard way. The first version returned a bare
    // "issue_failed", and when every request started failing there was nothing to go on — the
    // cause turned out to be a missing service_role grant, which the code 42501 would have named
    // outright. A SQLSTATE is a fixed five-character class of error and carries no data about
    // anybody; a message can quote row contents and constraint bodies, so it stays in the log.
    //
    // The client does nothing with either. Its response to any failure here is the same: play a
    // locally generated set and accept that this run will not be verified.
    return json({ error: 'issue_failed', code: insertError?.code ?? null }, 500);
  }

  return json({
    setId: inserted.id,
    seed,
    setSize,
    mode,
    difficulty,
    // The server's own clock at issue. The client does not need it to play, and does not get to
    // influence it — it is returned so the app can tell how much of the set's fifteen-minute life
    // it has used, and fall back to a fresh one rather than submitting into a rejection.
    issuedAt: inserted.issued_at,
  }, 200);
});
