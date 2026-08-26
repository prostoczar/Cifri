// Sends the day's reminder. Runs once an hour.
//
// ── This function knows no game rules, and that is the whole design ───────────────────────────
//
// It never asks "has this player banked today?". The device already answered that, using the one
// copy of the rule that exists — the reducer — and published the answer as an absolute timestamp.
// All that happens here is `now` being compared against it.
//
// The alternative, a job that worked out for itself who had played, would be a second
// implementation of a rule living somewhere nothing tests. CLAUDE.md's warning about the three
// places a day's score is computed disagreeing is the same trap; this one fails just as quietly,
// by telling somebody to play a day they already played.
//
// `scripts/check-notification-tags.mjs` drives the real reducer and asserts the timestamp this
// function reads means what it assumes it means.
//
// ── Why the audience is OneSignal's tags and not our database ─────────────────────────────────
//
// A guest has no row on the server. That is the point of guests, and it is the reason reminders
// are targeted on tags the device publishes: a query against `daily_results` could only ever reach
// players who had signed up, and making it reach the others would mean mirroring guest progress
// server-side — the exact architecture the app is built to avoid.
//
// ── Why only two tags ──────────────────────────────────────────────────────────────────────────
//
// This used to be four kinds of nudge (restore, boost, streak, daily), each needing its own tag to
// know when it applied. The OneSignal plan this app is on rejects a tag write outright once a user
// holds more tags than the plan allows — every write was refused, so nothing was ever deliverable.
// One nudge, "play a session today", needs only two facts: `w` (the hour and language to send in,
// packed into one exact-match value, e.g. "15en") and `c` (credited_until_ms — `now >= c` means
// today is not banked yet).
//
// ── Why the timestamp comparison is safe as a string ──────────────────────────────────────────
//
// OneSignal stores every tag as a string. Millisecond timestamps are 13 digits and stay 13 digits
// until the year 2286, and equal-length digit strings order identically whether compared as text or
// as numbers — so `<` is correct either way. The `w` tag is compared with `=` only, which needs no
// ordering at all. Nothing here relies on OneSignal casting anything.

import { corsHeaders, json } from '../_shared/cors.ts';
import { NOTIFICATION_COPY, LANGS } from '../_shared/notificationCopy.js';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

type Filter = Record<string, string>;

// A tag compared against a value. `field: 'tag'` is OneSignal's way of saying "not one of your
// built-in properties".
function tag(key: string, relation: string, value: string): Filter {
  return { field: 'tag', key, relation, value };
}

/**
 * The audience for this hour's send, in one language.
 *
 * `nowMs` is stamped once per run and reused, so every filter in a run agrees about when "now" is.
 * Deriving it per filter would let a run straddle a midnight and disagree with itself.
 */
function filtersFor(nowMs: number, utcHour: number, lang: string): Filter[] {
  return [
    tag('w', '=', String(utcHour) + lang),
    tag('c', '<', String(nowMs)),
  ];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !apiKey) return json({ error: 'not_configured' }, 500);

  // Only the scheduler may fire this. Without the check, the URL is a button anybody could press
  // to notify every subscriber Cifri has, as often as they liked.
  //
  // FAIL CLOSED. This used to read `if (secret && ...)`, which skipped the check entirely when the
  // variable was absent — so the one endpoint that can notify everybody was one deleted Edge
  // Function secret away from being open to the internet, and nothing would have looked wrong: the
  // scheduled call keeps working either way, because it sends a header nobody was checking. An
  // unset secret is now a refusal, not a waiver.
  //
  // 500 rather than 403 because the two are different problems: 403 means "you are not the
  // scheduler", 500 means "this deployment is misconfigured and nobody can call it". Answering 403
  // to a missing secret would send whoever is debugging it hunting for the wrong thing.
  const secret = Deno.env.get('REMINDER_CRON_SECRET');
  if (!secret) return json({ error: 'not_configured' }, 500);
  if (req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

  // `dryRun` builds and returns the exact payloads without sending, so the targeting can be read
  // and checked against real subscriber counts before anybody's phone lights up.
  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
  } catch {
    /* no body is the normal scheduled call */
  }

  const nowMs = Date.now();
  const utcHour = new Date(nowMs).getUTCHours();

  // Every send, fired at once.
  //
  // This was sequential to begin with, on the theory that the ORDER of the sends was what kept a
  // player to one notification. That was simply wrong: the filters are mutually exclusive by
  // construction, so a player matches exactly one kind regardless of which request lands first.
  // The ordering bought nothing.
  //
  // What it cost was real. Sequential round-trips to OneSignal put the function either side of
  // pg_net's five-second default timeout, so roughly every other scheduled run came back with a
  // null status code — the sends had probably happened, but there was no longer any way to know.
  // A monitoring blind spot on the one job nobody watches is the worst possible place for one.
  const jobs: Array<Promise<Record<string, unknown>>> = [];

  for (const lang of LANGS) {
    const copy = NOTIFICATION_COPY[lang];
    const payload = {
      app_id: appId,
      filters: filtersFor(nowMs, utcHour, lang),
      // See notificationCopy.js: the audience is already narrowed to one language by the `w`
      // filter, so OneSignal's required `en` slot is just a container here.
      headings: { en: copy.title },
      contents: { en: copy.body },
      // A retry, or an overlapping run, replaces the earlier notification on the device instead of
      // stacking a second one beside it.
      web_push_topic: 'cifri-nudge',
      url: Deno.env.get('APP_URL') || 'https://cifri-1cju.vercel.app',
    };

    if (dryRun) {
      jobs.push(Promise.resolve({ lang, dryRun: true, filters: payload.filters }));
      continue;
    }

    jobs.push(
      fetch(ONESIGNAL_API, {
        method: 'POST',
        headers: {
          // New-style API keys use `Key`; the legacy REST keys used `Basic`. Getting this wrong
          // returns a bare 401 with nothing explaining it.
          Authorization: 'Key ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then(async (res) => {
          const out = await res.json().catch(() => ({}));
          // "All included players are not subscribed" is OneSignal's reply to an empty segment,
          // and an empty segment is the normal, correct outcome for most hours of most days.
          // Recorded rather than treated as a failure, so the logs stay readable enough that a
          // real one stands out.
          return {
            lang,
            status: res.status,
            recipients: out.recipients ?? 0,
            id: out.id ?? null,
            errors: out.errors ?? null,
          };
        })
        // One language's send failing must not take the other with it.
        .catch((e) => ({ lang, error: String(e) }))
    );
  }

  // allSettled rather than all, though every promise above already swallows its own failure — it
  // costs nothing and means a future edit that forgets a .catch cannot silently drop the response.
  const settled = await Promise.allSettled(jobs);
  const results = settled.map((s) => (s.status === 'fulfilled' ? s.value : { error: String(s.reason) }));

  return json({ ok: true, utcHour, nowMs, dryRun, results });
});
