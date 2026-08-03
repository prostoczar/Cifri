// What a trick actually asks of a player before it gives anything away.
//
// Two rules meet here, and both were changed by hand across several files, so both are worth
// being able to re-run rather than re-read:
//
//   1. Credit is earned by DOING, not by opening. First Trick, Halfway There and Trick Master all
//      hang off one list of tricks practiced, and that list used to grow the instant the practice
//      button was tapped. Now only a finished drill or a passed Test can add to it.
//   2. A Test is passed on 20 of 20, first time, and one wrong answer ends the attempt. The
//      attempt still counts — `testDone` answers "how many times have you sat this?", and a test
//      abandoned at question three was still sat — while `testPassed` stays untouched.
//
// Run it with:  npm run check:tricks

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { reducer, defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const { TEST_LENGTH, TEST_PASS_MARK, PRACTICE_LENGTH } = await server.ssrLoadModule('/src/store/trickTest.js');

// Small enough to reason about; the rules do not care how many tricks there really are.
const TOTAL_TRICKS = 6;

const fresh = () => ({ ...defaultState() });

function practice(s, gi, ti, firstTryCorrect = PRACTICE_LENGTH) {
  return reducer(s, {
    type: 'TRICK_PRACTICE_COMPLETE', reqId: 1, gi, ti,
    firstTryCorrect, total: PRACTICE_LENGTH, totalTricks: TOTAL_TRICKS,
  });
}
function test(s, gi, ti, passed) {
  return reducer(s, {
    type: 'TRICK_TEST_COMPLETE', reqId: 1, gi, ti,
    passed, total: TEST_LENGTH, totalTricks: TOTAL_TRICKS,
  });
}

const earned = (s) => s.milestones.achievedLog;
const has = (s, k) => earned(s).indexOf(k) !== -1;

const checks = [];
function check(name, fn) {
  let ok, detail = '';
  try {
    const r = fn();
    ok = r === true;
    if (!ok) detail = String(r);
  } catch (e) {
    ok = false;
    detail = e.message;
  }
  checks.push({ name, ok, detail });
}

// ── The pass mark ─────────────────────────────────────────────────────────────
check('a Test is marked out of every question, not a margin', () =>
  TEST_PASS_MARK === TEST_LENGTH || 'pass mark is ' + TEST_PASS_MARK + ' of ' + TEST_LENGTH);

// ── Opening earns nothing ─────────────────────────────────────────────────────
//
// Stated as the absence of the action that used to do it. If a PRACTICE_TRICK case is ever added
// back, this is what notices — the reducer would stop returning the identical object.
check('opening a trick is not an achievement', () => {
  const s = fresh();
  const after = reducer(s, { type: 'PRACTICE_TRICK', reqId: 1, gi: 0, ti: 0, total: TOTAL_TRICKS });
  if (after !== s) return 'PRACTICE_TRICK still changes state';
  return earned(after).length === 0 || 'earned ' + earned(after).join(',');
});

// ── Practice ──────────────────────────────────────────────────────────────────
check('finishing a practice drill earns First Trick', () => {
  const s = practice(fresh(), 0, 0);
  return has(s, 'tr_first') || 'earned ' + earned(s).join(',');
});

check('a practice drill counts however badly it went', () => {
  // Nothing right at the first attempt, and it still completed — practice is for working at
  // something, so finishing is the whole of what it asks.
  const s = practice(fresh(), 0, 0, 0);
  if (s.trickStats.practiceDone['0-0'] !== 1) return 'practiceDone ' + JSON.stringify(s.trickStats.practiceDone);
  if (!has(s, 'tr_first')) return 'First Trick not earned';
  return !has(s, 'tr_clean_sweep') || 'Clean Sweep earned on a 0-correct drill';
});

check('Clean Sweep needs every question right first time', () => {
  const bad = practice(fresh(), 0, 0, PRACTICE_LENGTH - 1);
  const good = practice(fresh(), 0, 0, PRACTICE_LENGTH);
  if (has(bad, 'tr_clean_sweep')) return 'earned at ' + (PRACTICE_LENGTH - 1);
  return has(good, 'tr_clean_sweep') || 'not earned at ' + PRACTICE_LENGTH;
});

check('the practiced ladder counts distinct tricks, not repeats', () => {
  let s = fresh();
  for (let i = 0; i < 5; i++) s = practice(s, 0, 0); // the same trick five times
  if (has(s, 'tr_halfway')) return 'Halfway There earned by repeating one trick';
  for (let ti = 1; ti < 5; ti++) s = practice(s, 0, ti);
  return has(s, 'tr_halfway') || 'not earned after 5 distinct tricks';
});

check('Trick Master needs every trick in the library', () => {
  let s = fresh();
  for (let ti = 0; ti < TOTAL_TRICKS - 1; ti++) s = practice(s, 0, ti);
  if (has(s, 'trick_master')) return 'earned one trick short';
  s = practice(s, 0, TOTAL_TRICKS - 1);
  return has(s, 'trick_master') || 'not earned with all ' + TOTAL_TRICKS;
});

// ── The Test ──────────────────────────────────────────────────────────────────
check('a failed Test still counts as an attempt', () => {
  const s = test(fresh(), 0, 0, false);
  if (s.trickStats.testDone['0-0'] !== 1) return 'testDone ' + JSON.stringify(s.trickStats.testDone);
  return s.trickStats.testPassed.length === 0 || 'recorded a pass';
});

check('a failed Test earns nothing at all', () => {
  const s = test(fresh(), 0, 0, false);
  if (earned(s).length) return 'earned ' + earned(s).join(',');
  return s.milestones.tricksPracticedSet.length === 0 || 'credited the practiced list';
});

check('passing a Test earns First Exam and First Trick', () => {
  const s = test(fresh(), 0, 0, true);
  if (!has(s, 'tr_first_exam')) return 'First Exam missing';
  if (!has(s, 'tr_first')) return 'First Trick missing';
  return s.milestones.tricksPracticedSet.indexOf('0-0') !== -1 || 'not added to the practiced list';
});

check('a pass is never taken away by a later failure', () => {
  let s = test(fresh(), 0, 0, true);
  s = test(s, 0, 0, false);
  if (s.trickStats.testPassed.indexOf('0-0') === -1) return 'pass was removed';
  return s.trickStats.testDone['0-0'] === 2 || 'testDone ' + s.trickStats.testDone['0-0'];
});

check('Graduation needs every trick passed', () => {
  let s = fresh();
  for (let ti = 0; ti < TOTAL_TRICKS - 1; ti++) s = test(s, 0, ti, true);
  if (has(s, 'tr_graduation')) return 'earned one trick short';
  s = test(s, 0, TOTAL_TRICKS - 1, true);
  return has(s, 'tr_graduation') || 'not earned with all ' + TOTAL_TRICKS + ' passed';
});

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log((c.ok ? 'ok    ' : 'FAIL  ') + c.name + (c.detail ? ' — ' + c.detail : ''));
}
console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + checks.length + ' checks passed');
await server.close();
process.exit(failed ? 1 : 0);
