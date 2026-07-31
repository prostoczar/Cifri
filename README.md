# Cifri

Daily math. Sharper mind.

A mobile mental-arithmetic trainer: a timed daily Challenge, a Braining brain-age test, custom
Practice drills, and a library of mental-maths Tricks, tied together by a shared daily streak.

## Branches

| Branch | What it is |
|---|---|
| `main` | The original single-file prototype. Serves the live site at trycifri.com. |
| `react-rewrite` | The React rewrite. This branch. |

## Running it

```bash
npm install
npm run dev             # http://localhost:5173
npm run dev -- --host   # also reachable from a phone on the same network
```

Other commands:

```bash
npm run build     # production build into dist/
npm run preview   # serve that build locally
npm run lint      # oxlint
```

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

**`profiles.leaderboard_visible`** is dormant: `false` for every account, no UI, nothing reads it.
A placeholder so that when leaderboards launch, appearing on one has to be a deliberate act.

Nothing exposes one player's data to another. There is no view or function returning another
player's rows, and cross-account access is tested by attempting it, not assumed.

Two things deliberately left for a future session: `leaderboard_visible` is settable by a player
via the API (the "update own profile" policy covers every column), so a real consent gate is
needed at launch; and scores arrive from the device and are trusted, which matters once they rank
players against each other.

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
