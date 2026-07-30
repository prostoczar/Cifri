import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';

// Ported from the reference prototype's login screen + loginSubmit().
// Now real Supabase authentication. The screen is unchanged apart from the button showing a
// working state while the request is in flight — everything else, including the single
// deliberately vague error message, is exactly as it was.
export default function LoginScreen({ open, busy, onSubmit, onClose, onForgotPassword }) {
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const idRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setIdentifier('');
    setPassword('');
    setError('');
    const id = setTimeout(() => idRef.current && idRef.current.focus(), 300);
    return () => clearTimeout(id);
  }, [open]);

  async function submit() {
    if (busy) return;
    if (!identifier.trim() || !password) {
      setError(t('login_error'));
      return;
    }
    setError('');
    // Wrong name, wrong email and wrong password all produce the same message on purpose —
    // telling them apart would reveal which accounts exist.
    const res = await onSubmit({ identifier: identifier.trim(), password });
    if (!res.ok) setError(t(res.messageKey || 'login_error'));
  }

  return (
    <div className={'acct-screen' + (open ? ' on' : '')}>
      <div className="acct-title">{t('login_title')}</div>
      <div className="acct-sub">{t('login_sub')}</div>

      <div className="acct-field-label">{t('login_identifier')}</div>
      <input
        ref={idRef}
        className="acct-input"
        type="text"
        autoComplete="off"
        value={identifier}
        onChange={(e) => { setIdentifier(e.target.value); setError(''); }}
      />

      <div className="acct-field-label">{t('acct_password')}</div>
      <input
        className="acct-input"
        type="password"
        autoComplete="off"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />

      <div className={'acct-avail' + (error ? ' bad' : '')}>{error}</div>

      <button className="acct-submit" disabled={busy} onClick={submit}>
        {busy ? t('login_working') : t('login_btn')}
      </button>
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        <button className="prof-edit-btn" onClick={() => onForgotPassword(identifier)}>{t('login_forgot_password')}</button>
      </div>
      <button className="acct-cancel" onClick={onClose}>{t('back')}</button>
    </div>
  );
}
