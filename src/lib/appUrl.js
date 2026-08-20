// Where this app currently lives, and how to print that for a human.
//
// The app has no permanent home yet: it is opened from a laptop's dev server, from a phone on the
// same Wi-Fi, from a Vercel preview whose hostname changes with every deployment, and eventually
// from trycifri.com. Anything hardcoded — or put in an env var someone has to remember to set —
// would be wrong for all but one of those, and wrong SILENTLY. So the address is DERIVED, in one
// place, and the cutover to the real domain needs no change to this file at all.
//
// This was pulled out of lib/authRedirect.js, which had computed exactly this for the links in
// Supabase's emails since before there was a second caller. The share card now prints the same
// address onto every image a player sends to a friend, and the two must not be able to drift into
// different ideas of where the app is — the failure mode is a picture inviting people to an
// address that is not the one the sender is playing at. authRedirect.js still exists and still
// carries the reasoning specific to auth emails (the Supabase allowlist half of the problem);
// it now asks this module for the address rather than working it out again.

// The address to SEND someone to: a full, openable URL.
export function appUrl() {
  // Returning undefined rather than a guess: supabase-js treats a missing redirect the same as no
  // option at all and falls back to the Site URL, which is the safest thing to do off a browser.
  if (typeof window === 'undefined') return undefined;

  // Vite allows the app to be served from a sub-path (BASE_URL), and dropping it would send the
  // player to the domain root, where the app is not. It is '/' today, which makes this line a
  // no-op — the point is that it stays correct if that ever changes.
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return window.location.origin + base;
}

// The same address, written the way it is spoken: no scheme, no "www.", and short enough to sit
// on the footer of a shared card without wrapping.
//
// `host` rather than `hostname`, deliberately: it keeps the port. On trycifri.com there is no port
// and the two are identical, but during testing the app is served from a LAN address like
// 192.168.1.20:5173, and a label that dropped the :5173 would print an address that does not
// answer. A label nobody can type is worse than a long one.
export function appUrlLabel() {
  if (typeof window === 'undefined') return '';
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return window.location.host.replace(/^www\./, '') + base;
}
