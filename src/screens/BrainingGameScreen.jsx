import { useI18n } from '../store/useI18n.js';
import { brFmtTimer } from '../store/braining.js';

// Ported from the reference prototype's #scr-br-game markup.
export default function BrainingGameScreen({ game, onShowQuit }) {
  const { t } = useI18n();
  const { session, question, input, inputBad, qcState, hint, padInput, backspace, submitAnswer } = game;
  if (!session) return null;

  const overLast = session.lastTime != null && session.elapsed > session.lastTime;
  const pct = Math.round((session.qIdx / session.total) * 100);

  return (
    <div className="br-gpad">
      <div className="br-gtop">
        <div className="br-tc">
          {session.todayTime != null && (
            <div className="br-todaytime show">{t('hud_today', { v: brFmtTimer(session.todayTime) })}</div>
          )}
          {session.lastTime != null && (
            <div className="br-lasttime show">{t('hud_last_time', { v: brFmtTimer(session.lastTime) })}</div>
          )}
          <div className="br-tn" style={{ color: overLast ? 'var(--TC)' : '' }}>{brFmtTimer(session.elapsed)}</div>
          <div className="br-ts">{t('elapsed')}</div>
        </div>
        <div className="br-prog">
          <div className="br-pn">
            <span>{session.qIdx + 1}</span>
            <span style={{ fontSize: 'calc(14px * var(--fs-mult))', color: 'var(--txt3)', fontWeight: 400 }}> /</span>
            <span style={{ fontSize: 'calc(14px * var(--fs-mult))', color: 'var(--txt3)', fontWeight: 400 }}>{session.total}</span>
          </div>
          <div className="br-pl">{t('questions')}</div>
        </div>
        <button className="br-qbtn" onClick={onShowQuit}>
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="br-pw"><div className="br-pb" style={{ width: Math.max(2, pct) + '%' }}></div></div>
      {session.isPrac && (
        <div className="br-pbadge"><span>{t('practice_mode_not_counted')}</span></div>
      )}
      <div className={'br-qc' + (qcState ? ' ' + qcState : '')}>
        <div className="br-ob">{question.opLabel}</div>
        <div className="br-qt">{question.text}</div>
        <div className={'br-hint' + (hint ? ' bad' : '')}>{hint}</div>
      </div>
      <input
        type="text"
        className={'br-ai' + (inputBad ? ' bad' : '')}
        placeholder="?"
        autoComplete="off"
        inputMode="decimal"
        readOnly
        value={input}
        onKeyDown={(e) => { if (e.key === 'Enter') submitAnswer(); }}
      />
      {/* ph-no-capture — see the note on the identical keypad in ChallengeGameScreen. Autocapture
          would otherwise send each digit tapped as element text. */}
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
