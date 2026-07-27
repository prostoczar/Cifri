import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { MILESTONE_ICONS } from '../store/milestones.js';

// Ported from the reference prototype's milestone popup (queueAndShowMilestones/renderMilestone/
// dismissMilestone). `queue` is the full list of {icon,nameKey,descKey,vars} cards to show, one
// at a time, tap-anywhere to advance. Calls onDone() once the queue is empty.
// The account-creation CTA button is intentionally omitted this stage — it's wired up once the
// mocked account/onboarding UI exists.
export default function MilestonePopup({ queue, onDone }) {
  const { t } = useI18n();
  const [idx, setIdx] = useState(0);
  const [anim, setAnim] = useState(0);

  useEffect(() => {
    setIdx(0);
    setAnim((a) => a + 1);
  }, [queue]);

  if (!queue || !queue.length || idx >= queue.length) return null;

  const m = queue[idx];

  const dismiss = () => {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
      setAnim((a) => a + 1);
    } else {
      onDone();
    }
  };

  return (
    <div className="milestone-mbg on" onClick={dismiss}>
      <div className="milestone-card show" key={anim}>
        <div className="milestone-glow pulse"></div>
        <div className="milestone-icon-wrap bounce" dangerouslySetInnerHTML={{ __html: MILESTONE_ICONS[m.icon] || '' }} />
        <div className="milestone-name">{t(m.nameKey, m.vars)}</div>
        <div className="milestone-desc">{t(m.descKey, m.vars)}</div>
        <div className="milestone-hint">{t('tap_anywhere_close')}</div>
      </div>
    </div>
  );
}
