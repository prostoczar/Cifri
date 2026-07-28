import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { EMAIL_RE } from '../store/mockAccounts.js';

// Ported from the reference prototype's forgot-password screen. Mocked: no email is ever sent.
// It always shows the same success state whether or not the address matches anything, which is
// also what avoids leaking which addresses have accounts. When real password reset is wired up,
// submit() is the only body that needs replacing — the screens are already the real UX.
export default function ForgotPasswordScreen({ open, prefillEmail, onClose }) {
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
    setSent(true);
  }

  return (
    <div className={'acct-screen' + (open ? ' on' : '')}>
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
