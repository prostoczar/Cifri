-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — accounts schema (Chat 2)
--
-- Two tables, both keyed to Supabase's built-in auth.users by its UUID:
--   profiles      — who the player is (username, full name, avatar choice)
--   player_state  — what the player has done (all game progress, as one JSON blob)
--
-- Row Level Security is enabled on both and is DENY-BY-DEFAULT: once RLS is on,
-- nothing is permitted until a policy permits it. Every policy below says the
-- same thing — you may only ever touch the row that is you.
--
-- Safe to run more than once (everything is guarded with IF NOT EXISTS / drops).
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. profiles ────────────────────────────────────────────────────────────────
-- The row's id IS the auth user's id, so the link cannot be broken or forged.
-- ON DELETE CASCADE: deleting the auth account deletes this row automatically.

create table if not exists public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  username    text        not null,
  full_name   text        not null default '',
  -- The avatar object exactly as the icon picker produces it:
  -- {type, value, color, size, customized}. Stored whole so the picker's output
  -- round-trips through the database completely unchanged.
  avatar      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Mirrors the client's own rules: 2–20 characters, never contains a space.
  constraint username_length check (char_length(username) between 2 and 20),
  constraint username_no_spaces check (username !~ ' ')
);

-- Case-insensitive uniqueness, enforced by the database itself.
-- This is a GUARANTEE, not a check: if two people submit "alex" at the same
-- instant, Postgres rejects the second one. The app never has to win a race.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));


-- ── 2. player_state ────────────────────────────────────────────────────────────
-- One row per account holding the whole app state object, mirroring what the app
-- already keeps in localStorage: db, brState, the streak fields, milestones,
-- settings, chart preferences, totdLastViewed, tutorialShown, firstOpenDate.

create table if not exists public.player_state (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);


-- ── 3. Keep updated_at honest ──────────────────────────────────────────────────
-- Set server-side so a client can never backdate a write (which would matter for
-- last-write-wins sync between two devices).

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists player_state_touch_updated_at on public.player_state;
create trigger player_state_touch_updated_at
  before update on public.player_state
  for each row execute function public.touch_updated_at();


-- ── 4. Row Level Security ──────────────────────────────────────────────────────
--
-- auth.uid() is the ID of whoever is making the request, read by Postgres out of
-- their signed login token. The client cannot set it, pass it, or fake it.
--
--   using (...)      → which existing rows you may see or change
--   with check (...) → what you are allowed to write
--
-- Both are present on UPDATE: `using` stops you editing someone else's row,
-- `with check` stops you reassigning your row to someone else's id.
--
-- There is deliberately NO delete policy. Deletion happens by cascade when the
-- auth account itself is deleted (see the delete-account Edge Function), which
-- makes orphaned progress data impossible.
--
-- A logged-out visitor has no auth.uid() at all, so every comparison below is
-- false and they receive nothing.

alter table public.profiles     enable row level security;
alter table public.player_state enable row level security;

drop policy if exists "read own profile"   on public.profiles;
drop policy if exists "create own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;

create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "create own profile" on public.profiles
  for insert with check (auth.uid() = id);

create policy "update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "read own state"   on public.player_state;
drop policy if exists "create own state" on public.player_state;
drop policy if exists "update own state" on public.player_state;

create policy "read own state" on public.player_state
  for select using (auth.uid() = user_id);

create policy "create own state" on public.player_state
  for insert with check (auth.uid() = user_id);

create policy "update own state" on public.player_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ── 5. Username availability ───────────────────────────────────────────────────
--
-- The one deliberate exception to "you can only read your own row", and the
-- reason it is safe: this returns a single true/false and nothing else. No
-- usernames, no emails, no ids, no rows. It cannot list anything, so it cannot
-- be used to dump the userbase — it only answers about the name already typed.
--
-- security definer  → runs with the owner's rights, which is how it can see the
--                     table at all. Its body is kept as small as possible.
-- set search_path='' → hardening. Blocks the one known trick for abusing such
--                     functions (hijacking which schema a name resolves to),
--                     which is why every name below is fully qualified.
--
-- A logged-in player's own current username always reads as available, so the
-- edit-account screen can save without changing the name.

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles p
    where lower(p.username) = lower(trim(candidate))
      and p.id is distinct from auth.uid()
  );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;


-- ── 6. Table grants ────────────────────────────────────────────────────────────
-- Grants say which operations the role may attempt; RLS then decides which ROWS.
-- Both must pass. Note there is no DELETE grant and no delete policy.

grant select, insert, update on public.profiles     to authenticated;
grant select, insert, update on public.player_state to authenticated;
