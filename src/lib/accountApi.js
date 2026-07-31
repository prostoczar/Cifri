// Every call that touches Supabase lives here. The screens stay presentational: they call one
// of these functions and get back a plain result object, so no component ever holds a Supabase
// detail (error codes, table names, token juggling).
//
// Convention: every function resolves to either { ok: true, ... } or { ok: false, error: CODE }.
// CODE is one of the strings below, which the UI maps to the i18n message it already shows.
// Nothing here ever throws for an expected failure — only genuinely unexpected ones bubble up.

import { supabase } from './supabaseClient.js';
import { toSyncPayload, fromSyncPayload } from './syncedState.js';

export const ERR = {
  TAKEN: 'taken',                     // username already in use
  EMAIL_IN_USE: 'email_in_use',
  INVALID_CREDENTIALS: 'invalid_credentials',
  WEAK_PASSWORD: 'weak_password',
  RATE_LIMITED: 'rate_limited',
  EMAIL_INVALID: 'email_invalid',      // Supabase would not accept the address as deliverable
  CONFIRM_REQUIRED: 'confirm_required', // email confirmation is switched on in Supabase
  NETWORK: 'network',
  UNKNOWN: 'unknown',
};

// The i18n key each failure maps to, so every screen phrases the same problem the same way.
// TAKEN and INVALID_CREDENTIALS are absent on purpose: the screens already own dedicated copy
// for those two ('username_taken', 'login_error') and show it in their own place on screen.
const ERR_KEYS = {
  [ERR.EMAIL_IN_USE]: 'err_email_in_use',
  [ERR.EMAIL_INVALID]: 'err_email_invalid',
  [ERR.WEAK_PASSWORD]: 'err_weak_password',
  [ERR.RATE_LIMITED]: 'err_rate_limited',
  [ERR.NETWORK]: 'err_network',
  [ERR.CONFIRM_REQUIRED]: 'err_generic',
  [ERR.UNKNOWN]: 'err_generic',
};

export function errorKey(code) {
  return ERR_KEYS[code] || 'err_generic';
}

// Supabase reports failures as human-readable messages far more consistently than as codes, so
// matching on the message is unfortunately the reliable route. Anything unrecognised falls
// through to UNKNOWN rather than being silently treated as success.
function mapAuthError(error) {
  const msg = (error && error.message ? error.message : '').toLowerCase();
  if (!msg) return ERR.UNKNOWN;
  if (msg.includes('failed to fetch') || msg.includes('network')) return ERR.NETWORK;
  if (msg.includes('rate limit') || msg.includes('too many')) return ERR.RATE_LIMITED;
  if (msg.includes('already registered') || msg.includes('already been registered')) return ERR.EMAIL_IN_USE;
  // Supabase refuses addresses it considers undeliverable (no MX record, blocklisted domain).
  // Worth naming, because "something went wrong" sends people hunting for the wrong problem.
  if (msg.includes('is invalid') && msg.includes('email')) return ERR.EMAIL_INVALID;
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) return ERR.INVALID_CREDENTIALS;
  // No usable session. On the reset-password screen this is what an expired or already-used
  // recovery link looks like, which is the message worth showing rather than a generic failure.
  if (msg.includes('session missing') || msg.includes('session not found') || msg.includes('session_not_found')) {
    return ERR.INVALID_CREDENTIALS;
  }
  if (msg.includes('password') && (msg.includes('short') || msg.includes('least') || msg.includes('weak'))) {
    return ERR.WEAK_PASSWORD;
  }
  return ERR.UNKNOWN;
}

// Postgres unique-violation, i.e. the username index rejected the write. This is the real
// uniqueness guarantee — the live availability check is only a courtesy ahead of it.
function isUniqueViolation(error) {
  return !!error && error.code === '23505';
}

// ── Username availability ──────────────────────────────────────────────────────
// Backed by the is_username_available() database function, which returns a single true/false
// and can never return anyone's row. A logged-in player's own name always reads as available.

export async function isUsernameAvailable(candidate) {
  const v = (candidate || '').trim();
  if (v.length < 2) return { ok: false, available: false };
  const { data, error } = await supabase.rpc('is_username_available', { candidate: v });
  if (error) return { ok: false, available: false, error: mapAuthError(error) };
  return { ok: true, available: data === true };
}

// ── Session ────────────────────────────────────────────────────────────────────

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export function onAuthChange(handler) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => handler(event, session));
  return () => data.subscription.unsubscribe();
}

// ── Signup ─────────────────────────────────────────────────────────────────────
//
// Three steps that must all land: create the auth user, create the profile row, and upload
// whatever progress this player already built up as a guest.
//
// The retry case is handled deliberately. If the profile insert loses a race on the username,
// the auth user already exists and is signed in — so on the next attempt we detect that session
// and skip straight to the profile insert instead of trying to sign up again (which would fail
// with "email already registered" and strand the player).

export async function signUpWithProfile({ email, password, username, fullName, avatar, localState }) {
  let session = await getSession();

  // Only reuse an existing session if it is genuinely this same signup being retried.
  if (session && session.user.email !== email.trim().toLowerCase()) {
    await supabase.auth.signOut();
    session = null;
  }

  if (!session) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      if (mapAuthError(error) !== ERR.EMAIL_IN_USE) return { ok: false, error: mapAuthError(error) };

      // "Already registered" is not always what it looks like. Creating an account happens in
      // two steps — the auth user, then the profile — and if the second one failed (a dropped
      // connection, or the username being claimed in that instant) the email is registered but
      // the account is unusable: signup rejects it as taken, and login has no profile to load.
      // That is a permanent lock-out, so recover from it here.
      //
      // Safe because it requires BOTH the correct password AND the absence of a profile. A
      // finished account belonging to someone else fails the first check, and if it somehow
      // passes it, it fails the second — either way we sign straight back out and report the
      // address as taken, exactly as before.
      const { data: retry, error: retryError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (retryError || !retry.session) return { ok: false, error: ERR.EMAIL_IN_USE };

      const { data: existingProfile } = await supabase
        .from('profiles').select('id').eq('id', retry.session.user.id).maybeSingle();
      if (existingProfile) {
        await supabase.auth.signOut();
        return { ok: false, error: ERR.EMAIL_IN_USE };
      }
      session = retry.session;
    } else {
      // With email confirmation switched off, signUp returns a usable session immediately. If it
      // does not, confirmation has been turned back on in the Supabase dashboard and the rest of
      // this flow cannot run — say so plainly rather than failing further down with an RLS error.
      if (!data.session) return { ok: false, error: ERR.CONFIRM_REQUIRED };
      session = data.session;
    }
  }

  const userId = session.user.id;

  // upsert, not insert. If a previous attempt got this far and then failed on the progress
  // upload below, the profile row already exists — and a plain insert would fail on the PRIMARY
  // KEY, which is also a unique violation, so the retry would report "that username is taken"
  // about the player's own name and leave them permanently stuck. Upserting on `id` makes the
  // retry idempotent, while a genuine collision on someone else's username still raises 23505
  // against the username index and is reported correctly.
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    username: username.trim(),
    full_name: (fullName || '').trim(),
    avatar: avatar || {},
  }, { onConflict: 'id' });
  if (profileError) {
    if (isUniqueViolation(profileError)) return { ok: false, error: ERR.TAKEN };
    return { ok: false, error: mapAuthError(profileError) };
  }

  // Carry the guest's progress onto the new account. Upsert for the same reason.
  const { error: stateError } = await supabase.from('player_state').upsert({
    user_id: userId,
    data: toSyncPayload(localState),
  }, { onConflict: 'user_id' });
  if (stateError) return { ok: false, error: mapAuthError(stateError) };

  return { ok: true, session };
}

// ── Login ──────────────────────────────────────────────────────────────────────
//
// The screen accepts a username OR an email. Supabase's own sign-in only accepts an email, and
// resolving username → email in the browser would expose a public-name → private-address
// lookup. So a username goes to an Edge Function that does the lookup AND the sign-in on the
// server: the address is never revealed unless the password was already correct.

export async function signInWithIdentifier({ identifier, password }) {
  const id = (identifier || '').trim();
  if (!id || !password) return { ok: false, error: ERR.INVALID_CREDENTIALS };

  if (id.includes('@')) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: id, password });
    if (error) return { ok: false, error: mapAuthError(error) };
    return { ok: true, session: data.session };
  }

  const { data, error } = await supabase.functions.invoke('login-with-username', {
    body: { username: id, password },
  });
  if (error || !data || !data.access_token) {
    // The function returns a flat "no" for every failure — wrong name and wrong password are
    // indistinguishable from the outside, which is what stops it being used to test whether a
    // username exists.
    return { ok: false, error: ERR.INVALID_CREDENTIALS };
  }

  const { data: sessionData, error: setError } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (setError) return { ok: false, error: mapAuthError(setError) };
  return { ok: true, session: sessionData.session };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: mapAuthError(error) };
  return { ok: true };
}

// ── Loading an account ─────────────────────────────────────────────────────────
// Called after login and on every app start with a live session. RLS means these two queries
// physically cannot return anyone else's row, whatever the app asks for.

export async function fetchAccount() {
  const session = await getSession();
  if (!session) return { ok: false, error: ERR.INVALID_CREDENTIALS };

  const [{ data: profile, error: pErr }, { data: stateRow, error: sErr }] = await Promise.all([
    supabase.from('profiles').select('username, full_name, avatar').eq('id', session.user.id).maybeSingle(),
    supabase.from('player_state').select('data').eq('user_id', session.user.id).maybeSingle(),
  ]);
  if (pErr) return { ok: false, error: mapAuthError(pErr) };
  if (sErr) return { ok: false, error: mapAuthError(sErr) };

  return {
    ok: true,
    email: session.user.email,
    profile: profile || null,
    syncedState: fromSyncPayload(stateRow ? stateRow.data : null),
    hasRemoteState: !!stateRow,
  };
}

// ── Saving progress ────────────────────────────────────────────────────────────
// Upsert so the first save after login works whether or not a row exists yet.

export async function pushPlayerState(payload) {
  const session = await getSession();
  if (!session) return { ok: false, error: ERR.INVALID_CREDENTIALS };
  const { error } = await supabase
    .from('player_state')
    .upsert({ user_id: session.user.id, data: payload }, { onConflict: 'user_id' });
  if (error) return { ok: false, error: mapAuthError(error) };
  return { ok: true };
}

// ── Saving the normalized daily results ────────────────────────────────────────
//
// The companion write to pushPlayerState above. The blob remains the source of truth; these
// rows are a derived, indexed mirror of it, shaped for the ranking queries a future leaderboard
// will run. Nothing reads them across accounts today, and RLS would not permit it if it tried.
//
// Upsert on the full primary key, so re-sending a day updates its row instead of duplicating it.
// That is what lets this run on every sync and after every failure without accumulating junk.

export async function pushDailyResults(rows) {
  if (!rows || !rows.length) return { ok: true };
  const session = await getSession();
  if (!session) return { ok: false, error: ERR.INVALID_CREDENTIALS };

  const withOwner = rows.map((r) => ({ ...r, user_id: session.user.id }));

  // A long history is sent in pieces — a first-login backfill can be hundreds of rows, and one
  // oversized request on a phone connection is far more likely to fail than several small ones.
  for (let i = 0; i < withOwner.length; i += 200) {
    const { error } = await supabase
      .from('daily_results')
      .upsert(withOwner.slice(i, i + 200), { onConflict: 'user_id,day,mode,difficulty' });
    if (error) return { ok: false, error: mapAuthError(error) };
  }
  return { ok: true };
}

// ── Editing the account ────────────────────────────────────────────────────────

export async function updateProfile({ username, fullName, avatar }) {
  const session = await getSession();
  if (!session) return { ok: false, error: ERR.INVALID_CREDENTIALS };

  const patch = {};
  if (username !== undefined) patch.username = username.trim();
  if (fullName !== undefined) patch.full_name = (fullName || '').trim();
  if (avatar !== undefined) patch.avatar = avatar || {};

  const { error } = await supabase.from('profiles').update(patch).eq('id', session.user.id);
  if (error) {
    if (isUniqueViolation(error)) return { ok: false, error: ERR.TAKEN };
    return { ok: false, error: mapAuthError(error) };
  }
  return { ok: true };
}

// Changing an email is not instant: Supabase sends a confirmation link to the new address and
// the change only takes effect once it is clicked. The caller surfaces that as a "check your
// inbox" line under the field.
export async function requestEmailChange(newEmail) {
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
  if (error) return { ok: false, error: mapAuthError(error) };
  return { ok: true, pending: true };
}

// ── Password reset (forgotten) ─────────────────────────────────────────────────
// Always reports success to the caller, whether or not the address has an account — that is
// what stops the screen being used to discover who is registered. The existing UI already says
// "If an account exists for that email…", so this matches the copy that is already there.

export async function sendPasswordReset(email) {
  // Land back on the app's own origin and nothing more. Supabase appends the recovery token to
  // this URL itself, so adding a path or hash of our own here only risks colliding with it —
  // ResetPasswordScreen is opened by detecting that token, not by a URL we chose.
  await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  });
  return { ok: true };
}

// ── Password change (while logged in) ──────────────────────────────────────────
//
// Supabase's updateUser({password}) does NOT require the old password, so we prove knowledge of
// it first by signing in again as the same account. That check runs on Supabase's own hardened
// endpoint — no password is ever compared in this app's code — and failed attempts count
// against Supabase's auth rate limits, so this cannot be used to brute-force anything.
//
// It re-authenticates the identical user (same email, same account), so no privilege can change
// hands. The only side effect is a freshly issued session token.

export async function changePassword({ currentPassword, newPassword }) {
  const session = await getSession();
  if (!session) return { ok: false, error: ERR.INVALID_CREDENTIALS };

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: session.user.email,
    password: currentPassword,
  });
  if (verifyError) return { ok: false, error: mapAuthError(verifyError) };

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) return { ok: false, error: mapAuthError(updateError) };
  return { ok: true };
}

// Used by the reset-link landing flow, where Supabase has already authenticated the player via
// the emailed token and no current password exists to check against.
export async function setNewPassword(newPassword) {
  // Arriving here without a session means the recovery link never authenticated anyone — it had
  // expired, or had already been used. Checked up front so that reads as "expired link" rather
  // than depending on how Supabase happens to word the failure.
  const session = await getSession();
  if (!session) return { ok: false, error: ERR.INVALID_CREDENTIALS };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: mapAuthError(error) };
  return { ok: true };
}

// ── Account deletion ───────────────────────────────────────────────────────────
//
// Deleting an auth user needs the service_role key, which bypasses all RLS and must never be in
// the app bundle. So this calls an Edge Function that holds that key server-side. The function
// takes NO user id — it deletes only the id it reads out of the caller's verified token, so the
// only account any caller can ever delete is their own. profiles and player_state go with it by
// cascade.

export async function deleteAccount() {
  const session = await getSession();
  if (!session) return { ok: false, error: ERR.INVALID_CREDENTIALS };
  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error || !data || data.deleted !== true) return { ok: false, error: ERR.UNKNOWN };
  await supabase.auth.signOut();
  return { ok: true };
}
