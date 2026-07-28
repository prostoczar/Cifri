// Mocked account data — local only. Nothing here talks to a server, and no function in the
// account flow makes a network or auth call of any kind. This exists purely so the guest →
// account UX can be rehearsed end to end before real backend wiring lands.

// Stands in for a "username already taken" lookup.
export const MOCK_TAKEN_USERNAMES = [
  'admin', 'test', 'cifri', 'player1', 'alex', 'anna', 'guest', 'demo', 'math', 'champion',
];

// Stands in for a user database, so both the success and the wrong-credentials paths of the
// login screen can be exercised.
export const MOCK_LOGIN_ACCOUNTS = [
  { username: 'demoplayer', email: 'demo@cifri.app', password: 'demo123', fullName: 'Demo Player' },
];

export const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Usernames are always a single unbroken word — spaces are stripped as they are typed rather
// than blocked at submit, so the field simply never accepts one.
export function stripSpaces(v) {
  return (v || '').replace(/ /g, '');
}

// A name is acceptable if it is the player's own current one, or not in the taken list.
export function usernameAvailable(candidate, ownUsername) {
  const v = (candidate || '').trim().toLowerCase();
  if (v.length < 2) return false;
  if (ownUsername && v === ownUsername.toLowerCase()) return true;
  return MOCK_TAKEN_USERNAMES.indexOf(v) === -1;
}

export function findMockAccount(identifier, password) {
  const idf = (identifier || '').trim().toLowerCase();
  return MOCK_LOGIN_ACCOUNTS.filter(
    (a) => (a.username.toLowerCase() === idf || a.email.toLowerCase() === idf) && a.password === password
  )[0];
}
