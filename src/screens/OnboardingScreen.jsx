import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { stripSpaces } from '../store/accountRules.js';
import { useUsernameCheck } from '../hooks/useUsernameCheck.js';
// The app icon's own artwork, imported from the canonical brand assets rather than copied into
// src/ — a second copy of the mark is a copy that drifts from the icon. See assets/README.md.
import markUrl from '../../assets/source/cifri-icon-adaptive-foreground.svg';

const FEATURES = [
  { key: 'ob_feat_challenge', icon: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /> },
  { key: 'ob_feat_braining', icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /> },
  { key: 'ob_feat_practice', icon: <><rect x="2" y="10" width="3" height="4" rx="1" /><rect x="19" y="10" width="3" height="4" rx="1" /><rect x="5" y="8" width="3" height="8" rx="1" /><rect x="16" y="8" width="3" height="8" rx="1" /><line x1="8" y1="12" x2="16" y2="12" /></> },
  { key: 'ob_feat_tricks', icon: <><circle cx="8" cy="10" r="4" /><path d="M12 10h9M18 10v3" /></> },
];

// Ported from the reference prototype's onboarding screen + obCheck()/obFinish().
// The availability check is real: it uses the same shared hook as the account screens, so a
// guest cannot settle on a name here that would then be rejected at signup. A guest name is
// still only held locally — nothing is reserved in the database until an account exists.
export default function OnboardingScreen({ initialUsername, onFinish, onOpenLogin }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialUsername || '');
  const inputRef = useRef(null);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current && inputRef.current.focus(), 400);
    return () => clearTimeout(id);
  }, []);

  const { avail, ok: canSubmit } = useUsernameCheck(value, null);

  return (
    <div className="ob-screen">
      <img className="ob-mark" src={markUrl} alt="" width="220" height="220" />
      <div className="ob-wordmark">Cifri</div>
      <div className="ob-tagline">{t('ob_tagline')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28, maxWidth: 300, textAlign: 'left' }}>
        {FEATURES.map((f) => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, background: 'var(--GL2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--GDK)" strokeWidth="2.5">{f.icon}</svg>
            </div>
            <span style={{ fontSize: 'calc(12px * var(--fs-mult))', color: 'var(--txt2)', fontWeight: 600 }}>{t(f.key)}</span>
          </div>
        ))}
      </div>
      <button className="ob-login-btn" onClick={onOpenLogin}>{t('ob_have_account')}</button>
      <div className="ob-label">{t('ob_label')}</div>
      <input
        ref={inputRef}
        className="ob-input"
        type="text"
        placeholder={t('ob_input_ph')}
        maxLength={20}
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(stripSpaces(e.target.value))}
      />
      <div className={'ob-avail ' + avail.cls}>{avail.text}</div>
      {/* Sits directly under "✓ Available" because that is the line it qualifies. Available and
          reserved are not the same thing, and only one of them was being said out loud. */}
      <div className="ob-disclaimer pair">{t('ob_not_reserved')}</div>
      <div className="ob-disclaimer">{t('ob_disclaimer')}</div>
      <div className="ob-hint">{t('ob_hint')}</div>
      <button
        className="ob-btn"
        disabled={!canSubmit}
        onClick={() => {
          const v = stripSpaces(value.trim());
          if (v.length >= 2) onFinish(v);
        }}
      >
        {t('ob_btn')}
      </button>
    </div>
  );
}
