import { useCallback, useRef, useState } from 'react';
import { brMakeSession, brFmtTimer } from '../store/braining.js';
import { opName } from '../store/questionEngine.js';
import { tick, buzz } from '../store/sound.js';
import { startSession } from '../lib/attemptLog.js';
import { t } from '../i18n_data.js';

// Ported from the reference prototype's brBeginGame/brLoadQ/brSubmit/brFinish timer logic.
// Braining has no countdown clock — the timer counts UP, and a wrong answer must be corrected
// before advancing (the timer keeps running), so there is no "wrong" tally at all.
// `onAttempt` is optional and purely a REPORT — see the equivalent note in useChallengeGame.js.
// Braining makes the player correct a wrong answer before moving on, so a single question can
// produce several attempts. Each one is reported, which is the only record that the wrong
// answers happened at all: the game itself keeps no tally of them.
export function useBrainingGame({ lang, soundOn, onGameEnd, onAttempt, getLastTime, getTodayTime }) {
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState({ text: '--', opLabel: '' });
  const [input, setInput] = useState('');
  const [inputBad, setInputBad] = useState(false);
  const [qcState, setQcState] = useState(''); // '' | 'ok' | 'bad'
  const [hint, setHint] = useState('');

  const gameRef = useRef(null);
  const ivRef = useRef(null);
  // Mirrors `input` synchronously. The reference reads the live DOM value at submit time, so it
  // is never stale; React state can still be a render behind if a digit and Submit are tapped
  // within the same frame, which this ref avoids.
  const inputRef = useRef('');

  const clearTimer = useCallback(() => {
    if (ivRef.current) {
      clearInterval(ivRef.current);
      ivRef.current = null;
    }
  }, []);

  const pushUpdate = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setSession({
      isPrac: g.isPrac,
      total: g.total,
      qIdx: g.qIdx,
      elapsed: g.elapsed,
      lastTime: g.lastTime,
      todayTime: g.todayTime,
    });
  }, []);

  const setInputBoth = useCallback((updater) => {
    // Derive from the ref, not from React state: the ref is always current, whereas a state
    // updater callback only runs during the render phase — too late for a Submit tap that
    // lands in the same frame as the digit before it.
    const next = typeof updater === 'function' ? updater(inputRef.current) : updater;
    inputRef.current = next;
    setInput(next);
  }, []);

  const loadQuestion = useCallback(() => {
    const g = gameRef.current;
    const q = g.questions[g.qIdx];
    g.answer = q.ans;
    g.curOp = q.op;
    // Question shape, carried only so the attempt log can describe what was asked.
    g.curDigits = q.digits;
    g.curTerms = q.terms;
    g.qStart = Date.now();
    // Translated, the way Challenge already does it. This badge was rendering the generator's own
    // `op` value — 'Subtraction' — so a Russian player read one English word in the middle of every
    // question, on all fifty of them. The opname_* keys already existed and were already translated;
    // only Braining was not using them. The generator capitalises its Braining ops where Challenge
    // does not, hence the lowercase before the lookup.
    setQuestion({ text: q.q, opLabel: opName(lang, String(q.op).toLowerCase()) });
    setInputBoth('');
    setInputBad(false);
    setHint('');
    setQcState('');
    pushUpdate();
  }, [pushUpdate, setInputBoth, lang]);

  const finishGame = useCallback(() => {
    clearTimer();
    const g = gameRef.current;
    if (!g) return;
    const sec = Math.floor((Date.now() - g.startTime) / 1000);
    // `total` is how many questions this sitting asked — 50 or 20. Reported for the cumulative
    // question count, which has no other way to know: Braining stores a time and a brain age on
    // each session, never a question count.
    onGameEnd({
      isPrac: g.isPrac, sec, total: g.total, wrong: g.wrong, opTimes: g.opTimes, sessionId: g.sessionId,
      // For the server. `sec` above is the claim it will be checked against — it has to account
      // for very nearly the whole window the server watched, which is what makes a fast time
      // impossible to assert rather than merely unlikely.
      setId: g.setId,
      answers: g.answers,
      verifiable: !!g.setId && !g.isPrac && g.answers.length > 0,
    });
  }, [clearTimer, onGameEnd]);

  const begin = useCallback(
    (isPrac, serverSet) => {
      const total = isPrac ? 20 : 50;
      const g = {
        isPrac,
        total,
        // The server's set when there is one, drawn on this device from the seed it sent — so
        // these are the questions the server holds the answers to. Absent for a guest, for a
        // practice run, and for anyone whose request lost its race with the countdown; all three
        // fall back to ordinary local generation and play identically.
        questions: serverSet ? serverSet.questions : brMakeSession(total),
        setId: serverSet ? serverSet.setId : null,
        // What the server will be sent. Braining makes a wrong answer be corrected before moving
        // on, so one question can produce several entries here — which is exactly the shape
        // validateBrainingSubmission expects: indices non-decreasing, repeats being corrections.
        answers: [],
        qIdx: 0,
        answer: null,
        curOp: null,
        qStart: 0,
        opTimes: {},
        // Braining makes you correct a wrong answer before moving on, so a wrong one costs time
        // rather than points and never needed counting. Flawless Brain asks for a session with
        // none at all, so they are counted now — reported at the end, never read by the game.
        wrong: 0,
        startTime: Date.now(),
        elapsed: 0,
        // Groups this sitting's answers together in the attempt log.
        sessionId: startSession(),
        lastTime: isPrac ? null : getLastTime(),
        todayTime: isPrac ? getTodayTime() : null,
      };
      gameRef.current = g;
      loadQuestion();

      clearTimer();
      ivRef.current = setInterval(() => {
        g.elapsed = Math.floor((Date.now() - g.startTime) / 1000);
        pushUpdate();
      }, 200);
    },
    [clearTimer, getLastTime, getTodayTime, loadQuestion, pushUpdate]
  );

  const padInput = useCallback((v) => {
    setInputBoth((prev) => {
      if (v === 'neg') return prev.startsWith('-') ? prev.slice(1) : '-' + prev;
      if (v === '.') return prev.includes('.') ? prev : prev + v;
      return prev + String(v);
    });
    // Typing clears the previous wrong-answer state, matching brPad().
    setInputBad(false);
    setHint('');
    setQcState('');
  }, [setInputBoth]);

  const backspace = useCallback(() => {
    setInputBoth((prev) => prev.slice(0, -1));
    setInputBad(false);
  }, [setInputBoth]);

  const submitAnswer = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const raw = inputRef.current.trim();
    if (!raw || raw === '-') return;
    const val = parseFloat(raw);
    if (isNaN(val)) return;
    const ok = Math.abs(val - g.answer) < 0.05;
    const elapsedMs = Date.now() - g.qStart;

    // Book the attempt for the server. Every attempt, not just the successful one: a correction
    // is part of what happened, and a submission that hid its wrong answers would arrive with
    // indices the server could not reconcile against the run it issued.
    if (g.setId) g.answers.push({ i: g.qIdx, value: val, ms: elapsedMs });

    // Report the answered question, right or wrong. Wrapped so a logging fault can never
    // interrupt play, and placed after the marking above so it only describes what was decided.
    if (onAttempt) {
      try {
        onAttempt({
          sessionId: g.sessionId,
          mode: 'braining',
          isPrac: g.isPrac,
          diff: null,
          operation: g.curOp,
          digits: g.curDigits,
          terms: g.curTerms,
          // Time since the question appeared. On a re-try after a wrong answer this is the
          // running total for that question, not the time since the last keystroke.
          timeMs: Date.now() - g.qStart,
          isCorrect: ok,
        });
      } catch (e) { /* never let logging interrupt a game */ }
    }

    if (ok) {
      if (!g.opTimes) g.opTimes = {};
      (g.opTimes[g.curOp] = g.opTimes[g.curOp] || []).push((Date.now() - g.qStart) / 1000);
      tick(soundOn);
      setQcState('ok');
      g.qIdx++;
      if (g.qIdx >= g.total) {
        setTimeout(finishGame, 200);
      } else {
        setTimeout(loadQuestion, 180);
      }
    } else {
      // Still not counted against the player — correcting it is the cost. Tallied only so
      // Flawless Brain can ask whether this session had any.
      g.wrong++;
      buzz(soundOn);
      setInputBad(true);
      setQcState('bad');
      setHint(t(lang, 'wrong_try_again'));
      setInputBoth('');
    }
  }, [finishGame, lang, loadQuestion, onAttempt, setInputBoth, soundOn]);

  const quit = useCallback(() => {
    clearTimer();
    const g = gameRef.current;
    return { sessionId: g ? g.sessionId : null };
  }, [clearTimer]);

  // Which warning the quit modal shows depends on whether this run could still have counted.
  //
  // Composed from `quit_session_warn` plus a tail, rather than three whole sentences: the shared
  // opening is the string that key already held, and it is still the same promise on both branches.
  // Practice takes neither — nothing is being lost, so warning about lost progress would be a lie.
  const quitWarningFor = useCallback((brDoneToday) => {
    const g = gameRef.current;
    if (g && g.isPrac) return t(lang, 'br_quit_practice');
    return t(lang, 'quit_session_warn') + ' ' + t(lang, brDoneToday ? 'br_quit_retry' : 'br_quit_first');
  }, [lang]);

  return {
    session, question, input, inputBad, qcState, hint,
    begin, padInput, backspace, submitAnswer, quit, quitWarningFor,
    fmtTimer: brFmtTimer,
  };
}
