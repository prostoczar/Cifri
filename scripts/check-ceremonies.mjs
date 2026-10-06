// Does a batch of unlocks play the ceremonies it should, in the order it should?
//
// docs/launch-celebrations-spec.md, Feature 5: lowest rarity first so the run builds to its biggest
// moment; at most three ceremonies, the rest on one "+{n} more" card in the highest remaining tier;
// the first-streak sign-up prompt always its own ceremony. None of it throws when it is wrong —
// a legendary played before a common, or a sign-up ask folded into "+3 more", just quietly happens,
// and the batches that expose it (four unlocks in one run) are rare enough that nobody would see it
// in testing. So the real queue builder is driven here with every awkward batch there is.
//
// Run it with:  npm run check:ceremonies

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { buildCeremonies } = await server.ssrLoadModule('/src/components/ceremonyQueue.js');

const LIT = { icon: 'flame', nameKey: 'ms_streaklit_name', descKey: 'ms_streaklit_desc', cta: true };
const k = (key) => ({ key });

// What a list of items looks like, compactly: "lit, ach:ch_first, more:2/rare, legacy".
const show = (items) => items.map((it) => {
  if (it.kind === 'ach') return 'ach:' + it.card.key;
  if (it.kind === 'more') return 'more:' + it.entries.length + '/' + it.tier;
  if (it.kind === 'legacy') return 'legacy:' + (it.card.nameKey || '?');
  return it.kind;
}).join(', ');

const cases = [];
const expect = (name, cards, wanted) => {
  const got = show(buildCeremonies(cards));
  cases.push({ name, wanted, got, ok: got === wanted });
};

expect('nothing unlocked plays nothing', [], '');
expect('missing list plays nothing', undefined, '');
expect('one achievement plays one ceremony', [k('ch_first')], 'ach:ch_first');
// ch_moon legendary, ch_perfect uncommon, ch_first common — earned in that order.
expect('lowest rarity first, whatever order earned', [k('ch_moon'), k('ch_perfect'), k('ch_first')],
  'ach:ch_first, ach:ch_perfect, ach:ch_moon');
expect('equal rarities keep the order earned', [k('ch_medium'), k('ch_perfect')], 'ach:ch_medium, ach:ch_perfect');
// Five: common, uncommon, rare, epic, legendary → the top three play, the other two share a card
// in the higher of their two tiers (uncommon).
expect('more than three: the three highest play, the rest share a card',
  [k('ch_first'), k('ch_perfect'), k('ch_hard'), k('ch_sky'), k('ch_moon')],
  'ach:ch_hard, ach:ch_sky, ach:ch_moon, more:2/uncommon');
expect('exactly three is no "+more" card', [k('ch_first'), k('ch_perfect'), k('ch_hard')],
  'ach:ch_first, ach:ch_perfect, ach:ch_hard');
expect('the first-streak prompt comes first', [k('ch_first'), LIT], 'lit, ach:ch_first');
expect('the first-streak prompt is never folded into "+more"',
  [k('ch_first'), k('br_first'), k('ch_easy'), k('q_100'), LIT],
  'lit, ach:br_first, ach:ch_easy, ach:q_100, more:1/common');
expect('an unknown key is not an achievement ceremony', [{ key: 'not_a_real_key', nameKey: 'x' }], 'legacy:x');

const w = (s, n) => String(s).padEnd(n);
console.log(w('case', 64) + 'verdict');
console.log('-'.repeat(72));
let failed = 0;
for (const c of cases) {
  if (!c.ok) failed++;
  console.log(w(c.name, 64) + (c.ok ? 'ok' : 'FAIL'));
  if (!c.ok) console.log('    wanted: ' + c.wanted + '\n    got:    ' + c.got);
}
console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + cases.length + ' checks passed');
await server.close();
process.exit(failed ? 1 : 0);
