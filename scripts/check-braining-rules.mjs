// Braining's one counting trial a day — still true after everything Challenge has been through.
//
// Challenge has been rebuilt twice: every play now counts and the day is scored as an average,
// where it used to be first-trial-only. Braining kept the OLD rule, and the two modes share a
// reducer, a streak, a boost and a state blob. That is exactly the shape of thing that gets
// changed by accident, so this states Braining's rule out loud and runs it.
//
//   the day's FIRST non-practice Braining run is the one that counts
//   it is the only one that credits the streak, and the only one that grants the Challenge boost
//   later runs are recorded, may still improve a personal best, and change nothing else
//
// Run it with:  npm run check:braining

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { reducer, defaultState } = await server.ssrLoadModule('/src/store/AppStateContext.jsx');
const { applyBrainingBoost } = await server.ssrLoadModule('/src/store/scoring.js');
const { brScaleShown, BR_AGES, BR_SCALE, brAge } = await server.ssrLoadModule('/src/store/braining.js');
const { t } = await server.ssrLoadModule('/src/i18n_data.js');

// The scale exactly as the result screen builds it, in English. The translation check below builds
// it again in both languages.
const shown = brScaleShown((k, v) => t('en', k, v));

const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
const key = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const today = key(new Date());
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return key(d); };

const fresh = () => ({ ...defaultState() });

function braining(s, { sec = 200, age = 30, isPrac = false, wrong = 1 } = {}) {
  return reducer(s, { type: 'BRAINING_SESSION_COMPLETE', reqId: 1, sec, age, isPrac, wrong, opTimes: null, lang: 'en' });
}
function challenge(s, { diff = 'easy', score = 100, isPrac = false } = {}) {
  return reducer(s, {
    type: 'CHALLENGE_SESSION_COMPLETE', reqId: 1, diff, score, isPrac,
    correct: 8, wrong: 1, origin: 'challenge', opTimes: null, breakdown: null, lang: 'en',
  });
}
const realBr = (s) => (s.brState.sessions || []).filter((x) => x.real === true);

const checks = [];
function check(name, fn) {
  let ok, detail = '';
  try {
    const r = fn();
    ok = r === true;
    if (!ok) detail = String(r);
  } catch (e) { ok = false; detail = e.message; }
  checks.push({ name, ok, detail });
}

check("the day's first trial is the one that counts", () => {
  const s = braining(fresh());
  if (s.brState.lastDay !== today) return 'lastDay ' + s.brState.lastDay;
  if (realBr(s).length !== 1) return 'real sessions ' + realBr(s).length;
  return s._lastBrResult.isFirst === true || 'isFirst false';
});

check('a second trial the same day is recorded but does not count', () => {
  let s = braining(fresh());
  s = braining(s, { sec: 150, age: 22 });
  if (s.brState.sessions.length !== 2) return 'sessions ' + s.brState.sessions.length;
  if (realBr(s).length !== 1) return realBr(s).length + ' sessions marked real, expected 1';
  return s._lastBrResult.isFirst === false || 'second run reported isFirst';
});

check('a retry can still improve a personal best', () => {
  let s = braining(fresh(), { sec: 200, age: 30 });
  s = braining(s, { sec: 120, age: 21 });
  if (s.brState.bestTime !== 120) return 'bestTime ' + s.brState.bestTime;
  return s.brState.bestAge === 21 || 'bestAge ' + s.brState.bestAge;
});

check('only the counting trial credits the streak', () => {
  let s = braining(fresh());
  const afterFirst = s.streak;
  s = braining(s);
  s = braining(s);
  if (afterFirst !== 1) return 'first trial gave streak ' + afterFirst;
  return s.streak === 1 || 'streak grew to ' + s.streak + ' on retries';
});

check('practice never counts, never credits, never grants a boost', () => {
  const s = braining(fresh(), { isPrac: true });
  if (realBr(s).length !== 0) return 'practice recorded as real';
  if (s.brState.lastDay !== null) return 'practice stamped lastDay';
  if (s.streak !== 0) return 'practice credited the streak';
  return s.brBoostDay === null || 'practice granted a boost';
});

check('only the counting trial grants the Challenge boost', () => {
  let s = braining(fresh());
  if (s.brBoostDay !== today) return 'first trial did not grant the boost';
  // Spend it, then try to earn another one the same day.
  s = challenge(s);
  if (s.brBoostDay !== null) return 'boost survived being spent';
  s = braining(s, { sec: 100, age: 20 });
  return s.brBoostDay === null || 'a retry re-granted the boost';
});

check('exactly one Challenge run is boosted, and it says so', () => {
  let s = braining(fresh());
  s = challenge(s, { score: 100 });
  s = challenge(s, { score: 100 });
  const sessions = s.db.easy.sessions;
  const boosted = sessions.filter((x) => x.boosted);
  if (boosted.length !== 1) return boosted.length + ' boosted attempts';
  if (boosted[0].rawScore !== 100) return 'rawScore ' + boosted[0].rawScore;
  if (boosted[0].score !== applyBrainingBoost(100)) return 'boosted score ' + boosted[0].score;
  return sessions[1].score === 100 || 'the second run was boosted too';
});

check('a Practice-tab run cannot spend the boost', () => {
  let s = braining(fresh());
  s = reducer(s, {
    type: 'CHALLENGE_SESSION_COMPLETE', reqId: 1, diff: null, score: 100, isPrac: true,
    correct: 8, wrong: 1, origin: 'practice', opTimes: null, breakdown: null, lang: 'en',
  });
  return s.brBoostDay === today || 'the Practice tab burned the boost';
});

check('Challenge playing many times does not disturb Braining', () => {
  let s = braining(fresh());
  const brBefore = JSON.stringify(s.brState);
  for (let i = 0; i < 5; i++) s = challenge(s, { score: 50 + i });
  if (JSON.stringify(s.brState) !== brBefore) return 'brState changed under Challenge replays';
  return s.streak === 1 || 'streak moved to ' + s.streak + ' on Challenge replays';
});

check('yesterday\'s trial does not make today already done', () => {
  const s = {
    ...fresh(),
    brState: { sessions: [{ date: ago(1), time: 200, age: 30, real: true }], lastDay: ago(1), bestTime: 200, bestAge: 30 },
  };
  const after = braining(s);
  if (after._lastBrResult.isFirst !== true) return 'today\'s trial was treated as a retry';
  return realBr(after).length === 2 || 'real sessions ' + realBr(after).length;
});

// ── The displayed scale against the computed age ──────────────────────────────
//
// These were two hand-written lists — twelve bands in BR_SCALE, which decides the age, and eight in
// BR_SCALE_SHOWN, which the result screen drew. They disagreed. The 2026-08-14 audit found four rows
// stating an age brAge() never returns, one row (57) displaying an age nobody could earn, and five
// reachable ages with no row at all, so a player landing on 22, 28, 36, 53 or 62 saw a scale with
// nothing highlighted — the result screen marks the current row with `age === s.age`.
//
// The shown scale is now GENERATED from BR_SCALE, so it cannot drift by construction. That is a
// claim about the code, and these three checks are the claim being tested rather than asserted: for
// every second in the plausible range, the age brAge() computes must appear on exactly one displayed
// row, and every displayed row must be an age that is genuinely reachable.

check('every displayed scale row states an age brAge() can actually return', () => {
  const reachable = new Set(BR_AGES);
  for (const row of shown) {
    if (!reachable.has(row.age)) return `row "${row.label}" claims age ${row.age}, which brAge() never returns`;
  }
  return true;
});

check('every reachable age has exactly one row that can highlight it', () => {
  for (const age of BR_AGES) {
    const rows = shown.filter((r) => r.age === age);
    if (rows.length !== 1) return `age ${age} matches ${rows.length} displayed rows, so the screen highlights ${rows.length === 0 ? 'nothing' : 'several'}`;
  }
  return true;
});

check('every second from 0 to 20 minutes lands on the row its own label describes', () => {
  for (let sec = 0; sec <= 1200; sec++) {
    const age = brAge(sec);
    const row = shown.find((r) => r.age === age);
    if (!row) return `${sec}s computes age ${age}, which no displayed row carries`;
    // And the row really is the band this second falls in, not merely a row with a matching age:
    // compare against the BR_SCALE band index rather than trusting the age to be unique.
    const bandIdx = BR_SCALE.findIndex((b) => sec <= b.maxSec);
    if (shown.indexOf(row) !== bandIdx) {
      return `${sec}s falls in band ${bandIdx} but highlights displayed row ${shown.indexOf(row)}`;
    }
  }
  return true;
});

check('the two rows with words in them are translated', () => {
  const en = brScaleShown((k, v) => t('en', k, v)).map((r) => r.label);
  const ru = brScaleShown((k, v) => t('ru', k, v)).map((r) => r.label);
  // Only the first and last rows carry words. The ten between them read "3:00 – 3:30" and are
  // DELIBERATELY identical in both languages, so asserting that every row differs would be
  // asserting the wrong thing — it would force a translation onto a row that has nothing to
  // translate. What matters is that the rows which do carry words carry translated ones.
  const worded = [0, en.length - 1];
  for (const i of worded) {
    if (en[i] === ru[i]) return `row ${i} reads "${en[i]}" in both languages`;
    if (!/[а-яА-Я]/.test(ru[i])) return `row ${i} has no Cyrillic in Russian: "${ru[i]}"`;
  }
  // And the rest really are wordless, rather than English that nobody noticed.
  for (let i = 1; i < en.length - 1; i++) {
    if (/[a-zA-Z]/.test(en[i])) return `row ${i} "${en[i]}" contains letters, so it needs a key`;
  }
  return true;
});

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log((c.ok ? 'ok    ' : 'FAIL  ') + c.name + (c.detail ? ' — ' + c.detail : ''));
}
console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + checks.length + ' checks passed');
await server.close();
process.exit(failed ? 1 : 0);
