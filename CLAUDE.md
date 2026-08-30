# Cifri — working notes

A mobile mental-arithmetic trainer. React + Vite, Supabase for accounts and sync.

## Branches — read this first

**`react-rewrite` is the live branch and the default branch.** All work happens here, and it is what
serves the real app at **cifri.app**.

`main` holds the original single-file prototype. It served trycifri.com until **27 August 2026**,
when the cutover happened: cifri.app became the one canonical URL, trycifri.com became a 301 to it,
and the Vercel project that deployed `main` was deleted. `main` is now history — no domain, no
deployment, no database (its auth was always faked; it never had a Supabase connection).

**Do not merge the two, and do not commit to `main`.** The cutover being done does not make the
branches mergeable — `main` is kept as the record of what was ported, and the rewrite's history
should not absorb it. If the prototype is ever needed again, deploy the branch; do not merge it.

The domain rule that replaces "do not touch trycifri.com": **cifri.app is production and has real
players.** Changing what it serves, or the DNS behind it, is a deliberate decision, not a tidying-up
job. The GoDaddy zone for cifri.app also carries live Google Workspace email — the MX, SPF, DKIM
and DMARC records are load-bearing and must never be removed while adjusting web hosting.

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
| `check:mode-streaks` | a per-mode streak pill claiming a day that was never played in that mode |
| `check:tricks` | a trick Test that credits a fail, or un-credits a pass |
| `check:trick-variety` | a trick whose 20-question Test has to repeat itself to fill up |
| `check:braining` | brain-age, the Sharper Every Day tiers, and the displayed scale disagreeing with the computed age |
| `check:achievements` | a catalogue row that renders wrong, or unlocks a reward it should not |
| `check:triggers` | an achievement wired to the wrong number, or firing on a near-miss |
| `check:achievements-verified` | an achievement the Braining boost could buy, or one that needs the network |
| `check:invariant` | the three places a day's score is computed disagreeing |
| `check:notify` | a reminder addressed to the wrong player, or carrying something it should not |
| `check:notify-identity` | tags stranded on an abandoned OneSignal user by a sign-in or sign-out |
| `check:i18n` | user-facing text that never reached the translation table, and key parity |
| `check:worktrees` | work parked on a branch or worktree that `react-rewrite` cannot see |

`check:i18n` is worth a note, because the discipline it replaces looked clean while about twenty
strings were reaching players untranslated. Key parity only proves every key in `en` has a twin in
`ru`; it cannot see a string that was never made a key. So the script scans the AST for literals and
JSX text that look like prose, and it carries a **self-test** — the audit's actual findings, which it
must still detect, and real non-copy strings, which it must still ignore. Loosen the heuristic and
the self-test names the historical bug you just stopped catching. Its blind spots are listed in its
own header; the main one is single-word copy.

`check:mode-streaks` and `check:trick-variety` are the two newest, and both guard rules that fail
silently in the way this app specialises in. The per-mode streaks shown on each home screen are
DERIVED from session history rather than stored — no migration, nothing to double-credit, nothing
to miss at midnight — which trades a class of state bugs for exactly one reading, and that reading
is what the script pins down. `check:trick-variety` measures every generator's real output space:
before 22 August 2026, 14 of the 47 tricks could not produce twenty distinct questions, so Tests
padded themselves by repeating and nothing said so.

`check:worktrees` is the odd one out: it checks the repository rather than the game. Work has been
stranded twice on a `claude/*` worktree branch nobody merged — most recently a complete, better
implementation of a task that was then done a second time from scratch. It fails when any branch or
worktree holds commits unreachable from `react-rewrite`, and prints the merge/discard/defer options.
`CIFRI_ALLOW_WORKTREES=1 npm run check` defers it for one command, for genuinely parallel sessions.

Note that this rule cannot live *only* here. A session starting in a worktree off an older commit
reads that older CLAUDE.md — after the decision the rule was meant to govern — and a rule about
worktrees tends to get written while working in one, which lands it on the branch that then goes
unmerged. That is how the previous attempt vanished. The durable copy is in user-level memory; this
paragraph and the check script are the backstop.

**Never `git add -A` here.** Another session's uncommitted work often sits in the same checkout —
a `git add -A` on 18 August 2026 swept a half-finished Russian formality pass into an unrelated
commit. Stage explicit paths.

`scripts/sim-difficulty.mjs` is **not** a check script and `npm run check` does not run it. It is the
model the difficulty multipliers and the nine score-achievement thresholds were derived from, kept
because the previous derivation was thrown away and had to be rebuilt from figures quoted in a
report. Run it before changing `DIFF_MULT` or a score threshold. It reports the thresholds by reading
them out of the reducer, so it cannot drift from what actually ships.

`npm run probe:anticheat` is the live counterpart to `check:anticheat`: it attacks the DEPLOYED
functions with a real account. It needs credentials in the environment and a throwaway account —
never a real one, since it records real games. Run it after any change to `_shared/`, the Edge
Functions, or the client wiring; the headless suite cannot prove the rules are wired up.

`supabase/verification/*.sql` are the database-side RLS checks. They are **run by hand** in the
Supabase SQL editor, not by `npm run check`, and they need a real account to defend.

## Where the specs live

The authoritative content specs are in **`~/Downloads`**, not in this repo —
`Cifri_Milestones_v4.xlsx` (the 59 achievements) and `icon_picker_test_v7.html` (the icon set).
`reference/original-prototype.html` is the older full prototype that was ported, not a spec.

When a task says to use a spec's own wording, transcribe it and then **diff it back against the
source with a script**. Sixty rows is well past what a careful read can confirm.

**Both spec files were missing from `~/Downloads` as of 17 August 2026**, so the catalogue can no
longer be diffed against them. The code has since deliberately diverged in three ways, all recorded
in the header of `store/achievements.js`: six appended rows, three retuned thresholds, and the
rarities that moved with them. If the spreadsheet turns up, the first 59 rows of `ACHIEVEMENTS` are
still it, in its order — that is what the appended block is kept at the END of the array to protect.

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

**`DIFF_MULT` cannot be rebalanced again without a migration plan.** It changed on 17 August 2026
from 1.0/1.3/1.6 to 1.0/1.9/4.2, because the old figures made Hard score about half what Easy did for
the same player. That was safe only because this branch has no real player data. It will not be safe
again: a Hard run recorded at ×1.6 sits in the same chart, daily average and personal best as one
recorded at ×4.2, and nothing marks which is which. **Revisit before the `main`/`react-rewrite`
cutover, and before any later rebalance.** The nine score-achievement thresholds move with it — see
`scripts/sim-difficulty.mjs`.

**Score-based achievements read the raw score, never the boosted one.** Finishing Braining grants a
one-shot multiplier on one Challenge run that day; the session stores both `rawScore` and `score`
so the boost is provable. An achievement keyed off the boosted number is an achievement the boost
can buy.

**The achievements array stays in spreadsheet order.** `ACHIEVEMENTS` in `store/achievements.js`
mirrors the xlsx row for row so it can be checked against it. Display order is a *view* over it
(`achievementsByRarity()`), not a reordering. Anything the spreadsheet does not contain is APPENDED
at the end rather than filed with its family: inserting into the middle shifts every row after it out
of alignment with the source, which costs more than the tidiness is worth.

**Achievement keys are permanent.** They are in players' saved data and on the server. Renaming one
strands whoever earned it.

## The native wrappers

`ios/` and `android/` are Capacitor wrappers around the SAME `dist/` build — no second codebase, no
second copy of any rule. App id `app.cifri`, display name `Cifri`, both **permanent once published**.

**A native build shows the last `npm run build`, not your working tree.** `npx cap sync` copies
`dist/` into both projects. A change that works on the dev server but not in the simulator is
almost always a missed sync — run `npm run native:sync`.

**Android needs JDK 21, not the one Android Studio ships.** Studio bundles JDK 25 and Gradle 8.14.3
rejects it outright (`Unsupported class file major version 69`). Export
`JAVA_HOME=/opt/homebrew/opt/openjdk@21` before any Gradle command. iOS needs only Xcode —
Capacitor 8 uses Swift Package Manager, so CocoaPods is not required despite most guides saying so.

**`src/lib/platform.js` is the one place that decides "are we native".** Four behaviours hang off
it — push, the app's printed address, analytics environment, and the status bar — and a second copy
of that test could only ever disagree with the first. It reads the injected `window.Capacitor`
global rather than importing `@capacitor/core`, so the WEB bundle does not grow by ~15 kB to be
told it is not native, and so the check scripts (which have no window at all) keep working.

**Never un-gate OneSignal on native.** `notifications.js` is the WEB SDK and web push cannot work in
a webview. The gate is not only about the native app being quiet — ungated, a native build would
register undeliverable subscribers against the LIVE OneSignal app and pollute the audience the
hourly reminder job sends to. Native push means the native SDK, APNs/FCM, and a paid Apple
Developer account; it is a separate piece of work.

**Native analytics are production only when serving bundled assets.** A wrapper's hostname is
`localhost`, so the plain hostname rules would file every real player as `development` and PostHog's
internal-users filter would discard them all. `isBundledNativeBuild()` is a positive test, not a
fallback — a live-reload build pointed at a dev server stays `development`, which is the safe
direction.

## House style

Comments explain **why**, not what — including why an alternative was rejected. Much of this code
is a port of a working prototype, and the reasons a rule is shaped the way it is are the part that
cannot be recovered by reading it. Match the density of the file you are in.

The app is bilingual (English and Russian). Every user-facing string goes in `src/i18n_data.js`;
the achievement catalogue is the one deliberate exception, keeping both languages on the row so it
can be diffed against the spreadsheet.
