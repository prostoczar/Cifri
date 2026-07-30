// Signs a player in with their username instead of their email.
//
// The login screen has always said "Username or email", but Supabase's sign-in only accepts an
// email. The tempting shortcut — look the email up from the browser — would mean publishing a
// mapping from public usernames to private email addresses, which is a real privacy leak. So
// the lookup and the sign-in both happen here, on the server.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS DOES NOT LEAK ANYTHING:
//
//   • The email address is never returned. On success the caller gets session tokens; on
//     failure it gets a flat "no".
//   • Every failure looks identical — unknown username, known username with the wrong password,
//     and malformed input all return the same 401 with the same body. So this cannot be used to
//     test whether a username exists.
//   • The password is checked by Supabase's own sign-in endpoint, which applies its usual rate
//     limiting. Nothing is compared by hand here.
// ─────────────────────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

// One shape for every rejection, so the outside world cannot tell them apart.
const DENIED = { error: 'invalid_credentials' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let username = '';
  let password = '';
  try {
    const body = await req.json();
    username = typeof body.username === 'string' ? body.username.trim() : '';
    password = typeof body.password === 'string' ? body.password : '';
  } catch {
    return json(DENIED, 401);
  }
  if (!username || !password) return json(DENIED, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Username → user id. This RPC is granted to service_role only; the app's public key cannot
  // call it. It returns a UUID, never an address.
  const { data: profileId, error: lookupError } = await admin.rpc('profile_id_for_username', {
    candidate: username,
  });
  if (lookupError || !profileId) return json(DENIED, 401);

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profileId);
  if (userError || !userData.user?.email) return json(DENIED, 401);

  // Sign in as an ordinary client, not as the admin — so the password genuinely has to be
  // correct, and Supabase's own rate limiting applies to the attempt.
  const anon = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email: userData.user.email,
    password,
  });
  if (signInError || !signIn.session) return json(DENIED, 401);

  return json({
    access_token: signIn.session.access_token,
    refresh_token: signIn.session.refresh_token,
  }, 200);
});
