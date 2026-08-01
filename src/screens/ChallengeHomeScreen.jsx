import { useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { attemptWord } from '../i18n_data.js';
import TrickOfDayCard from '../components/TrickOfDayCard.jsx';
import { todayDone } from '../store/AppStateContext.jsx';
import { todayChallengeAvg, todayChallengeHigh } from '../store/selectors.js';
import { diffLabel, diffInfoText } from '../store/questionEngine.js';
import ChallengeChart from '../components/ChallengeChart.jsx';
import StatInfoModal from '../components/StatInfoModal.jsx';

const DIFF_KEYS = ['easy', 'medium', 'hard'];

// Ported from the reference prototype's Challenge home screen markup + updateChUI()/selD()/
// chSetRange()/toggleInfo()/openMdl(). The Trick-of-the-Day card and guest-conversion banner
// are intentionally omitted this stage — Tricks and the account/onboarding UI aren't built yet.
export default function ChallengeHomeScreen({
  db, selDiff, onSelDiff, chRange, onChRange, streak, bestStreakEver,
  onStartChallenge,
  totdLastViewed, onOpenTrickOfDay,
}) {
  const { t, lang } = useI18n();
  const [infoOpen, setInfoOpen] = useState(false);
  const [statModal, setStatModal] = useState(null); // 'streak' | 'today' | 'best' | null

  const d = db[selDiff];
  // "Has played Challenge today" — the day's streak credit and the green styling, both of which
  // now turn on at the first play and stay on however many more times the player goes again.
  const done = todayDone(db, selDiff);
  // `count` drives the attempts line below; `avg` is the day's official score, and is shown on the
  // chart rather than in a stat box — a box repeating the chart's own headline number would be a
  // wasted third of the row.
  const { count: att } = todayChallengeAvg(db, selDiff);
  // The best SINGLE run today, which is a genuinely different number from both the day's average
  // and the all-time personal best beside it.
  const high = todayChallengeHigh(db, selDiff);
  const streakIsRecord = done && streak > 0 && streak === bestStreakEver;
  const streakCls = done ? (streakIsRecord ? 'yl' : 'gr') : '';

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
          <div className={'sn ' + (done ? 'gr' : '')}>{high == null ? '--' : high}</div>
          <div className={'sl ' + (done ? 'gr' : '')}>{t('stat_today_high')}</div>
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
      {/* One button, in two states. There is no longer a countdown to midnight, because there is
          nothing to wait for — Challenge can be replayed as often as the player likes — and no
          separate practice button, because every play now counts toward the day's average. */}
      <button
        className={'sbtn ' + (done ? 'gr' : 'tc')}
        onClick={onStartChallenge}
      >
        {done ? t('ch_play_again') : t('start_challenge')}
      </button>

      {/* The honest small print, shown only once there is a score at stake. Playing again is a
          bet: it can lift the day's average and it can just as easily sink it, and a player
          about to tap that green button deserves to know which of the two they are risking. */}
      {att > 0 && (
        <div className="albl">
          {t('attempts_today', { n: att, unit: attemptWord(lang, att) })}
          <div className="albl-risk">{t('ch_avg_risk')}</div>
        </div>
      )}

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
