import { useCallback, useRef, useState } from 'react';
import { DIFFS, makeQ, calcSc, opName, fn } from '../store/questionEngine.js';
import { tick, buzz, urgentTick } from '../store/sound.js';
import { t } from '../i18n_data.js';

// Ported from the reference prototype's beginGame/loadQ/submitAns/updateTUI/endGame timer logic.
// Pure game-loop state — knows nothing about the persisted app store. Calls onGameEnd(summary)
// exactly once when a session is over (timer hit 0, or a count-mode session reached its target).
export function useChallengeGame({ lang, soundOn, onGameEnd, getYestScore, getTodayScore }) {
  const [session, setSession] = useState(null); // {diff,isPrac,isUnlim,timer,ttotal,score,correct,wrong,origin,yestScore,todayScore,pcfgMode}
  const [question, setQuestion] = useState({ text: '--', opLabel: '' });
  const [input, setInput] = useState('');
  const [inputClass, setInputClass] = useState('ai');
  const [feedback, setFeedback] = useState({ text: '', cls: 'fb' });
  const [qcFlash, setQcFlash] = useState(false);

  const curRef = useRef(null); // mutable session data mirroring the reference's `cur`
  const alockRef = useRef(false);
  const ivRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (ivRef.current) {
      clearInterval(ivRef.current);
      ivRef.current = null;
    }
  }, []);

  const loadQuestion = useCallback(() => {
    const c = curRef.current;
    const cfg = c.isPrac ? c.pcfg : DIFFS[c.diff];
    const res = makeQ(lang, cfg);
    c.answer = res.ans;
    c.op = res.op;
    c.qStart = Date.now();
    setQuestion({ text: res.q, opLabel: opName(lang, c.op) });
    setInput('');
    setInputClass('ai');
    setFeedback({ text: '', cls: 'fb' });
    setQcFlash(false);
    alockRef.current = false;
  }, [lang]);

  const pushTuiUpdate = useCallback(() => {
    const c = curRef.current;
    if (!c) return;
    setSession({
      diff: c.diff,
      isPrac: c.isPrac,
      isUnlim: c.isUnlim,
      timer: c.timer,
      ttotal: c.ttotal,
      score: c.score,
      correct: c.correct,
      wrong: c.wrong,
      origin: c.origin,
      yestScore: c.yestScore,
      todayScore: c.todayScore,
      isCountMode: c.isPrac && c.pcfg && c.pcfg.mode === 'count',
      countLeft: c.isPrac && c.pcfg && c.pcfg.mode === 'count' ? c.pcfg.count - (c.pcfg._done || 0) : null,
      countTotal: c.isPrac && c.pcfg && c.pcfg.mode === 'count' ? c.pcfg.count : null,
    });
  }, []);

  const finishGame = useCallback(() => {
    clearTimer();
    const c = curRef.current;
    if (!c) return;
    onGameEnd({
      diff: c.diff,
      isPrac: c.isPrac,
      origin: c.origin,
      score: c.score,
      correct: c.correct,
      wrong: c.wrong,
      opTimes: c.opTimes,
    });
  }, [clearTimer, onGameEnd]);

  // Starts the actual timed session (called once the 3-2-1-Go countdown finishes).
  const begin = useCallback(
    (diff, isPrac, pcfg, origin) => {
      const c = {
        diff, isPrac, pcfg, origin,
        score: 0, correct: 0, wrong: 0, opTimes: {},
        answer: null, op: null, qStart: 0,
      };
      let tsec;
      if (isPrac) {
        if (pcfg.mode === 'time') { tsec = pcfg.timeSec; c.isUnlim = false; }
        else if (pcfg.mode === 'count') { tsec = 99999; c.isUnlim = false; pcfg._done = 0; }
        else { tsec = 99999; c.isUnlim = true; }
      } else {
        tsec = 60; c.isUnlim = false;
      }
      c.timer = tsec;
      c.ttotal = tsec;
      c.yestScore = diff ? getYestScore(diff) : null;
      c.todayScore = isPrac && diff ? getTodayScore(diff) : null;
      curRef.current = c;
      alockRef.current = false;
      loadQuestion();
      pushTuiUpdate();

      clearTimer();
      if (!c.isUnlim && !(isPrac && pcfg.mode === 'count')) {
        ivRef.current = setInterval(() => {
          c.timer--;
          pushTuiUpdate();
          if (!c.isPrac && c.timer <= 5 && c.timer > 0) urgentTick(soundOn);
          if (c.timer <= 0) {
            finishGame();
          }
        }, 1000);
      }
    },
    [clearTimer, finishGame, getTodayScore, getYestScore, loadQuestion, pushTuiUpdate, soundOn]
  );

  const padInput = useCallback((v) => {
    setInput((prev) => {
      if (v === 'neg') return prev.startsWith('-') ? prev.slice(1) : '-' + prev;
      if (v === '.') return prev.includes('.') ? prev : prev + v;
      return prev + String(v);
    });
  }, []);

  const backspace = useCallback(() => {
    setInput((prev) => prev.slice(0, -1));
  }, []);

  const submitAnswer = useCallback(() => {
    if (alockRef.current) return;
    const c = curRef.current;
    if (!c) return;
    const raw = input.trim();
    if (!raw || raw === '-' || raw === '.') return;
    const val = parseFloat(raw);
    if (isNaN(val)) return;

    const elapsed = (Date.now() - c.qStart) / 1000;
    const dm = c.isPrac ? 1.0 : DIFFS[c.diff] ? DIFFS[c.diff].dm : 1.0;
    const ok = Math.abs(val - c.answer) < 0.055;
    const pts = calcSc(ok, elapsed, c.op, dm);

    if (ok) {
      if (!c.opTimes) c.opTimes = {};
      (c.opTimes[c.op] = c.opTimes[c.op] || []).push(elapsed);
      alockRef.current = true;
      c.correct++;
      c.score = Math.max(0, c.score + pts);
      tick(soundOn);
      setInputClass('ai ok');
      setFeedback({ text: '+' + pts + ' ' + t(lang, 'pts'), cls: 'fb ok' });
      setQcFlash(true);
      pushTuiUpdate();

      if (c.isPrac && c.pcfg.mode === 'count') {
        c.pcfg._done = (c.pcfg._done || 0) + 1;
        pushTuiUpdate();
        if (c.pcfg._done >= c.pcfg.count) {
          setTimeout(finishGame, 260);
          return;
        }
      }
      setTimeout(loadQuestion, 250);
    } else {
      c.wrong++;
      c.score = Math.max(0, c.score + pts);
      buzz(soundOn);
      alockRef.current = true;
      setInputClass('ai bad');
      setFeedback({ text: t(lang, 'answer_colon') + ' ' + fn(c.answer), cls: 'fb bad' });
      pushTuiUpdate();

      if (c.isPrac && c.pcfg.mode === 'count') {
        c.pcfg._done = (c.pcfg._done || 0) + 1;
        pushTuiUpdate();
        if (c.pcfg._done >= c.pcfg.count) {
          setTimeout(finishGame, 1200);
          return;
        }
      }
      setTimeout(() => {
        alockRef.current = false;
        loadQuestion();
      }, 1200);
    }
  }, [finishGame, input, lang, loadQuestion, pushTuiUpdate, soundOn]);

  // Quit always discards — never records a session, matching the reference's doQuit().
  const quit = useCallback(() => {
    clearTimer();
    const c = curRef.current;
    return { origin: c ? c.origin : 'challenge' };
  }, [clearTimer]);

  return { session, question, input, inputClass, feedback, qcFlash, begin, padInput, backspace, submitAnswer, quit };
}
