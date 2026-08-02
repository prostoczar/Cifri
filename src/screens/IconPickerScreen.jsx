import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { AVATAR_COLORS, AVATAR_ICONS, AVATAR_SYMBOLS, avatarSpecFor } from '../store/avatar.js';
import { achDesc, achName, achievementForReward, isRewardUnlocked } from '../store/achievements.js';
import Avatar from '../components/Avatar.jsx';

// Ported from the reference prototype's icon picker. Letters / symbols / icons × 4 colours,
// with a content-size slider. Reused by the profile sheet, account creation and edit account.
//
// The draft is a working copy: Approve commits it, Back throws it away, so nothing is ever
// half-saved. The preview renders through the same Avatar component as the header and profile,
// which is what guarantees the colour-matched shadow looks identical everywhere.
//
// ── Locking ──
// Almost every icon and symbol here is the reward for an achievement. One that has not been
// earned is drawn grey and flat and cannot be chosen; tapping it says which achievement it
// belongs to and what that achievement asks for, so the grid doubles as a map of what is left
// to go after rather than a wall of things that simply do not respond.
//
// Free from day one and never locked: letters, all four colours, + − × ÷, and the `person` icon.
// The reserved icons and symbols are not handled here at all — they are not in AVATAR_ICONS or
// AVATAR_SYMBOLS, so there is nothing in this file that could render them.
export default function IconPickerScreen({ open, avatar, username, milestones, onApprove, onBack }) {
  const { t, lang } = useI18n();
  const [draft, setDraft] = useState({ type: 'letters', value: '', color: 'green', size: 55 });
  const [tab, setTab] = useState('letters');
  // The reward whose "how to unlock" card is showing, as {type, value}, or null.
  const [locked, setLocked] = useState(null);

  // Opening picks up wherever the current avatar left off.
  useEffect(() => {
    if (!open) return;
    const current = avatarSpecFor(avatar, username);
    setDraft({ type: current.type, value: current.value, color: current.color, size: current.size || 55 });
    setTab(current.type === 'letters' ? 'letters' : current.type === 'symbol' ? 'symbol' : 'icon');
    setLocked(null);
  }, [open, avatar, username]);

  const iconNames = Object.keys(AVATAR_ICONS);
  const unlocked = (type, value) => isRewardUnlocked(milestones, type, value);

  // Selecting is only ever possible for something already earned; everything else explains itself.
  const choose = (type, value) => {
    if (unlocked(type, value)) setDraft((d) => ({ ...d, type, value }));
    else setLocked({ type, value });
  };

  const lockedAch = locked ? achievementForReward(locked.type, locked.value) : null;

  return (
    <div className={'icon-picker-screen' + (open ? ' on' : '')}>
      <div className="ip-hdr"><div className="ip-title">{t('ip_choose_picture')}</div></div>
      <div className="ip-body">
        <div className="ip-preview-wrap">
          <Avatar className="ip-preview" spec={draft} size={96} />
        </div>
        <div className="ip-size-row">
          <label>
            <span>{t('ip_content_size')}</span> <span>{draft.size}px</span>
          </label>
          <input
            type="range" min="20" max="90" value={draft.size}
            onChange={(e) => setDraft((d) => ({ ...d, size: parseInt(e.target.value, 10) }))}
          />
        </div>

        <div className="ip-card">
          <div className="ip-tabs">
            <button className={'ip-tab' + (tab === 'letters' ? ' on' : '')} onClick={() => setTab('letters')}>{t('ip_letters')}</button>
            <button className={'ip-tab' + (tab === 'symbol' ? ' on' : '')} onClick={() => setTab('symbol')}>{t('ip_symbols')}</button>
            <button className={'ip-tab' + (tab === 'icon' ? ' on' : '')} onClick={() => setTab('icon')}>{t('ip_icons')}</button>
          </div>

          <div className={'ip-tabc' + (tab === 'letters' ? ' on' : '')}>
            <input
              className="ip-letters-input"
              type="text"
              maxLength={2}
              placeholder="AB"
              value={draft.type === 'letters' ? draft.value : ''}
              onChange={(e) => {
                const v = e.target.value.toUpperCase().slice(0, 2);
                setDraft((d) => ({ ...d, type: 'letters', value: v.length ? v : '?' }));
              }}
            />
          </div>

          <div className={'ip-tabc' + (tab === 'symbol' ? ' on' : '')}>
            <div className="ip-sym-grid">
              {AVATAR_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  className={
                    'ip-sym-btn' +
                    (draft.type === 'symbol' && draft.value === sym ? ' on' : '') +
                    (unlocked('symbol', sym) ? '' : ' locked')
                  }
                  onClick={() => choose('symbol', sym)}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          <div className={'ip-tabc' + (tab === 'icon' ? ' on' : '')}>
            <div className="ip-icon-grid">
              {iconNames.map((name) => (
                <button
                  key={name}
                  className={
                    'ip-icon-btn' +
                    (draft.type === 'icon' && draft.value === name ? ' on' : '') +
                    (unlocked('icon', name) ? '' : ' locked')
                  }
                  onClick={() => choose('icon', name)}
                  dangerouslySetInnerHTML={{ __html: AVATAR_ICONS[name] }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="ip-card">
          <div className="prof-section-title" style={{ marginBottom: 10 }}>{t('ip_color')}</div>
          <div className="ip-swatch-row">
            {Object.keys(AVATAR_COLORS).map((key) => (
              <button
                key={key}
                className={'ip-swatch' + (draft.color === key ? ' on' : '')}
                style={{ background: AVATAR_COLORS[key].bg }}
                onClick={() => setDraft((d) => ({ ...d, color: key }))}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="ip-actions">
        <button className="ip-btn back" onClick={onBack}>{t('back')}</button>
        <button className="ip-btn approve" onClick={() => onApprove(draft)}>{t('approve')}</button>
      </div>

      {lockedAch && (
        <div className="ach-lock-bg on" onClick={() => setLocked(null)}>
          <div className="ach-lock-card" onClick={(e) => e.stopPropagation()}>
            {locked.type === 'symbol' ? (
              <div className="ach-lock-icon ms-symbol">{locked.value}</div>
            ) : (
              <div className="ach-lock-icon" dangerouslySetInnerHTML={{ __html: AVATAR_ICONS[locked.value] || '' }} />
            )}
            <div className="ach-lock-name">{achName(lang, lockedAch)}</div>
            <span className={'ms-rarity r-' + lockedAch.rarity}>{t('rarity_' + lockedAch.rarity)}</span>
            <div className="ach-lock-how">{t('ach_locked_how')}</div>
            <div className="ach-lock-desc">{achDesc(lang, lockedAch)}</div>
            <button className="ach-lock-btn" onClick={() => setLocked(null)}>{t('close')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
