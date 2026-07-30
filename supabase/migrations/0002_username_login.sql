-- ═══════════════════════════════════════════════════════════════════════════════
-- Cifri — username → account lookup, for the login-with-username Edge Function.
--
-- The login screen accepts "username or email", but Supabase's sign-in only takes an email.
-- Resolving one to the other in the browser would expose a public-username → private-email
-- lookup, so the resolution happens server-side instead, and this is the only piece of it that
-- touches the database.
--
-- Why this is not a hole in the wall:
--   • It returns a UUID, never an email address.
--   • It is granted to service_role ONLY. The anon and authenticated roles — the ones the app's
--     public key can act as — cannot call it at all. The single caller is the Edge Function,
--     which holds the service_role key server-side.
--   • Even reaching that function gets you nothing without the correct password: it signs in on
--     your behalf and returns tokens, never the address it looked up.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.profile_id_for_username(candidate text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where lower(p.username) = lower(trim(candidate))
  limit 1;
$$;

-- Deny everyone, then grant to service_role alone. Note the deliberate absence of anon and
-- authenticated here — that is the whole point of this function's security posture.
revoke all on function public.profile_id_for_username(text) from public;
revoke all on function public.profile_id_for_username(text) from anon, authenticated;
grant execute on function public.profile_id_for_username(text) to service_role;
