// Permanently deletes the calling player's account.
//
// Deleting an auth user requires the service_role key, which bypasses every Row Level Security
// policy. That key must never reach the browser — anyone could read it out of the JavaScript
// bundle and then read, alter or delete every account in the project. So it lives here, in
// Supabase's server-side secret storage, and the app calls this function instead.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE ONE SECURITY PROPERTY THAT MATTERS:
//
//   This function never accepts a user id as input.
//
// It reads the id out of the caller's own verified login token and deletes only that. There is
// no parameter to tamper with and no code path that deletes anyone else. Even someone who found
// this function's URL and called it directly, with a valid token of their own, could delete
// only their own account.
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// profiles and player_state go with it automatically: both are declared ON DELETE CASCADE
// against auth.users, so removing the auth user removes them in the same transaction. That is
// also why there is no DELETE policy anywhere in the schema — deletion is never a row-by-row
// operation the client performs.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Verify the token and, critically, derive the identity FROM it rather than from the request
  // body. A forged or expired token fails here and nothing is deleted.
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: 'unauthorized' }, 401);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account failed for', user.id, deleteError.message);
    return json({ error: 'delete_failed' }, 500);
  }

  return json({ deleted: true }, 200);
});
