// Small input rules shared by the account screens. Formerly the top of mockAccounts.js — the
// mocked username list and demo login table that lived alongside these are gone, replaced by
// real Supabase calls in src/lib/accountApi.js.

export const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Usernames are always a single unbroken word — spaces are stripped as they are typed rather
// than blocked at submit, so the field simply never accepts one. The database enforces the same
// rule as a constraint, so this can never be the only thing standing in the way.
export function stripSpaces(v) {
  return (v || '').replace(/ /g, '');
}
