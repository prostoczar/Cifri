// Is any work parked outside this branch where it will be forgotten?
//
// This exists because it already happened, twice. A session working in a git worktree commits to
// its own `claude/<name>` branch; if nobody merges it, the work is stranded somewhere no later
// session will look. The 17 August audit-fixes session found `claude/brave-proskuriakova-dc9acf`
// holding a complete, better implementation of a task that had just been done a second time from
// scratch on react-rewrite — two sessions, one job, because neither could see the other.
//
// WHY THIS IS A SCRIPT AND NOT A LINE IN CLAUDE.md. A rule in CLAUDE.md binds whoever reads
// CLAUDE.md on the branch they happen to be on. A session that starts in a fresh worktree off an
// older commit reads that older copy, so branch-local documentation cannot govern branch-creation
// behaviour — it is read after the decision it was meant to prevent. Worse, a rule about worktrees
// is most naturally written while working in one, which lands it on the very branch that then goes
// unmerged. That is precisely how the previous attempt disappeared: `git log --all -S worktree`
// across every branch and all history returns nothing, so it was never durably written at all.
//
// So the rule lives somewhere a branch cannot swallow it: here, in the gate, plus the user-level
// memory that loads regardless of which branch or worktree a session starts in.
//
// Run it with:  npm run check:worktrees

import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

// The branch everything is supposed to land on. CLAUDE.md: "react-rewrite is the live branch and
// the default branch. All work happens here."
const HOME_BRANCH = 'react-rewrite';

// A genuinely concurrent session may legitimately be holding a worktree open right now. This is the
// acknowledged escape, deliberately an environment variable rather than a file: it lasts for one
// command, so it cannot be set once and quietly forgotten the way a committed exception would be.
const ACKNOWLEDGED = process.env.CIFRI_ALLOW_WORKTREES === '1';

let failed = 0;
const fail = (msg) => { failed++; console.log('FAIL  ' + msg); };
const ok = (msg) => console.log('ok    ' + msg);

// ── Worktrees other than the primary checkout ─────────────────────────────────
const worktrees = [];
{
  let current = null;
  for (const line of git('worktree', 'list', '--porcelain').split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null };
      worktrees.push(current);
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '');
    }
  }
}
const extra = worktrees.slice(1); // the first entry is always the primary checkout

// ── Branches carrying commits that never reached the home branch ──────────────
//
// Unreachable from react-rewrite is the operative test, not the branch's name: a branch whose
// commits are all merged is just a leftover label and costs nobody anything, while an unmerged one
// is work that only exists somewhere nobody is looking.
function unmergedCount(branch) {
  try {
    return Number(git('rev-list', '--count', `${HOME_BRANCH}..${branch}`));
  } catch {
    return -1;
  }
}

const localBranches = git('branch', '--format=%(refname:short)').split('\n').filter(Boolean);
const stranded = localBranches
  .filter((b) => b !== HOME_BRANCH && b !== 'main')
  .map((b) => ({ branch: b, ahead: unmergedCount(b) }))
  .filter((b) => b.ahead > 0);

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`Worktrees and stranded branches (home branch: ${HOME_BRANCH})`);

if (!extra.length) {
  ok('no worktrees beyond the primary checkout');
} else {
  for (const w of extra) {
    const ahead = w.branch ? unmergedCount(w.branch) : -1;
    const where = `${w.branch || '(detached)'} at ${w.path}`;
    if (ahead > 0) fail(`worktree holds ${ahead} commit(s) not in ${HOME_BRANCH}: ${where}`);
    else ok(`worktree is fully merged, so nothing is stranded in it: ${where}`);
  }
}

for (const s of stranded) {
  // A branch already reported above as a worktree does not need saying twice.
  if (extra.some((w) => w.branch === s.branch)) continue;
  fail(`branch has ${s.ahead} commit(s) not in ${HOME_BRANCH}, with no worktree: ${s.branch}`);
}
if (!stranded.length) ok(`every local branch is already contained in ${HOME_BRANCH}`);

if (failed && ACKNOWLEDGED) {
  console.log('\nCIFRI_ALLOW_WORKTREES=1 is set, so the above is reported but not enforced.');
  console.log('Set it only while a parallel session is genuinely mid-flight.');
  process.exit(0);
}

if (failed) {
  console.log(`\n${failed} place(s) holding work that ${HOME_BRANCH} cannot see.`);
  console.log('Resolve each one before it is forgotten:');
  console.log(`  merge it      git merge <branch>            (or cherry-pick the commits you want)`);
  console.log(`  discard it    git worktree remove <path> && git branch -D <branch>`);
  console.log(`  defer it      CIFRI_ALLOW_WORKTREES=1 npm run check    (one command only)`);
  process.exit(1);
}

console.log('\nall checks passed');
