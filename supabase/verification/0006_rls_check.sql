-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — proving RLS still holds on the reworked daily_results (Chat 3.5)
--
-- Migration 0006 added two columns to daily_results and rewrote its row-shape
-- constraint. The policies were not edited, and in theory that means they still
-- apply unchanged — policies are written about a row's user_id, not its columns.
--
-- "In theory" is exactly the sort of reasoning this file exists to distrust. Rather
-- than assume the boundary survived the change, this script sits down as the row's
-- owner, as another player, and as a logged-out visitor, and *tries* to cross it,
-- then reports what the database actually did with each attempt.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it. The
-- final table is the report — every row should say PASS.
--
-- WHAT IT TOUCHES: it writes a handful of rows dated 1999-01-01, a day that
-- predates the app and can never collide with real data, and deletes every one of
-- them before it finishes. It reads existing account ids to test with but changes
-- nothing about those accounts.
--
-- IT NEEDS ONE REAL ACCOUNT, NOT TWO. Player A has to be real, because A owns the
-- row under attack and daily_results.user_id has a foreign key to auth.users.
-- Player B does not: every policy here compares auth.uid() to the row's user_id and
-- never asks whether that uid exists. So if there is a second real account this uses
-- it, and otherwise it impersonates a stranger with a made-up uuid — which tests the
-- same code path, and tests it slightly harder, since it proves that even a
-- well-formed token for somebody who is not in the database at all comes away with
-- nothing.
-- ═══════════════════════════════════════════════════════════════════════════════

drop table if exists rls_0006;
create temp table rls_0006 (
  n          int,
  acting_as  text,
  check_name text,
  expected   text,
  actual     text,
  verdict    text
);

do $$
declare
  uid_a   uuid;
  uid_b   uuid;
  claim_a text;
  claim_b text;
  users   int;
  got     int;
  txt     text;
  step    int := 0;
  b_is_real boolean;

  -- A day that cannot collide with anything real.
  test_day constant date := date '1999-01-01';
begin
  -- ── Setup ────────────────────────────────────────────────────────────────────
  --
  -- Player A must be a real account: A owns the row every attack below is aimed at,
  -- and daily_results.user_id has a foreign key to auth.users, so a made-up owner
  -- could not be inserted in the first place.

  select count(*) into users from auth.users;
  if users < 1 then
    raise exception
      'This check needs at least one account to own the row being defended; auth.users is empty. Sign up in the app and re-run.';
  end if;

  select id into uid_a from auth.users order by created_at, id limit 1;

  -- Player B is whoever else exists — or, if nobody else does, a stranger who does
  -- not exist at all. Both are equally valid here: no policy on this table asks
  -- whether auth.uid() corresponds to a real account, only whether it matches the
  -- row's owner. The attacker is defined by their token, not by their existence.
  select id into uid_b from auth.users where id <> uid_a order by created_at, id limit 1;
  b_is_real := uid_b is not null;
  if not b_is_real then
    uid_b := '00000000-0000-4000-8000-00000000b0b0'::uuid;
  end if;

  -- What Supabase puts in the request when someone is signed in. auth.uid() reads
  -- the 'sub' out of this; setting it is how we impersonate a signed-in player.
  claim_a := json_build_object('sub', uid_a::text, 'role', 'authenticated')::text;
  claim_b := json_build_object('sub', uid_b::text, 'role', 'authenticated')::text;

  delete from public.daily_results where day = test_day;

  -- One row belonging to player A, in the new shape: 2 plays summing to 100, so the
  -- day's score is 50.
  insert into public.daily_results
    (user_id, day, mode, difficulty, score, attempt_count, score_sum, is_real)
  values
    (uid_a, test_day, 'challenge', 'easy', 50, 2, 100, true);


  -- Recorded in the report itself, so the output says out loud what it assumed
  -- rather than leaving a reader to wonder who "player B" was.
  step := step + 1;
  insert into rls_0006 values (step, '(setup)', 'who is attacking player A',
    'anyone but A',
    case when b_is_real then 'a second real account' else 'a stranger with no account' end,
    'INFO');


  -- ── The switch is still on ───────────────────────────────────────────────────
  --
  -- RLS is deny-by-default only once it is enabled. If this were ever turned off,
  -- every policy below would still exist and mean nothing, so it is checked first.

  select case when relrowsecurity then 'enabled' else 'DISABLED' end
    into txt from pg_class where oid = 'public.daily_results'::regclass;
  step := step + 1;
  insert into rls_0006 values (step, '(catalog)', 'row level security on daily_results',
    'enabled', txt, case when txt = 'enabled' then 'PASS' else '*** FAIL ***' end);

  select count(*) into got from pg_policies
   where schemaname = 'public' and tablename = 'daily_results';
  step := step + 1;
  insert into rls_0006 values (step, '(catalog)', 'policy count (read/insert/update own)',
    '3', got::text, case when got = 3 then 'PASS' else '*** FAIL ***' end);


  -- ── Player A, on their own rows: everything must still work ──────────────────
  --
  -- A security boundary that also blocks the legitimate owner is not secure, it is
  -- broken. These three prove the app can still do its job through the new columns.

  perform set_config('request.jwt.claims', claim_a, true);
  set local role authenticated;
  select count(*) into got from public.daily_results
   where day = test_day and user_id = uid_a;
  reset role;
  step := step + 1;
  insert into rls_0006 values (step, 'player A', 'reads own row',
    '1', got::text, case when got = 1 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_a, true);
  set local role authenticated;
  update public.daily_results
     set attempt_count = 3, score_sum = 150, score = 50
   where user_id = uid_a and day = test_day;
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0006 values (step, 'player A', 'updates own row through the new columns',
    '1', got::text, case when got = 1 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_a, true);
  set local role authenticated;
  insert into public.daily_results
    (user_id, day, mode, difficulty, score, attempt_count, score_sum, is_real)
  values
    (uid_a, test_day, 'challenge', 'medium', 40, 5, 200, true);
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0006 values (step, 'player A', 'inserts own row in the new shape',
    '1', got::text, case when got = 1 then 'PASS' else '*** FAIL ***' end);


  -- ── Player B, on player A's rows: everything must fail ───────────────────────
  --
  -- Note the difference between the two shapes of "no". A select or update simply
  -- finds no rows — B is not told that A's row exists. An insert carrying A's id is
  -- refused outright, because `with check` is what stops one player writing history
  -- into another player's account.

  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  select count(*) into got from public.daily_results where day = test_day;
  reset role;
  step := step + 1;
  insert into rls_0006 values (step, 'player B', 'reads player A''s rows',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  update public.daily_results set score = 9999, score_sum = 9999, attempt_count = 1
   where user_id = uid_a and day = test_day;
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0006 values (step, 'player B', 'overwrites player A''s average',
    '0 rows changed', got::text || ' rows changed',
    case when got = 0 then 'PASS' else '*** FAIL ***' end);

  begin
    perform set_config('request.jwt.claims', claim_b, true);
    set local role authenticated;
    insert into public.daily_results
      (user_id, day, mode, difficulty, score, attempt_count, score_sum, is_real)
    values
      (uid_a, test_day, 'challenge', 'hard', 99, 1, 99, true);
    reset role;
    step := step + 1;
    insert into rls_0006 values (step, 'player B', 'inserts a row owned by player A',
      'rejected', 'ALLOWED', '*** FAIL ***');
  exception when others then
    reset role;
    step := step + 1;
    insert into rls_0006 values (step, 'player B', 'inserts a row owned by player A',
      'rejected', 'rejected: ' || sqlstate, 'PASS');
  end;

  begin
    perform set_config('request.jwt.claims', claim_b, true);
    set local role authenticated;
    delete from public.daily_results where user_id = uid_a and day = test_day;
    reset role;
    step := step + 1;
    insert into rls_0006 values (step, 'player B', 'deletes player A''s row',
      'rejected', 'ALLOWED', '*** FAIL ***');
  exception when others then
    reset role;
    step := step + 1;
    insert into rls_0006 values (step, 'player B', 'deletes player A''s row',
      'rejected', 'rejected: ' || sqlstate, 'PASS');
  end;


  -- ── A logged-out visitor ─────────────────────────────────────────────────────
  --
  -- There are two different ways this can come back clean, and the difference is
  -- worth reporting rather than flattening:
  --
  --   "0 rows"        — RLS let the query run and filtered everything out, because
  --                     no token means no auth.uid() and every policy comparison is
  --                     false.
  --   "blocked"       — the anon role holds no grant on this table at all, so the
  --                     query is refused before RLS is even consulted.
  --
  -- The second is the stronger of the two: a logged-out visitor cannot ask the
  -- question, never mind get an answer. Migration 0003 granted this table to
  -- `authenticated` only, so that is the expected result — but both are a pass, and
  -- the report says which one actually happened instead of assuming.

  begin
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    select count(*) into got from public.daily_results;
    reset role;
    step := step + 1;
    insert into rls_0006 values (step, 'logged out', 'reads the whole table',
      'nothing', got::text || ' rows visible',
      case when got = 0 then 'PASS' else '*** FAIL ***' end);
  exception when others then
    reset role;
    step := step + 1;
    insert into rls_0006 values (step, 'logged out', 'reads the whole table',
      'nothing', 'blocked at the grant, before RLS (' || sqlstate || ')', 'PASS');
  end;

  begin
    perform set_config('request.jwt.claims', '', true);
    set local role anon;
    insert into public.daily_results
      (user_id, day, mode, difficulty, score, attempt_count, score_sum, is_real)
    values
      (uid_a, test_day, 'challenge', 'hard', 77, 1, 77, true);
    reset role;
    step := step + 1;
    insert into rls_0006 values (step, 'logged out', 'inserts a row',
      'rejected', 'ALLOWED', '*** FAIL ***');
  exception when others then
    reset role;
    step := step + 1;
    insert into rls_0006 values (step, 'logged out', 'inserts a row',
      'rejected', 'rejected: ' || sqlstate, 'PASS');
  end;


  -- ── Nothing above actually landed ────────────────────────────────────────────
  --
  -- Read back as the owner, bypassing RLS entirely, to confirm that all those
  -- refusals were real refusals and not merely invisible successes.

  select score into got from public.daily_results
   where user_id = uid_a and day = test_day and difficulty = 'easy';
  step := step + 1;
  insert into rls_0006 values (step, '(owner)', 'player A''s score after every attack',
    '50', got::text, case when got = 50 then 'PASS' else '*** FAIL ***' end);


  -- ── The new row shape is enforced, not just intended ─────────────────────────

  begin
    insert into public.daily_results
      (user_id, day, mode, difficulty, score, is_real)
    values (uid_a, test_day, 'challenge', 'hard', 42, true);
    step := step + 1;
    insert into rls_0006 values (step, '(owner)', 'Challenge row with no count/sum',
      'rejected', 'ALLOWED', '*** FAIL ***');
  exception when others then
    step := step + 1;
    insert into rls_0006 values (step, '(owner)', 'Challenge row with no count/sum',
      'rejected', 'rejected: ' || sqlstate, 'PASS');
  end;

  begin
    insert into public.daily_results
      (user_id, day, mode, difficulty, time_sec, attempt_count, score_sum, is_real)
    values (uid_a, test_day, 'braining', 'standard', 200, 2, 100, true);
    step := step + 1;
    insert into rls_0006 values (step, '(owner)', 'Braining row carrying an average',
      'rejected', 'ALLOWED', '*** FAIL ***');
  exception when others then
    step := step + 1;
    insert into rls_0006 values (step, '(owner)', 'Braining row carrying an average',
      'rejected', 'rejected: ' || sqlstate, 'PASS');
  end;

  -- The one that matters most for "Braining is untouched": a perfectly ordinary
  -- Braining row, exactly the shape the app has always written, is still accepted.
  begin
    insert into public.daily_results
      (user_id, day, mode, difficulty, time_sec, brain_age, is_real)
    values (uid_a, test_day, 'braining', 'standard', 200, 24, true);
    get diagnostics got = row_count;
    step := step + 1;
    insert into rls_0006 values (step, '(owner)', 'ordinary Braining row still accepted',
      '1', got::text, case when got = 1 then 'PASS' else '*** FAIL ***' end);
  exception when others then
    step := step + 1;
    insert into rls_0006 values (step, '(owner)', 'ordinary Braining row still accepted',
      '1', 'REJECTED: ' || sqlerrm, '*** FAIL ***');
  end;


  -- ── The backfill reached every real row ──────────────────────────────────────
  --
  -- Migration 0006 filled in count and sum for the Challenge days that already
  -- existed. If any real row were missed it could never be updated again, because
  -- the new constraint would reject it. This counts the ones that got left behind.

  select count(*) into got from public.daily_results
   where mode = 'challenge' and (attempt_count is null or score_sum is null);
  step := step + 1;
  insert into rls_0006 values (step, '(owner)', 'real Challenge rows missing count/sum',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);


  -- ── Clean up ─────────────────────────────────────────────────────────────────
  reset role;
  delete from public.daily_results where day = test_day;

  select count(*) into got from public.daily_results where day = test_day;
  step := step + 1;
  insert into rls_0006 values (step, '(owner)', 'test rows left behind',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);
end $$;

select * from rls_0006 order by n;
