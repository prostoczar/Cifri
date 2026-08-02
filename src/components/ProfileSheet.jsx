import { useEffect, useRef } from 'react';
import { useI18n } from '../store/useI18n.js';
import { avatarSpecFor } from '../store/avatar.js';
import { brFmtSec } from '../store/braining.js';
import { achName, achievementsPercent, latestEarnedAchievement } from '../store/achievements.js';
import Avatar from './Avatar.jsx';

function isRecorded(s) {
  return s.real === true || typeof s.real === 'undefined';
}

// Ported from the reference prototype's profile sheet + openProfile().
export default function ProfileSheet({
  open, state, onClose, onEditPrimary, onEditPicture, onOpenAchievements,
  onOpenLegal, onSetting, onSetFontSize, onSetLanguage, onLogout, onReset, onDeleteAccount,
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
            {stat(brState.bestTime !== null && brState.bestTime !== undefined ? brFmtSec(brState.bestTime) : '--', t('prof_best_time'))}
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

          {/* Logging out only makes sense once an account exists. */}
          {acctCreated && <button className="logout-btn" onClick={onLogout}>{t('set_logout')}</button>}
          <button className="danger-btn" onClick={onReset}>{t('set_reset')}</button>
          <button className="danger-btn" onClick={onDeleteAccount}>{t('set_delete_account')}</button>
        </div>
      </div>
    </div>
  );
}
