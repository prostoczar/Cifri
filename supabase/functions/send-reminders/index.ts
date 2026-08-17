// Sends the day's reminders. Runs once an hour.
//
// ── This function knows no game rules, and that is the whole design ───────────────────────────
//
// It never asks "is this streak about to break?". The device already answered that, using the one
// copy of the rule that exists — the reducer — and published the answer as absolute timestamps.
// All that happens here is `now` being compared against them.
//
// The alternative, a job that worked out for itself who was at risk, would be a second
// implementation of the streak rule living somewhere nothing tests. CLAUDE.md's warning about the
// three places a day's score is computed disagreeing is the same trap; this one fails just as
// quietly, by telling somebody their streak is safe on the evening it dies.
//
// `scripts/check-notification-tags.mjs` drives the real reducer and asserts the timestamps this
// function reads mean what it assumes they mean.
//
// ── Why the audience is OneSignal's tags and not our database ─────────────────────────────────
//
// A guest has no row on the server. That is the point of guests, and it is the reason reminders
// are targeted on tags the device publishes: a query against `daily_results` could only ever reach
// players who had signed up, and making it reach the others would mean mirroring guest progress
// server-side — the exact architecture the app is built to avoid.
//
// ── One notification per player per evening ───────────────────────────────────────────────────
//
// The four kinds are ordered by urgency, and each filter excludes everything above it, so a player
// matches exactly one. The exclusions are plain ANDs — OneSignal cannot express a negated range —
// which works because of a property check 9 of the tag script asserts: when today is not banked, a
// live streak always has a future deadline and a dead one always has zero. So "not at risk" is
// simply `streak_deadline_ms < now`.
//
// ── Why the timestamp comparisons are safe as strings ─────────────────────────────────────────
//
// OneSignal stores every tag as a string. Millisecond timestamps are 13 digits and stay 13 digits
// until the year 2286, and equal-length digit strings order identically whether compared as text or
// as numbers — so `>` and `<` are correct either way. The hour tag is compared with `=` only,
// which needs no ordering at all. Nothing here relies on OneSignal casting anything.

import { corsHeaders, json } from '../_shared/cors.ts';
import { NOTIFICATION_COPY, NUDGE_ORDER, LANGS } from '../_shared/notificationCopy.js';

const ONESIGNAL_API = 'https://onesignal.com/api/v1/notifications';

type Filter = Record<string, string>;

// A tag compared against a value. `field: 'tag'` is OneSignal's way of saying "not one of your
// built-in properties".
function tag(key: string, relation: string, value: string): Filter {
  return { field: 'tag', key, relation, value };
}

/**
 * The audience for one kind of nudge, at this moment.
 *
 * `nowMs` is stamped once per run and reused, so every filter in a run agrees about when "now" is.
 * Deriving it per filter would let a run straddle a midnight and disagree with itself.
 */
function filtersFor(kind: string, nowMs: number, utcHour: number, lang: string): Filter[] {
  const now = String(nowMs);
  // Everyone reached is someone who asked to be, whose chosen hour is this one, and who reads this
  // language. Applied to every kind including the urgent ones: a player who turned reminders off
  // has turned off reminders, and an expiring boost is not an exception somebody agreed to.
  const base: Filter[] = [
    tag('reminders', '=', '1'),
    tag('nudge_utc_hour', '=', String(utcHour)),
    tag('lang', '=', lang),
  ];

  if (kind === 'restore') {
    return [...base, tag('restore_expires_ms', '>', now)];
  }
  if (kind === 'boost') {
    return [...base, tag('boost_expires_ms', '>', now), tag('restore_expires_ms', '<', now)];
  }
  if (kind === 'streak') {
    // A live streak whose deadline is tonight, on a day nothing has been played.
    return [
      ...base,
      tag('credited_until_ms', '<', now),
      tag('streak_deadline_ms', '>', now),
      tag('boost_expires_ms', '<', now),
      tag('restore_expires_ms', '<', now),
    ];
  }
  // daily — today unplayed, and nothing more urgent applies. `streak_deadline_ms < now` covers both
  // "no streak" (the tag is 0) and "the streak already broke", and excludes exactly the at-risk
  // case above.
  return [
    ...base,
    tag('credited_until_ms', '<', now),
    tag('streak_deadline_ms', '<', now),
    tag('boost_expires_ms', '<', now),
    tag('restore_expires_ms', '<', now),
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
  const secret = Deno.env.get('REMINDER_CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

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

  const results: Array<Record<string, unknown>> = [];

  // Ordered most urgent first. Sent sequentially rather than in parallel: the ordering is the
  // thing that keeps one player to one notification, and firing them at once would make the
  // outcome depend on which request happened to land first.
  for (const kind of NUDGE_ORDER) {
    for (const lang of LANGS) {
      const copy = NOTIFICATION_COPY[kind][lang];
      const payload = {
        app_id: appId,
        filters: filtersFor(kind, nowMs, utcHour, lang),
        // See notificationCopy.js: the audience is already narrowed to one language by the `lang`
        // filter, so OneSignal's required `en` slot is just a container here.
        headings: { en: copy.title },
        contents: { en: copy.body },
        // Collapsing on the kind means a retry, or an overlapping run, replaces the earlier
        // notification on the device instead of stacking a second one beside it.
        web_push_topic: 'cifri-' + kind,
        url: Deno.env.get('APP_URL') || 'https://cifri-1cju.vercel.app',
      };

      if (dryRun) {
        results.push({ kind, lang, dryRun: true, filters: payload.filters });
        continue;
      }

      try {
        const res = await fetch(ONESIGNAL_API, {
          method: 'POST',
          headers: {
            // New-style API keys use `Key`; the legacy REST keys used `Basic`. Getting this wrong
            // returns a bare 401 with nothing explaining it.
            Authorization: 'Key ' + apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        const out = await res.json().catch(() => ({}));
        // "All included players are not subscribed" is OneSignal's reply when a segment is empty,
        // and an empty segment is the normal, correct outcome for most hours of most days. Recorded
        // rather than treated as a failure, so the logs stay readable enough to spot a real one.
        results.push({
          kind,
          lang,
          status: res.status,
          recipients: out.recipients ?? 0,
          id: out.id ?? null,
          errors: out.errors ?? null,
        });
      } catch (e) {
        // One kind failing must not stop the rest. A network blip during the restore send should
        // not also cost everybody their daily reminder.
        results.push({ kind, lang, error: String(e) });
      }
    }
  }

  return json({ ok: true, utcHour, nowMs, dryRun, results });
});
