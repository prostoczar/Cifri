import { useI18n } from '../store/useI18n.js';
import { fn } from '../store/questionEngine.js';

// Ported from the reference prototype's #scr-game markup + updateTUI().
export default function ChallengeGameScreen({ game, onShowQuit }) {
  const { t } = useI18n();
  const { session, question, input, inputClass, feedback, qcFlash, padInput, backspace, submitAnswer } = game;
  if (!session) return null;

  let tn, ts, pbWidth, pbBg, urgent = false;
  if (session.isUnlim) {
    tn = '∞'; ts = ''; pbWidth = '100%'; pbBg = 'var(--G)';
  } else if (session.isCountMode) {
    const left = session.countLeft;
    tn = left; ts = 'left';
    const pct = Math.max(0, (left / session.countTotal) * 100);
    pbWidth = pct + '%'; pbBg = pct < 20 ? 'var(--TC)' : 'var(--G)';
  } else {
    tn = session.timer; ts = t('sec');
    const p = session.ttotal > 0 ? Math.max(0, (session.timer / session.ttotal) * 100) : 0;
    pbWidth = p + '%';
    if (session.timer <= 10 && session.timer > 0) { urgent = true; pbBg = 'var(--TC)'; }
    else pbBg = 'var(--G)';
  }

  return (
    <div className="gpad">
      <div className="gtop">
        <div className={'tc2' + (urgent ? ' urg' : '')}>
          <div className="tn">{tn}</div>
          <div className="ts">{ts}</div>
        </div>
        <div className="scd">
          {session.todayScore != null && <div className="sc-today show">{t('hud_today', { v: fn(session.todayScore) })}</div>}
          {session.yestScore != null && <div className="sc-yest show">{t('hud_yesterday', { v: fn(session.yestScore) })}</div>}
          <div className="sb" style={{ color: session.yestScore == null ? '' : session.score < session.yestScore ? 'var(--TC)' : 'var(--G)' }}>
            {session.score}
          </div>
          <div className="sbs">{t('pts')}</div>
        </div>
        <button className="qbtn" onClick={onShowQuit}>
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="pw"><div className="pb" style={{ width: pbWidth, background: pbBg }}></div></div>
      <div className={'qc' + (qcFlash ? ' fok' : '')}>
        <div className="ob">{question.opLabel}</div>
        <div className="qt">{question.text}</div>
        {/* Inside the card, the way Braining's .br-hint already sits inside .br-qc. As a sibling
            band between the card and the answer box it pushed them 32px apart, against 8px
            everywhere else on the screen. It keeps its reserved height either way — the text
            appears and clears on every answer, and a line that collapsed when empty would bounce
            the keypad under the player's thumb mid-run. */}
        <div className={feedback.cls}>{feedback.text}</div>
      </div>
      <input type="text" className={inputClass} placeholder="?" autoComplete="off" inputMode="decimal" readOnly value={input}
        onKeyDown={(e) => { if (e.key === 'Enter') submitAnswer(); }} />
      {/* ph-no-capture keeps analytics autocapture off the keypad. Autocapture records the TEXT of
          whatever was clicked, and these buttons are labelled 1-9 — so without it every tap would
          be sent as a digit, and the sequence would reconstruct the player's answer exactly. The
          answer field itself is an <input>, which is masked by default; the keypad is not, and is
          the route that would leak. */}
      <div className="np ph-no-capture">
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
        <button className="k go" style={{ gridColumn: 'span 2' }} onClick={submitAnswer}>{t('submit')}</button>
      </div>
    </div>
  );
}
