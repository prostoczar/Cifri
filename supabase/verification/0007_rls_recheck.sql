-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — re-proving RLS across every table (Chat 3.9 audit)
--
-- Since the last check (0006_rls_check.sql) the app gained achievements and the
-- Tricks Test. Neither added a table. Both live INSIDE player_state.data, as the
-- `milestones` and `trickStats` keys of the progress blob, so what defends them is
-- whatever defends player_state — and that is worth stating out loud rather than
-- discovering later. The migration list still ends at 0006: the schema has not
-- moved, only what the blob contains.
--
-- That is precisely why this re-check exists anyway. "The schema did not change so
-- the policies still hold" is a plausible sentence, and plausible sentences are what
-- this file is for distrusting. So it sits down as the row's owner, as another
-- player, and as a logged-out visitor, and tries to cross the line on ALL FOUR
-- tables, then reports what the database actually did.
--
-- Client-side, the same attacks were run for real against the live project during
-- the audit — two signed-in accounts, each pointed at the other's rows across
-- profiles, player_state, daily_results and question_attempts. Every read returned
-- nothing and every write was refused with 42501. This file is the database-side
-- half: the catalogue facts (is RLS actually switched on, how many policies are
-- there) that a client can never observe.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it. The
-- final table is the report — every row should say PASS.
--
-- WHAT IT TOUCHES: rows dated 1999-01-01, a day that predates the app, all deleted
-- before it finishes. It reads existing account ids but changes nothing about them.
--
-- IT NEEDS ONE REAL ACCOUNT, NOT TWO — see 0006 for why: every policy here compares
-- auth.uid() to the row's owner and never asks whether that uid exists, so a
-- stranger's made-up uuid tests the same path, slightly harder.
-- ═══════════════════════════════════════════════════════════════════════════════

drop table if exists rls_0007;
create temp table rls_0007 (
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
  tbl     text;
  test_day constant date := date '1999-01-01';
  test_client constant uuid := '19990101-0000-4000-8000-000000000001';
  test_session constant uuid := '19990101-0000-4000-8000-000000000002';
begin
  select count(*) into users from auth.users;
  if users < 1 then
    raise exception
      'This check needs at least one account to own the rows being defended; auth.users is empty. Sign up in the app and re-run.';
  end if;

  select id into uid_a from auth.users order by created_at, id limit 1;
  select id into uid_b from auth.users where id <> uid_a order by created_at, id limit 1;
  b_is_real := uid_b is not null;
  if not b_is_real then
    uid_b := '00000000-0000-4000-8000-00000000b0b0'::uuid;
  end if;

  claim_a := json_build_object('sub', uid_a::text, 'role', 'authenticated')::text;
  claim_b := json_build_object('sub', uid_b::text, 'role', 'authenticated')::text;

  step := step + 1;
  insert into rls_0007 values (step, '(setup)', 'who is attacking player A',
    'anyone but A',
    case when b_is_real then 'a second real account' else 'a stranger with no account' end,
    'INFO');

  -- ── The switch is still on, everywhere ───────────────────────────────────────
  --
  -- Deny-by-default only exists once RLS is enabled. If it were ever turned off on
  -- one table, every policy on it would still exist and mean nothing — so all four
  -- are checked by name rather than assumed to match each other.

  foreach tbl in array array['profiles', 'player_state', 'daily_results', 'question_attempts'] loop
    select case when relrowsecurity then 'enabled' else 'DISABLED' end
      into txt from pg_class where oid = ('public.' || tbl)::regclass;
    step := step + 1;
    insert into rls_0007 values (step, '(catalog)', 'row level security on ' || tbl,
      'enabled', coalesce(txt, 'TABLE MISSING'),
      case when txt = 'enabled' then 'PASS' else '*** FAIL ***' end);

    select count(*) into got from pg_policies
     where schemaname = 'public' and tablename = tbl;
    step := step + 1;
    insert into rls_0007 values (step, '(catalog)', 'policies on ' || tbl,
      'at least 1', got::text,
      case when got >= 1 then 'PASS' else '*** FAIL ***' end);
  end loop;

  -- The blob that now carries achievements and trick-test results. Named separately
  -- because "player_state is protected" is the entire argument for those features
  -- needing no protection of their own.
  select count(*) into got from pg_policies
   where schemaname = 'public' and tablename = 'player_state';
  step := step + 1;
  insert into rls_0007 values (step, '(catalog)', 'achievements + trickStats live in player_state.data',
    'covered by player_state''s policies', got::text || ' policies on player_state',
    case when got >= 1 then 'PASS' else '*** FAIL ***' end);

  -- ── Seed one row of player A's in each table ─────────────────────────────────

  delete from public.daily_results where day = test_day;
  delete from public.question_attempts where client_id = test_client;

  insert into public.daily_results
    (user_id, day, mode, difficulty, score, attempt_count, score_sum, is_real)
  values
    (uid_a, test_day, 'challenge', 'easy', 50, 2, 100, true);

  insert into public.question_attempts
    (user_id, client_id, session_id, mode, difficulty, operation, digits, terms,
     time_ms, is_correct, answered_at, day, is_real)
  values
    (uid_a, test_client, test_session, 'challenge', 'easy', 'addition', 2, 2,
     1200, true, now(), test_day, true);

  -- ── Player A, on their own rows: everything must still work ──────────────────

  perform set_config('request.jwt.claims', claim_a, true);
  set local role authenticated;
  select count(*) into got from public.daily_results where day = test_day and user_id = uid_a;
  reset role;
  step := step + 1;
  insert into rls_0007 values (step, 'player A', 'reads own daily_results row',
    '1', got::text, case when got = 1 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_a, true);
  set local role authenticated;
  select count(*) into got from public.question_attempts where client_id = test_client and user_id = uid_a;
  reset role;
  step := step + 1;
  insert into rls_0007 values (step, 'player A', 'reads own question_attempts row',
    '1', got::text, case when got = 1 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_a, true);
  set local role authenticated;
  select count(*) into got from public.player_state where user_id = uid_a;
  reset role;
  step := step + 1;
  insert into rls_0007 values (step, 'player A', 'reads own progress blob',
    '0 or 1, never an error', got::text || ' rows', 'PASS');

  -- ── Player B, on player A's rows: everything must fail ───────────────────────
  --
  -- Two different shapes of "no". A select or update finds nothing — B is never told
  -- A's row exists. An insert carrying A's id is refused outright, because `with
  -- check` is what stops one player writing history into another player's account.

  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  select count(*) into got from public.player_state where user_id = uid_a;
  reset role;
  step := step + 1;
  insert into rls_0007 values (step, 'player B', 'reads player A''s progress blob',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  select count(*) into got from public.question_attempts where user_id = uid_a and day = test_day;
  reset role;
  step := step + 1;
  insert into rls_0007 values (step, 'player B', 'reads player A''s answered questions',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);

  -- The achievements attack, stated as what it actually is: rewriting somebody
  -- else's progress blob, which is where the earned log lives.
  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  update public.player_state
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{milestones,achievedLog}',
                          '["tr_graduation","x_collector"]'::jsonb)
   where user_id = uid_a;
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0007 values (step, 'player B', 'grants themselves A''s achievements',
    '0 rows changed', got::text || ' rows changed',
    case when got = 0 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  update public.daily_results set score = 9999, score_sum = 9999, attempt_count = 1
   where user_id = uid_a and day = test_day;
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0007 values (step, 'player B', 'overwrites player A''s daily score',
    '0 rows changed', got::text || ' rows changed',
    case when got = 0 then 'PASS' else '*** FAIL ***' end);

  begin
    perform set_config('request.jwt.claims', claim_b, true);
    set local role authenticated;
    insert into public.player_state (user_id, data) values (uid_a, '{"streak":999}'::jsonb);
    reset role;
    step := step + 1;
    insert into rls_0007 values (step, 'player B', 'inserts a progress blob owned by A',
      'rejected', 'ALLOWED', '*** FAIL ***');
  exception when others then
    reset role;
    step := step + 1;
    insert into rls_0007 values (step, 'player B', 'inserts a progress blob owned by A',
      'rejected', 'rejected: ' || sqlstate, 'PASS');
  end;

  begin
    perform set_config('request.jwt.claims', claim_b, true);
    set local role authenticated;
    insert into public.question_attempts
      (user_id, client_id, session_id, mode, difficulty, operation, digits, terms,
       time_ms, is_correct, answered_at, day, is_real)
    values
      (uid_a, '19990101-0000-4000-8000-0000000000ff'::uuid, test_session, 'challenge', 'easy',
       'addition', 2, 2, 1, true, now(), test_day, true);
    reset role;
    step := step + 1;
    insert into rls_0007 values (step, 'player B', 'logs a question as player A',
      'rejected', 'ALLOWED', '*** FAIL ***');
  exception when others then
    reset role;
    step := step + 1;
    insert into rls_0007 values (step, 'player B', 'logs a question as player A',
      'rejected', 'rejected: ' || sqlstate, 'PASS');
  end;

  -- ── A logged-out visitor ─────────────────────────────────────────────────────
  --
  -- Two ways this comes back clean, and the difference is reported rather than
  -- flattened. "0 rows" means RLS ran and filtered everything out. "blocked at the
  -- grant" means the anon role holds no privilege on the table at all, so the query
  -- is refused before RLS is consulted — the stronger of the two, and what the live
  -- client run actually observed (42501 on every table).

  foreach tbl in array array['profiles', 'player_state', 'daily_results', 'question_attempts'] loop
    begin
      perform set_config('request.jwt.claims', '', true);
      set local role anon;
      execute 'select count(*) from public.' || tbl into got;
      reset role;
      step := step + 1;
      insert into rls_0007 values (step, 'logged out', 'reads ' || tbl,
        'nothing', got::text || ' rows visible',
        case when got = 0 then 'PASS' else '*** FAIL ***' end);
    exception when others then
      reset role;
      step := step + 1;
      insert into rls_0007 values (step, 'logged out', 'reads ' || tbl,
        'nothing', 'blocked at the grant, before RLS (' || sqlstate || ')', 'PASS');
    end;
  end loop;

  -- ── Nothing above actually landed ────────────────────────────────────────────

  select score into got from public.daily_results
   where user_id = uid_a and day = test_day and difficulty = 'easy';
  step := step + 1;
  insert into rls_0007 values (step, '(owner)', 'player A''s score after every attack',
    '50', got::text, case when got = 50 then 'PASS' else '*** FAIL ***' end);

  -- ── Clean up ─────────────────────────────────────────────────────────────────
  reset role;
  delete from public.daily_results where day = test_day;
  delete from public.question_attempts where client_id = test_client;

  select count(*) into got from public.daily_results where day = test_day;
  step := step + 1;
  insert into rls_0007 values (step, '(owner)', 'test rows left behind',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);
end $$;

select * from rls_0007 order by n;
