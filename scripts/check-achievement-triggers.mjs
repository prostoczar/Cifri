// Does each achievement actually fire, and only when it should?
//
// check:achievements answers a different and weaker question — it reads the reducer's SOURCE and
// reports which keys appear in an earn() call. That catches an achievement nobody wired at all,
// and nothing else. A trigger wired to the wrong number, reading the boosted score instead of the
// raw one, or firing on a near-miss would sail through it looking perfectly connected.
//
// So this one plays. Every case below drives the real reducer with the real action a real finished
// session produces, then asks whether the key landed in the earned log. Where a rule has an edge —
// a threshold, an exact value, a "three in a row" — the near-miss is asserted too, because a
// trigger that fires on everything is as broken as one that fires on nothing, and only the
// negative case can tell the two apart.
//
// Run it with:  npm run check:triggers

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { reducer, defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const { ACHIEVEMENTS } = await server.ssrLoadModule('/src/store/achievements.js');
const { applyBrainingBoost } = await server.ssrLoadModule('/src/store/scoring.js');
const { dayKey, addDaysStr } = await server.ssrLoadModule('/src/store/dates.js');

const TODAY = dayKey();
const ALL_OPS = ['addition', 'subtraction', 'multiplication', 'division', 'percentage'];

// ── Building the actions a finished session sends ─────────────────────────────

// `ops` is the per-operation tally the game keeps as the score is earned. Given a list of
// operations, this builds one that says each was asked once and answered correctly.
function opsTally(ops, { correctEach = 1, askedEach = 1 } = {}) {
  const out = {};
  for (const o of ops) out[o] = { asked: askedEach, correct: correctEach, points: 10 };
  return { ops: out, wrong: 0, penalty: 0, floorAbsorbed: 0, dm: 1 };
}

function challenge(s, { diff = 'easy', score = 50, correct = 10, wrong = 0, isPrac = false, origin, breakdown = null } = {}) {
  return reducer(s, {
    type: 'CHALLENGE_SESSION_COMPLETE', reqId: 1, diff, score, isPrac, correct, wrong,
    origin: origin || (diff ? 'challenge' : 'practice'),
    opTimes: null, breakdown, lang: 'en',
  });
}

// A standalone Practice-tab run: no difficulty, so it is never recorded, and origin 'practice'.
function practice(s, { correct = 10, wrong = 0, ops = ALL_OPS } = {}) {
  return challenge(s, { diff: null, score: 0, correct, wrong, isPrac: true, origin: 'practice', breakdown: opsTally(ops) });
}

function braining(s, { sec = 200, age = 30, isPrac = false, wrong = 0, total } = {}) {
  return reducer(s, {
    type: 'BRAINING_SESSION_COMPLETE', reqId: 1, sec, age, isPrac, wrong,
    total: total === undefined ? (isPrac ? 20 : 50) : total,
    opTimes: null, lang: 'en',
  });
}

function trickPractice(s, { gi = 0, ti = 0, firstTryCorrect = 20 } = {}) {
  return reducer(s, { type: 'TRICK_PRACTICE_COMPLETE', reqId: 1, gi, ti, firstTryCorrect, total: 20, totalTricks: 47 });
}

const log = (s) => (s.milestones.achievedLog || []);
const has = (s, key) => log(s).indexOf(key) !== -1;

// ── The harness ───────────────────────────────────────────────────────────────

let failed = 0;
const covered = new Set();

// `key` is asserted to be in the log after `play` runs. `not` lists keys that must NOT be.
function earns(key, description, play, { not = [] } = {}) {
  covered.add(key);
  let ok = true, detail = '';
  try {
    const s = play({ ...defaultState() });
    if (!has(s, key)) { ok = false; detail = 'not earned'; }
    for (const n of not) {
      if (has(s, n)) { ok = false; detail = (detail ? detail + '; ' : '') + n + ' fired when it should not have'; }
    }
  } catch (e) {
    ok = false;
    detail = e.message + (e.stack ? ' @ ' + e.stack.split('\n')[1].trim() : '');
  }
  if (!ok) failed++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + key.padEnd(18) + description + (detail ? ' — ' + detail : ''));
}

// A rule's near-miss: the same shape of play, one notch short, earning nothing.
function stopsShort(key, description, play) {
  let ok = true, detail = '';
  try {
    const s = play({ ...defaultState() });
    if (has(s, key)) { ok = false; detail = 'fired anyway'; }
  } catch (e) {
    ok = false;
    detail = e.message;
  }
  if (!ok) failed++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + ('· ' + key).padEnd(18) + description + (detail ? ' — ' + detail : ''));
}

// ── Streak ────────────────────────────────────────────────────────────────────
console.log('\nStreak');

earns('streak_rebirth', 'taking the streak restore offer', (s) => {
  s.pendingRestore = { brokenValue: 9, brokenAtMs: Date.now(), availableAtBreak: true };
  return reducer(s, { type: 'STREAK_RESTORE', reqId: 1 });
});

// The restore undoes the break, so it must also undo the fact of it — otherwise New Record
// becomes earnable by a player who has never actually lost a streak.
stopsShort('streak_record', 'a restored break does not count as a break', (s) => {
  s.pendingRestore = { brokenValue: 9, brokenAtMs: Date.now(), availableAtBreak: true };
  s.milestones = { ...s.milestones, everBrokeStreak: true };
  let out = reducer(s, { type: 'STREAK_RESTORE', reqId: 1 });
  if (out.milestones.everBrokeStreak) throw new Error('everBrokeStreak survived a restore');
  out = { ...out, streak: 12, bestStreakEver: 12, streakCreditedForDay: addDaysStr(TODAY, -1) };
  return challenge(out, { diff: 'easy', score: 40 });
});

earns('streak_record', 'passing your old best, having lost a streak before', (s) => {
  s.milestones = { ...s.milestones, everBrokeStreak: true };
  s.streak = 12;
  s.bestStreakEver = 12;
  s.streakCreditedForDay = addDaysStr(TODAY, -1);
  return challenge(s, { diff: 'easy', score: 40 });
});

stopsShort('streak_record', 'a first streak passing its own record is not a record', (s) => {
  s.streak = 12;
  s.bestStreakEver = 12;
  s.streakCreditedForDay = addDaysStr(TODAY, -1);
  return challenge(s, { diff: 'easy', score: 40 });
});

// The break itself has to record that it happened, or nothing above can ever be true in real play.
{
  let s = { ...defaultState(), streak: 5, streakCreditedForDay: addDaysStr(TODAY, -3), streakRestoreAvailable: true };
  s = reducer(s, { type: 'CHECK_STREAK_BREAK' });
  const ok = s.streak === 0 && s.milestones.everBrokeStreak === true;
  if (!ok) failed++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + '· break'.padEnd(18) + 'a real streak break records that it happened');
}

// ── Challenge ─────────────────────────────────────────────────────────────────
console.log('\nChallenge');

// The score ladder: three rungs on each difficulty, and the difficulty is part of every rule. Each
// rung is checked three ways — it fires on its own tier at its own number, it does NOT fire one
// point short, and it does NOT fire on the same number on a different tier. The third is the one the
// old flat ladder never needed and the one a careless edit would lose.
const LADDER = [
  { key: 'ch_sprout', diff: 'easy', at: 125, above: ['ch_leaf', 'ch_evergreen'] },
  { key: 'ch_leaf', diff: 'easy', at: 300, above: ['ch_evergreen'] },
  { key: 'ch_evergreen', diff: 'easy', at: 375, above: [] },
  { key: 'ch_small_change', diff: 'medium', at: 150, above: ['ch_making_bank', 'ch_priceless'] },
  { key: 'ch_making_bank', diff: 'medium', at: 400, above: ['ch_priceless'] },
  { key: 'ch_priceless', diff: 'medium', at: 525, above: [] },
  { key: 'ch_peak', diff: 'hard', at: 200, above: ['ch_sky', 'ch_moon'] },
  { key: 'ch_sky', diff: 'hard', at: 550, above: ['ch_moon'] },
  { key: 'ch_moon', diff: 'hard', at: 750, above: [] },
];
const OTHER_DIFFS = { easy: ['medium', 'hard'], medium: ['easy', 'hard'], hard: ['easy', 'medium'] };

for (const r of LADDER) {
  earns(r.key, `a ${r.at}-point ${r.diff} run`, (s) => challenge(s, { diff: r.diff, score: r.at }),
    { not: r.above });
  stopsShort(r.key, `a ${r.at - 1}-point ${r.diff} run`, (s) => challenge(s, { diff: r.diff, score: r.at - 1 }));
  for (const other of OTHER_DIFFS[r.diff]) {
    stopsShort(r.key, `a ${r.at}-point ${other} run (wrong tier)`,
      (s) => challenge(s, { diff: other, score: r.at }));
  }
}

earns('ch_nice', 'a score of exactly 69', (s) => challenge(s, { score: 69 }));
stopsShort('ch_nice', 'a score of 70', (s) => challenge(s, { score: 70 }));

// The rule the whole boost design exists to protect: a boosted run must not buy an achievement the
// run itself did not earn. 120 raw boosts to 126, so this straddles Sprout's 125 exactly.
stopsShort('ch_sprout', 'a 120-point run boosted over 125', (s) => {
  const after = challenge(braining(s), { diff: 'easy', score: 120 });
  const entry = after.db.easy.sessions[0];
  if (!(entry.score >= 125 && entry.rawScore === 120)) {
    throw new Error('fixture no longer straddles 125 (' + entry.rawScore + ' → ' + entry.score + ')');
  }
  return after;
});

earns('ch_four_for_four', 'all five operation types answered right', (s) =>
  challenge(s, { breakdown: opsTally(ALL_OPS) }));
stopsShort('ch_four_for_four', 'four of the five, percentage missing', (s) =>
  challenge(s, { breakdown: opsTally(ALL_OPS.slice(0, 4)) }));
stopsShort('ch_four_for_four', 'all five asked, one never answered right', (s) => {
  const b = opsTally(ALL_OPS);
  b.ops.division = { asked: 3, correct: 0, points: 0 };
  return challenge(s, { breakdown: b });
});

earns('ch_challenger', 'easy, medium and hard today with 5 correct in each', (s) => {
  for (const d of ['easy', 'medium', 'hard']) s = challenge(s, { diff: d, score: 30, correct: 5 });
  return s;
}, { not: ['ch_triple_crown'] });

stopsShort('ch_challenger', 'only two difficulties today', (s) => {
  for (const d of ['easy', 'medium']) s = challenge(s, { diff: d, score: 30, correct: 9 });
  return s;
});
stopsShort('ch_challenger', 'all three, but one run only got 4 right', (s) => {
  s = challenge(s, { diff: 'easy', score: 30, correct: 9 });
  s = challenge(s, { diff: 'medium', score: 30, correct: 9 });
  return challenge(s, { diff: 'hard', score: 30, correct: 4 });
});

earns('ch_triple_crown', 'all three today with 20 correct in each', (s) => {
  for (const d of ['easy', 'medium', 'hard']) s = challenge(s, { diff: d, score: 90, correct: 20 });
  return s;
});

// ── Practice ──────────────────────────────────────────────────────────────────
console.log('\nPractice');

earns('pr_first', 'finishing one Practice session', (s) => practice(s, { correct: 5 }));
stopsShort('pr_first', 'a Challenge run is not a Practice run', (s) => challenge(s, { diff: 'easy', score: 40 }));

earns('pr_sharpshooter', '20 questions, none wrong', (s) => practice(s, { correct: 20, wrong: 0 }));
stopsShort('pr_sharpshooter', '20 questions with one wrong', (s) => practice(s, { correct: 20, wrong: 1 }));
stopsShort('pr_sharpshooter', '19 clean questions', (s) => practice(s, { correct: 19, wrong: 0 }));

earns('pr_marathon', 'a 100-question session', (s) => practice(s, { correct: 80, wrong: 20 }));
stopsShort('pr_marathon', 'a 99-question session', (s) => practice(s, { correct: 80, wrong: 19 }));

earns('pr_all_mixed', 'every operation in one session', (s) => practice(s, { ops: ALL_OPS }));
stopsShort('pr_all_mixed', 'four operations in one session', (s) => practice(s, { ops: ALL_OPS.slice(0, 4) }));

earns('pr_mix_master', 'every operation across several sessions', (s) => {
  s = practice(s, { ops: ['addition', 'subtraction'] });
  s = practice(s, { ops: ['multiplication'] });
  s = practice(s, { ops: ['division', 'percentage'] });
  // Never all five in one sitting, so this must be the cumulative rule and not All Mixed Up.
  if (has(s, 'pr_all_mixed')) throw new Error('All Mixed Up fired without a single mixed session');
  return s;
});

// ── Cumulative ────────────────────────────────────────────────────────────────
console.log('\nCumulative');

// Braining is a fixed 50, so the count crosses 100 on the second session and not the first.
earns('q_100', '100 questions across modes', (s) => braining(braining(s)));
stopsShort('q_100', '50 questions', (s) => braining(s));

earns('q_500', '500 questions', (s) => {
  for (let i = 0; i < 5; i++) s = practice(s, { correct: 100 });
  return s;
}, { not: ['q_1000'] });

earns('q_1000', '1,000 questions', (s) => {
  for (let i = 0; i < 10; i++) s = practice(s, { correct: 100 });
  return s;
});
earns('q_2500', '2,500 questions', (s) => {
  for (let i = 0; i < 25; i++) s = practice(s, { correct: 100 });
  return s;
});
earns('q_5000', '5,000 questions', (s) => {
  for (let i = 0; i < 50; i++) s = practice(s, { correct: 100 });
  return s;
});

// Every mode really does feed the same total: 50 + 20 + 20 + 10 + 10 = 110.
{
  let s = { ...defaultState() };
  s = braining(s);                        // 50
  s = braining(s, { isPrac: true });      // 20
  s = trickPractice(s);                   // 20
  s = challenge(s, { correct: 8, wrong: 2 });   // 10
  s = practice(s, { correct: 10 });             // 10
  const ok = s.milestones.qTotal === 110;
  if (!ok) failed++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + '· qTotal'.padEnd(18) + 'every mode adds to the same total (110)'
    + (ok ? '' : ' — got ' + s.milestones.qTotal));
}

earns('q_pct_pro', '70 percentage questions right', (s) => {
  // 10 sessions of 7 correct percentage answers.
  for (let i = 0; i < 10; i++) {
    s = challenge(s, { score: 40, correct: 7, breakdown: { ops: { percentage: { asked: 7, correct: 7, points: 70 } } } });
  }
  return s;
});
stopsShort('q_pct_pro', '69 percentage questions right', (s) => {
  for (let i = 0; i < 69; i++) {
    s = challenge(s, { score: 40, correct: 1, breakdown: { ops: { percentage: { asked: 1, correct: 1, points: 10 } } } });
  }
  return s;
});

// ── Replay ────────────────────────────────────────────────────────────────────
console.log('\nReplay');

earns('rp_first', 'a second run on the same difficulty today', (s) =>
  challenge(challenge(s, { score: 50 }), { score: 50 }));
stopsShort('rp_first', 'the day\'s first run', (s) => challenge(s, { score: 50 }));
stopsShort('rp_first', 'a different difficulty is not a replay', (s) =>
  challenge(challenge(s, { diff: 'easy', score: 50 }), { diff: 'hard', score: 50 }));

earns('rp_up', 'a replay that lifted the average', (s) =>
  challenge(challenge(s, { score: 50 }), { score: 80 }), { not: ['rp_plus50'] });
stopsShort('rp_up', 'a replay that dropped the average', (s) =>
  challenge(challenge(s, { score: 80 }), { score: 50 }));

// 40 then 200 averages 120 — a 80-point lift in one replay.
earns('rp_plus50', 'a replay worth 50+ on the average', (s) =>
  challenge(challenge(s, { score: 40 }), { score: 200 }));
stopsShort('rp_plus50', 'a replay worth 20 on the average', (s) =>
  challenge(challenge(s, { score: 40 }), { score: 80 }));

earns('rp_five', 'seven replays in a day across difficulties', (s) => {
  // 4 easy + 3 medium + 3 hard = 10 runs, of which 3 + 2 + 2 = 7 are replays.
  for (let i = 0; i < 4; i++) s = challenge(s, { diff: 'easy', score: 50 });
  for (let i = 0; i < 3; i++) s = challenge(s, { diff: 'medium', score: 50 });
  for (let i = 0; i < 3; i++) s = challenge(s, { diff: 'hard', score: 50 });
  return s;
});
stopsShort('rp_five', 'six replays in a day', (s) => {
  for (let i = 0; i < 3; i++) s = challenge(s, { diff: 'easy', score: 50 });
  for (let i = 0; i < 3; i++) s = challenge(s, { diff: 'medium', score: 50 });
  for (let i = 0; i < 3; i++) s = challenge(s, { diff: 'hard', score: 50 });
  return s;
});

// Three REPLAYS in a row is the day's second, third and fourth runs — so four runs, and only the
// last three have to be close together.
earns('rp_consistent', 'three replays in a row within 5 points', (s) => {
  for (const sc of [10, 50, 52, 54]) s = challenge(s, { diff: 'easy', score: sc });
  return s;
});
stopsShort('rp_consistent', 'only three runs, so only two replays', (s) => {
  for (const sc of [50, 52, 54]) s = challenge(s, { diff: 'easy', score: sc });
  return s;
});
stopsShort('rp_consistent', 'four runs, last three spread by 6', (s) => {
  for (const sc of [10, 50, 53, 56]) s = challenge(s, { diff: 'easy', score: sc });
  return s;
});

// ── Cross-mode ────────────────────────────────────────────────────────────────
console.log('\nCross-mode');

earns('x_explorer', 'all four modes tried', (s) => {
  s = challenge(s, { score: 40 });
  s = braining(s);
  s = practice(s, { correct: 5 });
  return trickPractice(s);
});
stopsShort('x_explorer', 'three of the four modes', (s) => {
  s = challenge(s, { score: 40 });
  s = braining(s);
  return practice(s, { correct: 5 });
});

earns('x_well_rounded', 'all four modes on one day', (s) => {
  s = challenge(s, { score: 40 });
  s = braining(s);
  s = practice(s, { correct: 5 });
  return trickPractice(s);
});
stopsShort('x_well_rounded', 'the trick was practiced yesterday', (s) => {
  s = challenge(s, { score: 40 });
  s = braining(s);
  s = practice(s, { correct: 5 });
  s = trickPractice(s);
  // Roll the trick back a day and replay the run that would complete the set.
  s = { ...s, milestones: { ...s.milestones, trickLastDay: addDaysStr(TODAY, -1), achievedLog: [] } };
  return challenge(s, { score: 40 });
});

earns('x_one_year', '365 days since the first open', (s) => {
  s.firstOpenDate = addDaysStr(TODAY, -365);
  return reducer(s, { type: 'AMBIENT_ACHIEVEMENTS_CHECK', reqId: 1 });
});
stopsShort('x_one_year', '364 days since the first open', (s) => {
  s.firstOpenDate = addDaysStr(TODAY, -364);
  return reducer(s, { type: 'AMBIENT_ACHIEVEMENTS_CHECK', reqId: 1 });
});

earns('x_collector', 'the last remaining achievement', (s) => {
  // Everything except the collector itself and First Challenge, which the run below earns.
  s.milestones = {
    ...s.milestones,
    achievedLog: ACHIEVEMENTS.map((a) => a.key).filter((k) => k !== 'x_collector' && k !== 'ch_first'),
  };
  return challenge(s, { score: 40 });
});
stopsShort('x_collector', 'one still missing', (s) => {
  s.milestones = {
    ...s.milestones,
    achievedLog: ACHIEVEMENTS.map((a) => a.key).filter((k) => k !== 'x_collector' && k !== 'ch_first' && k !== 'br_first'),
  };
  return challenge(s, { score: 40 });
});

// ── Every card that fires is a card the popup can draw ────────────────────────
//
// An achievement earned but not announced is invisible, and an announcement naming a key the
// catalogue does not have would render a blank card. Both are silent failures.
console.log('\nAnnouncements');
{
  const byKey = new Set(ACHIEVEMENTS.map((a) => a.key));
  let s = { ...defaultState() };
  const cards = [];
  const collect = (next, from) => {
    for (const c of (from || [])) cards.push(c);
    return next;
  };
  s = collect(challenge(s, { diff: 'easy', score: 100, correct: 20, breakdown: opsTally(ALL_OPS) }), null);
  cards.push(...(s._lastSessionResult.unlocked || []));
  s = braining(s);
  cards.push(...(s._lastBrResult.unlocked || []));
  s = practice(s, { correct: 20 });
  cards.push(...(s._lastSessionResult.unlocked || []));
  s = trickPractice(s);
  cards.push(...(s._lastTrickUnlocked.unlocked || []));

  const bad = cards.filter((c) => c.key && !byKey.has(c.key));
  const earnedButSilent = log(s).filter((k) => k !== 'streak_lit' && !cards.some((c) => c.key === k));
  let ok = true;
  if (bad.length) { ok = false; console.log('FAIL  ' + '· cards'.padEnd(18) + 'card names an unknown key: ' + bad.map((c) => c.key).join(' ')); }
  if (earnedButSilent.length) { ok = false; console.log('FAIL  ' + '· cards'.padEnd(18) + 'earned with no card shown: ' + earnedButSilent.join(' ')); }
  if (!ok) failed++;
  else console.log('ok    ' + '· cards'.padEnd(18) + 'all ' + cards.length + ' cards from a mixed day are drawable, and nothing was earned silently');
}

// ── The display order ─────────────────────────────────────────────────────────
console.log('\nOrder');
{
  const { achievementsByRarity, RARITIES } = await server.ssrLoadModule('/src/store/achievements.js');
  const ordered = achievementsByRarity();
  let ok = true, why = '';
  if (ordered.length !== ACHIEVEMENTS.length) { ok = false; why = 'length ' + ordered.length; }
  const keys = new Set(ordered.map((a) => a.key));
  if (keys.size !== ACHIEVEMENTS.length) { ok = false; why = 'entries duplicated or dropped'; }
  for (const a of ACHIEVEMENTS) if (!keys.has(a.key)) { ok = false; why = a.key + ' is missing from the ordered view'; }
  for (let i = 1; i < ordered.length; i++) {
    if (RARITIES.indexOf(ordered[i].rarity) < RARITIES.indexOf(ordered[i - 1].rarity)) {
      ok = false; why = ordered[i].key + ' (' + ordered[i].rarity + ') comes after ' + ordered[i - 1].rarity;
    }
  }
  // Within a tier, a family must be one run rather than scattered through it.
  const seen = new Set();
  let prev = null;
  for (const a of ordered) {
    const id = a.rarity + '/' + a.mode;
    if (id !== prev) {
      if (seen.has(id)) { ok = false; why = id + ' appears in two separate runs'; }
      seen.add(id);
      prev = id;
    }
  }
  if (!ok) failed++;
  console.log((ok ? 'ok    ' : 'FAIL  ') + '· order'.padEnd(18)
    + `all ${ACHIEVEMENTS.length} present once, common→legendary, families grouped inside each tier`
    + (ok ? '' : ' — ' + why));
}

// ── Did this file actually test everything it claims to? ──────────────────────
//
// The point of that session was 29 specific achievements, and the score-ladder rebuild added six
// more. A test file that quietly stopped covering one of them would still pass every check above.
console.log('');
const EXPECTED = [
  'streak_rebirth', 'streak_record',
  'ch_challenger', 'ch_four_for_four', 'ch_peak', 'ch_sky', 'ch_moon', 'ch_triple_crown', 'ch_nice',
  // The six added when the flat score ladder became three rungs per difficulty.
  'ch_sprout', 'ch_leaf', 'ch_evergreen', 'ch_small_change', 'ch_making_bank', 'ch_priceless',
  'pr_sharpshooter', 'pr_mix_master', 'pr_marathon', 'pr_all_mixed', 'pr_first',
  'q_100', 'q_500', 'q_1000', 'q_2500', 'q_5000', 'q_pct_pro',
  'rp_first', 'rp_up', 'rp_plus50', 'rp_five', 'rp_consistent',
  'x_well_rounded', 'x_one_year', 'x_explorer', 'x_collector',
];
const missing = EXPECTED.filter((k) => !covered.has(k));
if (missing.length) {
  failed++;
  console.log('FAIL  ' + missing.length + ' of the ' + EXPECTED.length + ' have no earning test: ' + missing.join(' '));
} else {
  console.log('ok    all ' + EXPECTED.length + ' newly-wired achievements were triggered for real');
}

console.log(failed ? '\n' + failed + ' FAILED' : '\nall checks passed');
await server.close();
process.exit(failed ? 1 : 0);
