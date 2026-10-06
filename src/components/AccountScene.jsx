import { useMemo, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { useAppState, chDoneToday, brDoneToday } from '../store/AppStateContext.jsx';
import { tPlural } from '../i18n_data.js';
import { earnedCount } from '../store/achievements.js';
import { avatarSpecFor } from '../store/avatar.js';
import { accountSuccess, rewardPing, welcomeChime } from '../store/sound.js';
import { success } from '../lib/haptics.js';
import { useScene, prefersReducedMotion } from '../hooks/useScene.js';
import { Sparks } from './CelebrationParts.jsx';
import Avatar from './Avatar.jsx';
import { StreakPill } from './Header.jsx';

// "Account created" and "Welcome back" (docs/launch-celebrations-spec.md, Feature 8) — two mirror
// images. Creating an account, the player's progress flows INTO their avatar and a ring closes round
// it: saved. Signing in on a device, the ring closes first and the progress flows back OUT.
//
// Everything shown is the player's own, read from the state as it stands once the sign-up or the
// download has landed: their avatar and username, the streak pill exactly as the header draws it,
// their best Challenge score (the highest of the three difficulties) and how many achievements they
// hold. Nothing here is decided or recorded; it only shows what the account now holds.
//
// `mode` is 'created' or 'back'. Follows the shared tap pattern (hooks/useScene.js).

// Where each chip sits, relative to the avatar's centre: left, right, and below.
const CHIP_AT = [[-118, -6], [118, -6], [0, 112]];

function stepsFor(mode) {
  if (mode === 'created') {
    return [
      [0, 'av'], [150, 'chips'],
      [800, 'f0'], [920, 'f1'], [1040, 'f2'],
      [1180, 'l0'], [1300, 'l1'], [1420, 'l2'],
      [1300, 'ring'], [1800, 'check'], [1850, 'title'], [2000, 'sub'], [2300, 'ready'],
    ].sort((a, b) => a[0] - b[0]);
  }
  return [
    [0, 'head'], [0, 'av'], [300, 'ring'], [800, 'check'],
    [1100, 'o0'], [1220, 'o1'], [1340, 'o2'],
    [1540, 'l0'], [1660, 'l1'], [1780, 'l2'],
    [1500, 'title'], [1650, 'sub'], [1900, 'ready'],
  ].sort((a, b) => a[0] - b[0]);
}

export default function AccountScene({ mode, onDone }) {
  const { t, lang } = useI18n();
  const { state } = useAppState();
  const soundRef = useRef(state.settings.sound);
  soundRef.current = state.settings.sound;
  const [reduced] = useState(prefersReducedMotion);
  const steps = useMemo(() => stepsFor(mode), [mode]);
  const avatarRef = useRef(null);

  const scene = useScene({
    steps,
    reduced,
    collapseAt: 300,
    onContinue: onDone,
    cue: (name) => {
      const snd = soundRef.current;
      if (name === 'check') {
        if (mode === 'created') accountSuccess(snd); else welcomeChime(snd);
        success();
      }
      // A chip landing — in the avatar (created) or in its place (back): a soft ping, and on the
      // way in the avatar gives a small bump.
      if (name[0] === 'l' && name.length === 2) {
        rewardPing(snd);
        if (mode === 'created' && !reduced && avatarRef.current) {
          avatarRef.current.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
            { duration: 200, easing: 'ease-out' });
        }
      }
    },
  });
  const { reached, skipped, onTap, classes } = scene;

  // The player's own figures, as the header and profile show them.
  const pill = chDoneToday(state.db) && brDoneToday(state.brState) ? 'both'
    : chDoneToday(state.db) || brDoneToday(state.brState) ? 'one' : 'grey';
  const best = Math.max(0, ...['easy', 'medium', 'hard'].map((d) => ((state.db || {})[d] || {}).best || 0));
  const badges = earnedCount(state.milestones);
  const at = '@' + (state.username || '');

  const cls = ['ac', 'mode-' + mode].concat(classes).join(' ');
  const R = 60;
  const C = 2 * Math.PI * R;

  return (
    <div className={cls} onClick={onTap} role="dialog" aria-modal="true"
      aria-label={mode === 'created' ? t('acct_welcome', { username: state.username }) : t('acct_back')}>
      {mode === 'back' && <div className="ac-head cer-a">{t('acct_back')}</div>}

      <div className="ac-center">
        <svg className="ac-ring" viewBox="-70 -70 140 140" aria-hidden="true">
          <circle r={R} fill="none" stroke="#0f9d6c" strokeWidth="7" strokeLinecap="round"
            transform="rotate(-90)" strokeDasharray={C} className="ac-ring-arc cer-a"
            style={{ '--ac-c': C }} />
        </svg>
        <div className="ac-avatar cer-a" ref={avatarRef}>
          <Avatar spec={avatarSpecFor(state.avatar, state.username)} size={96} />
        </div>
        <div className="ac-sparks"><Sparks n={16} colors={['#0f9d6c', '#ffd166', '#d65a3a']} go={!!reached.check && !skipped && !reduced} distance={130} /></div>
        <div className="ac-check cer-a" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        {[
          <StreakPill key="s" state={pill} streak={state.streak} />,
          <span key="b" className="ac-stat">{t('acct_best', { n: best })}</span>,
          <span key="n" className="ac-stat">{tPlural(lang, 'acct_badges', badges)}</span>,
        ].map((chip, i) => (
          <div key={i} className={'ac-chip cer-a c' + i}
            style={{ '--cx': CHIP_AT[i][0] + 'px', '--cy': CHIP_AT[i][1] + 'px', transitionDelay: mode === 'created' && !skipped && !reduced && !reached.f0 ? i * 80 + 'ms' : '0ms' }}>
            {chip}
          </div>
        ))}
      </div>

      <div className="ac-text">
        <div className="ac-title cer-a">{mode === 'created' ? t('acct_welcome', { username: state.username }) : at}</div>
        <div className="ac-sub cer-a">{mode === 'created' ? t('acct_saved') : t('acct_restored')}</div>
      </div>
      <div className="cer-tap ac-tap" aria-hidden="true">{t('finish_tap')}</div>
    </div>
  );
}
