# Cifri — working notes

A mobile mental-arithmetic trainer. React + Vite, Supabase for accounts and sync.

## Branches — read this first

**`react-rewrite` is the live branch and the default branch.** All work happens here.

`main` holds the original single-file prototype and serves the live site at **trycifri.com**.

**Do not merge the two.** Cutting the live site over to the rewrite is a deliberate decision that
has not been made yet — it is not a tidying-up job, and it must not happen as a side effect of
anything else. Do not commit to `main`, do not open a PR into it, and do not touch trycifri.com.

## Before you commit

```bash
npm run check
npm run lint
```

`npm run check` is the gate, and it matters more here than in most projects: almost every rule in
this app fails **quietly**. A day averaged wrong, a streak that should have broken, an achievement
wired to the wrong number — none of them throw, they just record something untrue. The scripts in
`scripts/` boot Vite in middleware mode and load the real reducer, so they exercise the shipped
logic rather than a copy of it.

| Script | What it would catch |
|---|---|
| `check:parity` | the server and the phone drawing different questions from the same seed |
| `check:anticheat` | a forged score, a fabricated boost or tampered timing getting recorded |
| `check:projection` | a day's score projected to the server differently from the screen |
| `check:streak` | a streak that survives a gap, or dies without one |
| `check:tricks` | a trick Test that credits a fail, or un-credits a pass |
| `check:braining` | brain-age and the Sharper Every Day tiers |
| `check:achievements` | a catalogue row that renders wrong, or unlocks a reward it should not |
| `check:triggers` | an achievement wired to the wrong number, or firing on a near-miss |
| `check:invariant` | the three places a day's score is computed disagreeing |

`supabase/verification/*.sql` are the database-side RLS checks. They are **run by hand** in the
Supabase SQL editor, not by `npm run check`, and they need a real account to defend.

## Where the specs live

The authoritative content specs are in **`~/Downloads`**, not in this repo —
`Cifri_Milestones_v4.xlsx` (the 59 achievements) and `icon_picker_test_v7.html` (the icon set).
`reference/original-prototype.html` is the older full prototype that was ported, not a spec.

When a task says to use a spec's own wording, transcribe it and then **diff it back against the
source with a script**. Sixty rows is well past what a careful read can confirm.

## Things that will bite you

**The question generator and the scoring maths live under `supabase/functions/_shared/`, not in
`src/`.** They moved there because the server has to run them too, and Deno will only reliably
bundle what sits beneath `supabase/functions/`. `src/store/questionEngine.js`, `scoring.js` and
`braining.js` are now thin re-exports. Edit the shared copy, never re-add a local one — a second
copy of the scoring maths means the server rejecting honest players' scores.

**The server sends a seed, not questions.** Number formatting is locale-dependent ("12.5" vs
"12,5"), so the server generating the question TEXT would decide what Russian players see. Both
sides run the same seeded generator instead. Everything in the generator must therefore stay
deterministic — one stray `Math.random()` desynchronises the two sides silently, which is what
`check:parity` is watching for.

**`daily_results` is the player's own mirror; `verified_daily_results` is the competitive record.**
The first is client-writable and must stay that way (it is what works offline). The second is
written only by the Edge Function and is what a leaderboard reads. Never rank the first, and never
grant the client write access to the second.

**State is one reducer.** `src/store/AppStateContext.jsx` holds every game rule. It exports
`reducer` and `defaultState` purely so the check scripts can drive it directly — nothing in the app
imports them. Keep it that way: a rule that can be driven headlessly is a rule that can be proved.

**`localStorage` is primary, the server is a mirror.** The app must work offline. Never make a
game rule depend on a network call having succeeded.

**`SYNCED_KEYS` in `src/lib/syncedState.js` is the sync boundary.** New state that should follow a
player between devices must be added there, or nested inside something already listed (the
achievement counters live inside `milestones` for exactly this reason). State added outside it
silently becomes per-device — a value that disagrees with itself depending on which phone earned it.

**Loading replaces objects wholesale.** `Object.assign(base, parsed)` means a saved `milestones`
from before a field existed arrives without it. Every reader must tolerate `undefined`.

**Score-based achievements read the raw score, never the boosted one.** Finishing Braining grants a
one-shot multiplier on one Challenge run that day; the session stores both `rawScore` and `score`
so the boost is provable. An achievement keyed off the boosted number is an achievement the boost
can buy.

**The achievements array stays in spreadsheet order.** `ACHIEVEMENTS` in `store/achievements.js`
mirrors the xlsx row for row so it can be checked against it. Display order is a *view* over it
(`achievementsByRarity()`), not a reordering.

**Achievement keys are permanent.** They are in players' saved data and on the server. Renaming one
strands whoever earned it.

## House style

Comments explain **why**, not what — including why an alternative was rejected. Much of this code
is a port of a working prototype, and the reasons a rule is shaped the way it is are the part that
cannot be recovered by reading it. Match the density of the file you are in.

The app is bilingual (English and Russian). Every user-facing string goes in `src/i18n_data.js`;
the achievement catalogue is the one deliberate exception, keeping both languages on the row so it
can be diffed against the spreadsheet.
