import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { useAppState } from '../store/AppStateContext.jsx';
import { tPlural } from '../i18n_data.js';
import { ACHIEVEMENTS, earnedCount } from '../store/achievements.js';
import { achievementFanfare, dotNote, ignite, rewardPing } from '../store/sound.js';
import { selection } from '../lib/haptics.js';
import { appUrl } from '../lib/appUrl.js';
import { useScene, prefersReducedMotion } from '../hooks/useScene.js';
import { TIERS, tierShakes, tierVars } from './celebrateTiers.js';
import { InfinityDraw, RewardGlyph, Sparks, TierRing } from './CelebrationParts.jsx';
import { stampHaptic, useCeremonyLayout } from './ceremonyLayout.js';
import Flame from './Flame.jsx';
import ShareButton from './ShareButton.jsx';

// A streak milestone ceremony (docs/launch-celebrations-spec.md, Feature 6): a ring of sixteen dots
// fills, the flame heats up and catches, then the tier's own celebration plays — the achievement
// ceremony's palette, ring, sparks, fanfare and haptics, with the burning flame where the medallion
// would be. Which days get one, and in what tier, is buildCeremonies()'s business (ceremonyQueue.js);
// this only plays `item`: { days, tier, textKey, ach }, where `ach` (the day's streak achievement,
// unlocked just now) adds the reward row.
//
// The sixteen dots are always sixteen, whatever the milestone: a build-up, not a day count. The chip
// always reads "{n}-DAY STREAK", never a rarity, so a tier's colour here never contradicts the rarity
// the achievements list shows for the same day.
//
// Shares index.css's "CEREMONIES" styles with CeremonyScene, plus its own "STREAK CEREMONY" block.

const DOTS = 16;
const DOT_RING = 74;

function stepsFor(item) {
  const gold = item.tier === 'legendary';
  // The tier moment. Gold first draws the ∞ (from 1880, 800 ms), which pushes it back.
  const moment = gold ? 2680 : 1980;
  const s = [[0, 'flood'], [250, 'chip'], [250, 'disc'], [300, 'flame'], [350, 'dots']];
  for (let i = 0; i < DOTS; i++) s.push([600 + 55 * i, 'd' + i]);
  s.push([1600, 'heat'], [1920, 'burn'], [moment, 'tier'], [moment + 300, 'label'], [moment + 450, 'text']);
  if (gold) s.push([1880, 'inf']);
  if (tierShakes(item.tier)) s.push([moment + 240, 'shake']);
  if (item.ach) s.push([moment + 650, 'reward'], [moment + 900, 'fly'], [moment + 1380, 'landed']);
  s.push([moment + 1200, 'ready']);
  return s.sort((a, b) => a[0] - b[0]);
}

export default function StreakCeremony({ item, onDone, guestConvoStarted, acctCreated, onCreateAccount }) {
  const { t, lang } = useI18n();
  const { state } = useAppState();
  const soundRef = useRef(state.settings.sound);
  soundRef.current = state.settings.sound;
  const [reduced] = useState(prefersReducedMotion);
  const steps = useMemo(() => stepsFor(item), [item]);
  const { tier, days, ach } = item;
  const p = TIERS[tier] || TIERS.common;

  const scene = useScene({
    steps,
    reduced,
    collapseAt: 600,
    onContinue: onDone,
    cue: (name) => {
      const snd = soundRef.current;
      if (name[0] === 'd' && name.length <= 3) {
        dotNote(snd, Number(name.slice(1)));
        selection();
      }
      if (name === 'heat') ignite(snd);
      if (name === 'tier') { achievementFanfare(snd, tier); stampHaptic(tier); }
      if (name === 'landed') rewardPing(snd);
    },
  });
  const { reached, skipped, onTap, classes } = scene;

  const rootRef = useRef(null);
  const avatarRef = useRef(null);
  const vars = useCeremonyLayout(rootRef, avatarRef);

  // The big number counts up from 0 at the tier moment: 300 ms plus 2 ms a day, at most 900 ms.
  // Written straight into the DOM, as the Finish screen's count is, so it does not re-render the
  // scene sixty times a second.
  const numRef = useRef(null);
  useEffect(() => {
    const el = numRef.current;
    if (!el) return undefined;
    if (!reached.tier || skipped || reduced) {
      el.textContent = String(reached.tier || reduced ? days : 0);
      return undefined;
    }
    const dur = Math.min(900, 300 + 2 * days);
    const t0 = performance.now();
    let raf = 0;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = String(Math.round(days * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reached.tier, skipped, reduced, days]);

  const chip = tPlural(lang, 'streak_chip', days);
  const text = item.textKey === 'ms_streak_desc' ? t('ms_streak_desc', { n: days }) : t(item.textKey);
  const reward = ach ? ach.reward : null;
  const showCta = !!guestConvoStarted && !acctCreated;
  const shareChips = [{ value: earnedCount(state.milestones) + '/' + ACHIEVEMENTS.length, label: t('share_chip_achievements') }];

  const cls = ['cer', 'tier-' + tier, 'kind-streak'].concat(classes).join(' ');

  return (
    <div className={cls} ref={rootRef} style={{ ...tierVars(tier), ...vars }} onClick={onTap}
      role="dialog" aria-modal="true" aria-label={chip}>
      <div className="cer-flood cer-a" />
      <span className="cel-sr" role="status" aria-live="polite">{reached.chip ? chip + '. ' + text : ''}</span>

      <div className="cer-body">
        <div className="cer-center">
          {tier === 'legendary' && <div className="cer-inf-pos cer-a"><InfinityDraw /></div>}
          <div className="cer-ring-pos cer-a"><TierRing tier={tier} still={reduced} /></div>
          <div className="sk-dots cer-a" aria-hidden="true">
            {Array.from({ length: DOTS }, (_, i) => {
              const a = ((i / DOTS) * 360 - 90) * (Math.PI / 180);
              return (
                <span key={i} className={'sk-dot cer-a' + (reached['d' + i] ? ' on' : '')}
                  style={{
                    left: (Math.cos(a) * DOT_RING).toFixed(1) + 'px', top: (Math.sin(a) * DOT_RING).toFixed(1) + 'px',
                    transitionDelay: skipped || reduced ? '0ms' : i * 15 + 'ms',
                  }} />
              );
            })}
          </div>
          <Sparks n={p.sparks} colors={tier === 'legendary' ? ['#ffffff', '#d65a3a', '#0f9d6c'] : ['#ffd166', '#ffffff', p.ring]}
            go={!!reached.tier && !skipped && !reduced} />
          <div className="sk-disc cer-a">
            <div className="sk-flame cer-a">
              <Flame base="cold" catching={!!reached.heat} burning={!!reached.burn} edge={p.edge} />
            </div>
          </div>
          {reward && <div className="cer-fly-pos cer-a"><RewardGlyph reward={reward} px={58} /></div>}
        </div>
        <div className="cer-info sk-info">
          <div className="sk-num cer-a" ref={numRef}>0</div>
          <div className="sk-label cer-a">{tPlural(lang, 'streak_label', days)}</div>
          <div className="cer-desc sk-text cer-a">{text}</div>
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
              <button className="cer-cta" onClick={() => onCreateAccount('achievement_cta', ach ? ach.key : null)}>
                {t('create_account')}
              </button>
            )}
            <ShareButton
              className="cer-share"
              cacheKey={'streak_' + days + ':ceremony'}
              analytics={{ content_type: 'achievement', achievement_key: ach ? ach.key : 'streak_' + days, rarity: ach ? ach.rarity : null }}
              build={() => ({
                slug: 'streak-' + days,
                text: t('share_cap_achievement', { name: chip, url: appUrl() }),
                card: {
                  hero: { iconName: 'flame', symbol: null, rarity: null, title: chip, body: text },
                  chips: shareChips,
                  tagline: t('ob_tagline'),
                },
              })}
            />
          </div>
        </div>
      </div>

      <div className="cer-chip-pos"><div className="cer-chip cer-a">{chip}</div></div>
      <div className="cer-tap" aria-hidden="true">{t('finish_tap')}</div>
    </div>
  );
}
