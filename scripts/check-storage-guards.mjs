// The two ways this app can lose a player's history without anybody noticing.
//
// Both were found while investigating a device that came back from a relaunch showing the
// onboarding screen (README, "Cross-device restore"). Neither was the cause of that — the wipe
// there was a real, confirmed sign-out — but both are live paths to the same outcome, and both
// fail in the way this app specialises in: nothing throws, nothing is logged, the app looks
// exactly as it did, and a day's play is simply not there any more.
//
//   1. A localStorage write that fails. localStorage is the PRIMARY store here — the server is
//      its mirror, and offline play exists nowhere else — so a `setItem` that throws means the
//      game is no longer being recorded at all. It used to be swallowed by a bare catch with an
//      "ignore quota" comment. writeStateToStorage() now reports instead, and the provider says
//      so out loud.
//
//   2. An ACCOUNT_LOADED carrying a server payload with no progress in it. "The server's copy
//      wins" is correct whenever the server HAS a copy; against an empty row it can only
//      subtract. All three paths that dispatch ACCOUNT_LOADED — startup adoption, login, and
//      conflict reconciliation — inherit the guard because it lives in the reducer.
//
// What this pins down:
//   * a storage failure is REPORTED, never swallowed, and never thrown into the caller
//   * every failure mode reports (quota, refused writes, no storage at all)
//   * a blank server payload cannot empty a device that holds progress — checked against each
//     kind of progress independently, so no single field carries the whole guard
//   * a server payload WITH progress is still adopted, in every shape: that is cross-device
//     restore, and a guard that broke it would be worse than the bug it prevents
//   * a blank device still adopts a blank account (there is nothing to protect), and the
//     profile half of the action lands either way
//
// Run it with:  npm run check:storage

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { reducer, defaultState, writeStateToStorage, hasMeaningfulProgress, wouldEmptyDevice } =
  await server.ssrLoadModule('/src/store/AppStateContext.jsx');

const rows = [];
let failed = 0;
const check = (group, name, ok, detail) => {
  if (!ok) failed++;
  rows.push({ group, name, verdict: ok ? 'ok' : 'FAIL', detail: detail || '' });
};

const TODAY = new Date().toLocaleDateString('en-CA');

// ── 1. A failed write is reported, not swallowed ──────────────────────────────────────────────

{
  const written = {};
  const working = { setItem: (k, v) => { written[k] = v; } };
  const res = writeStateToStorage({ username: 'Player' }, working);
  check('storage', 'a working store reports ok', res.ok === true);
  check('storage', 'a working store actually receives the state',
    JSON.parse(written.cifri_react_v1 || '{}').username === 'Player');

  // The real failure: a full device. DOMException's name is what distinguishes the causes, and
  // it is the one part of the error safe to send anywhere — the message can carry a URL or a
  // quota figure, the name cannot.
  const quota = { setItem: () => { const e = new Error('exceeded'); e.name = 'QuotaExceededError'; throw e; } };
  const q = writeStateToStorage({}, quota);
  check('storage', 'a full store reports failure', q.ok === false);
  check('storage', 'a full store reports WHY', q.reason === 'QuotaExceededError', q.reason);

  // Safari's private mode, and any browser where storage is switched off by policy.
  const refused = { setItem: () => { const e = new Error('denied'); e.name = 'SecurityError'; throw e; } };
  check('storage', 'a refused store reports failure', writeStateToStorage({}, refused).ok === false);
  check('storage', 'a refused store reports WHY',
    writeStateToStorage({}, refused).reason === 'SecurityError');

  // An error with no name at all must still be a failure rather than an unhandled shape.
  const odd = { setItem: () => { throw 'not an error object'; } };
  const o = writeStateToStorage({}, odd);
  check('storage', 'a nameless failure is still a failure', o.ok === false && typeof o.reason === 'string');

  // No storage object whatsoever — the case every check script itself runs in. Reported as a
  // failure and not as a silent success, because a success here would be a lie.
  check('storage', 'absent storage is a failure, not a success', writeStateToStorage({}, null).ok === false);

  // The whole point: it hands the failure back rather than throwing it at a render effect.
  let threw = false;
  try { writeStateToStorage({}, quota); } catch (e) { threw = true; }
  check('storage', 'never throws into the caller', threw === false);

  // A value JSON cannot serialise must be caught by the same net. Nothing puts one in state
  // today, but "the persist write cannot take the app down" should not rest on that staying true.
  const circular = {}; circular.self = circular;
  let stringifyThrew = false;
  try { stringifyThrew = writeStateToStorage(circular, working).ok === false; }
  catch (e) { stringifyThrew = false; }
  check('storage', 'an unserialisable state fails safely rather than throwing', stringifyThrew === true);
}

// ── 2. A blank server payload cannot empty a device ───────────────────────────────────────────

const loaded = (state, synced) => reducer(state, {
  type: 'ACCOUNT_LOADED',
  username: 'Player',
  email: 'player@example.com',
  fullName: '',
  avatar: null,
  synced,
});

// Each kind of progress on its own, so the guard cannot be passing on the strength of one field.
const withEachKind = {
  'a Challenge run': (s) => ({
    ...s,
    db: { ...s.db, easy: { sessions: [{ attemptId: 'a1', date: TODAY, score: 900, correct: 20, real: true }], best: 900, lastDay: TODAY } },
  }),
  'a Braining run': (s) => ({
    ...s,
    brState: { ...s.brState, sessions: [{ attemptId: 'b1', date: TODAY, time: 61, age: 24 }], lastDay: TODAY },
  }),
  'an achievement': (s) => ({ ...s, milestones: { ...s.milestones, achievedLog: ['first_challenge'] } }),
  'a trick passed': (s) => ({ ...s, trickStats: { ...s.trickStats, testPassed: [3] } }),
  'a live streak': (s) => ({ ...s, streak: 6, streakCreditedForDay: TODAY }),
};

// What an account row that has never been written looks like once it comes back through
// fromSyncPayload: present, well-formed, and holding nothing.
const blankPayload = () => {
  const d = defaultState();
  return {
    db: d.db, brState: d.brState, milestones: d.milestones, trickStats: d.trickStats,
    streak: 0, bestStreakEver: 0, settings: d.settings,
  };
};

for (const [label, populate] of Object.entries(withEachKind)) {
  const device = populate(defaultState());
  check('blank payload', `device holding ${label} is recognised as holding progress`,
    hasMeaningfulProgress(device) === true);

  for (const [shape, payload] of [['a blank row', blankPayload()], ['no row at all', {}], ['a missing payload', undefined]]) {
    const after = loaded(device, payload);
    check('blank payload', `${shape} does not empty a device holding ${label}`,
      hasMeaningfulProgress(after) === true,
      `progress survived: ${hasMeaningfulProgress(after)}`);
  }

  // Refusing the progress must not refuse the account. The player is still logged in.
  const after = loaded(device, blankPayload());
  check('blank payload', `the account still loads while refusing ${label}'s erasure`,
    after.acctCreated === true && after._loggedOut === false && after.username === 'Player');
}

// ── 3. The shared predicate, which the reducer and the startup adoption both read ─────────────
//
// They have to agree: the reducer refuses the payload, and adopt() has to know it was refused so
// it does not record a download that never landed as this device's sync baseline. Driving the
// predicate directly is what stops the two drifting into different answers.

{
  const populated = withEachKind['a Challenge run'](defaultState());
  const blank = blankPayload();
  const withHistory = { ...blank, bestStreakEver: 4 };

  check('predicate', 'blank payload at a populated device → refuse', wouldEmptyDevice(populated, blank) === true);
  check('predicate', 'blank payload at a blank device → allow', wouldEmptyDevice(defaultState(), blank) === false);
  check('predicate', 'real payload at a populated device → allow', wouldEmptyDevice(populated, withHistory) === false);
  check('predicate', 'real payload at a blank device → allow', wouldEmptyDevice(defaultState(), withHistory) === false);
  check('predicate', 'a missing payload is treated as empty', wouldEmptyDevice(populated, undefined) === true);
  check('predicate', 'and never refuses when there is nothing to lose',
    wouldEmptyDevice(defaultState(), undefined) === false);
}

// ── 4. The guard must not break cross-device restore ──────────────────────────────────────────

{
  const serverHistory = {
    ...blankPayload(),
    db: {
      ...defaultState().db,
      medium: { sessions: [{ attemptId: 's1', date: TODAY, score: 1400, correct: 24, real: true }], best: 1400, lastDay: TODAY },
    },
    milestones: { ...defaultState().milestones, achievedLog: ['first_challenge', 'streak_3'] },
    bestStreakEver: 11,
  };

  // A brand new phone. Nothing local to protect, so the account arrives whole.
  const fresh = loaded(defaultState(), serverHistory);
  check('restore', 'a blank device adopts the account in full',
    fresh.db.medium.best === 1400 && fresh.bestStreakEver === 11 &&
    fresh.milestones.achievedLog.length === 2);

  // A device that has played, meeting an account that has ALSO played. This is the ordinary
  // case the "server wins" rule is written for, and the guard must leave it exactly as it was.
  const played = withEachKind['a Challenge run'](defaultState());
  const merged = loaded(played, serverHistory);
  check('restore', 'a populated device still adopts a populated account',
    merged.db.medium.best === 1400 && merged.bestStreakEver === 11);
  check('restore', 'and does not keep its own copy alongside it',
    merged.db.easy.best === 0, `easy best was ${merged.db.easy.best}`);

  // Nothing on either side: no progress to defend, so nothing to refuse.
  const empty = loaded(defaultState(), blankPayload());
  check('restore', 'a blank device accepts a blank account', empty.acctCreated === true);

  // firstOpenDate is read off the payload actually applied, so a refused payload cannot smuggle
  // one in — and a missing payload cannot throw on the way past.
  const refusedDate = loaded(
    { ...withEachKind['a Challenge run'](defaultState()), firstOpenDate: '2026-01-01' },
    { ...blankPayload(), firstOpenDate: '2020-05-05' },
  );
  check('restore', 'a refused payload does not smuggle its firstOpenDate in',
    refusedDate.firstOpenDate === '2026-01-01', refusedDate.firstOpenDate);
  const adoptedDate = loaded(defaultState(), { ...serverHistory, firstOpenDate: '2020-05-05' });
  check('restore', 'an adopted payload still brings its firstOpenDate',
    adoptedDate.firstOpenDate === '2020-05-05', adoptedDate.firstOpenDate);
}

// ── Report ────────────────────────────────────────────────────────────────────────────────────

console.log('\nStorage and account-load guards\n');
let group = '';
for (const r of rows) {
  if (r.group !== group) { group = r.group; console.log(`  ${group}`); }
  console.log(`    ${r.verdict === 'ok' ? '✓' : '✗'} ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log(`\n${rows.length - failed}/${rows.length} passed\n`);

await server.close();
process.exit(failed ? 1 : 0);
