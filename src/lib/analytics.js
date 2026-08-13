// Product analytics (PostHog).
//
// Nothing in this file is allowed to affect the game. Every entry point swallows its own errors,
// exactly as attemptLog.js does: if analytics breaks, is blocked by an extension, or was never
// configured at all, the player answers the next question and never finds out. That is also why
// this is a plain module rather than a React provider — a provider would put analytics inside the
// render tree, and half the interesting moments here (auth transitions, sync) happen in plain
// functions that have no component to hang off.
//
// Two things this module deliberately does NOT do:
//
//   It is never imported by the reducer. src/store/AppStateContext.jsx holds every game rule and
//   is driven directly by the scripts in scripts/ — a reducer that fired network calls would stop
//   being a pure function of its inputs, and `npm run check` would start emitting events. Events
//   are captured from App.jsx's existing callbacks and from read-only effects that watch state,
//   never from inside a `case`.
//
//   It never recomputes a game rule. Anything numeric an event reports is read back from state
//   the reducer has already settled. CLAUDE.md warns about the three places a day's score is
//   computed disagreeing; analytics must not become a fourth.

import posthog from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST;

// False when the keys are absent — a contributor's checkout, or a build where they were not
// configured. Everything below then becomes a no-op rather than an error.
let enabled = false;

// ── Which app sent this? ──────────────────────────────────────────────────────
//
// Everything reports into ONE PostHog project, and this property is what keeps the real numbers
// honest inside it: PostHog's "filter out internal and test users" setting is pointed at
// `environment is not production`, so a day spent testing never lands in the figures.
//
// A separate project per environment is the textbook answer and was rejected deliberately —
// it costs a paid plan, and it would buy nothing this property does not.
//
// Detected from the hostname rather than from a build-time variable, because the failure mode
// matters more than the elegance. A stale or forgotten env var would silently mark staging as
// production and quietly poison the real numbers; a hostname cannot be wrong about itself.
//
// PRODUCTION IS AN EXPLICIT ALLOWLIST, never a fallback. Vercel gives every deployment its own
// hostname (cifri-1cju-git-<branch>-<team>.vercel.app and friends), so anything that tried to
// name the test hosts instead would be out of date by the next branch. Anything unrecognised —
// a new preview URL, a LAN address with the app open on a phone — is treated as test data, which
// is the safe direction to be wrong in.
const PRODUCTION_HOSTS = ['trycifri.com', 'www.trycifri.com'];

function detectEnvironment() {
  try {
    const host = window.location.hostname;
    if (PRODUCTION_HOSTS.indexOf(host) !== -1) return 'production';
    if (/\.vercel\.app$/.test(host)) return 'staging';
    return 'development';
  } catch (e) {
    // No window at all. Not a browser, so not a real player either.
    return 'development';
  }
}

const ENVIRONMENT = detectEnvironment();

// ── Keeping auth tokens out of the URL properties ──────────────────────────────
//
// This is the one piece of this file that is load-bearing for security rather than for tidiness.
//
// PostHog attaches $current_url to EVERY event. Supabase's password-reset and email-confirmation
// links open the app with a live session in the address bar — an access_token in the hash under
// the implicit flow, a `code` in the query string under PKCE (see lib/recoveryLink.js, which
// reads both shapes synchronously for exactly this reason). Left alone, initialising PostHog
// would send working auth tokens to a third party on the very first pageview.
//
// The hash goes unconditionally: this app has no hash routing, so nothing legitimate ever lives
// there and there is no case to weigh. The query string is filtered by name rather than emptied,
// because utm_* parameters on inbound links are real acquisition data and PostHog reads its
// campaign properties out of them.
const SENSITIVE_PARAMS = [
  'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
  'code', 'token', 'token_hash', 'type',
];

function scrubUrl(value) {
  if (typeof value !== 'string' || !value) return value;
  try {
    const u = new URL(value);
    u.hash = '';
    for (const p of SENSITIVE_PARAMS) u.searchParams.delete(p);
    return u.toString();
  } catch (e) {
    // Not a parseable URL. Returning it unchanged would be the optimistic reading; dropping the
    // fragment by hand is the cautious one, and this path only ever sees malformed values.
    return value.split('#')[0];
  }
}

// Applied across the property bag rather than to a fixed list of keys. PostHog carries the URL in
// more places than $current_url alone ($referrer, and the $initial_* copies it pins to the person
// via $set_once), and a new one appearing in a future version must not quietly reopen this hole.
function scrubUrlProperties(props) {
  if (!props || typeof props !== 'object') return;
  for (const k of Object.keys(props)) {
    const v = props[k];
    if (typeof v === 'string' && /url|referrer/i.test(k)) props[k] = scrubUrl(v);
    else if (v && typeof v === 'object' && (k === '$set' || k === '$set_once')) scrubUrlProperties(v);
  }
}

export function initAnalytics() {
  if (!KEY || !HOST) return;
  try {
    posthog.init(KEY, {
      api_host: HOST,

      // Every option below is set explicitly rather than through the `defaults` bundle. The bundle
      // is versioned by date and changes several behaviours at once; naming them individually is
      // longer, but it means upgrading posthog-js cannot silently change what this app collects.

      // Automatic click/interaction tracking. The keypads and the account forms are excluded from
      // it at the DOM level — see the ph-no-capture note below.
      autocapture: true,

      // Deliberately off. It was considered and rejected for this first pass: it records a real
      // person's actual interaction, and the questions this analytics exists to answer (drop-off,
      // streak behaviour, conversion timing) are all answerable from events alone.
      disable_session_recording: true,

      // Web vitals — load and responsiveness on real phones, which is the point on a mobile app.
      capture_performance: { web_vitals: true },

      // Guests get full person profiles, not just events. Cifri's pre-account phase can run five
      // days or more before the fallback prompt fires, and "did this guest come back on day three"
      // is precisely the question that phase exists to answer. 'identified_only' would leave the
      // behaviour of everyone who never signs up — most people — as loose events with no journey
      // behind them.
      person_profiles: 'always',

      // Fires once on load and never again: this app has no router and the address bar never
      // changes, so every screen is React state. Screen movement is reported by the `screen_viewed`
      // event instead. Synthesising $pageview per screen was rejected — they would all carry the
      // same URL, and would corrupt bounce rate and session duration by looking like navigation
      // that did not happen.
      capture_pageview: true,
      capture_pageleave: true,

      before_send: (event) => {
        if (!event) return event;
        try {
          scrubUrlProperties(event.properties);
          // Stamped here rather than registered as a super property, because the initial
          // $pageview is captured DURING init — before any register() call could possibly run.
          // An environment tag that the one guaranteed event is missing is not a filter, it is a
          // leak, so it goes where nothing can be captured ahead of it.
          if (event.properties) event.properties.environment = ENVIRONMENT;
        } catch (e) {
          // A property bag that cannot be scrubbed is a property bag that cannot be shown to be
          // safe, so it does not get sent. Dropping one event costs a data point; sending an
          // unscrubbed one could cost a token.
          return null;
        }
        return event;
      },
    });
    enabled = true;
  } catch (e) {
    enabled = false;
    // Silent in production — a player must never see or feel this. Loud in dev, because a
    // swallowed init failure is indistinguishable from "analytics is working" right up until the
    // day someone goes looking for data that was never collected.
    if (import.meta.env.DEV) console.warn('[analytics] init failed — no events will be sent:', e);
  }
}

// ── Capturing ─────────────────────────────────────────────────────────────────

export function track(event, props) {
  if (!enabled) return;
  try {
    posthog.capture(event, props);
  } catch (e) {
    /* never let analytics interrupt a game */
  }
}

// ── Identity ──────────────────────────────────────────────────────────────────
//
// Called from the same three places attemptLog.js calls setLogOwner(), and for the same reason.
// That set of three is already proven correct against a hard problem — an unsent queue must never
// be inherited by the next person to log in on a shared device — and identity here has the exact
// same failure mode, so it follows the same wiring rather than inventing its own.
//
// Identified by Supabase user id. Never by email: an email address is the one property that would
// make this data personally identifying, and it buys nothing that a UUID does not.

export function identifyPlayer(userId, personProps) {
  if (!enabled || !userId) return;
  try {
    // Merges the anonymous person into this one, so everything played as a guest — possibly days
    // of it — is retroactively attributed to the account. This is the whole guest→account link.
    // PostHog refuses to merge an anonymous id that has already been merged elsewhere, which is
    // what stops two accounts on one device from being conflated.
    posthog.identify(userId, personProps);
  } catch (e) {
    /* as above */
  }
}

// Logging out mints a fresh anonymous id. Without this the next guest on this device would keep
// the previous player's identity and be silently merged into their account on signup — the same
// bug setLogOwner(null) exists to prevent, one layer up.
export function resetIdentity() {
  if (!enabled) return;
  try {
    posthog.reset();
  } catch (e) {
    /* as above */
  }
}

// Context carried on every event from here on, plus the same values pinned to the person so they
// can be segmented rather than only filtered. Registered rather than passed per call, because a
// property that has to be remembered at ~30 call sites is a property that will be forgotten at one.
export function setPlayerContext(props) {
  if (!enabled || !props) return;
  try {
    posthog.register(props);
    posthog.setPersonProperties(props);
  } catch (e) {
    /* as above */
  }
}
