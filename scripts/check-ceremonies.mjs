// Does a batch of unlocks play the ceremonies it should, in the order it should?
//
// docs/launch-celebrations-spec.md, Features 5 and 6 — and, for the streak days, the "Decisions made
// during build" at the end of it. Feature 5: lowest rarity first so the run builds to its biggest
// moment; EVERY achievement its own ceremony however many arrive at once (the spec's "+{n} more"
// card was removed on 7 Oct 2026); the first-streak sign-up prompt always its own ceremony, first.
// None of it throws when it is wrong — a legendary played before a common, or a batch of five
// quietly playing only some of them, just happens, and the batches that expose it (four unlocks in
// one run) are rare enough that nobody would see it in testing. The streak days are worse: which of 7, 120, 180, 360 and 365 gets which ceremony —
// or none — is a table of special cases that only shows itself once a year. So the real queue
// builder is driven here with every awkward batch there is.
//
// Run it with:  npm run check:ceremonies

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { buildCeremonies } = await server.ssrLoadModule('/src/components/ceremonyQueue.js');

const LIT = { icon: 'flame', nameKey: 'ms_streaklit_name', descKey: 'ms_streaklit_desc', cta: true };
const k = (key) => ({ key });

// What a list of items looks like, compactly: "lit, ach:ch_first, legacy:ms_streak_name".
const show = (items) => items.map((it) => {
  if (it.kind === 'streak') return 'streak:' + it.days + '/' + it.tier + (it.ach ? '+reward' : '');
  if (it.kind === 'ach') return 'ach:' + it.card.key;
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
// Five at once, common to legendary: every one of them plays, lowest first.
expect('five unlocks: every one plays its own ceremony',
  [k('ch_moon'), k('ch_first'), k('ch_sky'), k('ch_perfect'), k('ch_hard')],
  'ach:ch_first, ach:ch_perfect, ach:ch_hard, ach:ch_sky, ach:ch_moon');
expect('the first-streak prompt comes first', [k('ch_first'), LIT], 'lit, ach:ch_first');
expect('a first game\'s whole batch plays, the sign-up prompt first',
  [k('ch_first'), k('br_first'), k('ch_easy'), k('q_100'), LIT],
  'lit, ach:ch_first, ach:br_first, ach:ch_easy, ach:q_100');
expect('an unknown key is not an achievement ceremony', [{ key: 'not_a_real_key', nameKey: 'x' }], 'legacy:x');

// ── Streak days (spec Feature 6, and its "Decisions made during build") ──
// `step(a, b)` is the card App.jsx adds when a game moves the streak from a to b; `plain(n)` is the
// reducer's ad-hoc "{n}-day streak" card for a day with no catalogue row.
const step = (from, to) => ({ streakStep: { from, to } });
const plain = (n) => ({ icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n } });
expect('day 7: the streak ceremony carries its achievement', [k('streak_7'), step(6, 7)], 'streak:7/common+reward');
expect('day 7 again, already earned: ceremony, no reward row', [step(6, 7)], 'streak:7/common');
expect('day 120 replaces the plain card', [plain(120), step(119, 120)], 'streak:120/uncommon');
expect('day 183 needs no card at all', [step(182, 183)], 'streak:183/rare');
expect('day 180 is the achievement ceremony, in its rarity', [k('streak_180'), step(179, 180)], 'ach:streak_180');
expect('day 240 is green', [plain(240), step(239, 240)], 'streak:240/epic');
expect('day 360 keeps the simple card', [plain(360), step(359, 360)], 'legacy:ms_streak_name');
expect('day 365: gold, with its reward', [k('streak_365'), step(364, 365)], 'streak:365/legendary+reward');
expect('day 390: gold, no reward row', [plain(390), step(389, 390)], 'streak:390/legendary');
expect('day 391 is not a milestone', [step(390, 391)], '');
expect('an ordinary day plays nothing', [step(5, 6)], '');
expect('the streak goes first, achievements after it', [k('ch_moon'), k('streak_30'), k('ch_first'), step(29, 30)],
  'streak:30/common+reward, ach:ch_first, ach:ch_moon');
expect('a streak card with no step still celebrates', [k('streak_14')], 'streak:14/common+reward');
expect('the streak plays before every achievement', [k('ch_first'), k('ch_perfect'), k('ch_hard'), k('streak_60'), step(59, 60)],
  'streak:60/uncommon+reward, ach:ch_first, ach:ch_perfect, ach:ch_hard');
expect('nothing is ever folded away', [k('ch_first'), k('ch_easy'), k('q_100'), k('pr_first'), k('br_first'), k('tr_first')],
  'ach:ch_first, ach:ch_easy, ach:q_100, ach:pr_first, ach:br_first, ach:tr_first');

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
