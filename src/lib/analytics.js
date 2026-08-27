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
//
// ── Why posthog-js is imported dynamically ────────────────────────────────────
//
// posthog-js is ~248 kB raw / ~80 kB gzipped — roughly 30% of the shipped JavaScript for a
// mobile-first app. Imported statically it sat in the entry chunk, so a player on a phone
// downloaded and parsed the whole analytics SDK before the first question could be drawn.
// It is now its own chunk, fetched once the first paint is done.
//
// Deferring a module whose entire job is to record what happens at startup is only safe if
// nothing that happens before it arrives is lost. So every entry point below is callable from
// the first tick and records into `pending` until the real module lands. The lighter entry
// points posthog ships (dist/module.slim.js et al) were measured and rejected — see the note
// above `loadPosthog` for the numbers.

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST;

// Whether this build was given keys at all — a contributor's checkout, or a build where they
// were not configured. Everything below then becomes a no-op rather than an error. Checked
// synchronously so an unconfigured build never even requests the chunk.
const configured = Boolean(KEY && HOST);

// The module, once it has arrived AND initialised without throwing. Null means "not yet, or
// never" — the two are deliberately indistinguishable to callers, because the correct
// behaviour is the same for both: buffer, and never let the player notice.
let posthog = null;

// False until init() has actually succeeded. Kept separate from `posthog` being non-null so a
// module that loads but fails to initialise cannot be captured into.
let enabled = false;

// Set when the chunk failed to load, or loaded and failed to initialise. Distinct from `!enabled`,
// which also covers "not yet". This one means "never", and it is what stops `pending` refilling to
// its cap for the rest of a session that can no longer send anything.
let unavailable = false;

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
//
// cifri.app is the canonical domain as of the 27 August 2026 cutover. trycifri.com now 301s to it
// and should never serve the app again, but it stays on this list deliberately: a redirect can be
// mis-configured, a DNS change can take a day to reach everyone, and a real player who arrives on
// the old host during that window is still a real player. Dropping it would file those sessions
// as development and hide them behind the filter — the one direction this list must not be wrong
// in for a host that genuinely serves players.
const PRODUCTION_HOSTS = ['cifri.app', 'www.cifri.app', 'trycifri.com', 'www.trycifri.com'];

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

// ── Buffering the startup events ──────────────────────────────────────────────
//
// One ordered queue, not one per operation. identify(), reset() and capture() are only
// meaningful relative to each other: a reset that replayed after the captures it was supposed
// to precede would attribute the previous player's games to the next one — the exact bug the
// resetIdentity() comment below exists to prevent. Order is the correctness property here, so
// there is a single list of thunks and it is replayed front to back.
const pending = [];

// A player whose chunk never arrives — offline, blocked by an extension, a failed deploy —
// would otherwise grow this list for the whole session. The cap is far above a realistic
// session (a long day of play is dozens of events, not hundreds) so in practice it never
// binds; it is a memory guard, not a sampling policy. Once full, later events are dropped
// rather than earlier ones: the startup events are the ones the deferral put at risk, so they
// are the ones worth keeping.
const MAX_PENDING = 250;

function enqueue(op) {
  // Nothing will ever flush once the chunk is known to be gone, so holding events past that point
  // only grows a list nobody will read. Without this the queue refills to MAX_PENDING and stays
  // there for the rest of the session.
  if (unavailable) return;
  if (pending.length < MAX_PENDING) pending.push(op);
}

function flushPending() {
  // Spliced out before replaying: an op that somehow re-enters one of the entry points must
  // append to a fresh queue rather than mutating the list being iterated.
  const ops = pending.splice(0, pending.length);
  for (const op of ops) {
    try {
      op();
    } catch (e) {
      /* one un-replayable event must not cost the rest of the queue */
    }
  }
}

// After the first paint, without ever waiting for a paint that may not come.
//
// requestIdleCallback is the whole mechanism: idle periods only begin once the browser has
// finished rendering, so it already means "after the paint", and its timeout is the ceiling for
// a player who starts answering immediately and never leaves the main thread idle.
//
// requestAnimationFrame was tried here first and is wrong. A tab that starts hidden — a link
// opened in the background, a restored session, a page reload while the player is in another
// app — never runs a rAF callback at all, so the SDK would never be requested, and every event
// would sit in `pending` until the session ended. That is precisely the silent data loss this
// buffering exists to prevent, so the paint is inferred from idleness instead of waited on.
function afterFirstPaint(fn) {
  if (typeof window === 'undefined') return;

  // A hidden tab has no render work to yield to, so there is nothing to schedule around. Start
  // the fetch now: import() is asynchronous regardless, so this still cannot block a render.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    fn();
    return;
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 2000 });
    return;
  }

  // Safari only shipped requestIdleCallback in 16.4 and this app's audience is heavily iOS, so
  // this is a main path rather than an edge case. A plain delay is the closest honest
  // approximation: long enough to be clear of the first render, short enough that a player who
  // bounces in the first second still has their events sent.
  setTimeout(fn, 1000);
}

// The lighter entry points were measured, not assumed. On posthog-js 1.415.4:
//
//   posthog-js (dist/module.js)                      904.88 kB raw / 267.26 kB gzipped
//   dist/module.slim.js alone                        785.82 kB raw / 230.47 kB gzipped
//   dist/module.slim.js + dist/extension-bundles.js  915.17 kB raw / 270.86 kB gzipped
//
// The slim entry point drops src/autocapture.ts and src/extensions/web-vitals/index.ts — the
// only two extensions this app actually turns on — so the middle row is not a shippable
// configuration. Putting them back via extension-bundles.js costs more than slim saved,
// because dist/*.js are separately pre-bundled artifacts: the two files duplicate posthog's
// shared runtime and the minified bundle does not tree-shake down to the one group used.
// The documented `posthog-js/slim` subpath that would avoid this does not exist in 1.415.4
// (package.json has no `exports` map, and `files` ships no top-level slim/ directory), and
// the unbundled lib/ tree is CommonJS, so it cannot tree-shake either. Worth re-measuring
// when posthog-js ships real subpath exports; until then the win is in the deferral, not the
// entry point.
let requested = false;

function loadPosthog() {
  if (requested) return;
  requested = true;
  import('posthog-js')
    .then((mod) => {
      initPosthog(mod.default);
      flushPending();
    })
    .catch((e) => {
      // The chunk did not arrive. Everything buffered is now unsendable, so let it go rather
      // than hold it for a session that will never flush.
      unavailable = true;
      pending.length = 0;
      if (import.meta.env.DEV) console.warn('[analytics] posthog-js chunk failed to load:', e);
    });
}

export function initAnalytics() {
  if (!configured) return;
  afterFirstPaint(loadPosthog);
}

function initPosthog(ph) {
  try {
    ph.init(KEY, {
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
      //
      // posthog raises this one itself at init, so unlike the events routed through track() it
      // cannot be timestamped from when it truly happened — it now lands just after the first
      // paint rather than just before it. It is still exactly one pageview per load, which is
      // what the bounce and session metrics are counting; only its clock moved, by about the
      // length of one paint.
      capture_pageview: true,
      capture_pageleave: true,

      before_send: (event) => {
        if (!event) return event;
        try {
          scrubUrlProperties(event.properties);
          // Stamped here rather than registered as a super property, because the initial
          // $pageview is captured DURING init — before any register() call could possibly run.
          // An environment tag that the one guaranteed event is missing is not a filter, it is a
          // leak, so it goes where nothing can be captured ahead of it. Deferring init does not
          // change that ordering: setPlayerContext() is buffered and replays after init, so the
          // $pageview still lands strictly before the first register().
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
    posthog = ph;
    enabled = true;
  } catch (e) {
    posthog = null;
    enabled = false;
    // The module arrived but will never work, which is as final as it never arriving.
    unavailable = true;
    pending.length = 0;
    // Silent in production — a player must never see or feel this. Loud in dev, because a
    // swallowed init failure is indistinguishable from "analytics is working" right up until the
    // day someone goes looking for data that was never collected.
    if (import.meta.env.DEV) console.warn('[analytics] init failed — no events will be sent:', e);
  }
}

// ── Capturing ─────────────────────────────────────────────────────────────────

export function track(event, props) {
  if (!configured) return;
  if (!enabled) {
    // Stamped now, sent later. Without this every event a player produced before the chunk
    // landed would arrive bearing the load time instead of its own, and the first minute of a
    // session — the part the deferral touches, and the part drop-off analysis reads — would
    // collapse into a single instant.
    const at = new Date();
    enqueue(() => posthog.capture(event, props, { timestamp: at }));
    return;
  }
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
  if (!configured || !userId) return;
  if (!enabled) {
    enqueue(() => posthog.identify(userId, personProps));
    return;
  }
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
  if (!configured) return;
  if (!enabled) {
    enqueue(() => posthog.reset());
    return;
  }
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
  if (!configured || !props) return;
  if (!enabled) {
    enqueue(() => {
      posthog.register(props);
      posthog.setPersonProperties(props);
    });
    return;
  }
  try {
    posthog.register(props);
    posthog.setPersonProperties(props);
  } catch (e) {
    /* as above */
  }
}
