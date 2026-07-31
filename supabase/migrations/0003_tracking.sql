-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — attempt tracking and leaderboard-ready daily results (Chat 3)
--
-- Nothing here exposes any player's data to any other player. There is no view and
-- no function added by this file, and every policy below repeats the same sentence
-- the existing tables already say: you may only ever touch the row that is you.
--
-- What this adds:
--   question_attempts  — one append-only row per question answered, with metadata
--   daily_results      — one row per player / day / mode / difficulty, shaped and
--                        indexed for the ranking queries a future leaderboard needs
--   profiles.leaderboard_visible — a dormant opt-in flag, false for everyone
--
-- player_state is deliberately untouched. It remains the source of truth for
-- restoring a player's own app state; daily_results is a derived mirror of it.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. The dormant visibility flag ─────────────────────────────────────────────
--
-- No UI reads or writes this in the current app. It exists so that when leaderboards
-- launch, the default for every account that already exists is "invisible" — opting
-- in has to be a deliberate act, and silence is never taken as consent.
--
-- NOT NULL DEFAULT false means every existing row is backfilled to false by this
-- statement, and every future row starts false without anyone having to remember to
-- set it.

alter table public.profiles
  add column if not exists leaderboard_visible boolean not null default false;


-- ── 2. question_attempts ───────────────────────────────────────────────────────
--
-- One row per question answered, in any mode, real or practice. This data cannot be
-- reconstructed after the fact, which is the whole reason for starting it now.
--
-- APPEND-ONLY BY DESIGN. There is no update policy and no delete policy below, so a
-- player cannot edit or erase their own answer history after the fact — not even
-- their own. Rows go away only when the account itself is deleted (by cascade).

create table if not exists public.question_attempts (
  id          bigint      generated always as identity primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,

  -- Groups every attempt from one sitting. Generated on the device at the start of a
  -- game; it identifies a session without being derived from anything about the player.
  session_id  uuid        not null,

  -- 'challenge' — the timed 60-second game (real trial or its warm-up practice)
  -- 'braining'  — the 50-question Braining run
  -- 'practice'  — the standalone Practice tab, which has no difficulty tier
  mode        text        not null check (mode in ('challenge', 'braining', 'practice')),

  -- Null for Braining and free Practice, which genuinely have no difficulty tier.
  difficulty  text        check (difficulty in ('easy', 'medium', 'hard')),

  -- Whether this attempt was part of the run that counts for the day, as opposed to a
  -- practice run or a retry after the day was already logged.
  is_real     boolean     not null default false,

  operation   text        not null check (operation in
                            ('addition', 'subtraction', 'multiplication', 'division', 'percentage')),

  -- The size of the question as it was actually generated: the largest operand's digit
  -- count, and how many values the player had to combine.
  -- Bounds widened by migration 0004 — see the note there. Left as originally written
  -- so this file remains an accurate record of what was applied.
  digits      smallint    check (digits between 1 and 6),
  terms       smallint    check (terms between 1 and 8),

  -- Time from the question appearing to this answer being submitted.
  time_ms     integer     not null check (time_ms >= 0),
  is_correct  boolean     not null,

  -- When the player answered, by their own device clock, and the local calendar day it
  -- belongs to. `day` is sent by the client rather than derived here because the app's
  -- day boundary is local midnight, not UTC midnight — deriving it server-side would
  -- put late-evening answers on the wrong day for anyone outside UTC.
  answered_at timestamptz not null,
  day         date        not null,

  -- Set by the database, never by the client: an unforgeable record of when the row
  -- actually arrived, independent of whatever the device clock claimed above.
  created_at  timestamptz not null default now()
);

-- Reading back a player's own history — the only query shape RLS currently permits.
create index if not exists question_attempts_user_time
  on public.question_attempts (user_id, answered_at desc);

create index if not exists question_attempts_user_day
  on public.question_attempts (user_id, day);


-- ── 3. daily_results ───────────────────────────────────────────────────────────
--
-- The normalized companion to the player_state blob. One row per player, per day, per
-- mode, per difficulty — holding exactly what a ranking query needs and nothing else.
--
-- This does NOT replace the blob. The blob still holds the full session history and is
-- still what hydrates the app on login. These rows are derived from it, which is what
-- guarantees the two can never disagree: there is one source of truth, projected into
-- a second shape.
--
-- The primary key is what makes writing them safe. Re-deriving and re-upserting the
-- same day produces the same row rather than a duplicate, so the projection can run as
-- often as it likes and can repair itself after a failed write.

create table if not exists public.daily_results (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  day         date        not null,
  mode        text        not null check (mode in ('challenge', 'braining')),

  -- Braining has no difficulty tiers, so it uses the single value 'standard'. Keeping
  -- the column NOT NULL lets it sit in the primary key, which is what stops a second
  -- row ever appearing for the same day and tier.
  difficulty  text        not null check (difficulty in ('easy', 'medium', 'hard', 'standard')),

  -- Challenge fills score; Braining fills time_sec and brain_age. The check below
  -- enforces that a row is one shape or the other and never a meaningless mix.
  score       integer     check (score >= 0),
  time_sec    integer     check (time_sec > 0),
  brain_age   integer     check (brain_age > 0),

  -- True only for the run that counted for that day. A leaderboard ranks these; practice
  -- rows are stored so the data is complete, but they are not a competitive result.
  is_real     boolean     not null default false,

  -- The streak as it stood on that day. Null on rows backfilled from history: the streak
  -- for a past day is not reconstructible (streak restores leave no dated record), and a
  -- plausible guess in a ranking table would be worse than an honest gap.
  streak      integer     check (streak >= 0),
  best_streak integer     check (best_streak >= 0),

  updated_at  timestamptz not null default now(),

  primary key (user_id, day, mode, difficulty),

  constraint daily_results_mode_shape check (
    (mode = 'challenge' and difficulty in ('easy', 'medium', 'hard') and score is not null)
    or
    (mode = 'braining'  and difficulty = 'standard' and time_sec is not null)
  )
);

drop trigger if exists daily_results_touch_updated_at on public.daily_results;
create trigger daily_results_touch_updated_at
  before update on public.daily_results
  for each row execute function public.touch_updated_at();

-- ── The ranking indexes ────────────────────────────────────────────────────────
--
-- This is the actual point of the table. Each one is a pre-sorted structure that answers
-- a leaderboard question in a single read, with no JSON parsing and no full-table scan —
-- so when leaderboards are built, nobody has to unpack a blob to find the top 10.
--
-- They are partial indexes (`where ... is_real`), which means they only contain the runs
-- that actually count. That keeps them small and keeps practice runs out of the ranking
-- path entirely.
--
-- To be explicit: an index is a sorted copy of columns, not a permission. Nothing here
-- lets anyone read a row that RLS would not already have given them.

-- "Top scores on Hard today" — descending, so the leaders are the first rows read.
create index if not exists daily_results_challenge_rank
  on public.daily_results (difficulty, day, score desc)
  where mode = 'challenge' and is_real;

-- "Fastest Braining times today" — ascending, because for Braining lower is better.
create index if not exists daily_results_braining_rank
  on public.daily_results (day, time_sec asc)
  where mode = 'braining' and is_real;

-- "Longest active streaks" — the one ranking that is not per-mode.
create index if not exists daily_results_streak_rank
  on public.daily_results (day, streak desc)
  where is_real;


-- ── 4. Row Level Security ──────────────────────────────────────────────────────
--
-- Identical discipline to the existing tables. RLS is deny-by-default: once enabled,
-- nothing is readable or writable until a policy permits it, and every policy here
-- permits exactly one thing — your own rows.
--
-- auth.uid() is read by Postgres out of the caller's signed login token. The client
-- cannot set it, pass it, or forge it. A logged-out visitor has no auth.uid() at all,
-- so every comparison is false and they receive nothing.
--
-- `with check` on insert is what stops the interesting attack: without it, a signed-in
-- player could insert rows carrying someone else's user_id and pollute another
-- account's leaderboard history.

alter table public.question_attempts enable row level security;
alter table public.daily_results     enable row level security;

drop policy if exists "read own attempts"   on public.question_attempts;
drop policy if exists "insert own attempts" on public.question_attempts;

create policy "read own attempts" on public.question_attempts
  for select using (auth.uid() = user_id);

create policy "insert own attempts" on public.question_attempts
  for insert with check (auth.uid() = user_id);

-- Deliberately no update and no delete policy: the answer log is append-only.

drop policy if exists "read own daily"   on public.daily_results;
drop policy if exists "insert own daily" on public.daily_results;
drop policy if exists "update own daily" on public.daily_results;

create policy "read own daily" on public.daily_results
  for select using (auth.uid() = user_id);

create policy "insert own daily" on public.daily_results
  for insert with check (auth.uid() = user_id);

-- Update is needed because a day's row is re-derived and re-upserted as the day goes on.
-- `using` stops you editing someone else's row; `with check` stops you reassigning your
-- own row to someone else's id.
create policy "update own daily" on public.daily_results
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ── 5. Table grants ────────────────────────────────────────────────────────────
--
-- Grants say which operations the role may attempt; RLS then decides which ROWS. Both
-- must pass. Note the absences: no update or delete on question_attempts at all, and no
-- delete on daily_results — those are not withheld by policy alone but by the grant too,
-- which is the stricter of the two ways to say no.

grant select, insert         on public.question_attempts to authenticated;
grant select, insert, update on public.daily_results     to authenticated;
