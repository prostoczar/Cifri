import { useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import TrickOfDayCard from '../components/TrickOfDayCard.jsx';
import MidnightCountdown from '../components/MidnightCountdown.jsx';
import { todayDone } from '../store/AppStateContext.jsx';
import { todaySessionsFor } from '../store/selectors.js';
import { diffLabel, diffInfoText } from '../store/questionEngine.js';
import { fmtChCountdown } from '../store/dates.js';
import ChallengeChart from '../components/ChallengeChart.jsx';
import StatInfoModal from '../components/StatInfoModal.jsx';

const DIFF_KEYS = ['easy', 'medium', 'hard'];

// Ported from the reference prototype's Challenge home screen markup + updateChUI()/selD()/
// chSetRange()/toggleInfo()/openMdl(). The Trick-of-the-Day card and guest-conversion banner
// are intentionally omitted this stage — Tricks and the account/onboarding UI aren't built yet.
export default function ChallengeHomeScreen({
  db, selDiff, onSelDiff, chRange, onChRange, streak, bestStreakEver,
  onStartChallenge, onStartPractice,
  totdLastViewed, onOpenTrickOfDay,
}) {
  const { t, lang } = useI18n();
  const [infoOpen, setInfoOpen] = useState(false);
  const [statModal, setStatModal] = useState(null); // 'streak' | 'today' | 'best' | null

  const d = db[selDiff];
  const done = todayDone(db, selDiff);
  const todayList = todaySessionsFor(db, selDiff);
  const avg = todayList.length ? Math.round(todayList.reduce((a, s) => a + s.score, 0) / todayList.length) : '--';
  const streakIsRecord = done && streak > 0 && streak === bestStreakEver;
  const streakCls = done ? (streakIsRecord ? 'yl' : 'gr') : '';
  const att = todayList.length;

  return (
    <>
      <div className="drow">
        {DIFF_KEYS.map((k) => (
          <div
            key={k}
            className={'dc' + (selDiff === k ? (todayDone(db, k) ? ' gr' : ' tc') : '')}
            onClick={() => onSelDiff(k)}
          >
            {t('diff_' + k)}
          </div>
        ))}
      </div>

      <div className="srow">
        <div className={'sc ' + streakCls} onClick={() => setStatModal('streak')}>
          <div className={'sn ' + streakCls}>{bestStreakEver || 0}</div>
          <div className={'sl ' + streakCls}>{t('stat_best_streak')}</div>
        </div>
        <div className={'sc ' + (done ? 'gr' : '')} onClick={() => setStatModal('today')}>
          <div className={'sn ' + (done ? 'gr' : '')}>{avg}</div>
          <div className={'sl ' + (done ? 'gr' : '')}>{t('stat_today_avg')}</div>
        </div>
        <div className={'sc ' + (done ? 'gr' : '')} onClick={() => setStatModal('best')}>
          <div className={'sn ' + (done ? 'gr' : '')}>{d.best || '--'}</div>
          <div className={'sl ' + (done ? 'gr' : '')}>{t('stat_personal_best')}</div>
        </div>
      </div>

      <div className="cw">
        <div className="cl">
          <span>{t('last_n_days', { n: chRange })} · {diffLabel(lang, selDiff)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="ch-range-row">
              <button className={'br-rtgl' + (chRange === 7 ? ' on' : '') + (done ? ' gn' : ' rd')} onClick={() => onChRange(7)}>7d</button>
              <button className={'br-rtgl' + (chRange === 30 ? ' on' : '') + (done ? ' gn' : ' rd')} onClick={() => onChRange(30)}>30d</button>
            </div>
          </div>
        </div>
        <ChallengeChart db={db} diff={selDiff} range={chRange} />
      </div>

      <TrickOfDayCard
        doneToday={done}
        totdLastViewed={totdLastViewed}
        onOpen={onOpenTrickOfDay}
      />
      {done ? (
        <button className="sbtn timer" disabled><MidnightCountdown format={fmtChCountdown} /></button>
      ) : (
        // updateChUI() in the reference prototype overwrites the button's initial (translated)
        // text with this literal English string at runtime — ported as-is for fidelity.
        <button className="sbtn tc" onClick={onStartChallenge}>Start challenge (Only 1st trial counts)</button>
      )}
      <button
        className={'ch-prac-btn' + (done ? ' done' : '')}
        style={{ display: 'block' }}
        onClick={() => onStartPractice(selDiff)}
      >
        {done ? t('play_again_not_counted') : t('practice_not_counted')}
      </button>
      <div className="albl">{att > 0 ? att + ' attempt' + (att !== 1 ? 's' : '') + ' today' : ''}</div>

      <div style={{ textAlign: 'center', padding: '6px 16px 4px' }}>
        <button
          onClick={() => setInfoOpen((o) => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'calc(11px * var(--fs-mult))', color: 'var(--txt3)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{t('diff_info_link')}</span>
        </button>
      </div>
      <div className={'ip' + (infoOpen ? ' on' : '')} style={{ background: 'var(--card)' }}>
        <div>
          <strong style={{ fontSize: 'calc(13px * var(--fs-mult))', color: 'var(--txt)' }}>{diffLabel(lang, selDiff)}</strong>
          <p
            style={{ fontSize: 'calc(12px * var(--fs-mult))', color: 'var(--txt2)', marginTop: 6, lineHeight: 1.65 }}
            dangerouslySetInnerHTML={{ __html: diffInfoText(lang, selDiff) }}
          />
        </div>
        <button style={{ fontSize: 'calc(11px * var(--fs-mult))', color: 'var(--txt3)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }} onClick={() => setInfoOpen(false)}>
          {t('close')}
        </button>
      </div>

      <StatInfoModal
        type={statModal}
        db={db}
        selDiff={selDiff}
        streak={streak}
        bestStreakEver={bestStreakEver}
        lang={lang}
        onClose={() => setStatModal(null)}
      />
    </>
  );
}
