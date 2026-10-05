import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { brAgeColor, brFmtSec, brScaleShown } from '../store/braining.js';
import { computeOpSummary } from '../store/selectors.js';
import ConfettiBurst from '../components/ConfettiBurst.jsx';
import { ResultAccountButton } from '../components/GuestConversion.jsx';
import AchievementPopup from '../components/AchievementPopup.jsx';
import ShareButton from '../components/ShareButton.jsx';
import { appUrl } from '../lib/appUrl.js';

// Ported from the reference prototype's #scr-br-result markup + the display half of brFinish().
export default function BrainingResultScreen({
  result, brState, streak, chDone, achievementQueue, onAchievementsDone,
  onTryAgain, onBack, onCompleteStreak,
  guestConvoStarted, acctCreated, onCreateAccount,
}) {
  const { t } = useI18n();
  const [celebrate, setCelebrate] = useState(false);

  const { sec, age, isPrac, isFirst, isPR, pracBestBefore } = result;

  useEffect(() => {
    setCelebrate(isPR && !isPrac);
  }, [result, isPR, isPrac]);

  // "vs best" cell. Practice is compared only with earlier PRACTICE runs: it is 20 questions to
  // the trial's 50, so setting it against the stored best always showed a large green "faster"
  // that meant nothing. With no earlier practice run there is nothing fair to compare with, and
  // the cell is left out rather than filled with a dash. It never celebrates either way.
  let vsText = '--', vsColor = '';
  const showVs = !isPrac || pracBestBefore != null;
  if (isPrac) {
    if (pracBestBefore != null && sec !== pracBestBefore) {
      const pdiff = sec - pracBestBefore;
      vsText = (pdiff > 0 ? '+' : '') + brFmtSec(Math.abs(pdiff), t);
      vsColor = pdiff < 0 ? 'var(--GDK)' : 'var(--TC)';
    } else if (pracBestBefore != null) {
      vsText = t('ties_best');
      vsColor = 'var(--GDK)';
    }
  } else if (isPR && !isFirst) {
    vsText = t('new_best_excl');
    vsColor = 'var(--GDK)';
  } else if (brState.bestTime && sec !== brState.bestTime) {
    const diff = sec - brState.bestTime;
    vsText = (diff > 0 ? '+' : '') + brFmtSec(Math.abs(diff), t);
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

  // ── Who gets a share button ─────────────────────────────────────────────────
  //
  // The day's counting trial, and only that — the same `!isPrac && isFirst` pair the reducer uses
  // to decide whether a trial is recorded at all, so the button is on screen exactly when the
  // result behind it is part of the player's history.
  //
  // A practice brain age is not a false number: it is computed by the same rule as any other. The
  // reason it is not shareable is that practice is unlimited, and "brain age 20" chosen from the
  // ninth attempt of the evening would quietly turn a one-trial-a-day design into a best-of. That
  // is the same thing the verified results table exists to protect.
  const canShare = !isPrac && isFirst;

  return (
    <div className="br-rscr" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="br-rh">
        {celebrate && <div className="pb-ribbon show">{t('new_pb')}</div>}
        <div className="br-age-n br-pop" style={{ color: brAgeColor(age) }}>{age}</div>
        <div className="br-age-l">{t(isPrac ? 'br_age_label_practice' : 'br_age_label')}</div>
        <div className="br-age-sub">{t('br_completed_in', { time: brFmtSec(sec, t) })}</div>
        <div className="br-badge-row">
          <span className={'br-badge ' + badge.cls}>{badge.text}</span>
        </div>
      </div>

      {isPR && !isPrac && (
        <div className="br-pr on br-shimmer">
          <div className="br-pr-title">{t('new_pr')}</div>
          <div className="br-pr-sub">{t('br_pr_sub', { time: brFmtSec(sec, t), age })}</div>
        </div>
      )}

      <div className="br-scale">
        <div className="br-scale-title">{t('brain_age_scale')}</div>
        <div>
          {brScaleShown(t).map((s) => (
            <div key={s.age} className={'br-srow' + (age === s.age ? ' cur' : '')}>
              <div className="br-sdot" style={{ background: s.color }}></div>
              <div className="br-srange">{s.label}</div>
              <div className="br-sage" style={{ color: s.color }}>{t('br_scale_age', { age: s.age })}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="br-rcds">
        <div className={'br-rcd' + (celebrate ? ' celebrate' : '')}>
          <div className="br-rcn">{brFmtSec(sec, t)}</div><div className="br-rcl">{t('completion_time')}</div>
        </div>
        <div className={'br-rcd' + (celebrate ? ' celebrate' : '')}>
          {/* Practice never sets the best age, so a practice result must not stand in for one when
              no real trial has been played yet. */}
          <div className="br-rcn">{brState.bestAge || (isPrac ? '--' : age)}</div><div className="br-rcl">{t('stat_best_age')}</div>
        </div>
        {/* With the comparison left out, the streak card spans the row so the 2×2 grid does not
            end on a lone half-width card. */}
        <div className={'br-rcd' + (celebrate ? ' celebrate' : '')} style={showVs ? undefined : { gridColumn: '1 / -1' }}>
          <div className="br-rcn">{isPrac ? '--' : streak || 1}</div><div className="br-rcl">{t('day_streak')}</div>
        </div>
        {showVs && (
          <div className={'br-rcd' + (celebrate ? ' celebrate' : '')}>
            <div className="br-rcn" style={{ color: vsColor }}>{vsText}</div><div className="br-rcl">{t(isPrac ? 'vs_best_practice' : 'vs_best_time')}</div>
          </div>
        )}
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
      {canShare && (
        <ShareButton
          cacheKey={'br:' + (result.reqId || '') + ':' + Math.round(sec)}
          analytics={{
            content_type: 'result',
            mode: 'braining',
            brain_age: age,
            duration_sec: Math.round(sec),
            is_personal_best: !!isPR,
          }}
          build={() => ({
            slug: 'braining-age-' + age,
            text: t('share_cap_braining', { age, url: appUrl() }),
            card: {
              hero: {
                ribbon: isPR ? t('new_pb') : null,
                value: age,
                // The scale's own colour for this age, so the card agrees with the screen it came
                // from rather than deciding on its own what a good result looks like.
                valueColor: brAgeColor(age),
                label: t('br_age_label'),
                body: t('br_completed_in', { time: brFmtSec(sec, t) }),
              },
              chips: [
                { value: brFmtSec(sec, t), label: t('completion_time') },
                { value: brState.bestAge || age, label: t('stat_best_age') },
                { value: streak || 1, label: t('day_streak'), tone: 'gold' },
              ],
              tagline: t('ob_tagline'),
            },
          })}
        />
      )}
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
