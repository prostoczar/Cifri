import { useCallback, useRef, useState } from 'react';
import { brMakeSession, brFmtTimer } from '../store/braining.js';
import { tick, buzz } from '../store/sound.js';
import { t } from '../i18n_data.js';

// Ported from the reference prototype's brBeginGame/brLoadQ/brSubmit/brFinish timer logic.
// Braining has no countdown clock — the timer counts UP, and a wrong answer must be corrected
// before advancing (the timer keeps running), so there is no "wrong" tally at all.
export function useBrainingGame({ lang, soundOn, onGameEnd, getLastTime, getTodayTime }) {
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
    g.qStart = Date.now();
    setQuestion({ text: q.q, opLabel: q.op });
    setInputBoth('');
    setInputBad(false);
    setHint('');
    setQcState('');
    pushUpdate();
  }, [pushUpdate, setInputBoth]);

  const finishGame = useCallback(() => {
    clearTimer();
    const g = gameRef.current;
    if (!g) return;
    const sec = Math.floor((Date.now() - g.startTime) / 1000);
    onGameEnd({ isPrac: g.isPrac, sec, opTimes: g.opTimes });
  }, [clearTimer, onGameEnd]);

  const begin = useCallback(
    (isPrac) => {
      const total = isPrac ? 20 : 50;
      const g = {
        isPrac,
        total,
        questions: brMakeSession(total),
        qIdx: 0,
        answer: null,
        curOp: null,
        qStart: 0,
        opTimes: {},
        startTime: Date.now(),
        elapsed: 0,
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
      // Wrong answers are never counted — the player must correct it before moving on.
      buzz(soundOn);
      setInputBad(true);
      setQcState('bad');
      setHint(t(lang, 'wrong_try_again'));
      setInputBoth('');
    }
  }, [finishGame, lang, loadQuestion, setInputBoth, soundOn]);

  const quit = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  // Which warning the quit modal shows depends on whether this run could still have counted.
  const quitWarningFor = useCallback((brDoneToday) => {
    const g = gameRef.current;
    if (g && g.isPrac) return 'This is a practice session — nothing is counted anyway.';
    if (!brDoneToday) {
      return 'Your progress will not be saved. This would have been your first trial today — quitting means it will not count.';
    }
    return 'Your progress will not be saved. Your first trial is already logged — this retry will not affect your record.';
  }, []);

  return {
    session, question, input, inputBad, qcState, hint,
    begin, padInput, backspace, submitAnswer, quit, quitWarningFor,
    fmtTimer: brFmtTimer,
  };
}
