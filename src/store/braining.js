// Braining logic — ported verbatim from the reference prototype.
//
// The only addition is `digits` and `terms` on each generated question, for the attempt log.
// brMakeQ already picked its term count on its first line and discarded it; it is now reported
// instead. No question, answer or timing behaviour changes.
import { digitsInQuestion } from './questionEngine.js';

export const BR_SCALE = [
  { maxSec: 180, age: 20, label: 'Under 3 min', color: '#3d7020' },
  { maxSec: 210, age: 22, label: '3 – 3m 30s', color: '#4a8a28' },
  { maxSec: 240, age: 25, label: '3m 30s – 4 min', color: '#5a9e35' },
  { maxSec: 270, age: 28, label: '4 – 4m 30s', color: '#0f9d6c' },
  { maxSec: 300, age: 32, label: '4m 30s – 5 min', color: '#9bc878' },
  { maxSec: 330, age: 36, label: '5 – 5m 30s', color: '#b8c060' },
  { maxSec: 360, age: 40, label: '5m 30s – 6 min', color: '#c8a840' },
  { maxSec: 420, age: 46, label: '6 – 7 min', color: '#c07a30' },
  { maxSec: 480, age: 53, label: '7 – 8 min', color: '#d05a20' },
  { maxSec: 540, age: 62, label: '8 – 9 min', color: '#c0654a' },
  { maxSec: 600, age: 72, label: '9 – 10 min', color: '#a03828' },
  { maxSec: 99999, age: 80, label: 'Over 10 min', color: '#8a3a25' },
];

// The fixed 8-row scale shown on the result screen (a condensed view of BR_SCALE above).
export const BR_SCALE_SHOWN = [
  { label: 'Under 3 min', age: 20, color: '#3d7020' },
  { label: '3 – 4 min', age: 25, color: '#5a9e35' },
  { label: '4 – 5 min', age: 32, color: '#0f9d6c' },
  { label: '5 – 6 min', age: 40, color: '#c8a840' },
  { label: '6 – 7 min', age: 46, color: '#c07a30' },
  { label: '7 – 9 min', age: 57, color: '#d05a20' },
  { label: '9 – 10 min', age: 72, color: '#c0654a' },
  { label: 'Over 10 min', age: 80, color: '#8a3a25' },
];

export function brAge(sec) {
  for (let i = 0; i < BR_SCALE.length; i++) {
    if (sec <= BR_SCALE[i].maxSec) return BR_SCALE[i].age;
  }
  return 80;
}

export function brAgeColor(age) {
  for (let i = 0; i < BR_SCALE.length; i++) {
    if (age <= BR_SCALE[i].age) return BR_SCALE[i].color;
  }
  return '#8a3a25';
}

export function brRn(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export function brFmtSec(s) {
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60), sec = s % 60;
  return m + 'm ' + (sec < 10 ? '0' : '') + sec + 's';
}

export function brFmtTimer(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

export function fmtBrCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return 'Next Braining in ' + h + 'h ' + m + 'm ' + sec + 's';
}

export function brMakeQ(op) {
  const terms = Math.random() < 0.5 ? 2 : 3;
  let q, ans;
  if (op === 'add') {
    const nums = [];
    for (let i = 0; i < terms; i++) nums.push(Math.random() < 0.5 ? brRn(1, 9) : brRn(10, 49));
    ans = nums.reduce((a, b) => a + b, 0);
    q = nums.join(' + ') + ' = ?';
    return { q, ans, op: 'Addition', digits: digitsInQuestion(q), terms };
  }
  if (op === 'sub') {
    // Starting number floor is 15 so there's always room for a meaningful subtraction.
    const first = Math.random() < 0.5 ? brRn(20, 59) : brRn(15, 25);
    const vals = [];
    for (let j = 1; j < terms; j++) {
      vals.push(Math.random() < 0.4 ? brRn(10, Math.min(first - 1, 40)) : brRn(1, 9));
    }
    ans = first;
    for (let k = 0; k < vals.length; k++) ans -= vals[k];
    // Safety net: the final answer is never exactly 0.
    if (ans === 0) {
      const li = vals.length - 1;
      vals[li] = vals[li] > 1 ? vals[li] - 1 : vals[li] + 1;
      ans = first;
      for (let k2 = 0; k2 < vals.length; k2++) ans -= vals[k2];
    }
    const qp = [String(first)];
    vals.forEach((v) => qp.push('− ' + v));
    const qs = qp.join(' ') + ' = ?';
    return { q: qs, ans, op: 'Subtraction', digits: digitsInQuestion(qs), terms };
  }
  if (op === 'mul') {
    let a, b, c;
    if (terms === 2) {
      const r = Math.random();
      if (r < 0.4) { a = brRn(2, 9); b = brRn(2, 9); }
      else if (r < 0.75) { a = brRn(2, 9); b = brRn(11, 19); }
      else { a = brRn(11, 15); b = brRn(2, 6); }
      ans = a * b;
      q = a + ' × ' + b + ' = ?';
    } else {
      a = brRn(2, 9); b = brRn(2, 9); c = brRn(2, 5);
      ans = a * b * c;
      q = a + ' × ' + b + ' × ' + c + ' = ?';
    }
    return { q, ans, op: 'Multiplication', digits: digitsInQuestion(q), terms };
  }
  // div
  const div = brRn(2, 9), quot = Math.random() < 0.6 ? brRn(2, 9) : brRn(2, 12), divd = div * quot;
  q = divd + ' ÷ ' + div;
  ans = quot;
  if (terms === 3) {
    const ex = brRn(1, 9);
    if (Math.random() < 0.5) { q += ' + ' + ex; ans += ex; }
    else { q += ' − ' + ex; ans -= ex; }
  }
  const qd = q + ' = ?';
  return { q: qd, ans, op: 'Division', digits: digitsInQuestion(qd), terms };
}

export function brMakeSession(total) {
  const ops = ['add', 'sub', 'mul', 'div'];
  const qs = [];
  const perOp = Math.floor(total / ops.length);
  ops.forEach((op) => {
    for (let i = 0; i < perOp; i++) qs.push(brMakeQ(op));
  });
  while (qs.length < total) qs.push(brMakeQ(ops[brRn(0, 3)]));
  for (let i = qs.length - 1; i > 0; i--) {
    const k = brRn(0, i);
    const tmp = qs[i];
    qs[i] = qs[k];
    qs[k] = tmp;
  }
  return qs;
}

// ── Sharper Every Day ─────────────────────────────────────────────────────────
//
// The original rule asked for a flat 10-year improvement on your first-ever result. For anyone
// whose first result was already good, that was unreachable: the scale bottoms out at 20, so a
// player who opened with 25 was being asked to reach 15, a number that does not exist. The rule
// below replaces it with three tiers, all measured against the same first-ever result.
//
// Remember the scale is not continuous. The only reachable ages are
// 20, 22, 25, 28, 32, 36, 40, 46, 53, 62, 72, 80 — so "below 25" means landing on 22 or 20.
//
//   first-ever 40 or worse  ->  20 years younger, OR below 25, whichever comes first.
//                               A higher target age is the easier one to reach, so the easier of
//                               the two wins: that is what max() below is doing.
//   first-ever 25 to 39     ->  below 25. A full 20-year drop would fall through the floor.
//   first-ever already < 25 ->  a separate, harder bar: reach 20 exactly, the floor itself.
//
// Worked: first 80 -> 60. first 62 -> 42. first 46 -> 26. first 40 -> 24 (a 20-year drop would
// demand the floor, so "below 25" is kinder). first 36/32/28/25 -> 24. first 22 or 20 -> 20.

// The age of the first-ever COUNTING Braining trial. Practice runs are excluded deliberately:
// practice is 20 questions where a real trial is 50, but both are scored on the same time scale,
// so a practice run reports an age far younger than it represents. Letting one set the baseline
// would poison this achievement permanently on the very first day.
export function firstBrainingAge(brState) {
  const sessions = (brState && brState.sessions) || [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (s.real === true || typeof s.real === 'undefined') return s.age;
  }
  return null;
}

// Every age the scale can actually award, ascending. Derived from BR_SCALE rather than written
// out again, so the two can never drift: [20, 22, 25, 28, 32, 36, 40, 46, 53, 62, 72, 80].
export const BR_AGES = BR_SCALE.map((r) => r.age)
  .filter((a, i, all) => all.indexOf(a) === i)
  .sort((a, b) => a - b);

// The smallest reachable age at or above `age`. "20 years younger than 80" is 60, and there is no
// 60 on the scale — the ages either side are 53 and 62. Snapping UP to 62 keeps the bar no harder
// than the rule literally states; snapping down to 53 would quietly demand a 27-year improvement
// from a rule that promised 20.
function snapUpToScale(age) {
  for (let i = 0; i < BR_AGES.length; i++) {
    if (BR_AGES[i] >= age) return BR_AGES[i];
  }
  return BR_AGES[BR_AGES.length - 1];
}

// The age this player has to reach, given the result they started from.
export function sharperEveryDayTarget(firstAge) {
  if (typeof firstAge !== 'number') return null;
  if (firstAge < 25) return 20;
  // Only the 20-years-younger arm is snapped. The other arm is the number 24, which is not an
  // approximation of anything — it IS "below 25", already exact on a scale whose only values
  // under 25 are 22 and 20. Snapping it up to 25 would turn "below 25" into "25 or better".
  return Math.max(snapUpToScale(firstAge - 20), 24);
}

// Whether a result of `age` earns it. `brState` must be the history as it stood BEFORE this
// session, which is what stops the baseline trial from being the one that satisfies its own bar.
export function isSharperEveryDay(brState, age) {
  const first = firstBrainingAge(brState);
  const target = sharperEveryDayTarget(first);
  if (target === null) return false;
  return age <= target;
}

// How many counting trials have reached the floor. Steady Mind asks for five.
export function brainAge20Count(brState) {
  return ((brState && brState.sessions) || []).filter(
    (s) => (s.real === true || typeof s.real === 'undefined') && s.age <= 20
  ).length;
}

// Most recent RECORDED completion time on a day BEFORE today.
export function getLastBrainingTime(brState, todayKey) {
  if (!brState.sessions || !brState.sessions.length) return null;
  for (let i = brState.sessions.length - 1; i >= 0; i--) {
    const s = brState.sessions[i];
    if (s.date !== todayKey && (s.real === true || typeof s.real === 'undefined')) return s.time;
  }
  return null;
}

// Today's REAL recorded time, if the real trial already happened today.
export function getTodayBrainingTime(brState, todayKey) {
  if (!brState.sessions || !brState.sessions.length) return null;
  for (let i = brState.sessions.length - 1; i >= 0; i--) {
    const s = brState.sessions[i];
    if (s.date === todayKey && (s.real === true || typeof s.real === 'undefined')) return s.time;
  }
  return null;
}
