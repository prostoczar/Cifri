// Detecting that the app was opened from a password-reset email.
//
// Timing matters here. supabase-js consumes the token out of the URL and strips it as part of
// starting up, so by the time a React effect runs the evidence can already be gone. These two
// constants are read at import time — synchronously, before any of that has happened.
//
// Both URL shapes are checked because which one arrives depends on the auth flow the project
// uses: the implicit flow puts the token in the hash, PKCE puts a code in the query string.

const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
const search = typeof window !== 'undefined' ? window.location.search || '' : '';

export const arrivedFromRecoveryLink =
  hash.includes('type=recovery') ||
  new URLSearchParams(search).get('type') === 'recovery';

// Once the reset is finished, take the token out of the address bar so a refresh (or sharing
// the URL) cannot replay it.
export function clearRecoveryUrl() {
  if (typeof window === 'undefined' || !window.history) return;
  window.history.replaceState({}, document.title, window.location.pathname);
}
