// The 59-entry achievement catalogue, and the ones that are not connected to anything yet.
//
// Most of this catalogue cannot fire. That is intended — the rows were imported in one go so the
// picker could show players what is out there — but "intended" is a claim about the future, and
// the thing worth checking is what an unwired row DOES today. A row that fires nothing should be
// invisible to the machinery: it should render, lock its reward, count towards the total, and be
// unreachable. What it must not do is throw, render an empty box, or quietly hand out a reward.
//
// So this walks all 59 and asks the questions that would surface those failures, then reports
// which are wired and which are waiting.
//
// Run it with:  npm run check:achievements

import { createServer } from 'vite';
import { readFileSync } from 'fs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const ach = await server.ssrLoadModule('/src/store/achievements.js');
const { AVATAR_ICONS, AVATAR_SYMBOLS } = await server.ssrLoadModule('/src/store/avatar.js');
const { ACHIEVEMENTS, RARITIES, isRewardUnlocked, earnedCount, achievementsPercent, achName, achDesc,
        latestEarnedAchievement, achievementForReward } = ach;

// Which keys the store can actually award. Read out of the reducer's source rather than kept as a
// list here: a hand-maintained copy would drift the moment one was wired, and drift in exactly the
// direction that makes this file lie about the thing it exists to report.
const src = readFileSync(new URL('../src/store/AppStateContext.jsx', import.meta.url), 'utf8');
const wired = new Set();
for (const m of src.matchAll(/earn\(\w+,\s*\w+,\s*'([a-z0-9_]+)'\)/g)) wired.add(m[1]);
// The streak ladder is awarded by key lookup rather than by a literal, so it is wired for every
// threshold the catalogue names.
for (const a of ACHIEVEMENTS) if (a.mode === 'streak' && /^streak_\d+$/.test(a.key)) wired.add(a.key);

const checks = [];
function check(name, fn) {
  let ok, detail = '';
  try {
    const r = fn();
    ok = r === true;
    if (!ok) detail = String(r);
  } catch (e) { ok = false; detail = e.message + (e.stack ? ' @ ' + e.stack.split('\n')[1] : ''); }
  checks.push({ name, ok, detail });
}

check('the catalogue is 59 entries with unique keys', () => {
  const keys = new Set(ACHIEVEMENTS.map((a) => a.key));
  if (keys.size !== ACHIEVEMENTS.length) return 'duplicate keys';
  return ACHIEVEMENTS.length === 59 || 'found ' + ACHIEVEMENTS.length;
});

check('every entry has both languages and a known rarity', () => {
  for (const a of ACHIEVEMENTS) {
    if (!achName('en', a) || !achDesc('en', a)) return a.key + ' missing English';
    if (!achName('ru', a) || !achDesc('ru', a)) return a.key + ' missing Russian';
    if (RARITIES.indexOf(a.rarity) === -1) return a.key + ' rarity ' + a.rarity;
  }
  return true;
});

// The failure this is really looking for: an unwired row whose reward names an icon that does not
// exist. It would draw as an empty grey square in the picker, and the "how to unlock" card behind
// it would be blank — a broken-looking hole rather than something to go after.
check('every reward is something the picker can actually draw', () => {
  for (const a of ACHIEVEMENTS) {
    const { type, value } = a.reward;
    if (type === 'icon' && !AVATAR_ICONS[value]) return a.key + ' → missing icon "' + value + '"';
    if (type === 'symbol' && AVATAR_SYMBOLS.indexOf(value) === -1) return a.key + ' → symbol "' + value + '" not in the picker';
    if (type !== 'icon' && type !== 'symbol') return a.key + ' → unknown reward type ' + type;
  }
  return true;
});

check('no two achievements hand out the same reward', () => {
  const seen = new Map();
  for (const a of ACHIEVEMENTS) {
    const id = a.reward.type + ':' + a.reward.value;
    if (seen.has(id)) return id + ' given by both ' + seen.get(id) + ' and ' + a.key;
    seen.set(id, a.key);
  }
  return true;
});

// The whole point: an achievement nothing can award must keep its reward locked forever.
check('an unwired achievement locks its reward and stays locked', () => {
  const empty = { achievedLog: [], streakShown: [], tricksPracticedSet: [], trickCount: 0 };
  for (const a of ACHIEVEMENTS) {
    if (isRewardUnlocked(empty, a.reward.type, a.reward.value)) {
      return a.key + '\'s reward is unlocked with nothing earned';
    }
  }
  return true;
});

check('the free picker options need no achievement', () => {
  const empty = { achievedLog: [] };
  for (const v of ach.FREE_SYMBOLS) {
    if (!isRewardUnlocked(empty, 'symbol', v)) return 'symbol ' + v + ' is locked';
  }
  for (const v of ach.FREE_ICONS) {
    if (!isRewardUnlocked(empty, 'icon', v)) return 'icon ' + v + ' is locked';
  }
  return true;
});

// Reading the earned state must survive the shapes real saved data comes in — including the
// pre-achievements blobs still sitting in players' localStorage and on the server.
check('malformed or ancient saved data does not throw', () => {
  const shapes = [null, undefined, {}, { achievedLog: null }, { achievedLog: [] },
    { achievedLog: ['streak_lit', 'not_a_real_key', 'streak_450'] }];
  for (const m of shapes) {
    earnedCount(m);
    achievementsPercent(m);
    latestEarnedAchievement(m);
    for (const a of ACHIEVEMENTS) isRewardUnlocked(m, a.reward.type, a.reward.value);
  }
  return true;
});

check('keys that are not achievements do not count towards the total', () => {
  // `streak_lit` is the save-your-progress prompt and streaks past 365 have no catalogue entry.
  // Both sit in the earned log of real players and neither is something they achieved.
  const m = { achievedLog: ['streak_lit', 'streak_450', 'streak_720'] };
  if (earnedCount(m) !== 0) return 'counted ' + earnedCount(m);
  return latestEarnedAchievement(m) === null || 'reported one as the latest earned';
});

check('achievementForReward round-trips every entry', () => {
  for (const a of ACHIEVEMENTS) {
    const found = achievementForReward(a.reward.type, a.reward.value);
    if (!found || found.key !== a.key) return a.key + ' did not round-trip';
  }
  return true;
});

check('a full log reads as 100%', () => {
  const m = { achievedLog: ACHIEVEMENTS.map((a) => a.key) };
  if (earnedCount(m) !== ACHIEVEMENTS.length) return 'counted ' + earnedCount(m);
  return achievementsPercent(m) === 100 || 'percent ' + achievementsPercent(m);
});

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log((c.ok ? 'ok    ' : 'FAIL  ') + c.name + (c.detail ? ' — ' + c.detail : ''));
}

// ── The wiring report ─────────────────────────────────────────────────────────
const byMode = {};
for (const a of ACHIEVEMENTS) {
  const bucket = (byMode[a.mode] = byMode[a.mode] || { wired: [], waiting: [] });
  (wired.has(a.key) ? bucket.wired : bucket.waiting).push(a.key);
}
console.log('\n' + 'category'.padEnd(12) + 'wired'.padEnd(8) + 'waiting');
console.log('-'.repeat(58));
let w = 0, p = 0;
for (const mode of Object.keys(byMode).sort()) {
  const b = byMode[mode];
  w += b.wired.length; p += b.waiting.length;
  console.log(mode.padEnd(12) + String(b.wired.length).padEnd(8) + (b.waiting.length ? b.waiting.join(' ') : '—'));
}
console.log('-'.repeat(58));
console.log('total'.padEnd(12) + String(w).padEnd(8) + p + ' waiting to be wired');

console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + checks.length + ' checks passed');
await server.close();
process.exit(failed ? 1 : 0);
