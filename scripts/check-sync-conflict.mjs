// Does a sync conflict between two signed-in devices ever destroy real progress?
//
// The failure this guards: two devices signed in on the same account at once. Device A plays a
// Challenge run; it uploads and lands on the server. Device B never played anything — it was
// simply open — but something on it changes a synced field (which difficulty tab is selected,
// dark mode, the automatic midnight streak-check stamping a date) and its own upload fires. If
// that upload is an unconditional overwrite, it replaces the entire player_state row with B's
// stale, run-less copy. A's score is now gone from the server — and the next time A reloads, its
// own local copy is wiped too, because A's own baseline still matches what it last confirmed and
// gives it no reason to distrust the server. Reproduced live against a real Supabase project
// before this script was written; see the session that added it for the exact repro steps.
//
// The fix conditions every upload on the player_state row's `updated_at` (pushPlayerState in
// accountApi.js), so a stale write is refused rather than landing. hasUnsyncedProgress() in
// syncedState.js is what a refused write is then judged against: does the device's pending
// change hold real progress the server doesn't have, or was it always safe to drop? That
// decision function is pure and is what this script drives directly.
//
// What it pins down:
//   * a real run the server hasn't seen is never mistaken for something safe to discard
//   * a cosmetic-only change (tab selection, dark mode, chart range...) never blocks taking the
//     server's newer copy — the fix must not turn every idle second device into a stuck upload
//   * every PROGRESS_KEYS field independently trips the "defend this" signal on its own
//   * SYNCED_KEYS minus PROGRESS_KEYS is exactly the known preference set — a new synced key
//     that nobody consciously classified cannot silently fall on either side
//   * the real reducer's ACCOUNT_LOADED path, exercised end-to-end, never loses a field the
//     conflict logic decided was worth defending
//
// Run it with:  npm run check:sync-conflict

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { hasUnsyncedProgress, PROGRESS_KEYS, SYNCED_KEYS, toSyncPayload } =
  await server.ssrLoadModule('/src/lib/syncedState.js');
const { reducer, defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');

const rows = [];
let failed = 0;
const check = (group, name, ok, detail) => {
  if (!ok) failed++;
  rows.push({ group, name, verdict: ok ? 'ok' : 'FAIL', detail: detail || '' });
};

const base = () => toSyncPayload(defaultState());

// ── The exact reproduced scenario ─────────────────────────────────────────────────────────────

const withRun = (score) => ({
  ...base(),
  db: { ...base().db, easy: { sessions: [{ attemptId: 'run-' + score, date: '2026-08-24', score, correct: 92, real: true }], best: score, lastDay: '2026-08-24' } },
  streak: 1,
  streakCreditedForDay: '2026-08-24',
});

{
  // Device A's copy: a real run the server (device B's stale row) never saw.
  check('the exact bug', 'a real Challenge run the server lacks is defended',
    hasUnsyncedProgress(withRun(1117), base()) === true);
}

{
  // The bug this script exists to catch, caught live before this fixture existed: device B never
  // played anything, but a naive "do the payloads differ on a progress field" comparison cannot
  // tell "local added something" from "local is simply behind" — B's OWN empty `db` differs from
  // A's run-holding `db` just as much as A's did from B's, and a symmetric check defended it,
  // causing a second, now-successful overwrite of the very run this whole mechanism protects.
  // hasUnsyncedProgress must be direction-aware: local behind, fresh ahead, is never a defense.
  check('the exact bug', "device B's own empty history is NOT defended against A's real run",
    hasUnsyncedProgress(base(), withRun(1119)) === false);
}

{
  // Device B: the only local change since its own last sync is which difficulty tab is open —
  // exactly the tap that triggered the live repro. The server (device A's fresher copy) differs
  // only in that same cosmetic field, in the other direction.
  const fresh = { ...base(), selDiff: 'easy' };
  const localStale = { ...base(), selDiff: 'medium' };
  check('the exact bug', 'a bare difficulty-tab change is NOT defended (server may be adopted)',
    hasUnsyncedProgress(localStale, fresh) === false);
}

// ── Every cosmetic/preference key, alone, must never trip the defend signal ─────────────────────

const PREFERENCE_KEYS = SYNCED_KEYS.filter((k) => !PROGRESS_KEYS.includes(k));
const EXPECTED_PREFERENCE_KEYS = [
  // Housekeeping, not progress: purely a record of when the app last looked, and recomputed
  // identically wherever it runs — see CHECK_STREAK_BREAK's own comment on why re-running it is
  // always safe. Losing this field to a conflict costs nothing; the next check just repeats it.
  'streakLastCheckedDay',
  'settings', 'selDiff', 'chRange', 'brChartRange', 'brChartType', 'totdLastViewed',
  'tutorialShown', 'firstOpenDate',
];
check('classification', 'PROGRESS_KEYS + preference keys account for all of SYNCED_KEYS',
  PREFERENCE_KEYS.length + PROGRESS_KEYS.length === SYNCED_KEYS.length);
check('classification', 'the preference set is exactly the known device/view-preference fields',
  JSON.stringify([...PREFERENCE_KEYS].sort()) === JSON.stringify([...EXPECTED_PREFERENCE_KEYS].sort()),
  `got: ${PREFERENCE_KEYS.join(', ')}`);

const PREFERENCE_DIFFS = {
  streakLastCheckedDay: '2026-08-24',
  settings: { sound: false, dark: true, fontSize: 'large', lang: 'ru', notif: { enabled: true, hour: 8 } },
  selDiff: 'hard',
  chRange: 30,
  brChartRange: 30,
  brChartType: 'time',
  totdLastViewed: '2026-08-20',
  tutorialShown: true,
  firstOpenDate: '2026-01-01',
};
for (const k of PREFERENCE_KEYS) {
  const fresh = base();
  const local = { ...base(), [k]: PREFERENCE_DIFFS[k] };
  check('preference fields alone', `${k} differing alone is never defended`,
    hasUnsyncedProgress(local, fresh) === false,
    PREFERENCE_DIFFS[k] === undefined ? 'no diff fixture for this key — add one' : '');
}

// ── Every real progress field, added on ONE side only, must be defended on that side and NEVER
// on the other ──────────────────────────────────────────────────────────────────────────────
//
// Two fixtures per field: `ahead` (local has it, fresh does not — must be defended) and `behind`
// (fresh has it, local does not — must NOT be defended; this is the direction the live bug was
// actually caught in). streak / streakCreditedForDay / streakRestoreAvailable are excluded on
// purpose — see the comment on hasUnsyncedProgress in syncedState.js for why.
const DIRECTIONAL_FIXTURES = {
  db: (s) => ({ ...s, easy: { sessions: [{ attemptId: 'x', date: '2026-08-24', score: 300, correct: 20, real: true }], best: 300, lastDay: '2026-08-24' } }),
  brState: () => ({ sessions: [{ attemptId: 'x', date: '2026-08-24', age: 25, time: 200, real: true }], lastDay: '2026-08-24', bestTime: 200, bestAge: 25 }),
  bestStreakEver: () => 10,
  brBoostDay: () => '2026-08-24',
  pendingRestore: () => ({ brokenValue: 4, brokenAtMs: 1700000000000, availableAtBreak: true }),
  milestones: (m) => ({ ...m, achievedLog: [...m.achievedLog, 'first_challenge'] }),
  trickStats: (t) => ({ ...t, testPassed: ['0-0'] }),
};
const DIRECTIONAL_KEYS = Object.keys(DIRECTIONAL_FIXTURES);

for (const k of DIRECTIONAL_KEYS) {
  const empty = base();
  const filled = { ...base(), [k]: DIRECTIONAL_FIXTURES[k](empty[k]) };
  check('progress fields, directionally', `${k}: local ahead of fresh is defended`,
    hasUnsyncedProgress(filled, empty) === true);
  check('progress fields, directionally', `${k}: local behind fresh is NOT defended`,
    hasUnsyncedProgress(empty, filled) === false);
}

check('progress fields, directionally', 'every history/achievement-bearing PROGRESS_KEYS entry has a fixture',
  ['db', 'brState', 'milestones', 'trickStats', 'bestStreakEver', 'brBoostDay', 'pendingRestore']
    .every((k) => DIRECTIONAL_KEYS.includes(k)));

{
  // practiceDone / testDone are count maps, not arrays — hasNewInArray doesn't apply to them.
  // Exercised separately since a count going DOWN (practiced once here, three times on the
  // other device) must not be defended, only a count going UP.
  const fresh = { ...base(), trickStats: { ...base().trickStats, practiceDone: { '0-0': 3 }, testDone: { '0-0': 2 } } };
  const localHigher = { ...base(), trickStats: { ...base().trickStats, practiceDone: { '0-0': 5 }, testDone: { '0-0': 2 } } };
  const localLower = { ...base(), trickStats: { ...base().trickStats, practiceDone: { '0-0': 1 }, testDone: { '0-0': 2 } } };
  check('progress fields, directionally', 'trickStats: a higher practice count is defended',
    hasUnsyncedProgress(localHigher, fresh) === true);
  check('progress fields, directionally', 'trickStats: a lower practice count is NOT defended',
    hasUnsyncedProgress(localLower, fresh) === false);
}

// Identical payloads are never defended — the common case (nothing happened anywhere) must not
// itself look like a conflict worth fighting.
check('baseline', 'two identical payloads never trip the defend signal',
  hasUnsyncedProgress(base(), base()) === false);

// ── End-to-end through the real reducer ──────────────────────────────────────────────────────
//
// Proves the reconciliation this script's decision feeds is actually safe to act on: adopting a
// "fresh" server payload the decision logic cleared as safe must not, via the real ACCOUNT_LOADED
// case, drop anything the decision logic would have called progress.

{
  const veteranSynced = {
    db: { ...base().db, easy: { sessions: [{ date: '2026-08-24', score: 1117, correct: 92, real: true }], best: 1117, lastDay: '2026-08-24' } },
    streak: 1,
    streakCreditedForDay: '2026-08-24',
  };
  // A device that only changed its selected tab, then adopts the server's real run.
  let state = { ...defaultState(), acctCreated: true, selDiff: 'medium' };
  state = reducer(state, {
    type: 'ACCOUNT_LOADED',
    username: 'someone', email: 'someone@example.com', fullName: '', avatar: null,
    synced: veteranSynced,
  });
  check('reducer end-to-end', 'adopting the fresher copy carries the run over intact',
    state.db.easy.sessions.length === 1 && state.db.easy.sessions[0].score === 1117 && state.streak === 1);
}

// ── Report ─────────────────────────────────────────────────────────────────────────────────────

const groups = [...new Set(rows.map((r) => r.group))];
console.log('\nSync conflict resolution\n');
for (const g of groups) {
  console.log(g);
  for (const r of rows.filter((x) => x.group === g)) {
    console.log(`  ${r.verdict === 'ok' ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
  }
}
console.log(`\n${failed === 0 ? `all ${rows.length} checks passed` : `${failed} of ${rows.length} checks FAILED`}\n`);
process.exit(failed === 0 ? 0 : 1);
