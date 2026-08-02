import { useCallback, useRef, useState } from 'react';
import { DIFFS, makeQ, calcSc, opName, fn } from '../store/questionEngine.js';
import { makePracticeQ } from '../store/practiceEngine.js';
import { tick, buzz, urgentTick } from '../store/sound.js';
import { startSession } from '../lib/attemptLog.js';
import { t } from '../i18n_data.js';

// Ported from the reference prototype's beginGame/loadQ/submitAns/updateTUI/endGame timer logic.
// Pure game-loop state — knows nothing about the persisted app store. Calls onGameEnd(summary)
// exactly once when a session is over (timer hit 0, or a count-mode session reached its target).
// `onAttempt` is optional and purely a REPORT: it is called after a question has been marked,
// and nothing in this file reads its return value or changes course because of it. Remove it and
// the game behaves identically.
export function useChallengeGame({ lang, soundOn, onGameEnd, onAttempt, getYestScore, getTodayScore }) {
  const [session, setSession] = useState(null); // {diff,isPrac,isUnlim,timer,ttotal,score,correct,wrong,origin,yestScore,todayScore,pcfgMode}
  const [question, setQuestion] = useState({ text: '--', opLabel: '' });
  const [input, setInput] = useState('');
  const [inputClass, setInputClass] = useState('ai');
  const [feedback, setFeedback] = useState({ text: '', cls: 'fb' });
  const [qcFlash, setQcFlash] = useState(false);

  const curRef = useRef(null); // mutable session data mirroring the reference's `cur`
  const alockRef = useRef(false);
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

  const setInputBoth = useCallback((updater) => {
    // Derive from the ref, not from React state: the ref is always current, whereas a state
    // updater callback only runs during the render phase — too late for a Submit tap that
    // lands in the same frame as the digit before it.
    const next = typeof updater === 'function' ? updater(inputRef.current) : updater;
    inputRef.current = next;
    setInput(next);
  }, []);

  const loadQuestion = useCallback(() => {
    const c = curRef.current;
    const cfg = c.isPrac ? c.pcfg : DIFFS[c.diff];
    // The Practice tab is the only caller with a parameter-driven config; everything else (real
    // Challenge, Challenge warm-up practice) keeps using the difficulty-tier generator unchanged.
    const res = cfg && cfg.custom ? makePracticeQ(lang, cfg) : makeQ(lang, cfg);
    c.answer = res.ans;
    c.op = res.op;
    // Question shape, carried only so the attempt log can describe what was asked.
    c.digits = res.digits;
    c.terms = res.terms;
    c.qStart = Date.now();
    setQuestion({ text: res.q, opLabel: opName(lang, c.op) });
    setInputBoth('');
    setInputClass('ai');
    setFeedback({ text: '', cls: 'fb' });
    setQcFlash(false);
    alockRef.current = false;
  }, [lang, setInputBoth]);

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
      sessionId: c.sessionId,
      // The tally kept alongside the score as it was earned (see submitAnswer). Reported, never
      // read back: nothing here feeds the score, it only describes how the score happened.
      breakdown: {
        ops: c.opPoints,
        wrong: c.wrong,
        penalty: c.penalty,
        floorAbsorbed: c.floorAbsorbed,
        dm: c.dm,
      },
    });
  }, [clearTimer, onGameEnd]);

  // Starts the actual timed session (called once the 3-2-1-Go countdown finishes).
  const begin = useCallback(
    (diff, isPrac, pcfg, origin) => {
      const c = {
        diff, isPrac, pcfg, origin,
        score: 0, correct: 0, wrong: 0, opTimes: {},
        // ── The score breakdown, tallied as it is earned ────────────────────────────
        //
        // These four counters exist so the result screen can show where the score came from
        // WITHOUT recomputing it. Points are recorded at the moment calcSc awards them, so the
        // lines on the breakdown are the very numbers that moved the score, not a second
        // derivation of them that could disagree.
        //
        // `opPoints` is per operation: how many questions of that kind were asked, how many were
        // right, and the points they earned between them. `penalty` is the wrong answers' flat
        // cost, kept separate because it does not depend on the operation. `floorAbsorbed` is the
        // part of that cost the score never actually paid, because the running total is clamped at
        // zero — without it the lines would not add up to the score on a bad opening run.
        opPoints: {}, penalty: 0, floorAbsorbed: 0,
        answer: null, op: null, qStart: 0,
        // Groups this sitting's answers together in the attempt log.
        sessionId: startSession(),
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
      // The difficulty multiplier for this whole sitting. It used to be worked out again on every
      // answer; it is settled here instead because `diff` and `isPrac` are fixed the moment a
      // session begins and never change inside one. Same value, decided once, so the number the
      // breakdown names is provably the number the scoring used.
      c.dm = isPrac ? 1.0 : DIFFS[diff] ? DIFFS[diff].dm : 1.0;
      c.yestScore = diff ? getYestScore(diff) : null;
      // Today's running average, once there is one. Previously only shown while practising,
      // because during the one counting trial there was nothing yet to compare against. Now
      // every Challenge play after the first has a live average sitting behind it, and that
      // is precisely the number this run is wagering.
      c.todayScore = diff ? getTodayScore(diff) : null;
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
    setInputBoth((prev) => {
      if (v === 'neg') return prev.startsWith('-') ? prev.slice(1) : '-' + prev;
      if (v === '.') return prev.includes('.') ? prev : prev + v;
      return prev + String(v);
    });
  }, [setInputBoth]);

  const backspace = useCallback(() => {
    setInputBoth((prev) => prev.slice(0, -1));
  }, [setInputBoth]);

  const submitAnswer = useCallback(() => {
    if (alockRef.current) return;
    const c = curRef.current;
    if (!c) return;
    const raw = inputRef.current.trim();
    if (!raw || raw === '-' || raw === '.') return;
    const val = parseFloat(raw);
    if (isNaN(val)) return;

    const elapsed = (Date.now() - c.qStart) / 1000;
    const ok = Math.abs(val - c.answer) < 0.055;
    const pts = calcSc(ok, elapsed, c.op, c.dm);

    // Book this question into the breakdown. Every operation the player met gets an entry, even
    // one they never answered correctly, so the breakdown can say plainly that it earned nothing
    // rather than quietly leaving it out.
    const bo = (c.opPoints[c.op] = c.opPoints[c.op] || { asked: 0, correct: 0, points: 0 });
    bo.asked++;
    if (ok) { bo.correct++; bo.points += pts; } else { c.penalty += pts; }

    // Adds this question's points to the running score. The clamp is exactly the line that was
    // here before — `Math.max(0, …)`, unchanged — with one extra statement recording how much of
    // the change the clamp swallowed. Both branches go through here so the tally cannot fall out
    // of step with the clamp it is measuring.
    const applyPts = () => {
      const before = c.score;
      c.score = Math.max(0, c.score + pts);
      c.floorAbsorbed += c.score - before - pts;
    };

    // Report the answered question. Wrapped so a logging fault can never interrupt play, and
    // placed after the marking above so it only ever describes a decision already made.
    if (onAttempt) {
      try {
        onAttempt({
          sessionId: c.sessionId,
          origin: c.origin,
          isPrac: c.isPrac,
          diff: c.diff,
          operation: c.op,
          digits: c.digits,
          terms: c.terms,
          timeMs: elapsed * 1000,
          isCorrect: ok,
        });
      } catch (e) { /* never let logging interrupt a game */ }
    }

    if (ok) {
      if (!c.opTimes) c.opTimes = {};
      (c.opTimes[c.op] = c.opTimes[c.op] || []).push(elapsed);
      alockRef.current = true;
      c.correct++;
      applyPts();
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
      applyPts();
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
  }, [finishGame, lang, loadQuestion, onAttempt, pushTuiUpdate, soundOn]);

  // Quit always discards — never records a session, matching the reference's doQuit().
  const quit = useCallback(() => {
    clearTimer();
    const c = curRef.current;
    return { origin: c ? c.origin : 'challenge', sessionId: c ? c.sessionId : null };
  }, [clearTimer]);

  return { session, question, input, inputClass, feedback, qcFlash, begin, padInput, backspace, submitAnswer, quit };
}
