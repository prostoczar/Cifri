import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { AVATAR_COLORS, AVATAR_ICONS, AVATAR_SYMBOLS, avatarSpecFor } from '../store/avatar.js';
import Avatar from '../components/Avatar.jsx';

// Ported from the reference prototype's icon picker. Letters / symbols / icons × 4 colours,
// with a content-size slider. Reused by the profile sheet, account creation and edit account.
//
// The draft is a working copy: Approve commits it, Back throws it away, so nothing is ever
// half-saved. The preview renders through the same Avatar component as the header and profile,
// which is what guarantees the colour-matched shadow looks identical everywhere.
export default function IconPickerScreen({ open, avatar, username, onApprove, onBack }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({ type: 'letters', value: '', color: 'green', size: 55 });
  const [tab, setTab] = useState('letters');

  // Opening picks up wherever the current avatar left off.
  useEffect(() => {
    if (!open) return;
    const current = avatarSpecFor(avatar, username);
    setDraft({ type: current.type, value: current.value, color: current.color, size: current.size || 55 });
    setTab(current.type === 'letters' ? 'letters' : current.type === 'symbol' ? 'symbol' : 'icon');
  }, [open, avatar, username]);

  const iconNames = Object.keys(AVATAR_ICONS);

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
                  className={'ip-sym-btn' + (draft.type === 'symbol' && draft.value === sym ? ' on' : '')}
                  onClick={() => setDraft((d) => ({ ...d, type: 'symbol', value: sym }))}
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
                  className={'ip-icon-btn' + (draft.type === 'icon' && draft.value === name ? ' on' : '')}
                  onClick={() => setDraft((d) => ({ ...d, type: 'icon', value: name }))}
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
    </div>
  );
}
