import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { brAgeColor, brFmtSec, BR_SCALE_SHOWN } from '../store/braining.js';
import { computeOpSummary } from '../store/selectors.js';
import ConfettiBurst from '../components/ConfettiBurst.jsx';
import { ResultAccountButton } from '../components/GuestConversion.jsx';
import AchievementPopup from '../components/AchievementPopup.jsx';

// Ported from the reference prototype's #scr-br-result markup + the display half of brFinish().
export default function BrainingResultScreen({
  result, brState, streak, chDone, achievementQueue, onAchievementsDone,
  onTryAgain, onBack, onCompleteStreak,
  guestConvoStarted, acctCreated, onCreateAccount,
}) {
  const { t } = useI18n();
  const [celebrate, setCelebrate] = useState(false);

  const { sec, age, isPrac, isFirst, isPR } = result;

  useEffect(() => {
    setCelebrate(isPR && !isPrac);
  }, [result, isPR, isPrac]);

  // "vs best time" cell — practice compares against the stored best but never celebrates.
  let vsText = '--', vsColor = '';
  if (isPrac) {
    if (brState.bestTime != null && sec !== brState.bestTime) {
      const pdiff = sec - brState.bestTime;
      vsText = (pdiff > 0 ? '+' : '') + brFmtSec(Math.abs(pdiff));
      vsColor = pdiff < 0 ? 'var(--GDK)' : 'var(--TC)';
    } else if (brState.bestTime != null) {
      vsText = t('ties_best');
      vsColor = 'var(--GDK)';
    }
  } else if (isPR && !isFirst) {
    vsText = t('new_best_excl');
    vsColor = 'var(--GDK)';
  } else if (brState.bestTime && sec !== brState.bestTime) {
    const diff = sec - brState.bestTime;
    vsText = (diff > 0 ? '+' : '') + brFmtSec(Math.abs(diff));
    vsColor = diff < 0 ? 'var(--GDK)' : 'var(--TC)';
  } else {
    vsText = t('first_word');
  }

  const badge = isPrac
    ? { cls: 'gry', text: t('badge_practice_run') }
    : isFirst
    ? { cls: 'grn', text: t('badge_first_trial') }
    : { cls: 'gry', text: t('badge_retry') };

  const opSummary = computeOpSummary(result.opTimes);
  const showCompleteStreak = !isPrac && isFirst && !chDone;

  return (
    <div className="br-rscr" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="br-rh">
        {celebrate && <div className="pb-ribbon show">{t('new_pb')}</div>}
        <div className="br-age-n br-pop" style={{ color: brAgeColor(age) }}>{age}</div>
        <div className="br-age-l">{isPrac ? 'brain age (practice)' : 'brain age'}</div>
        <div className="br-age-sub">{'Completed in ' + brFmtSec(sec)}</div>
        <div className="br-badge-row">
          <span className={'br-badge ' + badge.cls}>{badge.text}</span>
        </div>
      </div>

      {isPR && !isPrac && (
        <div className="br-pr on br-shimmer">
          <div className="br-pr-title">{t('new_pr')}</div>
          <div className="br-pr-sub">{'Best time: ' + brFmtSec(sec) + ' · Brain age: ' + age}</div>
        </div>
      )}

      <div className="br-scale">
        <div className="br-scale-title">{t('brain_age_scale')}</div>
        <div>
          {BR_SCALE_SHOWN.map((s) => (
            <div key={s.age} className={'br-srow' + (age === s.age ? ' cur' : '')}>
              <div className="br-sdot" style={{ background: s.color }}></div>
              <div className="br-srange">{s.label}</div>
              <div className="br-sage" style={{ color: s.color }}>{'Age ' + s.age}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="br-rcds">
        <div className={'br-rcd' + (celebrate ? ' celebrate' : '')}>
          <div className="br-rcn">{brFmtSec(sec)}</div><div className="br-rcl">{t('completion_time')}</div>
        </div>
        <div className={'br-rcd' + (celebrate ? ' celebrate' : '')}>
          <div className="br-rcn">{brState.bestAge || age}</div><div className="br-rcl">{t('stat_best_age')}</div>
        </div>
        <div className={'br-rcd' + (celebrate ? ' celebrate' : '')}>
          <div className="br-rcn">{isPrac ? '--' : streak || 1}</div><div className="br-rcl">{t('day_streak')}</div>
        </div>
        <div className={'br-rcd' + (celebrate ? ' celebrate' : '')}>
          <div className="br-rcn" style={{ color: vsColor }}>{vsText}</div><div className="br-rcl">{t('vs_best_time')}</div>
        </div>
      </div>

      {opSummary && (
        <div className="op-summary-card">
          <span>{t('op_summary', { fastOp: opSummary.fastest.op, fastAvg: opSummary.fastest.avg.toFixed(1), slowOp: opSummary.slowest.op, slowAvg: opSummary.slowest.avg.toFixed(1) })}</span>
        </div>
      )}

      {showCompleteStreak && (
        <button className="complete-streak-btn" style={{ display: 'block' }} onClick={onCompleteStreak}>
          {t('complete_streak')}
        </button>
      )}
      <button className="br-btn-g" onClick={onTryAgain}>{t('try_again_not_counted')}</button>
      <ResultAccountButton visible={!acctCreated} onClick={onCreateAccount} />
      <button className="br-btn-out" onClick={onBack}>{t('back_to_braining')}</button>

      {celebrate && <ConfettiBurst />}
      <AchievementPopup
        queue={achievementQueue}
        onDone={onAchievementsDone}
        guestConvoStarted={guestConvoStarted}
        acctCreated={acctCreated}
        onCreateAccount={onCreateAccount}
      />
    </div>
  );
}
