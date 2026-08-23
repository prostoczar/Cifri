// Can every trick actually ask twenty different questions?
//
// The 14 August 2026 audit found that it could not: 14 of the 47 generators drew from ranges so
// narrow that they could not fill a 20-question Test, so testQuestions() padded the set by
// repeating — Rule of 70 had 7 possible questions, Multiply by 11 had 8, Cube a number had 8.
// Practice was the same story from the other end: a 20-question run kept serving the same eight.
//
// Nothing about that failure was visible. No error, no warning, just a drill that felt like it was
// looping because it was. That is what this script exists to stop happening again.
//
// It measures rather than asserts a remembered number: each gen() is hammered until its output
// space saturates, which is exact because every generator draws from small integer ranges. Two
// things are then checked —
//
//   1. no trick can produce fewer than TEST_LENGTH distinct questions (a Test that repeats)
//   2. every trick's ACTUAL test set is twenty different questions (the thing players see)
//
// (2) is not implied by (1): the set is chosen by ranking a seeded pool, so a trick could clear
// the first bar and still land on duplicates. Both are checked.
//
// The thin list at the bottom is informational, not a failure. Four tricks are inherently narrow
// and no amount of range-widening changes that — see the header of store/tricksData.js.
//
// Run it with:  npm run check:trick-variety

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { TRICKS, setTricksLang } = await server.ssrLoadModule('/src/store/tricksData.js');
const { testQuestions, TEST_LENGTH } = await server.ssrLoadModule('/src/store/trickTest.js');

// Enough draws that a space of a few thousand is found in full. Generators draw from integer
// ranges, so this saturates rather than estimates.
const DRAWS = 60000;

setTricksLang('en');
const rows = [];
let failed = 0;

TRICKS.forEach((g, gi) => {
  g.items.forEach((trick, ti) => {
    const seen = new Set();
    for (let i = 0; i < DRAWS; i++) seen.add(trick.gen().q);

    const set = testQuestions(gi, ti, 'en');
    const uniqInTest = new Set(set.map((q) => q.q)).size;

    const canFill = seen.size >= TEST_LENGTH;
    const testOk = uniqInTest === TEST_LENGTH;
    if (!canFill || !testOk) failed++;

    rows.push({
      group: g.group, name: trick.name,
      distinct: seen.size, uniqInTest,
      verdict: !canFill ? 'FAIL (pool < ' + TEST_LENGTH + ')' : !testOk ? 'FAIL (test repeats)' : 'ok',
    });
  });
});

rows.sort((a, b) => a.distinct - b.distinct);
const w = (s, n) => String(s).padEnd(n);
console.log(w('distinct', 10) + w('test uniq', 11) + w('group', 17) + w('trick', 38) + 'verdict');
console.log('-'.repeat(100));
for (const r of rows) {
  console.log(w(r.distinct, 10) + w(r.uniqInTest + '/' + TEST_LENGTH, 11) + w(r.group, 17) + w(r.name, 38) + r.verdict);
}

// Reported every run so the narrow ones stay visible rather than being rediscovered in a year.
const thin = rows.filter((r) => r.distinct < 60);
console.log('\nInherently narrow (under 60 distinct) — expected, see store/tricksData.js:');
for (const r of thin) console.log('  ' + r.distinct + '  ' + r.group + ' / ' + r.name);

console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + rows.length + ' tricks can fill a distinct ' + TEST_LENGTH + '-question Test');
await server.close();
process.exit(failed ? 1 : 0);
