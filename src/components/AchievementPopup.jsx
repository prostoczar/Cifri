import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { MILESTONE_ICONS } from '../store/milestones.js';

// Ported from the reference prototype's achievement popup (queueAndShowMilestones/renderMilestone/
// dismissMilestone). `queue` is the full list of {icon,nameKey,descKey,vars} cards to show, one
// at a time, tap-anywhere to advance. Calls onDone() once the queue is empty.
// The CTA rule is the reference's exactly: "First Challenge" and "First Braining" NEVER carry
// it — they stay simple celebrations, separate from the dedicated streak-lit popup, which is the
// one that actually asks. Every other achievement gets it once guest-conversion nudging has begun
// (the first streak-lit moment, or the 5-day fallback prompt), for as long as no account exists.
export default function AchievementPopup({ queue, onDone, guestConvoStarted, acctCreated, onCreateAccount }) {
  const { t } = useI18n();
  const [idx, setIdx] = useState(0);
  const [anim, setAnim] = useState(0);

  useEffect(() => {
    setIdx(0);
    setAnim((a) => a + 1);
  }, [queue]);

  if (!queue || !queue.length || idx >= queue.length) return null;

  const m = queue[idx];
  const noCtaEver = m.nameKey === 'ms_ch_first_name' || m.nameKey === 'ms_br_first_name';
  const showCta = !!guestConvoStarted && !acctCreated && !noCtaEver;

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
        <button
          className={'milestone-cta' + (showCta ? ' on' : '')}
          onClick={(e) => {
            // Stop this from also bubbling up and dismissing the popup, then clear anything left
            // in the queue so no leftover card is waiting behind the account screen.
            e.stopPropagation();
            onCreateAccount();
          }}
        >
          {t('create_account')}
        </button>
        <div className="milestone-hint">{t('tap_anywhere_close')}</div>
      </div>
    </div>
  );
}
