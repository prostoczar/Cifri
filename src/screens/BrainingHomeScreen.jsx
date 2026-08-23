import { useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { brDoneToday } from '../store/AppStateContext.jsx';
import { brFmtSec, fmtBrCountdown } from '../store/braining.js';
import { brainingStreak } from '../store/selectors.js';
import BrainingChart from '../components/BrainingChart.jsx';
import TrickOfDayCard from '../components/TrickOfDayCard.jsx';
import MidnightCountdown from '../components/MidnightCountdown.jsx';

// Ported from the reference prototype's Braining home markup + brUpdateHome().
export default function BrainingHomeScreen({
  brState, chartRange, chartType,
  onChartRange, onChartType, onStart, onPractice,
  totdLastViewed, onOpenTrickOfDay,
}) {
  const { t } = useI18n();
  const [infoOpen, setInfoOpen] = useState(false);

  const done = brDoneToday(brState);
  // v16 item 2: was `bestStreakEver`, the longest UNIFIED run. Now the number of days in a row
  // Braining itself has been played — see the matching note in ChallengeHomeScreen. The header
  // flame stays unified and untouched, so the two numbers can differ, and should.
  const brStreak = brainingStreak(brState);
  const streakIsRecord = done && brStreak.current > 0 && brStreak.current === brStreak.best;
  const statCls = (isStreak) =>
    'br-stat' + (done ? (isStreak && streakIsRecord ? ' br-stat-yl' : ' br-stat-gl') : '');
  const numStyle = { color: done ? '#000' : '' };

  const togCls = (on) => 'br-rtgl ' + (on ? 'on' : '') + (done ? ' gn' : ' rd');
  const ctabCls = (on) => 'br-ctab ' + (on ? 'on' : '') + (done ? ' gn' : ' rd');

  return (
    <div className="br-home">
      <div className="br-stats">
        <div className={statCls(true)}>
          <div className="br-stat-n" style={numStyle}>{brStreak.current}</div>
          <div className="br-stat-l">{t('stat_br_streak')}</div>
        </div>
        <div className={statCls(false)}>
          <div className="br-stat-n" style={numStyle}>{brState.bestTime !== null && brState.bestTime !== undefined ? brFmtSec(brState.bestTime, t) : '--'}</div>
          <div className="br-stat-l">{t('stat_best_time')}</div>
        </div>
        <div className={statCls(false)}>
          <div className="br-stat-n" style={numStyle}>{brState.bestAge || '--'}</div>
          <div className="br-stat-l">{t('stat_best_age')}</div>
        </div>
        <div className={statCls(false)}>
          <div className="br-stat-n" style={numStyle}>{done && brState.todayAge ? brState.todayAge : '--'}</div>
          <div className="br-stat-l">{t('stat_today_age')}</div>
        </div>
      </div>

      <div className="br-chart-card">
        <div className="br-chart-hdr">
          <span className="br-chart-lbl">
            {t('last_n_days', { n: chartRange })} — {chartType === 'age' ? t('brain_age') : t('completion_time_cap')}
          </span>
          <div className="br-range-row">
            <button className={togCls(chartRange === 7)} onClick={() => onChartRange(7)}>7d</button>
            <button className={togCls(chartRange === 30)} onClick={() => onChartRange(30)}>30d</button>
          </div>
        </div>
        <div className="br-ctabs">
          <button className={ctabCls(chartType === 'age')} onClick={() => onChartType('age')}>{t('brain_age')}</button>
          <button className={ctabCls(chartType === 'time')} onClick={() => onChartType('time')}>{t('time_view')}</button>
        </div>
        <BrainingChart brState={brState} range={chartRange} type={chartType} />
      </div>

      <TrickOfDayCard
        doneToday={done}
        totdLastViewed={totdLastViewed}
        onOpen={onOpenTrickOfDay}
      />
      {/* fmtBrCountdown takes `t` — the unit letters are translated too, not just the sentence. */}
      {done ? (
        <button className="br-btn-g timer" disabled><MidnightCountdown format={(ms) => fmtBrCountdown(ms, t)} /></button>
      ) : (
        <button className="br-btn-g br-btn-red" onClick={onStart}>{t('start_braining')}</button>
      )}
      <button
        id="br-prac-btn"
        className={'br-btn-grey' + (done ? ' done' : '')}
        style={{ display: 'block' }}
        onClick={onPractice}
      >
        {done ? t('play_again_not_counted') : t('br_practice')}
      </button>
      <div className="br-lbl">{done ? t('br_lbl_saved_today') : ''}</div>

      <div style={{ textAlign: 'center', padding: '6px 0 4px' }}>
        <button
          onClick={() => setInfoOpen((o) => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'calc(11px * var(--fs-mult))', color: 'var(--txt3)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>{t('br_info_link')}</span>
        </button>
      </div>
      <div className={'ip' + (infoOpen ? ' on' : '')} style={{ background: 'var(--card)' }}>
        <div>
          <strong style={{ fontSize: 'calc(13px * var(--fs-mult))', color: 'var(--txt)' }}>{t('br_info_title')}</strong>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {['br_info_1', 'br_info_2', 'br_info_3', 'br_info_4'].map((key) => (
              <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--G)', marginTop: 4, flexShrink: 0 }}></div>
                <div
                  style={{ fontSize: 'calc(12px * var(--fs-mult))', color: 'var(--txt2)', lineHeight: 1.55 }}
                  dangerouslySetInnerHTML={{ __html: t(key) }}
                />
              </div>
            ))}
          </div>
        </div>
        <button style={{ fontSize: 'calc(11px * var(--fs-mult))', color: 'var(--txt3)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }} onClick={() => setInfoOpen(false)}>
          {t('close')}
        </button>
      </div>
    </div>
  );
}
