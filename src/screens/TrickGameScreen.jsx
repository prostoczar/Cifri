import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { TRICKS, setTricksLang } from '../store/tricksData.js';
import { trGroupName, trTrick } from '../store/tricks.js';
import { fn } from '../store/questionEngine.js';
import { tick, buzz } from '../store/sound.js';

// Ported from the reference prototype's startTrick/loadTQ/tgSubmit. An untimed, unscored drill
// on a single trick: correct answers advance and bump the solved count, wrong ones reveal the
// answer and wait. Nothing here is recorded — no streak, no stats, no achievements on completion.
export default function TrickGameScreen({ gi, ti, soundOn, onExit }) {
  const { t, lang } = useI18n();
  const [question, setQuestion] = useState({ text: '--' });
  const [input, setInput] = useState('');
  const [inputClass, setInputClass] = useState('ai');
  const [feedback, setFeedback] = useState({ text: '', cls: 'fb' });
  const [qcOk, setQcOk] = useState(false);
  const [solved, setSolved] = useState(0);

  const answerRef = useRef(null);
  const alockRef = useRef(false);
  const inputRef = useRef('');

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
    const res = trick.gen();
    answerRef.current = res.ans;
    setQuestion({ text: res.q });
    setInputBoth('');
    setInputClass('ai');
    setFeedback({ text: '', cls: 'fb' });
    setQcOk(false);
    alockRef.current = false;
  }, [lang, trick, setInputBoth]);

  useEffect(() => {
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
      setSolved((n) => n + 1);
      tick(soundOn);
      setInputClass('ai ok');
      setFeedback({ text: t('correct_excl'), cls: 'fb ok' });
      setQcOk(true);
      setTimeout(loadQuestion, 250);
    } else {
      buzz(soundOn);
      setInputClass('ai bad');
      setFeedback({ text: t('answer_colon') + ' ' + fn(answerRef.current), cls: 'fb bad' });
    }
  }, [loadQuestion, soundOn, t]);

  return (
    <div className="tgpad">
      <div className="tgtop">
        <div className="ttl">{trTrick(lang, trick, group.group).name}</div>
        <button className="qbtn" onClick={onExit}>
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="tg-solved-row">
        <div className="tg-solved-n">{solved}</div>
        <div className="tg-solved-l">{t('solved')}</div>
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
