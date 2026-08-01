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
  someone plays changes their number, never whether the day counted. (The unified streak still
  needs Braining that day too — that rule is unchanged.)
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
