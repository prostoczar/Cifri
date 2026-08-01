-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — Challenge's daily score becomes an average (Chat 3.5)
--
-- WHAT CHANGED, IN ONE SENTENCE: a Challenge day used to be scored by its first
-- trial and locked; it is now scored by the average of every play that day, and
-- playing again recalculates it.
--
-- BRAINING IS NOT TOUCHED. Braining keeps its one-official-trial rule, its rows
-- keep exactly the shape they have now, and the two columns added below stay null
-- on every `mode = 'braining'` row — enforced, not merely intended, by the
-- reshaped constraint at the end of this file.
--
-- WHY COUNT AND SUM RATHER THAN A ROW PER PLAY: an average needs only two numbers.
-- Keeping a running count and a running sum means a player who plays once and a
-- player who plays fifty times both occupy exactly one row of exactly one size,
-- and the day's score is one division. Storing each individual score here would
-- grow the ranking table in proportion to how much people play, for no gain — the
-- individual scores are already kept in player_state, which is what draws the
-- chart's high/low candle.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. The two new columns ─────────────────────────────────────────────────────
--
-- Added nullable and unconstrained on purpose. Existing rows have no value for
-- either yet, so anything stricter would be rejected before step 2 can fill them in.

alter table public.daily_results
  add column if not exists attempt_count integer,
  add column if not exists score_sum     integer;

comment on column public.daily_results.attempt_count is
  'Challenge only: how many plays that day. Null for Braining, which has one official trial.';
comment on column public.daily_results.score_sum is
  'Challenge only: those plays'' scores added together. score = round(score_sum / attempt_count).';


-- ── 2. Backfill the days that already exist ────────────────────────────────────
--
-- Under the old rule every Challenge day had exactly one score that counted, so
-- "one attempt, summing to that score" is not an approximation of those days — it
-- is precisely what they were. Their average is unchanged, which is the point:
-- nobody's recorded history moves because of this migration.
--
-- This has to run BEFORE the constraints below, or they would be checked against
-- rows that have not been filled in yet and the migration would fail.

update public.daily_results
   set attempt_count = 1,
       score_sum     = score
 where mode = 'challenge'
   and score is not null
   and attempt_count is null;


-- ── 3. Column-level sanity ─────────────────────────────────────────────────────
--
-- Dropped first so this file stays re-runnable: `add constraint` has no IF NOT
-- EXISTS form, so "drop if exists, then add" is how you express it idempotently.
--
-- Both tolerate null, because null is the correct value on a Braining row. Which
-- rows are *allowed* to be null is decided in step 4, not here.

alter table public.daily_results
  drop constraint if exists daily_results_attempt_count_positive;
alter table public.daily_results
  add  constraint daily_results_attempt_count_positive
  check (attempt_count is null or attempt_count >= 1);

alter table public.daily_results
  drop constraint if exists daily_results_score_sum_nonneg;
alter table public.daily_results
  add  constraint daily_results_score_sum_nonneg
  check (score_sum is null or score_sum >= 0);


-- ── 4. The reshaped row-shape constraint ───────────────────────────────────────
--
-- The original version of this constraint said: a row is either a Challenge row or
-- a Braining row, never a meaningless mix. That still holds. What is added is that
-- a Challenge row must now carry the two numbers its score is derived from, and a
-- Braining row must not carry them at all.
--
-- That second half is the guard rail for this whole session: if some future change
-- ever tried to give Braining an averaged score, the database would refuse the row
-- rather than quietly accept a rule nobody agreed to.

alter table public.daily_results
  drop constraint if exists daily_results_mode_shape;

alter table public.daily_results
  add constraint daily_results_mode_shape check (
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
  );


-- ── 5. What is deliberately NOT here ───────────────────────────────────────────
--
-- No constraint asserting `score = round(score_sum / attempt_count)`. It is tempting
-- and it would be true, but it would also mean that any disagreement between how
-- JavaScript rounds and how Postgres rounds turns into a rejected write, and a
-- rejected write is a player whose progress silently stops syncing. Checking that
-- the number a client reports is the number its own inputs imply is a server-side
-- validation question, which is what the next session is for.
--
-- No RLS or grant changes. Adding a column to a table does not change who may read
-- or write its rows: the existing policies are written about the row's user_id, not
-- about its columns, so they cover the new columns automatically and the existing
-- grants (select, insert, update — never delete) still apply.
--
-- "Automatically" is a claim, though, and the point of RLS is not to take claims on
-- trust. supabase/verification/0006_rls_check.sql re-proves it by attempting every
-- cross-account read and write against the reworked table and reporting what the
-- database actually did.
