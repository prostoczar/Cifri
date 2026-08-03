-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — re-proving RLS after the achievements went live (Chat 3.10 audit)
--
-- Since 0007 the remaining twenty-nine achievements were wired, which added six
-- running counters (qTotal, pctCorrect, pracOpsSeen, pracLastDay, trickLastDay,
-- everBrokeStreak) and put a `correct` count on every Challenge session. Not one
-- of them is a column. They are all more keys on player_state.data — the counters
-- inside `milestones`, the session counts inside `db` — so what defends them is
-- whatever defends player_state, exactly as in 0007. The migration list still ends
-- at 0006: the schema has not moved.
--
-- So why re-check at all, when the answer is the same as last time?
--
-- Because the VALUE of the blob changed even though its protection did not. Until
-- this session most of the catalogue could not be earned, so a forged earned log
-- was a lie about nothing. Now all fifty-nine are reachable and each one unlocks a
-- picker reward, and the counters are the only record that certain work was ever
-- done — questions answered before they existed cannot be recovered, so a
-- tampered qTotal cannot be recomputed and caught. That makes this blob worth
-- attacking in a way it was not before, and "the policies did not change" is a
-- claim about the defence rather than a measurement of it.
--
-- This file therefore repeats 0007's catalogue checks and then goes after the new
-- contents specifically: another player inflating someone's question counter to
-- buy five cumulative achievements at once, writing correct-answer counts onto
-- their Challenge sessions to fake Triple Crown, flipping the streak-break flag,
-- and handing themselves the whole fifty-nine-key log.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and run it. The
-- final table is the report — every row should say PASS.
--
-- WHAT IT TOUCHES: rows dated 1999-01-01, a day that predates the app, all deleted
-- before it finishes. It READS player_state and never writes to it as its owner —
-- the blob under test is a real player's real progress, and a verification script
-- has no business editing it. Every write attempted against it here is made as
-- somebody else, and is expected to fail.
--
-- IT NEEDS ONE REAL ACCOUNT, NOT TWO — see 0006 for why: every policy here compares
-- auth.uid() to the row's owner and never asks whether that uid exists, so a
-- stranger's made-up uuid tests the same path, slightly harder.
-- ═══════════════════════════════════════════════════════════════════════════════

drop table if exists rls_0008;
create temp table rls_0008 (
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
  col     text;
  blob_before jsonb;
  blob_after  jsonb;
  has_state   boolean;
  test_day constant date := date '1999-01-01';
  test_client constant uuid := '19990101-0000-4000-8000-000000000003';
  test_session constant uuid := '19990101-0000-4000-8000-000000000004';
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
  insert into rls_0008 values (step, '(setup)', 'who is attacking player A',
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
    insert into rls_0008 values (step, '(catalog)', 'row level security on ' || tbl,
      'enabled', coalesce(txt, 'TABLE MISSING'),
      case when txt = 'enabled' then 'PASS' else '*** FAIL ***' end);

    select count(*) into got from pg_policies
     where schemaname = 'public' and tablename = tbl;
    step := step + 1;
    insert into rls_0008 values (step, '(catalog)', 'policies on ' || tbl,
      'at least 1', got::text,
      case when got >= 1 then 'PASS' else '*** FAIL ***' end);
  end loop;

  -- ── The schema really did not move ───────────────────────────────────────────
  --
  -- The whole argument for this file being short is that the session added no
  -- columns and no tables. That is checkable rather than assertable, so it is
  -- checked: player_state must still be exactly (user_id, data, updated_at). A new
  -- column here would mean some piece of progress had escaped the blob and was
  -- sitting somewhere whose protection nobody had thought about.

  select count(*) into got from information_schema.columns
   where table_schema = 'public' and table_name = 'player_state';
  step := step + 1;
  insert into rls_0008 values (step, '(catalog)', 'player_state column count',
    '3 (user_id, data, updated_at)', got::text,
    case when got = 3 then 'PASS' else '*** FAIL ***' end);

  -- And none of the six new counters became a column of its own.
  foreach col in array array['qtotal', 'pctcorrect', 'pracopsseen', 'praclastday', 'tricklastday', 'everbrokestreak'] loop
    select count(*) into got from information_schema.columns
     where table_schema = 'public' and lower(column_name) = col;
    step := step + 1;
    insert into rls_0008 values (step, '(catalog)', 'no public column named ' || col,
      '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);
  end loop;

  -- The blob that carries all of it. Named separately because "player_state is
  -- protected" is the entire argument for the new counters needing no protection
  -- of their own.
  select count(*) into got from pg_policies
   where schemaname = 'public' and tablename = 'player_state';
  step := step + 1;
  insert into rls_0008 values (step, '(catalog)', 'achievement counters live in player_state.data',
    'covered by player_state''s policies', got::text || ' policies on player_state',
    case when got >= 1 then 'PASS' else '*** FAIL ***' end);

  -- ── Photograph player A's blob before anything is tried against it ───────────
  --
  -- Read only. This is the evidence that every attack below changed nothing, and
  -- it is a stronger statement than each attack's own row count: it says the blob
  -- came out the far end byte-identical, not merely that no single update reported
  -- success.

  select data into blob_before from public.player_state where user_id = uid_a;
  has_state := blob_before is not null;
  -- The earned count is read through a type guard rather than straight: this file
  -- exists to survive whatever the blob actually contains, and jsonb_array_length
  -- raises on anything that is not an array — which would abort the entire check
  -- run over a cosmetic detail of somebody's saved data.
  step := step + 1;
  insert into rls_0008 values (step, '(setup)', 'player A has a progress blob to defend',
    'yes, ideally',
    case when not has_state then 'no player_state row — the blob attacks below prove less'
         when jsonb_typeof(blob_before->'milestones'->'achievedLog') = 'array'
           then 'yes, ' || jsonb_array_length(blob_before->'milestones'->'achievedLog')::text
                        || ' achievements earned'
         else 'yes, with no earned log yet' end,
    case when has_state then 'PASS' else 'INFO' end);

  -- ── Seed one row of player A's in each of the other tables ───────────────────

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
    (uid_a, test_client, test_session, 'challenge', 'easy', 'percentage', 2, 2,
     1200, true, now(), test_day, true);

  -- ── Player A, on their own rows: everything must still work ──────────────────

  perform set_config('request.jwt.claims', claim_a, true);
  set local role authenticated;
  select count(*) into got from public.daily_results where day = test_day and user_id = uid_a;
  reset role;
  step := step + 1;
  insert into rls_0008 values (step, 'player A', 'reads own daily_results row',
    '1', got::text, case when got = 1 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_a, true);
  set local role authenticated;
  select count(*) into got from public.question_attempts where client_id = test_client and user_id = uid_a;
  reset role;
  step := step + 1;
  insert into rls_0008 values (step, 'player A', 'reads own question_attempts row',
    '1', got::text, case when got = 1 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_a, true);
  set local role authenticated;
  select count(*) into got from public.player_state where user_id = uid_a;
  reset role;
  step := step + 1;
  insert into rls_0008 values (step, 'player A', 'reads own progress blob',
    '0 or 1, never an error', got::text || ' rows', 'PASS');

  -- The counters have to survive the round trip through jsonb as well as be
  -- defended. A number silently coerced or a list flattened would be a bug this
  -- file is well placed to notice and nothing else is.
  if has_state then
    perform set_config('request.jwt.claims', claim_a, true);
    set local role authenticated;
    -- coalesced per side, not across the pair: without it a blob holding a good
    -- qTotal and a missing pracOpsSeen would concatenate to SQL NULL and read as
    -- "not played yet", which is the one answer that would hide a real fault.
    select coalesce(jsonb_typeof(data->'milestones'->'qTotal'), 'absent') || '/' ||
           coalesce(jsonb_typeof(data->'milestones'->'pracOpsSeen'), 'absent')
      into txt from public.player_state where user_id = uid_a;
    reset role;
    step := step + 1;
    insert into rls_0008 values (step, 'player A', 'counters keep their types in the blob',
      'number/array, or absent/absent on a save from before they existed',
      coalesce(txt, 'absent/absent'),
      case when coalesce(txt, 'absent/absent') in ('number/array', 'absent/absent')
           then 'PASS' else '*** FAIL ***' end);
  end if;

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
  insert into rls_0008 values (step, 'player B', 'reads player A''s progress blob',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  select count(*) into got from public.question_attempts where user_id = uid_a and day = test_day;
  reset role;
  step := step + 1;
  insert into rls_0008 values (step, 'player B', 'reads player A''s answered questions',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);

  -- ── The four attacks this session's work made worth trying ───────────────────

  -- 1. The whole catalogue at once. Every key in the earned log unlocks a picker
  --    reward, so this is the theft with the largest payload.
  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  update public.player_state
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{milestones,achievedLog}',
                          '["br_first","ch_first","x_collector","tr_graduation","streak_365"]'::jsonb)
   where user_id = uid_a;
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0008 values (step, 'player B', 'grants themselves A''s achievements',
    '0 rows changed', got::text || ' rows changed',
    case when got = 0 then 'PASS' else '*** FAIL ***' end);

  -- 2. The question counter. Setting it to 5000 buys all five cumulative tiers on
  --    the next session, and because questions answered before the counter existed
  --    cannot be recovered, no recomputation could ever catch it.
  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  update public.player_state
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{milestones,qTotal}', '5000'::jsonb)
   where user_id = uid_a;
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0008 values (step, 'player B', 'inflates A''s question counter to 5,000',
    '0 rows changed', got::text || ' rows changed',
    case when got = 0 then 'PASS' else '*** FAIL ***' end);

  -- 3. The correct-answer counts now stored on each Challenge session, which are
  --    what Challenger and Triple Crown read. Faking them is faking a day's play.
  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  update public.player_state
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{db,hard,sessions}',
                          '[{"date":"1999-01-01","score":500,"correct":99,"real":true}]'::jsonb)
   where user_id = uid_a;
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0008 values (step, 'player B', 'writes fake correct-answer counts onto A''s sessions',
    '0 rows changed', got::text || ' rows changed',
    case when got = 0 then 'PASS' else '*** FAIL ***' end);

  -- 4. The streak-break flag, the one durable trace a lost streak leaves. Setting
  --    it hands New Record to a player who never lost anything.
  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  update public.player_state
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{milestones,everBrokeStreak}', 'true'::jsonb)
   where user_id = uid_a;
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0008 values (step, 'player B', 'flips A''s streak-break flag',
    '0 rows changed', got::text || ' rows changed',
    case when got = 0 then 'PASS' else '*** FAIL ***' end);

  perform set_config('request.jwt.claims', claim_b, true);
  set local role authenticated;
  update public.daily_results set score = 9999, score_sum = 9999, attempt_count = 1
   where user_id = uid_a and day = test_day;
  get diagnostics got = row_count;
  reset role;
  step := step + 1;
  insert into rls_0008 values (step, 'player B', 'overwrites player A''s daily score',
    '0 rows changed', got::text || ' rows changed',
    case when got = 0 then 'PASS' else '*** FAIL ***' end);

  begin
    perform set_config('request.jwt.claims', claim_b, true);
    set local role authenticated;
    insert into public.player_state (user_id, data)
    values (uid_a, '{"milestones":{"qTotal":5000,"achievedLog":["x_collector"]}}'::jsonb);
    reset role;
    step := step + 1;
    insert into rls_0008 values (step, 'player B', 'inserts a progress blob owned by A',
      'rejected', 'ALLOWED', '*** FAIL ***');
  exception when others then
    reset role;
    step := step + 1;
    insert into rls_0008 values (step, 'player B', 'inserts a progress blob owned by A',
      'rejected', 'rejected: ' || sqlstate, 'PASS');
  end;

  -- Percentage Pro counts correct percentage answers, so forged attempt rows are
  -- the shape a server-side recount would be fooled by. Chat 4 will do that
  -- recounting; this is the check that the rows it will trust cannot be planted.
  begin
    perform set_config('request.jwt.claims', claim_b, true);
    set local role authenticated;
    insert into public.question_attempts
      (user_id, client_id, session_id, mode, difficulty, operation, digits, terms,
       time_ms, is_correct, answered_at, day, is_real)
    values
      (uid_a, '19990101-0000-4000-8000-0000000000fe'::uuid, test_session, 'challenge', 'easy',
       'percentage', 2, 2, 1, true, now(), test_day, true);
    reset role;
    step := step + 1;
    insert into rls_0008 values (step, 'player B', 'plants a correct answer in A''s history',
      'rejected', 'ALLOWED', '*** FAIL ***');
  exception when others then
    reset role;
    step := step + 1;
    insert into rls_0008 values (step, 'player B', 'plants a correct answer in A''s history',
      'rejected', 'rejected: ' || sqlstate, 'PASS');
  end;

  -- ── A logged-out visitor ─────────────────────────────────────────────────────
  --
  -- Two ways this comes back clean, and the difference is reported rather than
  -- flattened. "0 rows" means RLS ran and filtered everything out. "blocked at the
  -- grant" means the anon role holds no privilege on the table at all, so the query
  -- is refused before RLS is consulted — the stronger of the two.

  foreach tbl in array array['profiles', 'player_state', 'daily_results', 'question_attempts'] loop
    begin
      perform set_config('request.jwt.claims', '', true);
      set local role anon;
      execute 'select count(*) from public.' || tbl into got;
      reset role;
      step := step + 1;
      insert into rls_0008 values (step, 'logged out', 'reads ' || tbl,
        'nothing', got::text || ' rows visible',
        case when got = 0 then 'PASS' else '*** FAIL ***' end);
    exception when others then
      reset role;
      step := step + 1;
      insert into rls_0008 values (step, 'logged out', 'reads ' || tbl,
        'nothing', 'blocked at the grant, before RLS (' || sqlstate || ')', 'PASS');
    end;
  end loop;

  -- ── Nothing above actually landed ────────────────────────────────────────────

  select data into blob_after from public.player_state where user_id = uid_a;
  step := step + 1;
  insert into rls_0008 values (step, '(owner)', 'player A''s blob after every attack',
    'byte-identical to before',
    case when blob_before is not distinct from blob_after then 'unchanged' else 'MODIFIED' end,
    case when blob_before is not distinct from blob_after then 'PASS' else '*** FAIL ***' end);

  select score into got from public.daily_results
   where user_id = uid_a and day = test_day and difficulty = 'easy';
  step := step + 1;
  insert into rls_0008 values (step, '(owner)', 'player A''s score after every attack',
    '50', got::text, case when got = 50 then 'PASS' else '*** FAIL ***' end);

  select count(*) into got from public.question_attempts
   where user_id = uid_a and day = test_day;
  step := step + 1;
  insert into rls_0008 values (step, '(owner)', 'answers in A''s history for that day',
    '1 — the one this file seeded, no planted second', got::text,
    case when got = 1 then 'PASS' else '*** FAIL ***' end);

  -- ── Clean up ─────────────────────────────────────────────────────────────────
  reset role;
  delete from public.daily_results where day = test_day;
  delete from public.question_attempts where client_id = test_client;
  delete from public.question_attempts where day = test_day and session_id = test_session;

  select count(*) into got from public.daily_results where day = test_day;
  step := step + 1;
  insert into rls_0008 values (step, '(owner)', 'test rows left behind',
    '0', got::text, case when got = 0 then 'PASS' else '*** FAIL ***' end);
end $$;

select * from rls_0008 order by n;
