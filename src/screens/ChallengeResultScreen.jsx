import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { opName } from '../store/questionEngine.js';
import { todayChallengeAvg, computeOpSummary } from '../store/selectors.js';
import ConfettiBurst from '../components/ConfettiBurst.jsx';
import { ResultAccountButton } from '../components/GuestConversion.jsx';
import AchievementPopup from '../components/AchievementPopup.jsx';
import ScoreBreakdown from '../components/ScoreBreakdown.jsx';

// Ported from the reference prototype's #scr-result markup + the relevant parts of endGame()/
// triggerResultCelebration().
export default function ChallengeResultScreen({
  result, db, streak, lang, achievementQueue, onAchievementsDone, onPlayAgain, onBack,
  guestConvoStarted, acctCreated, onCreateAccount,
}) {
  const { t } = useI18n();
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    setCelebrate(!!result.isNewBest);
  }, [result]);

  const { score, correct, wrong, diff, isPrac } = result;
  const total = correct + wrong;
  const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
  // The Practice tab has no difficulty, so there is no per-difficulty record to read.
  const d = diff ? db[diff] : null;

  // The fourth card is the payoff of the whole averaging model: not the run just played, but what
  // the day now scores having played it. On the first play of the day those are the same number;
  // on the third they may well not be, and that is the point.
  let bestText = '--', streakText = '--', avgText = '--';
  if (!isPrac && d) {
    bestText = d.best || score;
    streakText = streak || 1;
    avgText = todayChallengeAvg(db, diff).avg ?? score;
  } else if (diff) {
    bestText = d.best || '--';
    streakText = streak || '--';
    avgText = todayChallengeAvg(db, diff).avg ?? '--';
  }

  const opSummary = computeOpSummary(result.opTimes);

  return (
    <div className="rscr" style={{ position: 'relative', overflow: 'hidden' }}>
      <div className="rh">
        {celebrate && <div className="pb-ribbon show">{t('new_pb')}</div>}
        <div className="rsco">{score}</div>
        <div className="rl">{t('weighted_score')}</div>
        <div className="rsub">{correct} correct - {wrong} wrong</div>
      </div>
      <div className="rcds">
        <div className={'rcd' + (celebrate ? ' celebrate' : '')}><div className="rcn">{acc}%</div><div className="rcl">{t('accuracy')}</div></div>
        <div className={'rcd' + (celebrate ? ' celebrate' : '')}><div className="rcn">{bestText}</div><div className="rcl">{t('stat_personal_best')}</div></div>
        <div className={'rcd' + (celebrate ? ' celebrate' : '')}><div className="rcn">{streakText}</div><div className="rcl">{t('streak')}</div></div>
        <div className={'rcd' + (celebrate ? ' celebrate' : '')}><div className="rcn">{avgText}</div><div className="rcl">{t('stat_today_score')}</div></div>
      </div>
      <ScoreBreakdown
        breakdown={result.breakdown}
        rawScore={result.rawScore}
        boosted={result.boosted}
        score={score}
        diff={diff}
        lang={lang}
      />
      {opSummary && (
        <div className="op-summary-card">
          <span>{t('op_summary', { fastOp: opName(lang, opSummary.fastest.op), fastAvg: opSummary.fastest.avg.toFixed(1), slowOp: opName(lang, opSummary.slowest.op), slowAvg: opSummary.slowest.avg.toFixed(1) })}</span>
        </div>
      )}
      <button className="abtn" onClick={onPlayAgain}>{t('play_again')}</button>
      <ResultAccountButton visible={!acctCreated} onClick={onCreateAccount} />
      <button className="bbtn" onClick={onBack}>{t('back')}</button>
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
