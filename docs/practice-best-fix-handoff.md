# Handoff — Braining practice no longer sets the best time / best age

Written 5 Oct 2026, updated the same day. **Not merged yet, on purpose**: the Finish-screen session
in the main checkout was editing the same reducer case (adding `isAgeBest`), and the merge was
deferred until that work is committed. The `isAgeBest` follow-up is already DONE on this branch, so
the merge is now only conflict resolution plus the usual checks. Delete this file in the merge commit.

- **Branch:** `claude/vigorous-jones-b3f8ae`
- **Worktree:** `/Users/bml/Documents/Projects/cifri/.claude/worktrees/vigorous-jones-b3f8ae`
- **Commits:** `9557a22` the fix · `31f6e84` this note · `35c0ebd` `isAgeBest` · plus the commit
  that updated this note

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
- `isAgeBest` (`35c0ebd`), the new-best-BRAIN-AGE flag the Finish screen celebrates: the trial and
  retry lines are the Finish-screen session's own, comparing against the repaired `br`; practice
  leaves it `false`. Two more check cases (24 in all); the second fails if `br` is set back to
  `state.brState`.

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
   - in the **practice** branch take THIS branch's side whole — no `bestTime`/`bestAge` update, no
     `isAgeBest` assignment (it stays `false`), `prac: true` on the row,
     `pracBestBefore = bestPracticeTime(sessions)`. The other side's practice lines, and their
     comment saying practice "does move the stored best age", are exactly what this fix removes;
   - the trial and retry `isAgeBest` lines are identical on both sides — keep one copy;
   - keep one `let isAgeBest = false;` declaration (this branch's comment mentions the repair and
     practice), and both `isAgeBest` and `pracBestBefore` in `_lastBrResult`.
   `BrainingResultScreen.jsx` and `i18n_data.js` may need hand-merging too. The hunks are separate
   from the Finish screen's, but they sit near each other.
4. Run `npm run check:braining` — all 24 must pass, in particular the two `isAgeBest` cases — then
   `npm run check` and `npm run lint`.
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

## Why isAgeBest looks the way it does

The Finish-screen session's uncommitted reducer (as of 5 Oct) set `isAgeBest` on the practice path
too, with practice still lowering `bestAge`; `App.jsx` masks it with `!!r.isAgeBest && !r.isPrac`.
That mask can stay, but the reducer no longer needs it. On this branch:

- **Practice:** `isAgeBest` is never assigned, so it is `false`. Practice never sets the best age,
  so it can never beat it.
- **Trial and retry:** compared against the REPAIRED `br.bestAge`. That holds only while `br` is the
  `repairBrainingBests(...)` result, not `state.brState` — keep it that way through the merge.
- **Checks** (in `scripts/check-braining-rules.mjs`): "practice never reports a new best age", and
  "on a save practice poisoned, isAgeBest is judged against the repaired best age" (age 25 over a
  real best of 28 is a new best; 28 ties and is not).

## Also unmerged, not part of this

On 5 Oct `check:worktrees` also flagged `claude/vigilant-matsumoto-50437f` — one commit, "Lock
Braining's Submit after a correct answer, so a double tap counts once" (`useBrainingGame.js`,
`check-double-submit.mjs`). It does not touch this branch's files, but `npm run check` will keep
failing on it after this merge until it is merged or discarded too.
