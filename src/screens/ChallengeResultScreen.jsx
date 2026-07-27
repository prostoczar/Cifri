import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { opName } from '../store/questionEngine.js';
import { todaySessionsFor, computeOpSummary } from '../store/selectors.js';
import ConfettiBurst from '../components/ConfettiBurst.jsx';
import MilestonePopup from '../components/MilestonePopup.jsx';

// Ported from the reference prototype's #scr-result markup + the relevant parts of endGame()/
// triggerResultCelebration(). The "Create account" button and "Complete streak" cross-mode CTA
// are intentionally omitted this stage — deferred to the onboarding/account and Braining stages.
export default function ChallengeResultScreen({ result, db, streak, lang, milestoneQueue, onMilestonesDone, onPlayAgain, onBack }) {
  const { t } = useI18n();
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    setCelebrate(!!result.isNewBest);
  }, [result]);

  const { score, correct, wrong, diff, isPrac } = result;
  const total = correct + wrong;
  const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
  const d = db[diff];

  let bestText = '--', streakText = '--', avgText = '--';
  if (!isPrac) {
    bestText = d.best || score;
    streakText = streak || 1;
    const todayList = todaySessionsFor(db, diff);
    avgText = todayList.length ? Math.round(todayList.reduce((a, s) => a + s.score, 0) / todayList.length) : score;
  } else if (diff) {
    bestText = d.best || '--';
    streakText = streak || '--';
    const todayList = todaySessionsFor(db, diff);
    avgText = todayList.length ? Math.round(todayList.reduce((a, s) => a + s.score, 0) / todayList.length) : '--';
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
        <div className={'rcd' + (celebrate ? ' celebrate' : '')}><div className="rcn">{avgText}</div><div className="rcl">{t('stat_today_avg')}</div></div>
      </div>
      {opSummary && (
        <div className="op-summary-card">
          <span>{t('op_summary', { fastOp: opName(lang, opSummary.fastest.op), fastAvg: opSummary.fastest.avg.toFixed(1), slowOp: opName(lang, opSummary.slowest.op), slowAvg: opSummary.slowest.avg.toFixed(1) })}</span>
        </div>
      )}
      <button className="abtn" onClick={onPlayAgain}>{t('play_again')}</button>
      <button className="bbtn" onClick={onBack}>{t('back')}</button>
      {celebrate && <ConfettiBurst />}
      <MilestonePopup queue={milestoneQueue} onDone={onMilestonesDone} />
    </div>
  );
}
