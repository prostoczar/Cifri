import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { EMAIL_RE } from '../store/accountRules.js';

// Ported from the reference prototype's forgot-password screen. A real reset email is now sent
// by Supabase. It still shows the same success state whether or not the address matches an
// account — that is what avoids leaking which addresses are registered, and it is what the
// existing "If an account exists for that email…" copy already promises.
export default function ForgotPasswordScreen({ open, prefillEmail, onSubmit, onClose }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(prefillEmail && prefillEmail.indexOf('@') !== -1 ? prefillEmail : '');
    setError('');
    setSent(false);
  }, [open, prefillEmail]);

  function submit() {
    if (!EMAIL_RE.test(email.trim())) {
      setError(t('fp_invalid_email'));
      return;
    }
    // Deliberately not awaited: the confirmation must look identical for a registered and an
    // unregistered address, and waiting on the result would make a registered one measurably
    // slower to respond.
    onSubmit(email.trim());
    setSent(true);
  }

  // ph-no-capture — see the note in AccountCreateScreen. Nothing typed here reaches analytics.
  return (
    <div className={'acct-screen ph-no-capture' + (open ? ' on' : '')}>
      {!sent ? (
        <div>
          <div className="acct-title">{t('fp_title')}</div>
          <div className="acct-sub">{t('fp_sub')}</div>
          <div className="acct-field-label">{t('acct_email')}</div>
          <input
            className="acct-input"
            type="email"
            autoComplete="off"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <div className={'acct-avail' + (error ? ' bad' : '')}>{error}</div>
          <button className="acct-submit" onClick={submit}>{t('fp_submit')}</button>
          <button className="acct-cancel" onClick={onClose}>{t('back')}</button>
        </div>
      ) : (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>✉️</div>
          <div className="acct-title">{t('fp_success_title')}</div>
          <div className="acct-sub">{t('fp_success_sub')}</div>
          <button className="acct-submit" onClick={onClose}>{t('fp_back_to_login')}</button>
        </div>
      )}
    </div>
  );
}
