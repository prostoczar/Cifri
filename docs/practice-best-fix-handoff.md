# Handoff — Braining practice no longer sets the best time / best age

Written 5 Oct 2026. **Not merged yet, on purpose**: the Finish-screen session in the main checkout
was editing the same reducer case (adding `isAgeBest`), and the merge was deferred until that work
is committed. Delete this file in the merge commit, or once the follow-up below is done.

- **Branch:** `claude/vigorous-jones-b3f8ae`
- **Worktree:** `/Users/bml/Documents/Projects/cifri/.claude/worktrees/vigorous-jones-b3f8ae`
- **Fix commit:** `9557a22` — "Stop Braining practice runs setting the best time and best age"

Until it is merged, `npm run check:worktrees` (and so `npm run check`) fails in every other checkout,
naming this branch. That is the backstop doing its job; `CIFRI_ALLOW_WORKTREES=1 npm run check`
defers it for one command.

## The bug

Practice is 20 questions; the day's trial and its retries are 50. `brAge()` reads one time table for
both, so 100 s of practice is "brain age 20" while being about 4 minutes' pace over 50 questions.
The practice branch of `BRAINING_SESSION_COMPLETE` lowered `bestTime`/`bestAge` anyway — copied from
the prototype, which copied it from Challenge, where practice and the real run are both 60 s. One
practice run could set a best no real trial could ever beat: the new-best ribbon and confetti never
fired again, every real trial showed a red "+2m" against it, and the inflated best age went out on
share cards.

## What the fix does

- `src/store/braining.js` — new `isPracticeSession`, `countingBest`, `bestPracticeTime`,
  `repairBrainingBests`. A practice row is `prac: true` from now on; a pre-fix practice row is
  recognised as `real: false` with no `attemptId` (every trial and retry has had one since
  10 Aug 2026).
- `src/store/AppStateContext.jsx`
  - the practice branch no longer touches `bestTime`/`bestAge`, marks its row `prac: true`, and
    reports `pracBestBefore` (fastest EARLIER practice) in `_lastBrResult`;
  - `const br = repairBrainingBests(state.brState)` at the top of the case, so "is this a new best"
    is always asked of the best the 50-question runs set;
  - the repair also runs in `loadInitialState` and in `ACCOUNT_LOADED`, so every device and, through
    their uploads, the server end up corrected. It returns the same object when nothing changes.
- `src/screens/BrainingResultScreen.jsx` — practice compares only with earlier practice
  (`vs_best_practice`), hides that card when there is none (the streak card then spans the row), and
  the best-age card no longer falls back to the practice age.
- `src/i18n_data.js` — `vs_best_practice` in en and ru.
- `scripts/check-braining-rules.mjs` — eight cases; six fail against the old reducer.

Verified: `npm run check` and `npm run lint` clean; live in the browser, a poisoned save repaired
from 1:40 / 20 to 3:10 / 28 on load, and a practice run left it there.

## Merging into react-rewrite

1. Wait until the Finish-screen work in the main checkout is committed. `git merge` refuses to run
   over uncommitted edits to files it touches, and four of this branch's five files are among them.
2. In the main checkout, on `react-rewrite`:
   ```bash
   git merge --no-ff claude/vigorous-jones-b3f8ae
   ```
3. Expect a conflict in `BRAINING_SESSION_COMPLETE`. Resolve it as follows:
   - keep `const br = repairBrainingBests(state.brState);` at the top of the case;
   - in the **practice** branch take this branch's version — no `bestTime`/`bestAge` update,
     `prac: true` on the row, `pracBestBefore = bestPracticeTime(sessions)` — and set
     `isAgeBest = false` there (see below);
   - keep both `isAgeBest` and `pracBestBefore` in `_lastBrResult`.
   `BrainingResultScreen.jsx` and `i18n_data.js` may need hand-merging too. The hunks are separate
   from the Finish screen's, but they sit near each other.
4. Do the `isAgeBest` follow-up below, then `npm run check` and `npm run lint`.
5. Stage explicit paths only (never `git add -A`) and commit. Delete this file in that commit.
6. Remove the worktree and branch:
   ```bash
   git worktree remove .claude/worktrees/vigorous-jones-b3f8ae
   ```
   ```bash
   git branch -d claude/vigorous-jones-b3f8ae
   ```
   The worktree holds an ignored `.env.local` symlink to the main checkout's, added so the checks
   could boot. If `worktree remove` objects to it, delete the symlink first.

## The isAgeBest follow-up

As of 5 Oct the Finish-screen session's uncommitted reducer sets `isAgeBest` on the practice path as
well (`isAgeBest = br.bestAge === null || age < br.bestAge`, with practice still lowering
`bestAge`). `App.jsx` masks it with `!!r.isAgeBest && !r.isPrac`, but the reducer should not claim
it. After the merge:

- **Practice:** `isAgeBest = false`, always. Practice never sets the best age, so it can never beat
  it.
- **Trial and retry:** `isAgeBest` must compare against the REPAIRED `br.bestAge`. That holds as long
  as `br` is the `repairBrainingBests(...)` result above and not `state.brState`.
- **Check case** to add to `scripts/check-braining-rules.mjs`, next to the practice cases:
  - a practice run at age 20 on a save whose real best age is 30 reports `isAgeBest === false`, both
    with and without an earlier real trial;
  - on the `poisoned()` save (stored best age 20 from an old practice row, real best 28), a real run
    at age 25 reports `isAgeBest === true`, while a real run at age 28 reports `false`.
  Confirm the second case fails if `br` is set back to `state.brState`.
