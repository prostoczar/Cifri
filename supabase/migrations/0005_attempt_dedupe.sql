-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — make attempt uploads idempotent.
--
-- Found by testing rather than by reading: a 37-question game was uploaded twice,
-- landing 74 rows with identical timestamps. The outbox had an in-process lock, and
-- an in-process lock is the wrong tool — it cannot see a second browser tab, a retry
-- that overlaps its predecessor, or a reload part-way through a send. Each of those
-- has its own copy of the lock and its own view of the queue.
--
-- The queue is deliberately at-least-once: a row stays queued until the insert is
-- confirmed, because losing an attempt is worse than sending one twice. The correct
-- partner for that is a uniqueness rule the database enforces, so a repeat send is
-- discarded by Postgres instead of being trusted not to happen.
--
-- Each attempt therefore carries a client_id minted on the device when the question
-- was answered. Sending the same attempt any number of times now produces exactly
-- one row, whatever the client does.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.question_attempts
  add column if not exists client_id uuid;

-- Any row already present predates the column and has no device-side id to adopt.
-- Giving each one its own value keeps them distinct from each other and lets the
-- column become NOT NULL.
update public.question_attempts
  set client_id = gen_random_uuid()
  where client_id is null;

alter table public.question_attempts
  alter column client_id set not null;

-- Scoped to the user, not global: two devices could theoretically mint the same id,
-- and one player's ids should never be able to block another player's insert.
create unique index if not exists question_attempts_client_unique
  on public.question_attempts (user_id, client_id);
