// Where an emailed auth link should send the player back to.
//
// Every Supabase email that contains a link — password reset, signup confirmation, email change —
// needs to be told where to land. This is the one place that decides, so the three of them cannot
// drift apart and start sending people to different addresses.
//
// The value is DERIVED, never written down. The app has no permanent home yet: it is opened from
// a laptop's dev server, from a phone on the same Wi-Fi, from a Vercel preview whose hostname
// changes with every deployment, and eventually from trycifri.com. Any address hardcoded here —
// or put in an env var someone has to remember to set — would be wrong for all but one of those,
// and wrong SILENTLY: the email still arrives and the link still works, it just lands somewhere
// the person holding the phone cannot open. The cutover to the real domain therefore needs no
// change to this file at all.
//
// window.location.origin is the right answer in every one of those cases for one reason: the
// reset was asked for FROM the page the player is looking at, so that page is by definition an
// address their browser can reach.
//
// The remaining half of this lives in Supabase, not here. An address that is not on the project's
// Redirect URLs allowlist is not refused — it is quietly swapped for the project's Site URL. So a
// correct value computed here still lands in the wrong place if the allowlist has not been told
// about it, and nothing in the app can detect that. The README records the list that has to be
// kept in step, under "Where auth emails send people back to".

import { appUrl } from './appUrl.js';

// The derivation itself now lives in lib/appUrl.js, because the share card prints the same
// address onto every image a player sends out and a second copy of this line could only ever
// disagree with this one. Everything above still applies — it is the reasoning for WHY this is
// derived, and the Supabase allowlist half of the problem is specific to auth emails and lives
// nowhere else.
export function authRedirectUrl() {
  return appUrl();
}
