import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { useAppState } from '../store/AppStateContext.jsx';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_KEY, achDesc, achName, earnedCount } from '../store/achievements.js';
import { AVATAR_ICONS } from '../store/avatar.js';
import ShareButton from './ShareButton.jsx';
import { appUrl } from '../lib/appUrl.js';

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
  // Read straight from state rather than taken as props: this component is rendered from four
  // places, and the two numbers the card carries are the player's, not the caller's.
  const { state } = useAppState();
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

  // What the card brags with. `earnedCount` counts catalogue rows only, so `streak_lit` and the
  // post-365 streak celebrations do not inflate it. The streak chip is dropped rather than shown
  // as a zero — a card that says "0 day streak" is an advert against playing.
  const shareChips = [
    { value: earnedCount(state.milestones) + '/' + ACHIEVEMENTS.length, label: t('share_chip_achievements') },
  ];
  if (state.streak > 0) shareChips.push({ value: state.streak, label: t('day_streak'), tone: 'gold' });

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
        {/* Every unlock is shareable, including one that happened during a practice run: the
            achievement is genuinely and permanently theirs however it was earned. That is the
            difference between this and the result screens, where only a counted run offers the
            button — a warm-up SCORE is not comparable to anything, but a warm-up UNLOCK is real.

            BELOW the account CTA, not above it. The CTA is invisible on most cards, so the order
            usually does not show — but the one card where it does is the streak-lit prompt, which
            exists for no other purpose than to ask for an account. Sharing must not get in front
            of the ask on the one card that is the ask. */}
        <ShareButton
          cacheKey={(card.key || card.nameKey || '') + ':' + idx}
          analytics={{ content_type: 'achievement', achievement_key: card.key || null, rarity: ach ? ach.rarity : null }}
          build={() => ({
            slug: card.key || 'achievement',
            text: t('share_cap_achievement', { name, url: appUrl() }),
            card: {
              hero: {
                iconName: isSymbol ? null : reward.value,
                symbol: isSymbol ? reward.value : null,
                // The ad-hoc cards — the streak-lit prompt and the endless post-365 streaks — are
                // not catalogue rows and have no rarity to show. The template simply omits the
                // pill rather than inventing a tier for them.
                rarity: ach ? { key: ach.rarity, label: t('rarity_' + ach.rarity) } : null,
                title: name,
                body: desc,
              },
              chips: shareChips,
              tagline: t('ob_tagline'),
            },
          })}
        />
        <div className="milestone-hint">{t('tap_anywhere_close')}</div>
      </div>
    </div>
  );
}
