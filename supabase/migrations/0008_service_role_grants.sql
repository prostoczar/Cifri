-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — let the server write the tables that exist for it to write
--
-- Migration 0007 locked the three new tables down and forgot to unlock the one
-- door that had to stay open. Every set request came back "issue_failed": the Edge
-- Function's insert into question_sets was refused, because service_role had no
-- grant on a table it is the only intended writer of.
--
-- WHY IT WAS MISSED, since the same mistake is easy to repeat:
--
-- This project does not auto-expose new tables to the Data API roles — see the
-- `auto_expose_new_tables` note in supabase/config.toml, which is commented out and
-- therefore off, matching the current cloud default. A table created by a migration
-- starts with NO grants to anon, NO grants to authenticated, and — the part that
-- caught me — no grants to SERVICE_ROLE either.
--
-- 0007 reasoned carefully about the first two and said nothing about the third, on
-- the unexamined assumption that the service key is all-powerful. It is not. It
-- bypasses row level security, which is a different mechanism from grants; RLS
-- decides which ROWS, grants decide whether the statement may run at all. Bypassing
-- one says nothing about the other.
--
-- WHAT THIS DOES NOT CHANGE: nothing about anon or authenticated. The player-facing
-- permissions from 0007 stand exactly as written and as re-proved by
-- verification/0009 — question_sets remains unreadable by anybody, and
-- verified_daily_results remains read-only. service_role is not a role any client
-- can assume; the key that grants it is server-side only and never leaves the Edge
-- Function's environment.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════════


-- Exactly the operations the two functions actually perform, and no others.
--
-- issue-question-set:  counts rows (select), voids the previous set (update),
--                      inserts the new one (insert)
-- submit-attempt:      claims the set (update … returning), reads the answer key
--                      (select), writes the result receipt (update)
--
-- No delete on question_sets: rows are removed by prune_question_sets(), which is
-- security definer and runs as its owner, so it needs no grant of its own here.

grant select, insert, update on public.question_sets to service_role;

-- submit-attempt grants the boost (insert) and spends it (update), and the spend is
-- an `update … returning`, which needs select as well.
grant select, insert, update on public.braining_boosts to service_role;

-- The functions never touch this table directly — every write goes through
-- record_verified_challenge / record_verified_braining, which are security definer
-- and run as their owner. Select is granted anyway so that PostgREST can return the
-- composite row those functions hand back, and so a future read path does not fail
-- the same way this one did.
grant select on public.verified_daily_results to service_role;


-- ── The check that would have caught this ──────────────────────────────────────
--
-- Stated as a runnable assertion rather than a comment, so that re-running this
-- file re-proves it instead of merely re-asserting it. If a future migration
-- creates another server-owned table and forgets the grant again, adding it to this
-- list makes the omission fail loudly at migration time rather than quietly at
-- three in the morning when somebody cannot start a game.

do $$
declare
  missing text;
begin
  select string_agg(t, ', ') into missing
  from unnest(array['question_sets', 'braining_boosts', 'verified_daily_results']) as t
  where not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = t
       and grantee = 'service_role' and privilege_type = 'SELECT'
  );

  if missing is not null then
    raise exception 'service_role cannot read: %. The Edge Functions will fail at runtime.', missing;
  end if;
end $$;
