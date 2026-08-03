-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — the server becomes the authority on what was asked and what it scored
-- (Chat 4)
--
-- WHAT CHANGED, IN ONE SENTENCE: until now a score was whatever the device said it
-- was; from here the server issues the questions, re-marks the answers against its
-- own copy, and stores a figure the client never touched.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE ONE IDEA THIS FILE IS BUILT AROUND
--
-- `daily_results` is writable by the player it belongs to, and has to be: it is the
-- mirror of their own device state, it has to work offline, and it is what draws
-- their own charts. That makes it useless as a competitive record — a modified
-- client can write whatever it likes into its own row, and no amount of server-side
-- computation helps if the server's answer lands somewhere the client can overwrite.
--
-- So the trust boundary is split rather than moved:
--
--   daily_results           what this player's device believes. Client-writable.
--                           UNCHANGED by this migration. Never ranked.
--
--   verified_daily_results  what the server proved. Server-writable ONLY — the
--                           `authenticated` role has select and nothing else, by
--                           policy AND by grant. This is what a leaderboard reads.
--
-- A player who never goes online still plays, still keeps their history, still earns
-- every achievement. They simply have no row in the second table, because nothing
-- about their play was ever witnessed. That is the honest position, and it is what
-- lets the offline-first rule survive intact.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. question_sets — what the server asked ───────────────────────────────────
--
-- One row per set of questions issued to one player. This is the record that makes
-- verification possible at all: without it the server would be marking a submission
-- against questions it could only guess at.
--
-- BOTH the seed and the answer key are stored, which looks redundant and is not.
-- The seed is what the client is sent, and is what lets the phone draw exactly the
-- questions the server recorded (see _shared/rng.js for why a seed rather than the
-- questions themselves). The key is stored SEPARATELY so that marking never depends
-- on regenerating anything: if the generator is ever changed, a set issued minutes
-- before the deploy is still marked against the questions that were actually asked,
-- rather than against whatever the new code would produce from the same seed. A
-- rejected run would be bad; a run silently marked against different questions would
-- be much worse.

create table if not exists public.question_sets (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,

  mode        text        not null check (mode in ('challenge', 'braining')),
  -- 'standard' for Braining, which has no tiers — same convention as daily_results.
  difficulty  text        not null check (difficulty in ('easy', 'medium', 'hard', 'standard')),

  -- The player's local calendar day, sent by the client for the same reason
  -- question_attempts.day is: the app's day boundary is local midnight, not UTC's.
  -- It is used only for bookkeeping and daily caps, never to decide a score.
  day         date        not null,

  -- What the client is told. A 32-bit unsigned value, so bigint rather than integer.
  seed        bigint      not null,
  set_size    smallint    not null check (set_size between 1 and 200),

  -- The answer key: [{"a": 42, "o": "addition"}, ...], one entry per question, in
  -- the order they are asked. Compact on purpose — this is the only part of a
  -- question the server needs in order to mark it.
  answer_key  jsonb       not null,

  -- Both set by the database, never by the client. These two timestamps ARE the
  -- timing check: the window between them is a fact about the server's own clock,
  -- and no amount of tampering on the device can widen or narrow it.
  issued_at   timestamptz not null default now(),
  submitted_at timestamptz,

  -- Set when a newer set supersedes this one. See the partial unique index below.
  voided_at   timestamptz,

  -- What the server decided about this set when it was submitted — the score it
  -- computed, or the reason it refused. Stored so a resubmission is idempotent.
  --
  -- That case is not hypothetical. A phone on a weak connection submits, the server
  -- records, and the reply is lost on the way back; the app retries. Without this the
  -- retry would meet an already-submitted set and be refused, and a player who did
  -- nothing wrong would lose the verification for a run they genuinely played. With
  -- it, the second request is answered with the same result as the first — the same
  -- reasoning that put a client_id on question_attempts in migration 0005.
  result      jsonb
);

-- Rate limiting reads this: how many sets has this player been issued recently.
create index if not exists question_sets_user_issued
  on public.question_sets (user_id, issued_at desc);

-- AT MOST ONE LIVE SET PER PLAYER PER MODE.
--
-- This is the defence against hoarding. Without it the attack is easy and needs no
-- skill: request fifty sets, solve them at leisure with a calculator, then submit
-- fifty perfect runs with plausible-looking times. With it, asking for a new set
-- destroys the one before it, so there is never more than one unsolved set in
-- existence — and the fifteen-minute expiry in _shared/validate.js means even that
-- one cannot be kept.
--
-- Expressed as a partial unique index rather than as application logic, so it holds
-- even if two requests race: the second insert fails at the database rather than
-- being prevented by a check that both requests passed before either wrote.
create unique index if not exists question_sets_one_live
  on public.question_sets (user_id, mode)
  where submitted_at is null and voided_at is null;


-- ── 2. verified_daily_results — what the server proved ─────────────────────────
--
-- The same shape as daily_results, deliberately, so that a leaderboard query written
-- against one reads the other unchanged. Every number in it was computed by an Edge
-- Function from a submission it marked itself.
--
-- `attempt_count` and `score_sum` carry the running average exactly as daily_results
-- does, and for the same reason: a player who plays once and a player who plays fifty
-- times occupy one row of one size. The difference is who does the adding up. Here it
-- is the server, incrementing its own sum by its own figure, so the average cannot be
-- moved by asserting a different total.

create table if not exists public.verified_daily_results (
  user_id       uuid        not null references auth.users(id) on delete cascade,
  day           date        not null,
  mode          text        not null check (mode in ('challenge', 'braining')),
  difficulty    text        not null check (difficulty in ('easy', 'medium', 'hard', 'standard')),

  score         integer     check (score >= 0),
  attempt_count integer     check (attempt_count is null or attempt_count >= 1),
  score_sum     integer     check (score_sum is null or score_sum >= 0),
  time_sec      integer     check (time_sec > 0),
  brain_age     integer     check (brain_age > 0),

  -- How many of the attempts behind this row tripped a plausibility flag. Zero for
  -- almost everybody. Stored as a count rather than a boolean so that one odd run
  -- among forty honest ones reads as what it is, rather than condemning the day.
  --
  -- Nothing acts on it yet, and that is intentional — deciding what a leaderboard
  -- does about a flagged day is a policy question for the session that builds one.
  -- Recording it now means the data exists to make that decision from.
  suspect_count integer     not null default 0 check (suspect_count >= 0),

  updated_at    timestamptz not null default now(),

  primary key (user_id, day, mode, difficulty),

  -- The same mode-shape rule migration 0006 settled on: a row is a Challenge row or
  -- a Braining row and never a meaningless mix, and only Challenge carries an average.
  constraint verified_daily_results_mode_shape check (
    (mode = 'challenge'
      and difficulty in ('easy', 'medium', 'hard')
      and score         is not null
      and attempt_count is not null
      and score_sum     is not null)
    or
    (mode = 'braining'
      and difficulty = 'standard'
      and time_sec      is not null
      and attempt_count is null
      and score_sum     is null)
  )
);

drop trigger if exists verified_daily_results_touch_updated_at on public.verified_daily_results;
create trigger verified_daily_results_touch_updated_at
  before update on public.verified_daily_results
  for each row execute function public.touch_updated_at();

-- The ranking indexes, mirroring the ones on daily_results. Partial on
-- `suspect_count = 0` as well as being per-mode, so the ordinary leaderboard read
-- never has to filter flagged rows out — they are simply not in the index.
create index if not exists verified_challenge_rank
  on public.verified_daily_results (difficulty, day, score desc)
  where mode = 'challenge' and suspect_count = 0;

create index if not exists verified_braining_rank
  on public.verified_daily_results (day, time_sec asc)
  where mode = 'braining' and suspect_count = 0;


-- ── 3. braining_boosts — the server's own record of the boost ──────────────────
--
-- Completing Braining grants one 5% boost, spent by the next Challenge attempt that
-- day. Until now that lived entirely in `brBoostDay` on the device, which means a
-- modified client could claim one whenever it liked.
--
-- One row per player per day, created only by the Edge Function that records the
-- day's counting Braining trial. Spending it is a single statement:
--
--   update braining_boosts set consumed_at = now(), consumed_set_id = $1
--    where user_id = $2 and day = $3 and consumed_at is null
--   returning *
--
-- A row coming back means the boost existed AND was unspent AND is now spent. That
-- is the whole rule in one atomic step, which also settles the race a client-side
-- flag cannot: two Challenge runs submitted at the same instant, and exactly one of
-- them is paid.
--
-- Ordering comes for free. The row cannot exist before the Braining trial that
-- created it, so a boost can never be applied backwards to a run already finished.

create table if not exists public.braining_boosts (
  user_id         uuid        not null references auth.users(id) on delete cascade,
  day             date        not null,
  granted_at      timestamptz not null default now(),
  consumed_at     timestamptz,
  consumed_set_id uuid        references public.question_sets(id) on delete set null,
  primary key (user_id, day)
);


-- ── 4. Row Level Security ──────────────────────────────────────────────────────
--
-- RLS is deny-by-default: once enabled, nothing is readable or writable until a
-- policy permits it. What is interesting about this migration is mostly the policies
-- that are ABSENT.
--
-- question_sets gets NO POLICIES AT ALL. Not a read policy, not a write policy. The
-- answer key is in that table, so a player being able to read their own row would
-- mean a player being able to read the answers to a set they have not yet played —
-- which is the one thing the whole design is trying to prevent. The Edge Function
-- reaches it as service_role, which bypasses RLS; nobody else reaches it at all.
--
-- verified_daily_results gets a read policy and nothing else. A player may see what
-- the server recorded about them. They may not write it, and there is no policy
-- under which they could.
--
-- braining_boosts likewise: readable so the app can reconcile what it thinks it has
-- against what the server says, writable by nobody but the function.

alter table public.question_sets           enable row level security;
alter table public.verified_daily_results  enable row level security;
alter table public.braining_boosts         enable row level security;

-- Dropped first so the file stays re-runnable, and so that a policy added by hand in
-- the dashboard at some point cannot survive a re-run of this migration.
drop policy if exists "read own question sets"    on public.question_sets;
drop policy if exists "read own verified daily"   on public.verified_daily_results;
drop policy if exists "insert own verified daily" on public.verified_daily_results;
drop policy if exists "update own verified daily" on public.verified_daily_results;
drop policy if exists "read own boosts"           on public.braining_boosts;
drop policy if exists "insert own boosts"         on public.braining_boosts;
drop policy if exists "update own boosts"         on public.braining_boosts;

create policy "read own verified daily" on public.verified_daily_results
  for select using (auth.uid() = user_id);

create policy "read own boosts" on public.braining_boosts
  for select using (auth.uid() = user_id);


-- ── 5. Grants ──────────────────────────────────────────────────────────────────
--
-- Grants say which operations a role may attempt; RLS then decides which rows. Both
-- must pass, so saying no in both places is the stricter statement — and for these
-- three tables it is the right one.
--
-- The revokes are not belt-and-braces. Postgres grants nothing to these roles by
-- default and this project's API config does not auto-expose new tables, so in a
-- clean database they change nothing. They are here for the database this actually
-- runs against, where a permissive grant could have been added by hand at some point;
-- re-running this file then takes it away again rather than leaving it in place.

revoke all on public.question_sets          from anon, authenticated;
revoke all on public.verified_daily_results from anon, authenticated;
revoke all on public.braining_boosts        from anon, authenticated;

-- Read-only, and only via the policies above, which restrict it to your own rows.
grant select on public.verified_daily_results to authenticated;
grant select on public.braining_boosts        to authenticated;

-- question_sets deliberately gets nothing. It holds the answers.


-- ── 6. Recording a verified result ─────────────────────────────────────────────
--
-- The running average has to be updated by ADDING to it, and "read it, add, write it
-- back" is the classic way to lose an attempt: two submissions read 3, both write 4,
-- and a game disappears. So the increment happens inside the database, in a single
-- statement, where the row is locked for the duration whatever else is happening.
--
-- These are also the only place the average is ever computed on the server, which is
-- what keeps `score`, `score_sum` and `attempt_count` from ever telling three stories.

create or replace function public.record_verified_challenge(
  p_user       uuid,
  p_day        date,
  p_difficulty text,
  p_score      integer,
  p_suspect    boolean
)
returns public.verified_daily_results
language plpgsql
security definer
set search_path = public
as $$
declare
  row_out public.verified_daily_results;
begin
  insert into public.verified_daily_results
    (user_id, day, mode, difficulty, score, attempt_count, score_sum, suspect_count)
  values
    (p_user, p_day, 'challenge', p_difficulty, p_score, 1, p_score, case when p_suspect then 1 else 0 end)
  on conflict (user_id, day, mode, difficulty) do update
    set attempt_count = verified_daily_results.attempt_count + 1,
        score_sum     = verified_daily_results.score_sum + excluded.score_sum,
        -- The day's score is the average of everything that counted, recomputed from
        -- the two numbers above rather than tracked separately — so it cannot drift
        -- from the sum and count it is supposed to summarise.
        score         = round(
                          (verified_daily_results.score_sum + excluded.score_sum)::numeric
                          / (verified_daily_results.attempt_count + 1)
                        ),
        suspect_count = verified_daily_results.suspect_count + excluded.suspect_count
  returning * into row_out;
  return row_out;
end;
$$;

-- Braining keeps its one-official-trial rule, so this writes rather than accumulates.
-- The insert can only happen once a day anyway — the boost row and the Edge Function
-- both enforce that — but `do nothing` on conflict says so at the database too, and
-- means a retried submission cannot overwrite a trial that already stood.
create or replace function public.record_verified_braining(
  p_user      uuid,
  p_day       date,
  p_time_sec  integer,
  p_brain_age integer,
  p_suspect   boolean
)
returns public.verified_daily_results
language plpgsql
security definer
set search_path = public
as $$
declare
  row_out public.verified_daily_results;
begin
  insert into public.verified_daily_results
    (user_id, day, mode, difficulty, time_sec, brain_age, suspect_count)
  values
    (p_user, p_day, 'braining', 'standard', p_time_sec, p_brain_age, case when p_suspect then 1 else 0 end)
  on conflict (user_id, day, mode, difficulty) do nothing
  returning * into row_out;

  if row_out is null then
    select * into row_out from public.verified_daily_results
     where user_id = p_user and day = p_day and mode = 'braining' and difficulty = 'standard';
  end if;
  return row_out;
end;
$$;

-- Both are service_role only. They write the table the leaderboard will read, so a
-- player's own token being able to call them would undo the entire point of section 4.
revoke all on function public.record_verified_challenge(uuid, date, text, integer, boolean) from anon, authenticated, public;
revoke all on function public.record_verified_braining(uuid, date, integer, integer, boolean)  from anon, authenticated, public;
grant execute on function public.record_verified_challenge(uuid, date, text, integer, boolean) to service_role;
grant execute on function public.record_verified_braining(uuid, date, integer, integer, boolean)  to service_role;


-- ── 7. Housekeeping ────────────────────────────────────────────────────────────
--
-- Issued sets are worth keeping briefly — long enough to investigate a rejected
-- submission — and worthless after that. Without this the table grows forever at a
-- few kilobytes per game played.
--
-- Defined as a function rather than scheduled here, because scheduling belongs to
-- the environment (pg_cron on the hosted project) and not to a migration that has to
-- run identically on a laptop. It is safe to call at any time and from anywhere.

create or replace function public.prune_question_sets(older_than interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.question_sets where issued_at < now() - older_than;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- service_role only. This is a bulk delete, and nothing reachable by a player's token
-- should be able to call it.
revoke all on function public.prune_question_sets(interval) from anon, authenticated, public;
grant execute on function public.prune_question_sets(interval) to service_role;


-- ── 8. What is deliberately NOT here ───────────────────────────────────────────
--
-- No change to daily_results, question_attempts, player_state or profiles. The app
-- as it stands keeps working exactly as it does, which is what makes this migration
-- safe to apply before the client that uses it is deployed.
--
-- No foreign key from verified_daily_results to question_sets. A day's row is the
-- sum of many sets and outlives all of them — the pruning above would otherwise
-- either fail or cascade into the results it is supposed to leave alone.
--
-- No database-level assertion that score = round(score_sum / attempt_count), for the
-- same reason migration 0006 gave: a rounding disagreement between Postgres and
-- JavaScript would become a rejected write, and a rejected write is a player whose
-- progress silently stops. The server computes all three numbers in one place now,
-- which is a better guarantee than a constraint could give.
--
-- supabase/verification/0009_server_tables_rls.sql re-proves every claim in section 4
-- by attempting the reads and writes it forbids, rather than trusting that they are
-- forbidden.
