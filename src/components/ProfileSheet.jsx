import { useEffect, useRef } from 'react';
import { useI18n } from '../store/useI18n.js';
import { avatarSpecFor } from '../store/avatar.js';
import { brFmtSec } from '../store/braining.js';
import { achName, achievementsPercent, latestEarnedAchievement } from '../store/achievements.js';
import { useNotificationStatus } from '../hooks/useNotificationStatus.js';
import Avatar from './Avatar.jsx';

function isRecorded(s) {
  return s.real === true || typeof s.real === 'undefined';
}

// Waking hours only. A reminder is a nudge, not an alarm, and the whole point of picking an hour
// is that it lands when the player is actually up — offering 03:00 would only ever be a mistake
// someone made once. The last slot is 22:00 rather than 23:00 so there is still time to play
// before the local midnight that ends the day.
const REMIND_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

// Russian uses the 24-hour clock; English-speaking players overwhelmingly read am/pm. Formatted
// here rather than stored differently — the hour itself is a number in both languages.
function fmtHour(h, lang) {
  if (lang === 'ru') return (h < 10 ? '0' + h : h) + ':00';
  if (h === 12) return '12 pm';
  return h > 12 ? h - 12 + ' pm' : h + ' am';
}

// Ported from the reference prototype's profile sheet + openProfile().
export default function ProfileSheet({
  open, state, onClose, onEditPrimary, onEditPicture, onOpenAchievements,
  onOpenLegal, onSetting, onSetFontSize, onSetLanguage, onSetNotif, onLogout, onReset, onDeleteAccount,
}) {
  const { t, lang } = useI18n();
  const sheetRef = useRef(null);

  // Sit the sheet just under the fixed header, measured rather than assumed so it stays flush
  // at any text size.
  useEffect(() => {
    if (!open) return;
    const hdr = document.querySelector('.hdr');
    const el = sheetRef.current;
    if (hdr && el) {
      const h = hdr.getBoundingClientRect().height;
      if (h > 0) {
        el.style.marginTop = h + 10 + 'px';
        el.style.maxHeight = 'calc(90vh - ' + (h + 10) + 'px)';
      }
    }
  }, [open]);

  const { db, brState, milestones, settings, acctCreated } = state;

  // ── Reminders ──
  // Two facts that can disagree, and the UI has to be honest about which is which: what the player
  // asked for (`settings.notif`, synced) and what this device can currently do (`notif`, read live
  // from the browser). `settings.notif` may be absent entirely — loading replaces the settings
  // object wholesale, so data saved before this field existed arrives without it.
  const notif = useNotificationStatus();
  const notifPref = settings.notif || {};
  const notifHour = typeof notifPref.hour === 'number' ? notifPref.hour : 19;
  // The toggle shows ON only when both halves are true. A green switch on a laptop that holds no
  // subscription would be the app claiming to send something it cannot send.
  const remindersOn = !!notifPref.enabled && notif.subscribed;

  const notifSubKey = notif.blocked
    ? t('set_notif_blocked')
    : notif.capability === 'needs-install'
      ? t('set_notif_install')
      : notifPref.enabled && !notif.subscribed
        ? t('set_notif_enable_device')
        : t('set_notif_sub');

  async function handleRemindersToggle(want) {
    if (!want) {
      await notif.disable();
      onSetNotif({ enabled: false });
      return;
    }
    // Permission already granted on this device and merely opted out — no dialog needed, and
    // asking again would be spending a prompt on a question the browser has already answered.
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await notif.resume();
      onSetNotif({ enabled: true });
      return;
    }
    // The preference is only recorded if permission actually arrives. Storing "on" after a refusal
    // would leave a toggle that reads on and a device that receives nothing.
    const ok = await notif.enable();
    if (ok) onSetNotif({ enabled: true });
  }
  const chTotal = ['easy', 'medium', 'hard']
    .reduce((sum, d) => sum + (db[d].sessions || []).filter(isRecorded).length, 0);
  const brTotal = (brState.sessions || []).filter(isRecorded).length;
  const latest = latestEarnedAchievement(milestones);

  const stat = (n, l) => (
    <div className="prof-stat">
      <div className="prof-stat-n">{n}</div>
      <div className="prof-stat-l">{l}</div>
    </div>
  );

  return (
    <div
      className={'sheet-bg' + (open ? ' on' : '')}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle"></div>
        <div className="sheet-hdr">
          <div className="sheet-title">{t('prof_title')}</div>
          <button className="sheet-close" onClick={onClose}>✕</button>
        </div>
        <div className="sheet-body">
          <div className="prof-name-row">
            <Avatar className="prof-avatar" spec={avatarSpecFor(state.avatar, state.username)} size={44} />
            <div className="prof-name-info">
              <div className="prof-username">{state.username || 'Anonymous'}</div>
              <div className="prof-sublabel">{t('prof_sublabel')}</div>
            </div>
            <div className="prof-edit-row">
              {/* Before an account exists this opens account creation; afterwards, the full
                  edit-account screen. */}
              <button className="prof-edit-btn" onClick={onEditPrimary}>
                {acctCreated ? t('ea_edit_account') : t('create_account')}
              </button>
              <button className="prof-edit-btn" onClick={onEditPicture}>{t('prof_edit_picture')}</button>
            </div>
          </div>

          <div className="prof-section-title">{t('prof_sec_streak')}</div>
          <div className="prof-stats-grid">
            {stat(state.streak || 0, t('prof_day_streak'))}
            {stat(state.bestStreakEver || 0, t('prof_best_streak'))}
          </div>

          <div className="prof-section-title">{t('prof_sec_achievements')}</div>
          <div className="prof-ms-row" onClick={onOpenAchievements}>
            <div>
              <div className="prof-ms-pct">{achievementsPercent(milestones)}%</div>
              <div className="prof-ms-pct-label">{t('ms_completed')}</div>
            </div>
            <div className="prof-ms-latest-wrap">
              <div className="prof-ms-latest-label">{t('ms_latest')}</div>
              <div className="prof-ms-latest-name">{latest ? achName(lang, latest) : '—'}</div>
            </div>
          </div>

          <div className="prof-section-title">{t('nav_challenge')}</div>
          <div className="prof-stats-grid">
            {stat(db.easy.best || '--', t('prof_best_easy'))}
            {stat(db.medium.best || '--', t('prof_best_medium'))}
            {stat(db.hard.best || '--', t('prof_best_hard'))}
            {stat(chTotal, t('prof_total_sessions'))}
          </div>

          <div className="prof-section-title">{t('nav_braining')}</div>
          <div className="prof-stats-grid">
            {stat(brState.bestAge || '--', t('prof_best_age'))}
            {stat(brState.bestTime !== null && brState.bestTime !== undefined ? brFmtSec(brState.bestTime, t) : '--', t('prof_best_time'))}
            {stat(brTotal, t('prof_total_sessions'))}
          </div>

          <div className="prof-section-title">{t('prof_sec_settings')}</div>
          <div className="set-row">
            <div className="set-info">
              <div className="set-lbl">{t('set_sound')}</div>
              <div className="set-sub">{t('set_sound_sub')}</div>
            </div>
            <label className="tog">
              <input type="checkbox" checked={!!settings.sound} onChange={(e) => onSetting('sound', e.target.checked)} />
              <span className="tsl"></span>
            </label>
          </div>
          <div className="set-row">
            <div className="set-info">
              <div className="set-lbl">{t('set_dark')}</div>
              <div className="set-sub">{t('set_dark_sub')}</div>
            </div>
            <label className="tog">
              <input type="checkbox" checked={!!settings.dark} onChange={(e) => onSetting('dark', e.target.checked)} />
              <span className="tsl"></span>
            </label>
          </div>
          {/* Reminders. The whole row is hidden where push cannot work at all — a desktop browser
              in private mode, say — because a permanently dead toggle is worse than no toggle.
              `needs-install` is NOT that case: it is an iPhone that simply has not added the app
              to its Home Screen yet, which is fixable by the player, so it gets told how. */}
          {notif.capability !== 'unsupported' && (
            <div className="set-row">
              <div className="set-info">
                <div className="set-lbl">{t('set_notif')}</div>
                <div className="set-sub">{notifSubKey}</div>
              </div>
              {notif.capability === 'ready' && !notif.blocked && (
                <label className="tog">
                  <input
                    type="checkbox"
                    checked={remindersOn}
                    disabled={notif.busy}
                    onChange={(e) => handleRemindersToggle(e.target.checked)}
                  />
                  <span className="tsl"></span>
                </label>
              )}
            </div>
          )}
          {/* The hour only exists once there is something to schedule, so it appears with the
              preference rather than sitting there greyed out. */}
          {remindersOn && (
            <div className="fs-set-row">
              <div className="set-info">
                <div className="set-lbl">{t('set_notif_time')}</div>
                <div className="set-sub">{t('set_notif_time_sub')}</div>
              </div>
              <select
                className="notif-hour"
                value={notifHour}
                onChange={(e) => onSetNotif({ hour: Number(e.target.value) })}
              >
                {REMIND_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {fmtHour(h, lang)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="fs-set-row">
            <div className="set-info">
              <div className="set-lbl">{t('set_textsize')}</div>
              <div className="set-sub">{t('set_textsize_sub')}</div>
            </div>
            <div className="fs-row">
              {['small', 'medium', 'large'].map((sz) => (
                <button key={sz} className={'fs-opt' + (settings.fontSize === sz ? ' on' : '')} onClick={() => onSetFontSize(sz)}>
                  {t('set_' + sz)}
                </button>
              ))}
            </div>
          </div>
          <div className="set-row">
            <div className="set-info">
              <div className="set-lbl">{t('set_language')}</div>
              <div className="set-sub">{t('set_language_sub')}</div>
            </div>
            <div className="fs-row">
              <button className={'fs-opt' + (lang === 'en' ? ' on' : '')} onClick={() => onSetLanguage('en')}>EN</button>
              <button className={'fs-opt' + (lang === 'ru' ? ' on' : '')} onClick={() => onSetLanguage('ru')}>RU</button>
            </div>
          </div>

          <div className="prof-section-title">{t('prof_sec_legal')}</div>
          <div className="set-row" style={{ cursor: 'pointer' }} onClick={() => onOpenLegal('terms')}>
            <div className="set-info"><div className="set-lbl">{t('legal_terms_link')}</div></div>
          </div>
          <div className="set-row" style={{ cursor: 'pointer' }} onClick={() => onOpenLegal('privacy')}>
            <div className="set-info"><div className="set-lbl">{t('legal_privacy_link')}</div></div>
          </div>

          {/* Logging out only makes sense once an account exists. Neither does deleting one: for a
              guest there is no server-side account to delete, so the button led nowhere. Wiping
              local progress is what `set_reset` is for, and that stays available to everyone. */}
          {acctCreated && <button className="logout-btn" onClick={onLogout}>{t('set_logout')}</button>}
          <button className="danger-btn" onClick={onReset}>{t('set_reset')}</button>
          {acctCreated && <button className="danger-btn" onClick={onDeleteAccount}>{t('set_delete_account')}</button>}
        </div>
      </div>
    </div>
  );
}
