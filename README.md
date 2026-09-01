# Cifri

Daily math. Sharper mind.

A mobile mental-arithmetic trainer: a timed daily Challenge, a Braining brain-age test, custom
Practice drills, and a library of mental-maths Tricks, tied together by a shared daily streak.

## Branches

| Branch | What it is |
|---|---|
| `main` | The original single-file prototype. Served trycifri.com until the 27 August 2026 cutover; serves nothing now. |
| `react-rewrite` | The React rewrite. This branch, and the live app at **cifri.app**. |

## Running it

```bash
npm install
npm run dev             # http://localhost:5173
npm run dev -- --host   # also reachable from a phone on the same network
```

Other commands:

```bash
npm run build             # production build into dist/
npm run preview           # serve that build locally
npm run lint              # oxlint
npm run check:projection  # verify the daily-score arithmetic (see "How a day is scored")
```

`check:projection` is worth knowing about: a mistake in how a day's score is averaged would not
crash anything, it would quietly record wrong numbers. The check runs the real projection over a
fixed history that spans both scoring eras and asserts the rows that come out.

## Layout

```
src/
  App.jsx            screen/tab routing, overlays, session wiring
  index.css          the whole design system, ported verbatim
  i18n_data.js       every UI string, English and Russian
  store/             game logic and persisted state (no React inside)
  lib/               everything that talks to Supabase, plus sync bookkeeping
  hooks/             game loops and gestures
  screens/           full screens
  components/        shared pieces
reference/
  original-prototype.html    the v18.3 prototype this was ported from
```

State lives in one reducer (`store/AppStateContext.jsx`) and persists to `localStorage`.

## How a day is scored

The two modes score a day differently, and deliberately so.

**Challenge** has no daily cap. Every play counts, and the day's score is the **average of that
day's plays** — play once and it is that score, play again and it is the mean of both. Playing
again is a real gamble: it can pull the day's number down as easily as push it up, which the
button's small print says out loud rather than hiding.

Two things are deliberately insulated from that gamble:

- **The streak** is credited by the day's *first* Challenge play and never revisited. How often
  someone plays changes their number, never whether the day counted.
- **Personal best** tracks the best *single* run, so a bad replay dragging the day's average down
  can never cost someone a record they actually set.

**Braining** is untouched by any of this: one official trial per day, retries are practice, exactly
as before. `daily_results` enforces the separation rather than trusting it — a Braining row
carrying Challenge's averaging columns is rejected by the database.

The single definition of a day's score lives in `store/selectors.js` (`dayAverage`), and the chart,
the stat boxes, the result screen and the server-side projection all read it from there, so none of
them can quietly disagree about what a player scored.

*Averaging only the day's counting runs is also what makes the rule work backwards.* Days played
under the old first-trial-only model hold exactly one counting run plus some practice, so their
average is that single score — the number they always showed. No history was rewritten.

## The streak, and the boost that replaced it

**Either mode earns the day.** A day counts toward the unified streak if Challenge *or* Braining
was played — one alone is enough, and the streak only breaks on a day with neither. It used to
require both. The header pill still has three states, and they still mean something, but no
longer what they used to: grey is nothing played and the streak at risk, green is the day
secured by one mode, yellow is both modes done.

Requiring both was how the app made a case for playing both, so removing that requirement removes
the argument with it. **Completing Braining now grants a single 5% boost to the next Challenge
attempt played that day** — a smaller, opt-in reason to do both, in place of a rule that
punished doing one.

The boost is deliberately narrow:

- One attempt, not the day. The *next* counting Challenge attempt takes it, and the flag clears.
  Attempts already played before Braining finished are never revisited.
- No carry-over and no stacking. `brBoostDay` holds the day the boost was granted *for*, not a
  bare "available" flag, and whoever spends it compares that against today. A boost left unspent
  is dead once the date rolls over — expiry is a property of the shape of the data, not of a
  timer that has to fire at midnight.
- A Practice run neither grants it nor spends it, and a run that scored zero cannot burn it.

**A boosted attempt shows its working.** It is stored with the boosted value as its score, the
raw value it was earned at, and an explicit `boosted: true` — plus a timestamp, which both modes
now carry, because Challenge and Braining sessions live in separate lists and without one there
is no way to prove the boosted attempt came *after* the trial that granted it. So a day whose sum
exceeds its raw scores is explained and re-derivable, not an unaccountable discrepancy. That is
what the next session's server-side validation checks against.

The percentage and its rounding live in `store/scoring.js` — one figure, in one place, meant to
be retuned. `npm run check:projection` verifies both the averaging and the boost's own rules: a
boosted attempt contributes its boosted value, that value really is the constant applied to the
raw one, and a day never holds more than one boosted attempt.

**Milestones never read the score.** Perfect Run counts answers and mistakes, Medium and Hard
read the difficulty played, Braining's read time and brain age. None of them look at the score
number, which is what makes a boosted score unable to unlock anything a raw score could not.

## Accounts and stored data

Accounts are real: Supabase auth, cross-device sync, and Row Level Security under which a player
can only ever read or write their own rows. Every call that touches Supabase lives in
`lib/accountApi.js`; screens stay presentational. `supabase/migrations/` is the schema record.

Four tables, all keyed to the auth user and all RLS-protected:

| Table | What it holds |
|---|---|
| `profiles` | username, full name, avatar, `leaderboard_visible` |
| `player_state` | the whole app state as one JSON blob — this is what restores a player on login |
| `question_attempts` | one row per question answered, in any mode |
| `daily_results` | one row per player / day / mode / difficulty, shaped for ranking |

**`question_attempts`** records operation, digit count, term count, time taken, right/wrong,
timestamp, difficulty, and whether the run counted. Append-only — no update or delete policy *and*
no grant — so answer history cannot be rewritten. Attempts buffer in memory during a game, are
stamped once it ends (whether a run counted is only knowable then), and upload as a batch via a
localStorage outbox that survives being offline. Guest attempts are adopted by the account at
signup. Uploads are at-least-once, de-duplicated by a `(user_id, client_id)` unique index.

**`daily_results`** is *derived* from `player_state` rather than recorded alongside it, so the two
cannot drift apart. It exists so a future leaderboard reads a sorted index instead of parsing every
player's JSON; partial indexes cover top scores by difficulty, fastest Braining times, and longest
streaks. Streak values are null on rows backfilled from history — a past day's streak is not
reconstructible once restores are involved.

Challenge rows carry `attempt_count` and `score_sum` alongside `score`, and the score is the average
of those two. Storing a running count and sum rather than one row per play is what keeps a day one
row of one size however often somebody plays — a fifth play is a bigger sum, not a fifth row. Both
columns are null on Braining rows, and the row-shape constraint refuses any row that mixes the two
models up.

`supabase/verification/` holds the SQL that re-proves RLS after a schema change. It sits down as a
row's owner, as another player, and as a logged-out visitor, attempts every cross-account read and
write, and reports what the database actually did — run it in the SQL editor after applying a
migration that touches these tables, rather than assuming policies survived. It needs only one real
account: the owner. The other player is whoever else exists, or an impersonated stranger if nobody
does, since these policies compare `auth.uid()` to a row's owner and never ask whether that uid is
a real account.

**`profiles.leaderboard_visible`** is dormant: `false` for every account, no UI, nothing reads it.
A placeholder so that when leaderboards launch, appearing on one has to be a deliberate act.

Nothing exposes one player's data to another. There is no view or function returning another
player's rows, and cross-account access is tested by attempting it, not assumed.

Two things deliberately left for a future session: `leaderboard_visible` is settable by a player
via the API (the "update own profile" policy covers every column), so a real consent gate is
needed at launch; and scores arrive from the device and are trusted, which matters once they rank
players against each other.

### Where auth emails send people back to

Every Supabase email carrying a link — password reset, signup confirmation, email change — is told
where to land by `lib/authRedirect.js`, which returns the origin the request was made from. Nothing
is written down, so the same code is correct on a laptop, on a phone over Wi-Fi, on a Vercel
preview, and on the real domain once it is live. Do not replace it with a fixed URL.

The other half is in the Supabase dashboard, under **Authentication → URL Configuration**, and it
is the half that fails quietly. A `redirectTo` the project does not recognise is not rejected — it
is silently swapped for the **Site URL**, so a perfectly correct address computed in the app still
lands somewhere else. That is what used to happen: the allowlist knew only the dev machine, so a
reset requested from the deployed site fell back to a Site URL of `http://localhost:3000` and sent
real people to a dead address on a computer they do not own.

| Setting | Value |
|---|---|
| Site URL | `https://cifri.app` — the canonical domain, and the fallback a stray `redirectTo` lands on |
| Redirect URLs | `http://localhost:5173/**`, `http://192.168.1.25:5173/**`, `http://macbook-air-van-bogdan.local:5173/**`, `https://cifri-1cju.vercel.app/**`, `https://cifri-*.vercel.app/**`, `https://cifri.app/**` |

`https://cifri-*.vercel.app/**` is there because preview deployments get a fresh hostname every
time and could never be listed one by one. A new dev machine — or a new Wi-Fi network, which
changes the `192.168.*` address — needs its address added here, or resets asked for from it will
land on the Site URL instead.

The `trycifri.com` entries were removed at the 27 August 2026 cutover rather than kept as a
transition fallback, and the reasoning is worth recording because it does not generalise: the old
domain now 301s to `cifri.app`, so the app can no longer RUN at that origin and no new auth request
can be made from it. The only thing an entry could still serve is a reset email sent before the
cutover — and every account was deleted that same day, so there were none. On a domain with real
players, keep the old entries until the outstanding links have expired.

### Cross-device restore

The server's copy normally wins when an account loads — that is what makes picking up your history
on a second phone work. It must *not* win when this device holds progress the server has never
seen, or offline play is destroyed on reconnect. `lib/syncBaseline.js` records a fingerprint of
what the device last confirmed the server to be holding:

| Baseline | Behaviour |
|---|---|
| absent for this account | adopt the server — first login on a device |
| matches local state | adopt the server — genuinely newer elsewhere |
| differs from local state | keep local and upload it — played offline |

Written only after a confirmed upload or straight after a download, never optimistically, and
dropped on sign-out. A genuine conflict — offline play on two devices at once — is last-writer-wins.

### OPEN BUG — a signed-in device silently reset itself to a fresh install

**Status: open, unreproduced, not fixed. Severity: data loss.** Observed once, on 1 September 2026,
during the Capacitor session. It is written up at this length because it was seen exactly once and
the evidence will not survive in anyone's memory.

**This is not a native bug.** It was found on iOS, but nothing about the mechanism is specific to a
webview — it lives in session handling and the day boundary, both of which are shared verbatim with
the browser. **Assume web players are exposed until proven otherwise.** Filing it under the
wrappers would bury the most important thing about it.

**What was seen.** A device signed in as a real account, holding a played Challenge run, was
killed and relaunched. It came back as a FIRST-RUN INSTALL: the onboarding screen, and
`cifri_react_v1` rewritten to defaults — `username: ''`, `acctCreated: false`, `_loggedOut: true`,
every `db` best back to `0`. The Supabase token `sb-<ref>-auth-token` was gone from `localStorage`
entirely. So the app did not merely fail to restore a session; it took the logged-out branch and
ran the wipe, writing the cleared state back to disk.

Nothing was lost in that instance only because the scores had already reached the server, and a
second device still held them. A player with one phone would have lost everything not yet synced,
and would have been shown a brand-new app.

**What is NOT the cause.** A later attempt to reproduce it — sign in, kill, relaunch — SURVIVED
intact: token present, `username: 'Cifri'`, both bests correct. A plain restart is therefore fine,
and `localStorage` persistence in the webview is not the problem. The wipe writes proved the
storage works.

**The two confounds.** Between the sign-in and the restart that wiped, exactly two unusual things
happened, and the successful reproduction had neither:

1. **Midnight passed.** The session was created at ~23:45 and the restart was at ~00:05.
2. **A second device signed into the same account** and recorded a run against it.

One observation cannot separate them, and they may both be required.

**Why the second one is the prime suspect.** This is the third bug in this project with a second
device in it, and the family resemblance is close enough to be worth stating plainly:

- The **account-creation wipe** — a signup probing an existing email signed in on the real client,
  which fired `SIGNED_IN`, which made the store adopt the server's copy over guest progress the
  player was mid-way through saving. The fix is the separate probe client in `lib/supabaseClient.js`.
- The **two-device race** that `lib/syncBaseline.js` exists to arbitrate, where "server differs from
  local" was indistinguishable from "this device has unsynced play".

Both had the same shape: **a routine, unattended write made a second actor's state look
authoritative, and something local was discarded to match it.** That is what appears to have
happened again.

There is a third, even closer precedent, and it has ALREADY BEEN RULED OUT — recorded here so
nobody spends an afternoon rediscovering it. Commit `2e03e02` fixed `signOut()` defaulting to
Supabase's GLOBAL scope, which revoked the refresh token for every session on the account, so
logging out on one device silently signed the player out everywhere. That is this bug's symptom
almost exactly. It is not the cause: all five `supabase.auth.signOut()` call sites now pass
`{ scope: 'local' }` and no Edge Function revokes anything. What it does establish is that
"one device's action destroys another device's session" is a failure mode this codebase has
produced before — and, since no local sign-out can now revoke a remote token, that the missing
token arrived some OTHER way: a refresh that failed and was not retried, or the app clearing its
own storage. Those two are worth separating first, because they need different fixes.

**Where to start looking.** The **automatic midnight streak check** is the first hypothesis. The
interval in `App.jsx` (~line 244) watches `dayKey()` and, the moment the day turns, dispatches
`CHECK_STREAK_BREAK` and `AMBIENT_ACHIEVEMENTS_CHECK` with nobody touching the screen. That is
precisely the ingredient the earlier race had — an unattended background write — now firing at the
exact moment the observed failure occurred. Worth checking what it writes when the day rolls over
while a second device is concurrently syncing the same account, and whether a baseline or a session
can be invalidated by that interleaving.

**How to reproduce.** Do not wait for a real midnight. Use the day-shifting technique: shift the
stored day fields back, leave a second device signed into the same account, let the interval fire,
then restart. `check:sync-conflict` and `check:signout` are the scripts closest to this ground, and
neither currently covers "the day turns while another device is writing".

## Analytics

PostHog, added because the pre-account period cannot be recovered once it is missed: most people
who try this app will never sign up, and nothing was recording what they did before leaving.

`lib/analytics.js` holds all of it — a plain module, not a React provider, following
`lib/attemptLog.js`: every entry point swallows its own errors, so a blocked script or a dead
network costs a data point and never a game. Initialised from `main.jsx` before the first render.

**Nothing captures from inside the reducer.** `store/AppStateContext.jsx` is driven directly by the
scripts in `scripts/`, and a `case` that fired a network call would stop being a pure function and
would emit events every time `npm run check` ran. Events fire from App.jsx's existing callbacks and
from read-only effects that watch state. Anything numeric an event reports is read back from state
the reducer has already settled, never recomputed — a day's score is derived in enough places
already.

### What is collected

Autocapture and web vitals, plus roughly 25 deliberate events: `game_started` / `game_completed` /
`game_quit` (all four modes, distinguished by a `mode` property), the account funnel
(`account_prompt_shown` → `account_create_started` → `account_created`, each carrying which of the
six conversion surfaces it came from), the streak lifecycle, `achievement_unlocked`, `screen_viewed`,
and settings changes. Every event carries context: `is_guest`, `lang`, `streak`,
`achievements_unlocked` and friends.

`game_completed` for Challenge carries `day_average_before` / `_after` / `_delta`, which is the one
thing about a replay that cannot be reconstructed afterwards.

There is deliberately no separate event for the Braining boost. "Earned" is `game_completed` with
`mode=braining, is_practice=false`; "spent" is a Challenge completion with `boost_applied`. A
dedicated pair would be a second way to say the same thing.

`screen_viewed` exists because this app has no router — the address bar never changes, so PostHog's
automatic pageview fires once on load and never again. Synthesising a `$pageview` per screen was
rejected: they would all carry the same URL and would corrupt bounce rate and session length by
looking like navigation that never happened.

### Privacy

**Session replay is off** (`disable_session_recording: true`). It was considered and declined — it
records more of a real person's interaction than this needs, and drop-off, streak behaviour and
conversion timing all come out of events alone. Turning it on later should be a deliberate decision,
not a side effect.

Never sent: email, username, full name, question text, answers, Supabase tokens. Identity is the
Supabase user id, a UUID, and nothing else.

Three things are actively defended rather than merely avoided:

- **Auth tokens in the URL.** Password-reset links open the app with a live token in the address bar
  (see `lib/recoveryLink.js`), and PostHog stamps `$current_url` onto every event — so switching it
  on naively would send working tokens to a third party. `before_send` strips the hash and the named
  auth params from every URL-ish property, including the `$set_once` copies pinned to the person.
  `utm_*` survives, because that is acquisition data rather than a token.
- **The keypads.** They are grids of buttons labelled 1–9, and autocapture records the text of what
  was clicked — a tap sequence would reconstruct the player's answer exactly. All three keypads carry
  `ph-no-capture`. The answer field itself is an `<input>` and was already masked.
- **The account screens.** All five carry `ph-no-capture` at the container, not per field, so a field
  added later is covered by default rather than by remembering.

### Guest → account

`identifyPlayer()` / `resetIdentity()` are called from the same three places `attemptLog.js` calls
`setLogOwner()`, because that set is already proven against the same problem. `identify()` on adopt
and on bootstrap merges the anonymous person into the account, so days of guest play are attributed
retroactively. `reset()` on sign-out mints a fresh anonymous id — without it the next guest on a
shared device would inherit the previous player's identity.

### One project, and the `environment` tag

Everything reports into a single PostHog project (`Cifri — Dev`). A project per environment is the
textbook answer and was rejected on price: a second project means a paid plan, and buys nothing the
`environment` property does not.

Every event is tagged from the hostname:

| Host | `environment` |
|---|---|
| cifri.app, www.cifri.app, trycifri.com, www.trycifri.com | `production` |
| anything `*.vercel.app` | `staging` |
| anything else — localhost, a LAN address | `development` |

Detected from the hostname rather than a build-time variable because of how each fails: a forgotten
env var would mark staging as production and quietly poison the real numbers, and a hostname cannot
be wrong about itself. **Production is an explicit allowlist, never a fallback** — Vercel mints a new
hostname for every deployment, so anything unrecognised is treated as test data, which is the safe
direction to be wrong in.

Stamped inside `before_send` rather than registered as a super property, because the initial
`$pageview` is captured *during* init, before any `register()` call could run.

PostHog is then set to exclude it: **Settings → Project → Customization → "Filter out internal and
test users"**, with `environment ≠ staging` and `environment ≠ development`, and *Enable this filter
on all new insights* turned on.

Note that those filters define what is **kept**, not what is removed — an `environment = staging`
filter would show nothing but test data. PostHog warns about this ("you've added an inclusive
filter") if you get it the wrong way round.

> **An empty insight is the correct result until cutover.** Every event so far comes from staging or
> localhost, so with the filter on there is genuinely nothing to show — that is an accurate count of
> real users, not a bug. Toggle the filter off on any insight to see your own activity. This also
> catches events sent before the tag existed: PostHog's "doesn't equal" excludes events where the
> property is missing, so no historical cleanup is needed.

### Environment variables and cutover

`VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`, alongside the Supabase pair in `.env.local`. Both are
client-side values that end up in the bundle; leaving them unset disables analytics entirely, which
is what a contributor's checkout should do.

They are read at **build** time — Vite compiles `import.meta.env.VITE_*` into the bundle as literal
strings — so changing one in Vercel does nothing until a redeploy, and the redeploy must not reuse
the build cache. A missing key fails silently by design, which means the site looks perfectly healthy
while collecting nothing.

`cifri-1cju` is the rewrite's Vercel project and `react-rewrite` is its production branch, so both
`cifri.app` and `cifri-1cju.vercel.app` are served from the same deployment. The `.vercel.app`
address is kept ON PURPOSE rather than tidied away: it is the only host that tags itself `staging`,
which makes it the one place the real app can be exercised without the session landing in the live
figures.

The `cifri` project, which served trycifri.com from `main`, was deleted at the cutover once the
redirect was verified.

## Push notifications

Reminders are delivered by **OneSignal** (app "Cifri", web platform, origin
`https://cifri.app`). Nothing about them is allowed to touch a game rule.

The origin is not cosmetic. OneSignal validates the page against it, and when the app moved to
`cifri.app` while this still said `cifri-1cju.vercel.app`, `OneSignal.init()` never settled — which
stalls the `OneSignalDeferred` queue, so the callbacks behind `requestPermission()` and
`isSubscribed()` never ran and their promises never resolved. The visible symptoms were a reminders
toggle that would not switch on and an opt-in card that froze the app on "yes". Neither reported an
error, because both promises resolve only on the success path. If push ever hangs rather than
failing, check this setting first.

### Why the app had to become installable first

Apple delivers web push **only** to a site added to the Home Screen and opened from there. In an
ordinary iPhone browser tab the permission prompt cannot even be shown. So `public/manifest.json`
and the icons beside it are not polish — without them, no iPhone player can ever receive anything.
`public/OneSignalSDKWorker.js` is the service worker that receives pushes while the page is closed;
**its filename is part of OneSignal's contract** and renaming it breaks push silently.

The worker deliberately does no offline asset caching. The app already works offline through
`localStorage`, so caching would buy nothing and would add a way to serve a stale bundle.

`viewport-fit=cover` is deliberately absent. It would let the app paint under the notch, but the
header and bottom nav are both `position: fixed` and would slide under the system UI until every
screen learned about safe-area insets. iOS letterboxes in `theme_color` instead.

### The rule lives in the reducer, not in the sender

`supabase/functions/send-reminders/` never asks whether today has been played. The device answers
that with the reducer — the only copy of the rule — and publishes the answer as an absolute
timestamp in `src/lib/notificationTags.js`. The function only compares it to `now`.

A job that decided for itself who had played would be a second implementation of the rule, failing
the same quiet way everything else here fails: by telling somebody to play a day they already
played. `npm run check:notify` drives the real reducer and asserts the tag it publishes means what
the sender assumes it means.

A timestamp rather than a date string, because a OneSignal segment compares a tag against a
**fixed** value and "today" is not fixed. Storing when a thing expires turns the question into
`now > x`, and carries the player's local midnight inside it for free.

### One nudge, and two tags

There is exactly one message: play a session today to keep your streak going. It needs two facts,
carried as two OneSignal tags. Two, not more, because the OneSignal plan this app is on rejects a
tag write outright once a user holds more tags than the plan allows — a design that once tried to
express four different nudges across ten tags found that out by having every write silently
refused.

| Tag | Meaning |
|---|---|
| `w` | the chosen local hour (converted to UTC) and language, packed into one exact-match string, e.g. `15en`. Empty string when reminders are off — OneSignal deletes a tag set to `""`. |
| `c` | `credited_until_ms` — `now >= c` means today is not banked yet. |

The send filter is just `w = "<hour><lang>"` AND `c < now`.

### Guests get reminders too

Targeting is entirely on tags the device publishes, never on a database query. A guest has no row
on the server — that is the point of guests — so a query could only ever reach people who had
signed up, and fixing that would mean mirroring guest progress server-side.

Signing in additionally calls `OneSignal.login(<supabase user id>)` so one person on two devices is
one recipient; signing out calls `logout()`, without which the next person to use that browser
would inherit the previous player's tags.

No username, no email, no scores go to OneSignal. `check:notify` enforces a tag allowlist.

### Consent

The dashboard's own auto-prompt is switched **off**. A browser "Block" cannot be undone from inside
the app, so it is only ever spent after the player says yes to `NotifOptInCard`, which appears once
a first day is banked — never in onboarding, where nobody has played yet and where on iPhone the
prompt could not appear at all. Asked once per device, ever; the settings row is the way back.

The preference (`settings.notif`) is in `SYNCED_KEYS` and follows the player. The **subscription is
per-device and never synced** — a browser permission belongs to one browser, so the settings toggle
reads on only when the preference *and* this device's subscription agree.

### Dashboard settings that matter

| Setting | Value | Why |
|---|---|---|
| Permission prompt | exists, **Auto Prompt off** | OneSignal requires at least one to exist; ours does the asking |
| Welcome notification | off | fires on subscribe, says nothing, and cannot be localised |
| Click behaviour | **Origin + Focus** | the app has no router, so "navigate" would reload and discard a game in progress, and a new tab would mean two reducers writing one `localStorage` key |
| Persistence | off | a reminder is a nudge, not an alarm |
| Identity Verification | off | would need a signed token per player per login; revisit if notifications ever carry anything private |

### Deploying it

```bash
npx supabase functions deploy send-reminders
```

Secrets it needs (dashboard → Project Settings → Edge Functions → Secrets):

| Name | Notes |
|---|---|
| `ONESIGNAL_REST_API_KEY` | secret. New-style key, sent as `Authorization: Key …` — the legacy keys used `Basic` |
| `ONESIGNAL_APP_ID` | public, but the function needs its own copy |
| `REMINDER_CRON_SECRET` | any long random string; checked against an `x-cron-secret` header |
| `APP_URL` | optional, where a tapped notification opens |

`verify_jwt = false` for this one function — its caller is a scheduler, not a player. The cron
secret is what guards it, and it matters: an open endpoint that notifies every subscriber is a
button anyone could press.

Send a `{"dryRun": true}` body to get the exact filters back without anything being delivered.

The hourly schedule is `supabase/verification/0010_schedule_reminders.sql`, run by hand in the SQL
editor like the RLS checks beside it. It lives there rather than in `migrations/` because it
carries the cron secret, and a committed migration is the wrong home for the value that stops
anyone on the internet notifying every subscriber. The dashboard's Cron UI does the same job, but
only appears once `pg_cron` is enabled — which is why it is easy to go looking for and not find.

**Push subscriptions do not survive a domain change.** They are bound to one origin, so the move to
`cifri.app` on 27 August 2026 invalidated every existing subscription and each device had to
re-subscribe from scratch. That was free — every subscriber was a test device — and it is the
argument for having cut over before there were real ones. It also means the installed Home Screen
app has to be DELETED and re-added after such a move: the old service worker is bound to the old
origin and a reload will not replace it.

## The native wrappers (iOS and Android)

The same web app, wrapped by [Capacitor](https://capacitorjs.com) so it can be installed from the
App Store and Play Store. There is no second codebase and no second copy of any game rule: the
wrapper serves the ordinary `dist/` build inside a system webview, so `cifri.app` and the installed
app run identical JavaScript.

| | |
|---|---|
| App identifier | `app.cifri` — the reverse of the domain, and **permanent once published** |
| Display name | `Cifri` |
| Committed | `ios/` and `android/` project folders, `capacitor.config.json` |
| Not committed | each project's copy of `dist/`, build output, `android/local.properties` |

The project folders are committed on purpose. They hold the bundle identifier, display name,
permissions and icons — real configuration that `npx cap add` would regenerate with defaults if it
were ever lost, silently changing the identity of a published app.

### Building and running

```
npm run native:sync       # build the web app and copy it into both projects
npm run native:ios        # ...and open Xcode
npm run native:android    # ...and open Android Studio
```

`cap sync` copies `dist/`, so **a native build only ever shows the last `npm run build`.** A change
that appears on the dev server but not in the simulator is almost always a missed sync.

Android needs **JDK 21**, and this is the one piece of the toolchain that is not obvious. Android
Studio bundles JDK 25, which Gradle 8.14.3 — the version Capacitor's Android template pins — rejects
outright with `Unsupported class file major version 69`. Point Gradle at 21 instead:

```
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
```

iOS needs Xcode and nothing else. Capacitor 8 uses Swift Package Manager rather than CocoaPods, so
`pod` is not required despite most guides still saying it is.

### What the wrapper changes, and why

Four things behave differently inside a webview than in a browser tab. All four are decided by
`lib/platform.js`, which exists so that one test answers the question for every caller rather than
three files each inventing their own.

**Push notifications do not work, deliberately.** `lib/notifications.js` is the OneSignal *web*
SDK, and web push has no native equivalent: iOS webviews have no service worker under a custom
scheme, and Android webviews have no browser push service. So `pushCapability()` returns
`'unsupported'` on native and the SDK is never even requested. The reminders row disappears from
Settings, which is the behaviour that state already produced. Native push is a genuinely different
transport — APNs and FCM through OneSignal's *native* SDK — and it needs a paid Apple Developer
account before an APNs key can be created at all. **This gate is also what protects the web setup:**
ungated, a native build would register subscribers against the live OneSignal app that could never
be delivered to, polluting the audience the hourly reminder job sends to.

**The service worker never registers.** Nothing in `src/` calls `navigator.serviceWorker.register()`
— the only service worker is the one OneSignal registers for itself. Gating OneSignal off on native
therefore removes the worker too, and the PWA manifest in `index.html` is simply inert inside a
wrapper that is already installed. There is no conflict to resolve.

**The app's address has to be stated rather than derived.** `lib/appUrl.js` returns
`window.location.origin`, which is correct in a browser because the player is looking at that
address. In the wrapper the origin is `capacitor://localhost`, which resolves to nothing and can be
opened by nobody. Left alone it would print `localhost` across the footer of every shared card and
hand Supabase an unopenable `redirectTo`. So on native — and only on native — `CANONICAL_APP_URL`
from `lib/platform.js` is used instead.

Auth emails therefore open **cifri.app in the phone's browser**, not the app. Login and signup are
unaffected (they are plain API calls, and are proven working in the wrapper), but a password reset
finishes on the website and the player returns to the app to sign in. Bringing that link back into
the app needs deep linking — a custom URL scheme, a Supabase Redirect URLs entry, and Apple/Google
domain-association files — and is not done.

**Analytics would otherwise be discarded.** A native build's `window.location.hostname` is
`localhost` on both platforms, so `detectEnvironment()` in `lib/analytics.js` would file every real
player under `development` — precisely the bucket PostHog's internal-users filter throws away. The
app would ship and the dashboard would stay empty. Native builds are now detected explicitly, but
only when serving their own bundled assets: a live-reload build pointed at a laptop's Vite server
still reports `development`. Events also carry a `platform` property (`ios` / `android` / `web`),
because once native and browser players are both marked production, nothing else tells them apart.

### Status bar and keyboard

`lib/nativeShell.js` tells the status bar not to overlay the webview. Without it the header renders
under the Dynamic Island and the Cifri logo is sliced in half. The alternative — adding
`viewport-fit=cover` and safe-area padding — was rejected because `index.html` explains why that
was already declined for the web: the header and bottom nav are both `position: fixed`, and both
would slide under the system UI until every screen learned about insets. Confining the fix to the
native shell leaves the browser build byte-for-byte unchanged. It also hides the iOS keyboard
accessory bar, which offered field-stepping arrows over a number pad that has no fields.

### Still to do before either store

- **Signing.** Neither project is signed. iOS needs an Apple Developer account, a distribution
  certificate and a provisioning profile; Android needs a release keystore, which must be backed up
  because losing it means never updating the listing again.
- **Icons and splash screens.** Both projects ship Capacitor's placeholder assets.
- **Native push**, per above.
- **Deep-linked auth returns**, per above.

## The reference prototype

`reference/original-prototype.html` is the complete, tested prototype the rewrite was ported
from — it is the source of truth for behaviour, copy and styling. The port was checked against it
rule by rule: identical design tokens, identical CSS, identical UI strings in both languages, and
matching game logic.

Two intentional differences:

- **Practice mode honours its own settings.** In the prototype the operation, digit, term,
  negative and decimal choices had no effect on the questions generated — a bug. The rewrite has
  a separate parameter-driven generator (`store/practiceEngine.js`).
- **Tab switching** wraps around and animates differently, following later design feedback.
