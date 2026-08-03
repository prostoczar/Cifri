import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { TRICKS, setTricksLang } from '../store/tricksData.js';
import { trGroupName, trTrick } from '../store/tricks.js';
import { fn } from '../store/questionEngine.js';
import { PRACTICE_LENGTH, TEST_LENGTH, TEST_PASS_MARK, testQuestions } from '../store/trickTest.js';
import { tick, buzz } from '../store/sound.js';

// A drill on a single trick, in one of two modes.
//
//   practice  20 freshly generated questions. Repeatable without limit.
//   test      the 20 hardest questions that trick can ask, the same 20 every time, and a pass
//             mark. See store/trickTest.js for how "hardest" is decided.
//
// Both run the same loop, and in both a wrong answer reveals the correct one and waits rather
// than moving on — you always leave having seen the right answer. What separates them is what is
// recorded: `firstTryCorrect` counts questions answered correctly at the FIRST attempt, which is
// what Clean Sweep reads in practice and what the Test is marked out of. Correcting a mistake
// still advances you, it just does not earn the mark.
export default function TrickGameScreen({ gi, ti, mode, soundOn, onComplete, onAgain, onExit }) {
  const { t, lang } = useI18n();
  const isTest = mode === 'test';
  const total = isTest ? TEST_LENGTH : PRACTICE_LENGTH;

  const [question, setQuestion] = useState({ text: '--' });
  const [input, setInput] = useState('');
  const [inputClass, setInputClass] = useState('ai');
  const [feedback, setFeedback] = useState({ text: '', cls: 'fb' });
  const [qcOk, setQcOk] = useState(false);
  const [index, setIndex] = useState(0);          // how many questions are behind you
  const [firstTry, setFirstTry] = useState(0);    // ...of which, right at the first attempt
  const [done, setDone] = useState(null);         // the end card, once the run is over

  const answerRef = useRef(null);
  const alockRef = useRef(false);
  const inputRef = useRef('');
  const missedRef = useRef(false);                // has this question already been got wrong?
  const indexRef = useRef(0);
  const firstTryRef = useRef(0);
  // The Test's fixed 20. Built once per opening; regenerating mid-run could not change the
  // questions (the set is seeded) but would waste the work.
  const testSetRef = useRef(null);

  const group = TRICKS[gi];
  const trick = group.items[ti];

  const setInputBoth = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(inputRef.current) : updater;
    inputRef.current = next;
    setInput(next);
  }, []);

  const loadQuestion = useCallback(() => {
    // The generators call the reference's global translator; point it at the active language
    // before generating so Russian sessions get Russian question text.
    setTricksLang(lang);
    let res;
    if (isTest) {
      if (!testSetRef.current) testSetRef.current = testQuestions(gi, ti, lang);
      res = testSetRef.current[indexRef.current] || testSetRef.current[0];
    } else {
      res = trick.gen();
    }
    answerRef.current = res.ans;
    setQuestion({ text: res.q });
    setInputBoth('');
    setInputClass('ai');
    setFeedback({ text: '', cls: 'fb' });
    setQcOk(false);
    alockRef.current = false;
    missedRef.current = false;
  }, [lang, trick, gi, ti, isTest, setInputBoth]);

  // Reset everything when the trick or mode changes, then load the first question.
  useEffect(() => {
    indexRef.current = 0;
    firstTryRef.current = 0;
    testSetRef.current = null;
    setIndex(0);
    setFirstTry(0);
    setDone(null);
    loadQuestion();
  }, [loadQuestion]);

  const padInput = useCallback((v) => {
    setInputBoth((prev) => {
      if (v === 'neg') return prev.startsWith('-') ? prev.slice(1) : '-' + prev;
      if (v === '.') return prev.includes('.') ? prev : prev + v;
      return prev + String(v);
    });
  }, [setInputBoth]);

  const backspace = useCallback(() => setInputBoth((prev) => prev.slice(0, -1)), [setInputBoth]);

  const submit = useCallback(() => {
    if (alockRef.current) return;
    const raw = inputRef.current.trim();
    if (!raw || raw === '-' || raw === '.') return;
    const val = parseFloat(raw);
    if (isNaN(val)) return;

    if (Math.abs(val - answerRef.current) < 0.055) {
      alockRef.current = true;
      if (!missedRef.current) {
        firstTryRef.current++;
        setFirstTry(firstTryRef.current);
      }
      indexRef.current++;
      setIndex(indexRef.current);
      tick(soundOn);
      setInputClass('ai ok');
      setFeedback({ text: t('correct_excl'), cls: 'fb ok' });
      setQcOk(true);

      if (indexRef.current >= total) {
        const correct = firstTryRef.current;
        const passed = isTest && correct >= TEST_PASS_MARK;
        // Recorded the instant the run is over, NOT when the player taps something on the end
        // card. Waiting for the tap would mean closing the app on that screen threw away a Test
        // that had actually been passed.
        onComplete({ correct, passed });
        setTimeout(() => setDone({ correct, passed }), 320);
      } else {
        setTimeout(loadQuestion, 250);
      }
    } else {
      // Marked as missed even though the player will go on to correct it — that is the whole
      // difference between "you got there" and "you knew it".
      missedRef.current = true;
      buzz(soundOn);
      setInputClass('ai bad');
      setFeedback({ text: t('answer_colon') + ' ' + fn(answerRef.current), cls: 'fb bad' });
    }
  }, [loadQuestion, soundOn, t, total, isTest, onComplete]);

  const trickName = trTrick(lang, trick, group.group).name;

  // ── The end card ──
  if (done) {
    const passed = done.passed;
    return (
      <div className="tgpad">
        <div className="tgtop">
          <div className="ttl">{trickName}</div>
          <button className="qbtn" onClick={onExit}>
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div className={'tg-done' + (isTest ? (passed ? ' pass' : ' fail') : '')}>
          <div className="tg-done-score">{done.correct}<span>/{total}</span></div>
          <div className="tg-done-label">
            {isTest
              ? (passed ? t('trick_test_passed') : t('trick_test_failed', { n: TEST_PASS_MARK }))
              : t('trick_practice_done')}
          </div>
          <button className="tg-done-btn primary" onClick={onAgain}>
            {isTest && !passed ? t('trick_test_retake') : t('play_again')}
          </button>
          <button className="tg-done-btn" onClick={onExit}>{t('back')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tgpad">
      <div className="tgtop">
        <div className="ttl">{trickName}</div>
        <button className="qbtn" onClick={onExit}>
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      {isTest && <div className="tg-mode-pill">{t('trick_test_mode')}</div>}
      <div className="tg-solved-row">
        <div className="tg-solved-n">{index}<span className="tg-solved-of">/{total}</span></div>
        <div className="tg-solved-l">{isTest ? t('trick_test_right', { n: firstTry }) : t('solved')}</div>
      </div>
      <div className={'qc' + (qcOk ? ' fok' : '')}>
        <div className="ob">{trGroupName(lang, group.group)}</div>
        <div className="qt">{question.text}</div>
      </div>
      <div className={feedback.cls}>{feedback.text}</div>
      <input
        type="text"
        className={inputClass}
        placeholder="?"
        autoComplete="off"
        inputMode="decimal"
        readOnly
        value={input}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <div className="np">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} className="k" onClick={() => padInput(n)}>{n}</button>
        ))}
        <button className="k spec" style={{ background: '#ffd166', color: '#7a4f00', boxShadow: '0 2px 0 #c49030' }} onClick={() => padInput('neg')}>+/-</button>
        <button className="k" onClick={() => padInput(0)}>0</button>
        <button className="k spec-del" onClick={backspace}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
            <line x1="18" y1="9" x2="12" y2="15" />
            <line x1="12" y1="9" x2="18" y2="15" />
          </svg>
        </button>
        <button className="k spec" style={{ background: '#ffd166', color: '#7a4f00', boxShadow: '0 2px 0 #c49030' }} onClick={() => padInput('.')}>.</button>
        <button className="k go" style={{ gridColumn: 'span 2' }} onClick={submit}>{t('submit')}</button>
      </div>
    </div>
  );
}
