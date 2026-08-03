-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — proving the server-owned tables are actually server-owned (Chat 4 audit)
--
-- Migration 0007 makes a strong claim, and the whole anti-cheat design collapses if
-- it is not true: THE CLIENT CANNOT WRITE verified_daily_results, AND CANNOT READ
-- question_sets AT ALL.
--
-- Those are two different kinds of claim and both are worth attacking.
--
--   verified_daily_results  A player may read their own row and nothing else. If
--                           they could write it, every score the server computed
--                           could simply be overwritten afterwards, and issuing
--                           questions server-side would have bought nothing.
--
--   question_sets           Holds the ANSWER KEY. A player reading their own row
--                           would be a player reading the answers to a set they
--                           have not played yet — which is the single worst
--                           failure available here, worse than any scoring bug,
--                           because it would be silent and undetectable.
--
--   braining_boosts         Readable, never writable. A player who could insert a
--                           row here would grant themselves a 5% boost a day.
--
-- The previous audits (0006, 0007, 0008) covered the tables that existed then and
-- are not repeated. This file is only about the three tables and four functions
-- that 0007 adds.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it. The
-- final table is the report — every row should say PASS.
--
-- WHAT IT TOUCHES: rows dated 1999-01-01, a day that predates the app, all deleted
-- before it finishes. It writes a question_sets row and a verified_daily_results
-- row as the OWNER of the database (which is what the SQL editor is), purely so
-- there is something real for the attacks below to fail against — and then it
-- becomes a player and tries to read and wreck them.
--
-- IT NEEDS ONE REAL ACCOUNT, NOT TWO — same reasoning as 0006: every policy here
-- compares auth.uid() against the row's owner and never asks whether that uid
-- exists, so a stranger's invented uuid exercises the same path.
-- ═══════════════════════════════════════════════════════════════════════════════

drop table if exists rls_0009;
create temp table rls_0009 (
  n          int,
  acting_as  text,
  check_name text,
  expected   text,
  actual     text,
  verdict    text
);

do $$
declare
  uid_a    uuid;
  uid_b    uuid;
  claim_a  text;
  claim_b  text;
  users    int;
  got      int;
  txt      text;
  step     int := 0;
  b_is_real boolean;
  tbl      text;
  fn_name  text;
  set_id   uuid := '19990101-0000-4000-8000-00000000a001';
  test_day constant date := date '1999-01-01';
  score_before int;
  key_seen jsonb;
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
  insert into rls_0009 values (step, '(setup)', 'who is attacking player A',
    'anyone but A',
    case when b_is_real then 'a second real account' else 'a stranger with no account' end,
    'INFO');

  -- ── The switch is on ─────────────────────────────────────────────────────────
  --
  -- Deny-by-default only exists once RLS is enabled. A table with policies and RLS
  -- switched off is wide open while looking, in the dashboard, entirely protected.

  foreach tbl in array array['question_sets', 'verified_daily_results', 'braining_boosts'] loop
    select case when relrowsecurity then 'enabled' else 'DISABLED' end
      into txt from pg_class where oid = ('public.' || tbl)::regclass;
    step := step + 1;
    insert into rls_0009 values (step, '(catalog)', 'row level security on ' || tbl,
      'enabled', coalesce(txt, 'TABLE MISSING'),
      case when txt = 'enabled' then 'PASS' else '*** FAIL ***' end);
  end loop;

  -- ── The absences, checked as absences ────────────────────────────────────────
  --
  -- Most of migration 0007's protection is things NOT being there: no write policy,
  -- no grant. An absence is easy to lose by accident — one permissive policy added
  -- in the dashboard while debugging and never removed — and nothing would break
  -- loudly if it were. So the counts are asserted rather than eyeballed.

  select count(*) into got from pg_policies
   where schemaname = 'public' and tablename = 'question_sets';
  step := step + 1;
  insert into rls_0009 values (step, '(catalog)', 'policies on question_sets',
    '0 — it holds the answer key, nobody may read it',
    got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);

  foreach tbl in array array['verified_daily_results', 'braining_boosts'] loop
    select count(*) into got from pg_policies
     where schemaname = 'public' and tablename = tbl and cmd <> 'SELECT';
    step := step + 1;
    insert into rls_0009 values (step, '(catalog)', 'non-SELECT policies on ' || tbl,
      '0 — read only', got::text,
      case when got = 0 then 'PASS' else '*** FAIL ***' end);
  end loop;

  -- Grants are the other half, and the stricter one: a grant that was never made
  -- stops the statement before RLS is even consulted.
  select count(*) into got from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'question_sets'
     and grantee in ('anon', 'authenticated');
  step := step + 1;
  insert into rls_0009 values (step, '(catalog)', 'grants on question_sets to anon/authenticated',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);

  foreach tbl in array array['verified_daily_results', 'braining_boosts'] loop
    select count(*) into got from information_schema.role_table_grants
     where table_schema = 'public' and table_name = tbl
       and grantee in ('anon', 'authenticated')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
    step := step + 1;
    insert into rls_0009 values (step, '(catalog)', 'write grants on ' || tbl || ' to anon/authenticated',
      '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);
  end loop;

  -- ── Something real to attack ─────────────────────────────────────────────────
  --
  -- Seeded as the database owner, which is what the SQL editor is. These stand in
  -- for what the Edge Function writes when somebody plays.

  insert into public.question_sets (id, user_id, mode, difficulty, day, seed, set_size, answer_key)
  values (set_id, uid_a, 'challenge', 'easy', test_day, 123456, 3,
          '[{"a":42,"o":"addition"},{"a":7,"o":"division"},{"a":99,"o":"percentage"}]'::jsonb)
  on conflict (id) do nothing;

  insert into public.verified_daily_results
    (user_id, day, mode, difficulty, score, attempt_count, score_sum)
  values (uid_a, test_day, 'challenge', 'easy', 50, 1, 50)
  on conflict (user_id, day, mode, difficulty) do update set score = 50, attempt_count = 1, score_sum = 50;

  insert into public.braining_boosts (user_id, day)
  values (uid_a, test_day) on conflict (user_id, day) do nothing;

  select score into score_before from public.verified_daily_results
   where user_id = uid_a and day = test_day and mode = 'challenge' and difficulty = 'easy';

  -- ═══ Attacks as player B ═══════════════════════════════════════════════════

  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;

  -- The one that matters most: can anyone read the answers?
  begin
    select answer_key into key_seen from public.question_sets where id = set_id;
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'reads the answer key of A''s set',
      'nothing', coalesce(key_seen::text, 'no rows'),
      case when key_seen is null then 'PASS' else '*** FAIL ***' end);
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'reads the answer key of A''s set',
      'nothing', 'blocked at the grant, before RLS (' || sqlstate || ')', 'PASS');
  end;

  begin
    insert into public.question_sets (user_id, mode, difficulty, day, seed, set_size, answer_key)
    values (uid_b, 'challenge', 'easy', test_day, 1, 1, '[{"a":1,"o":"addition"}]'::jsonb);
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'forges a question set of their own',
      'refused', 'INSERTED', '*** FAIL ***');
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'forges a question set of their own',
      'refused', 'refused (' || sqlstate || ')', 'PASS');
  end;

  -- Rewriting somebody else's verified score.
  begin
    update public.verified_daily_results set score = 9999, score_sum = 9999
     where user_id = uid_a and day = test_day;
    get diagnostics got = row_count;
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'rewrites A''s verified score to 9999',
      '0 rows', got::text || ' rows',
      case when got = 0 then 'PASS' else '*** FAIL ***' end);
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'rewrites A''s verified score to 9999',
      '0 rows', 'refused (' || sqlstate || ')', 'PASS');
  end;

  begin
    delete from public.verified_daily_results where user_id = uid_a;
    get diagnostics got = row_count;
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'deletes A''s verified results',
      '0 rows', got::text || ' rows',
      case when got = 0 then 'PASS' else '*** FAIL ***' end);
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'deletes A''s verified results',
      '0 rows', 'refused (' || sqlstate || ')', 'PASS');
  end;

  begin
    select count(*) into got from public.verified_daily_results where user_id = uid_a;
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'reads A''s verified results',
      '0 rows', got::text || ' rows',
      case when got = 0 then 'PASS' else '*** FAIL ***' end);
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player B', 'reads A''s verified results',
      '0 rows', 'refused (' || sqlstate || ')', 'PASS');
  end;

  -- ═══ Attacks as player A — against their OWN rows ══════════════════════════
  --
  -- The interesting half. Cross-account protection is the familiar problem and the
  -- earlier audits cover the pattern; what is new here is that a player must not be
  -- able to wreck their own row either, because their own row is the one a
  -- leaderboard would rank them on.

  perform set_config('request.jwt.claims', claim_a, true);

  begin
    select answer_key into key_seen from public.question_sets where user_id = uid_a and id = set_id;
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'reads the answer key of their OWN set',
      'nothing — this is the attack that matters', coalesce(key_seen::text, 'no rows'),
      case when key_seen is null then 'PASS' else '*** FAIL ***' end);
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'reads the answer key of their OWN set',
      'nothing — this is the attack that matters',
      'blocked at the grant, before RLS (' || sqlstate || ')', 'PASS');
  end;

  begin
    select count(*) into got from public.verified_daily_results where user_id = uid_a;
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'reads their own verified results',
      'at least 1 — reading is allowed', got::text || ' rows',
      case when got >= 1 then 'PASS' else '*** FAIL ***' end);
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'reads their own verified results',
      'at least 1 — reading is allowed', 'refused (' || sqlstate || ')', '*** FAIL ***');
  end;

  begin
    update public.verified_daily_results set score = 9999, score_sum = 9999
     where user_id = uid_a and day = test_day;
    get diagnostics got = row_count;
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'inflates their OWN verified score',
      '0 rows', got::text || ' rows',
      case when got = 0 then 'PASS' else '*** FAIL ***' end);
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'inflates their OWN verified score',
      '0 rows', 'refused (' || sqlstate || ')', 'PASS');
  end;

  begin
    insert into public.verified_daily_results
      (user_id, day, mode, difficulty, score, attempt_count, score_sum)
    values (uid_a, test_day, 'challenge', 'hard', 5000, 1, 5000);
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'invents a verified 5000 on Hard',
      'refused', 'INSERTED', '*** FAIL ***');
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'invents a verified 5000 on Hard',
      'refused', 'refused (' || sqlstate || ')', 'PASS');
  end;

  -- Granting yourself a boost every day would be worth 5% forever.
  begin
    insert into public.braining_boosts (user_id, day) values (uid_a, test_day + 1);
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'grants themselves tomorrow''s boost',
      'refused', 'INSERTED', '*** FAIL ***');
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'grants themselves tomorrow''s boost',
      'refused', 'refused (' || sqlstate || ')', 'PASS');
  end;

  -- Un-spending a boost already used, so it can be spent again.
  begin
    update public.braining_boosts set consumed_at = null where user_id = uid_a;
    get diagnostics got = row_count;
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'un-spends a boost they already used',
      '0 rows', got::text || ' rows',
      case when got = 0 then 'PASS' else '*** FAIL ***' end);
  exception when others then
    step := step + 1;
    insert into rls_0009 values (step, 'player A', 'un-spends a boost they already used',
      '0 rows', 'refused (' || sqlstate || ')', 'PASS');
  end;

  -- The recording functions are security definer, so they run as their owner and
  -- bypass every policy above. That makes their EXECUTE grant the only thing
  -- standing between a player and writing whatever they like into the table this
  -- file exists to protect.
  foreach fn_name in array array['record_verified_challenge', 'record_verified_braining', 'prune_question_sets'] loop
    begin
      execute case fn_name
        when 'record_verified_challenge' then
          format('select public.record_verified_challenge(%L::uuid, %L::date, %L, 9999, false)', uid_a, test_day, 'easy')
        when 'record_verified_braining' then
          format('select public.record_verified_braining(%L::uuid, %L::date, 1, 20, false)', uid_a, test_day)
        else 'select public.prune_question_sets()'
      end;
      step := step + 1;
      insert into rls_0009 values (step, 'player A', 'calls ' || fn_name || '() directly',
        'refused', 'IT RAN', '*** FAIL ***');
    exception when others then
      step := step + 1;
      insert into rls_0009 values (step, 'player A', 'calls ' || fn_name || '() directly',
        'refused', 'refused (' || sqlstate || ')', 'PASS');
    end;
  end loop;

  -- ═══ Logged out ════════════════════════════════════════════════════════════

  perform set_config('request.jwt.claims', null, true);
  set local role anon;

  foreach tbl in array array['question_sets', 'verified_daily_results', 'braining_boosts'] loop
    begin
      execute format('select count(*) from public.%I', tbl) into got;
      step := step + 1;
      insert into rls_0009 values (step, 'logged out', 'reads ' || tbl,
        '0 rows', got::text || ' rows',
        case when got = 0 then 'PASS' else '*** FAIL ***' end);
    exception when others then
      step := step + 1;
      insert into rls_0009 values (step, 'logged out', 'reads ' || tbl,
        '0 rows', 'blocked at the grant, before RLS (' || sqlstate || ')', 'PASS');
    end;
  end loop;

  reset role;

  -- ═══ Nothing above actually landed ═════════════════════════════════════════

  select score into got from public.verified_daily_results
   where user_id = uid_a and day = test_day and mode = 'challenge' and difficulty = 'easy';
  step := step + 1;
  insert into rls_0009 values (step, '(owner)', 'A''s verified score after every attack',
    score_before::text, got::text,
    case when got = score_before then 'PASS' else '*** FAIL ***' end);

  select count(*) into got from public.verified_daily_results
   where user_id = uid_a and day = test_day;
  step := step + 1;
  insert into rls_0009 values (step, '(owner)', 'verified rows for that day',
    '1 — no planted second', got::text,
    case when got = 1 then 'PASS' else '*** FAIL ***' end);

  select count(*) into got from public.braining_boosts where user_id = uid_a and day > test_day;
  step := step + 1;
  insert into rls_0009 values (step, '(owner)', 'boosts granted by the attacks',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);

  -- ═══ The database's own rules, checked while we are here ═══════════════════
  --
  -- Two constraints from migration 0007 that no amount of RLS would give us, and
  -- which the Edge Function relies on rather than re-checking in code.

  -- Only one unsubmitted set per player per mode. This is the anti-hoarding rule,
  -- and it is enforced by a partial unique index rather than by the function.
  begin
    insert into public.question_sets (user_id, mode, difficulty, day, seed, set_size, answer_key)
    values (uid_a, 'challenge', 'easy', test_day, 999, 1, '[{"a":1,"o":"addition"}]'::jsonb);
    step := step + 1;
    insert into rls_0009 values (step, '(owner)', 'a SECOND live challenge set for the same player',
      'refused by question_sets_one_live', 'INSERTED', '*** FAIL ***');
    delete from public.question_sets where user_id = uid_a and seed = 999;
  exception when unique_violation then
    step := step + 1;
    insert into rls_0009 values (step, '(owner)', 'a SECOND live challenge set for the same player',
      'refused by question_sets_one_live', 'refused (unique_violation)', 'PASS');
  end;

  -- A Braining row must not carry an average. This is the guard rail that stops a
  -- future change quietly giving Braining the Challenge scoring model.
  begin
    insert into public.verified_daily_results
      (user_id, day, mode, difficulty, time_sec, attempt_count, score_sum)
    values (uid_a, test_day, 'braining', 'standard', 200, 3, 600);
    step := step + 1;
    insert into rls_0009 values (step, '(owner)', 'a Braining row carrying an average',
      'refused by the mode-shape constraint', 'INSERTED', '*** FAIL ***');
  exception when check_violation then
    step := step + 1;
    insert into rls_0009 values (step, '(owner)', 'a Braining row carrying an average',
      'refused by the mode-shape constraint', 'refused (check_violation)', 'PASS');
  end;

  -- ═══ Clean up ══════════════════════════════════════════════════════════════

  delete from public.verified_daily_results where day = test_day;
  delete from public.braining_boosts where day = test_day;
  delete from public.question_sets where day = test_day;

  select count(*) into got from public.question_sets where day = test_day;
  step := step + 1;
  insert into rls_0009 values (step, '(owner)', 'test rows left behind',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);
end $$;

select * from rls_0009 order by n;
