// A second Submit in the pause after a correct answer must do nothing.
//
// After a correct answer every game holds the green tick for a fifth of a second or so before the
// next question loads, and for that pause the right answer is still sitting in the input. Challenge
// and the trick screen lock Submit for it; Braining was ported without the lock, and nothing said
// so. Found 5 October 2026: a double tap (or Enter pressed twice) was marked right a second time.
// Mid-run it silently skipped the next question — a faster time, and a trial the server then marked
// incomplete. On the last question it ended the game twice, recording a duplicate session and
// sending a submission the server refused for answering a fifty-first question.
//
// The hooks are driven directly rather than through a rendered screen. React is replaced by just
// enough of itself for a hook to be called once outside a component — state setters do nothing,
// refs are plain objects — which is all a game hook needs, because every rule it has lives in its
// refs and its callbacks. Timers are queued by hand so a "double tap" lands exactly where a real
// one does: after the first Submit, before the next question has loaded. The trick screen is a
// component rather than a hook and cannot be driven this way; it has had the lock since it was
// written.
//
// Run it with:  npm run check:double-submit

import { createServer } from 'vite';

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  // React is normally left to Node; it has to be bundled for the stand-in below to replace it.
  ssr: { noExternal: ['react'] },
  plugins: [{
    name: 'headless-hooks',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'react') return '\0headless-react';
      // The attempt log imports the Supabase client, which refuses to construct without the
      // project's keys. Nothing here talks to the network, so it gets a null in its place.
      if (id.endsWith('/supabaseClient.js')) return '\0headless-supabase';
    },
    load(id) {
      if (id === '\0headless-react') {
        return 'export const useState = (i) => [typeof i === "function" ? i() : i, () => {}];'
          + 'export const useRef = (i) => ({ current: i });'
          + 'export const useCallback = (f) => f;';
      }
      if (id === '\0headless-supabase') return 'export const supabase = null;';
    },
  }],
});
// Renamed on import: called outside a component, a `use…` name trips the rules-of-hooks lint, which
// is right about real React and does not apply to the stand-in above.
const { useBrainingGame: brainingHook } = await server.ssrLoadModule('/src/hooks/useBrainingGame.js');
const { useChallengeGame: challengeHook } = await server.ssrLoadModule('/src/hooks/useChallengeGame.js');
const { generateBrainingSet, generateChallengeSet } = await server.ssrLoadModule('/supabase/functions/_shared/generator.js');
const { validateBrainingSubmission, validateChallengeSubmission, markBrainingCompletion } =
  await server.ssrLoadModule('/supabase/functions/_shared/validate.js');

// ── A hand-run clock ──────────────────────────────────────────────────────────
// Each queued callback runs on its own and its exception is counted, not thrown — the way a
// browser runs separate timeouts, so one crashing does not stop the next from firing.
let queue = [];
let timerErrors = 0;
globalThis.setTimeout = (fn) => { queue.push(fn); return queue.length; };
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
function flush() {
  while (queue.length) {
    const fn = queue.shift();
    try { fn(); } catch { timerErrors++; }
  }
}

const BR_TOTAL = 50;
const brSet = () => ({ setId: 'check', questions: generateBrainingSet(Math.floor(Math.random() * 2 ** 31), BR_TOTAL) });

// Plays one Braining trial, answering whatever is on screen. Which question that is comes from the
// hook's own attempt reports — each correct one moves the game on by exactly one, which is the very
// thing under test, so the player follows the game rather than a count of its own. `extraTaps`
// maps a question number (0-based) to the Submits that follow the first one before any timer runs.
function playBraining({ extraTaps = {}, wrongFirst = new Set(), tapAfterEnd = false } = {}) {
  queue = []; timerErrors = 0;
  const ends = [];
  let shown = 0;
  const g = brainingHook({
    lang: 'en', soundOn: false,
    onGameEnd: (s) => ends.push(s),
    onAttempt: (a) => { if (a.isCorrect) shown++; },
    getLastTime: () => null, getTodayTime: () => null,
  });
  const set = brSet();
  g.begin(false, set);
  let turns = 0;
  while (ends.length === 0 && turns++ < BR_TOTAL * 3) {
    const at = shown;
    if (at >= BR_TOTAL) { flush(); break; }
    const ans = set.questions[at].ans;
    if (wrongFirst.has(at)) {
      // A wrong answer, then the correction straight away with no timer in between: a wrong
      // answer must never lock the pad, or Braining's correct-it-yourself rule stops working.
      g.padInput(String(ans + 7)); g.submitAnswer();
    }
    g.padInput(String(ans)); g.submitAnswer();
    for (let k = 0; k < (extraTaps[at] || 0); k++) g.submitAnswer();
    flush();
  }
  // A Submit after the game is over, with the last answer still in the box.
  if (tapAfterEnd) { g.submitAnswer(); flush(); }
  return { ends, set, timerErrors, finalAnswerCount: ends[0] ? ends[0].answers.length : null };
}

// What the server would say about the trial the hook reported.
function serverVerdict(run) {
  const s = run.ends[0];
  const v = validateBrainingSubmission({
    answers: s.answers, setSize: BR_TOTAL, claimedSec: 300, issuedAt: 0, submittedAt: 305000,
  });
  if (!v.ok) return 'rejected: ' + v.code;
  const key = run.set.questions.map((q) => ({ a: q.ans }));
  const done = markBrainingCompletion({ answers: s.answers, key, tolerance: 0.05 });
  return done.complete || 'incomplete: ' + done.unresolved + ' question(s) never answered right';
}

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

// ── Braining ─────────────────────────────────────────────────────────────────

check('Braining: an ordinary trial ends once and the server accepts it (the control)', () => {
  const r = playBraining();
  if (r.ends.length !== 1) return 'onGameEnd ran ' + r.ends.length + ' times';
  return serverVerdict(r);
});

check('Braining: a double tap on the LAST question ends the game once, not twice', () => {
  const r = playBraining({ extraTaps: { [BR_TOTAL - 1]: 1 } });
  if (r.ends.length !== 1) return 'onGameEnd ran ' + r.ends.length + ' times — a duplicate session';
  return serverVerdict(r);
});

check('Braining: a double tap mid-trial does not skip the next question', () => {
  const r = playBraining({ extraTaps: { 9: 1 } });
  if (r.ends.length !== 1) return 'onGameEnd ran ' + r.ends.length + ' times';
  // 50 answers, all of them right: nothing extra booked and nothing skipped.
  if (r.finalAnswerCount !== BR_TOTAL) return r.finalAnswerCount + ' answers booked, expected ' + BR_TOTAL;
  return serverVerdict(r);
});

check('Braining: a double tap on the second-to-last question neither skips nor crashes', () => {
  const r = playBraining({ extraTaps: { [BR_TOTAL - 2]: 1 } });
  if (r.timerErrors) return r.timerErrors + ' timer callback(s) threw — a question past the end was loaded';
  if (r.ends.length !== 1) return 'onGameEnd ran ' + r.ends.length + ' times';
  return serverVerdict(r);
});

check('Braining: a burst of taps on every question still plays all fifty, once', () => {
  const taps = {};
  for (let i = 0; i < BR_TOTAL; i++) taps[i] = 3;
  const r = playBraining({ extraTaps: taps });
  if (r.timerErrors) return r.timerErrors + ' timer callback(s) threw';
  if (r.ends.length !== 1) return 'onGameEnd ran ' + r.ends.length + ' times';
  if (r.finalAnswerCount !== BR_TOTAL) return r.finalAnswerCount + ' answers booked, expected ' + BR_TOTAL;
  return serverVerdict(r);
});

check('Braining: a Submit after the trial has ended does nothing', () => {
  const r = playBraining({ tapAfterEnd: true });
  if (r.ends.length !== 1) return 'onGameEnd ran ' + r.ends.length + ' times';
  return serverVerdict(r);
});

check('Braining: a wrong answer does not lock — the correction goes straight in', () => {
  const r = playBraining({ wrongFirst: new Set([0, 17, BR_TOTAL - 1]) });
  if (r.ends.length !== 1) return 'onGameEnd ran ' + r.ends.length + ' times';
  if (r.ends[0].wrong !== 3) return 'wrong tallied as ' + r.ends[0].wrong + ', expected 3';
  if (r.finalAnswerCount !== BR_TOTAL + 3) return r.finalAnswerCount + ' answers booked, expected ' + (BR_TOTAL + 3);
  return serverVerdict(r);
});

// ── Challenge, including the Practice tab's count mode ───────────────────────
// Already locked; pinned here so the two modes cannot drift apart again.

function playChallenge({ isPrac, pcfg, questionsToPlay, extraTaps }) {
  queue = []; timerErrors = 0;
  const ends = [];
  let shown = 0;
  const c = challengeHook({
    lang: 'en', soundOn: false,
    onGameEnd: (s) => ends.push(s),
    // Challenge never asks a question twice, right or wrong, so every attempt moves it on.
    onAttempt: () => { shown++; },
    getYestScore: () => null, getTodayScore: () => null,
  });
  const set = { setId: 'check', questions: generateChallengeSet(Math.floor(Math.random() * 2 ** 31), 'easy') };
  c.begin('easy', isPrac, pcfg, isPrac ? 'practice' : 'challenge', set);
  for (let n = 0; n < questionsToPlay && ends.length === 0; n++) {
    c.padInput(String(set.questions[shown].ans)); c.submitAnswer();
    for (let k = 0; k < extraTaps; k++) c.submitAnswer();
    flush();
  }
  c.submitAnswer(); flush();
  return { ends, shown, timerErrors };
}

check('Challenge: double taps neither skip a question nor book an answer twice', () => {
  const r = playChallenge({ isPrac: false, pcfg: null, questionsToPlay: 12, extraTaps: 1 });
  // A real Challenge ends on its 60-second clock, which this script never runs, so it is still open.
  if (r.ends.length !== 0) return 'ended early';
  if (r.shown !== 12) return r.shown + ' attempts booked for 12 questions answered';
  return true;
});

check('Practice count mode: a double tap on the last question ends the session once', () => {
  const pcfg = { mode: 'count', count: 10 };
  const r = playChallenge({ isPrac: true, pcfg, questionsToPlay: 20, extraTaps: 1 });
  if (r.ends.length !== 1) return 'onGameEnd ran ' + r.ends.length + ' times';
  if (r.ends[0].correct !== 10) return 'correct ' + r.ends[0].correct + ', expected 10';
  const answers = r.ends[0].answers;
  if (!answers.every((a, i) => a.i === i)) return 'answer indices are not 0, 1, 2, … in order';
  return validateChallengeSubmission({ answers, setSize: 80, issuedAt: 0, submittedAt: 60000 }).ok
    || 'the answer sequence would be refused';
});

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log((c.ok ? 'ok    ' : 'FAIL  ') + c.name + (c.detail ? ' — ' + c.detail : ''));
}
console.log(failed ? '\n' + failed + ' FAILED' : '\nall ' + checks.length + ' checks passed');
await server.close();
process.exit(failed ? 1 : 0);
