import { useMemo, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { useAppState } from '../store/AppStateContext.jsx';
import { ACHIEVEMENTS, achDesc, achName, earnedCount } from '../store/achievements.js';
import { achievementFanfare, ceremonyChime, rewardPing } from '../store/sound.js';
import { impact } from '../lib/haptics.js';
import { stampHaptic, useCeremonyLayout } from './ceremonyLayout.js';
import { appUrl } from '../lib/appUrl.js';
import { useScene, prefersReducedMotion } from '../hooks/useScene.js';
import { TIERS, tierShakes, tierVars } from './celebrateTiers.js';
import { InfinityDraw, RewardGlyph, Sparks, TierRing } from './CelebrationParts.jsx';
import Flame from './Flame.jsx';
import ShareButton from './ShareButton.jsx';

// One achievement ceremony — a full-screen event scaled by rarity (docs/launch-celebrations-spec.md,
// Feature 5). It replaces the old achievement card; Ceremonies.jsx plays a queue of them.
//
// `item` comes from buildCeremonies() (ceremonyQueue.js):
//   ach   an achievement, in its catalogue rarity, with its reward flying into the avatar circle
//   lit   "You've lit a streak!" — grey, the flame as its medallion, no chip and no reward, and the
//         Create account button, which is the whole point of that card
//   more  the closing "+{n} more" card
//
// What the old card did beyond celebrating is kept (decided 6 Oct 2026, decision A): the Create
// account button, with the same rule for when it shows, and the Share button. Both appear with
// "Tap to continue", so they never interrupt the ceremony itself.
//
// The timeline is the spec's table. Each step becomes an `s-<step>` class and index.css does the
// moving ("CEREMONIES"); sounds and haptics ride on the same timers (useScene).

function stepsFor(item) {
  if (item.kind === 'more') {
    const n = item.entries.length;
    return [[0, 'flood'], [150, 'title'], [300, 'row'], [300 + n * 80 + 400, 'ready']];
  }
  const legendary = item.tier === 'legendary';
  const stamp = legendary ? 2000 : 1300;
  const s = [[0, 'flood'], [150, 'pill'], [1050, 'pillUp'], [stamp, 'stamp'], [stamp + 320, 'name'], [stamp + 420, 'desc']];
  if (item.kind === 'ach') s.push([1350, 'chip'], [stamp + 650, 'reward'], [stamp + 900, 'fly'], [stamp + 1380, 'landed']);
  if (legendary) s.push([1150, 'inf']);
  if (tierShakes(item.tier)) s.push([stamp + 240, 'shake']);
  s.push([stamp + 1300, 'ready']);
  return s.sort((a, b) => a[0] - b[0]);
}

export default function CeremonyScene({ item, onDone, guestConvoStarted, acctCreated, onCreateAccount }) {
  const { t, lang } = useI18n();
  const { state } = useAppState();
  const soundRef = useRef(state.settings.sound);
  soundRef.current = state.settings.sound;
  const [reduced] = useState(prefersReducedMotion);
  const steps = useMemo(() => stepsFor(item), [item]);
  const tier = item.tier;

  const scene = useScene({
    steps,
    reduced,
    collapseAt: 900,
    onContinue: onDone,
    cue: (name) => {
      const snd = soundRef.current;
      if (name === 'pill') ceremonyChime(snd);
      if (name === 'title') { ceremonyChime(snd); impact('light'); }
      if (name === 'stamp') { achievementFanfare(snd, tier); stampHaptic(tier); }
      if (name === 'landed') rewardPing(snd);
    },
  });
  const { reached, skipped, onTap, classes } = scene;

  // ── Layout, measured from the real screen (ceremonyLayout.js) ──
  const rootRef = useRef(null);
  const avatarRef = useRef(null);
  const vars = useCeremonyLayout(rootRef, avatarRef);

  const p = TIERS[tier] || TIERS.common;
  const ach = item.ach;
  const reward = ach ? ach.reward : null;
  const name = item.kind === 'ach' ? achName(lang, ach)
    : item.kind === 'lit' ? t('ms_streaklit_name')
    : t('cer_more', { n: item.entries.length });
  const desc = item.kind === 'ach' ? achDesc(lang, ach) : item.kind === 'lit' ? t('ms_streaklit_desc') : '';

  // The account ask: never on First Challenge or First Braining (they stay simple celebrations),
  // otherwise once guest-conversion nudging has begun and for as long as there is no account — the
  // old card's rule exactly. The lit-a-streak prompt is the ask itself.
  const key = item.card ? item.card.key : null;
  const noCtaEver = key === 'ch_first' || key === 'br_first';
  const showCta = item.kind !== 'more' && !acctCreated && (item.kind === 'lit' || (!!guestConvoStarted && !noCtaEver));

  const shareChips = [{ value: earnedCount(state.milestones) + '/' + ACHIEVEMENTS.length, label: t('share_chip_achievements') }];
  if (state.streak > 0) shareChips.push({ value: state.streak, label: t('day_streak'), tone: 'gold' });

  const sparkColors = tier === 'legendary' ? ['#ffffff', '#d65a3a', '#0f9d6c']
    : tier === 'epic' ? ['#ffd166', '#ffffff']
    : tier === 'rare' ? ['#ffd166', '#ffffff']
    : [p.ring, p.sym];

  const cls = ['cer', 'tier-' + tier, 'kind-' + item.kind].concat(classes).join(' ');

  return (
    <div className={cls} ref={rootRef} style={{ ...tierVars(tier), ...vars }} onClick={onTap}
      role="dialog" aria-modal="true" aria-label={name}>
      <div className="cer-flood cer-a" />
      <span className="cel-sr" role="status" aria-live="polite">{reached.pill || reached.title ? name : ''}</span>

      <div className="cer-body">
        {item.kind === 'more' ? (
          <>
            <div className="cer-more-title cer-a">{name}</div>
            <div className="cer-more-row">
              {item.entries.map((a, i) => (
                <span key={a.key} className="cer-mini cer-a" style={{ transitionDelay: reduced || skipped ? '0ms' : i * 80 + 'ms' }}>
                  <RewardGlyph reward={a.reward} px={26} />
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="cer-center">
              {tier === 'legendary' && <div className="cer-inf-pos cer-a"><InfinityDraw /></div>}
              <div className="cer-ring-pos cer-a"><TierRing tier={tier} still={reduced} /></div>
              <Sparks n={p.sparks} colors={sparkColors} go={!!reached.stamp && !skipped && !reduced} />
              <div className="cer-med cer-a">
                {item.kind === 'lit' ? <Flame base="lit" /> : <RewardGlyph reward={reward} px={58} />}
              </div>
              {reward && (
                <div className="cer-fly-pos cer-a"><RewardGlyph reward={reward} px={58} /></div>
              )}
            </div>
            <div className="cer-info">
              <div className="cer-name cer-a">{name}</div>
              <div className="cer-desc cer-a">{desc}</div>
              {reward && (
                <div className="cer-reward cer-a">
                  <span className="cer-avatar cer-a" ref={avatarRef}>
                    <span className="cer-avatar-glyph"><RewardGlyph reward={reward} px={17} /></span>
                  </span>
                  <span>{t('cer_new_avatar')}</span>
                </div>
              )}
              <div className="cer-actions" onClick={(e) => e.stopPropagation()}>
                {showCta && (
                  <button className="cer-cta" onClick={() => onCreateAccount(key ? 'achievement_cta' : 'streak_lit', key)}>
                    {t('create_account')}
                  </button>
                )}
                <ShareButton
                  className="cer-share"
                  cacheKey={(key || 'streak_lit') + ':ceremony'}
                  analytics={{ content_type: 'achievement', achievement_key: key, rarity: ach ? ach.rarity : null }}
                  build={() => ({
                    slug: key || 'achievement',
                    text: t('share_cap_achievement', { name, url: appUrl() }),
                    card: {
                      hero: {
                        iconName: reward && reward.type === 'icon' ? reward.value : (reward ? null : 'flame'),
                        symbol: reward && reward.type === 'symbol' ? reward.value : null,
                        rarity: ach ? { key: ach.rarity, label: t('rarity_' + ach.rarity) } : null,
                        title: name,
                        body: desc,
                      },
                      chips: shareChips,
                      tagline: t('ob_tagline'),
                    },
                  })}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {item.kind !== 'more' && (
        <div className="cer-pill-pos cer-a"><div className="cer-pill cer-a">{t('cer_new_achievement')}</div></div>
      )}
      {item.kind === 'ach' && (
        <div className="cer-chip-pos"><div className="cer-chip cer-a">{t('rarity_' + tier)}</div></div>
      )}
      <div className="cer-tap" aria-hidden="true">{t('finish_tap')}</div>
    </div>
  );
}
