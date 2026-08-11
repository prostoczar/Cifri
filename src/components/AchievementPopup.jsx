import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { ACHIEVEMENT_BY_KEY, achDesc, achName } from '../store/achievements.js';
import { AVATAR_ICONS } from '../store/avatar.js';

// Ported from the reference prototype's achievement popup (queueAndShowMilestones/renderMilestone/
// dismissMilestone). `queue` is the list of cards to show, one at a time, tap-anywhere to advance.
// Calls onDone() once the queue is empty.
//
// A card is one of two shapes:
//   { key }                          an entry in the catalogue — everything is looked up from it
//   { icon, nameKey, descKey, vars } an ad-hoc card with no catalogue entry behind it
//
// The second shape exists for exactly two things: the "You've lit a streak!" prompt, which the
// spreadsheet marks as not a real achievement, and streaks past 365, which keep celebrating every
// 30 days forever after the reward ladder has run out. Everything else is a `key`.
//
// The CTA rule is the reference's exactly: "First Challenge" and "First Braining" NEVER carry
// it — they stay simple celebrations, separate from the dedicated streak-lit popup, which is the
// one that actually asks. Every other achievement gets it once guest-conversion nudging has begun
// (the first streak-lit moment, or the 5-day fallback prompt), for as long as no account exists.
export default function AchievementPopup({ queue, onDone, guestConvoStarted, acctCreated, onCreateAccount }) {
  const { t, lang } = useI18n();
  const [idx, setIdx] = useState(0);
  const [anim, setAnim] = useState(0);

  useEffect(() => {
    setIdx(0);
    setAnim((a) => a + 1);
  }, [queue]);

  if (!queue || !queue.length || idx >= queue.length) return null;

  const card = queue[idx];
  const ach = card.key ? ACHIEVEMENT_BY_KEY[card.key] : null;

  const name = ach ? achName(lang, ach) : t(card.nameKey, card.vars);
  const desc = ach ? achDesc(lang, ach) : t(card.descKey, card.vars);

  // The reward is the celebration: an achievement shows the very icon or symbol it just unlocked
  // in the picker, so what you earned and what you can now wear are visibly the same thing.
  const reward = ach ? ach.reward : { type: 'icon', value: card.icon };
  const isSymbol = reward.type === 'symbol';

  const noCtaEver = card.key === 'ch_first' || card.key === 'br_first';
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
        {isSymbol ? (
          <div className="milestone-icon-wrap bounce ms-symbol">{reward.value}</div>
        ) : (
          <div
            className="milestone-icon-wrap bounce"
            dangerouslySetInnerHTML={{ __html: AVATAR_ICONS[reward.value] || '' }}
          />
        )}
        <div className="milestone-name">{name}</div>
        <div className="milestone-desc">{desc}</div>
        <button
          className={'milestone-cta' + (showCta ? ' on' : '')}
          onClick={(e) => {
            // Stop this from also bubbling up and dismissing the popup, then clear anything left
            // in the queue so no leftover card is waiting behind the account screen.
            e.stopPropagation();
            // Which card was on screen when the offer was taken. The dedicated first-streak
            // prompt is the one the whole conversion flow is built around, so it is reported
            // under its own name rather than lumped in with the achievements — it is not one
            // (see the catalogue's note on row 43), and the difference is the entire question
            // "does the streak moment convert better than a later milestone?".
            onCreateAccount(card.key ? 'achievement_cta' : 'streak_lit', card.key || null);
          }}
        >
          {t('create_account')}
        </button>
        <div className="milestone-hint">{t('tap_anywhere_close')}</div>
      </div>
    </div>
  );
}
