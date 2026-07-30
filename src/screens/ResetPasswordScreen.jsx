import { useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { setNewPassword } from '../lib/accountApi.js';

// Where the "reset your password" email lands.
//
// This is the one screen the mocked flow never needed: it only ever showed a confirmation, so
// there was nothing to click through to. A real reset has to end somewhere the player can
// actually type a new password, and this is it. Deliberately built from the same acct-screen
// markup and classes as the forgot-password screen it follows, so it reads as the next step of
// a flow that already existed rather than as a new place.
//
// By the time this renders, Supabase has already authenticated the player using the token in
// the link — that is what the emailed link does. So there is no current password to check
// against here: possession of the email IS the proof of identity.
export default function ResetPasswordScreen({ open, onDone }) {
  const { t } = useI18n();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const newOk = next.length >= 6;
  const matchOk = next.length > 0 && next === confirm;
  const canSubmit = newOk && matchOk && !busy;

  const msg = confirm.length > 0 && !matchOk
    ? { text: t('ea_passwords_no_match'), cls: 'bad' }
    : error
    ? { text: t(error), cls: 'bad' }
    : { text: '', cls: '' };

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    const res = await setNewPassword(next);
    setBusy(false);
    if (!res.ok) {
      // The usual cause is an expired or already-used link, which leaves no valid session to
      // update — so say that rather than a generic failure.
      setError(res.error === 'invalid_credentials' ? 'rp_expired' : 'err_generic');
      return;
    }
    setDone(true);
  }

  return (
    <div className={'acct-screen' + (open ? ' on' : '')}>
      {!done ? (
        <div>
          <div className="acct-title">{t('rp_title')}</div>
          <div className="acct-sub">{t('rp_sub')}</div>

          <div className="acct-field-label">{t('ea_new_password')}</div>
          <input className="acct-input" type="password" autoComplete="off" placeholder={t('acct_password_ph')}
            value={next} onChange={(e) => { setNext(e.target.value); setError(''); }} />

          <div className="acct-field-label">{t('ea_confirm_password')}</div>
          <input className="acct-input" type="password" autoComplete="off"
            value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />

          <div className={'acct-avail ' + msg.cls}>{msg.text}</div>

          <button className="acct-submit" disabled={!canSubmit} onClick={submit}>
            {busy ? t('ea_saving') : t('rp_submit')}
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>✓</div>
          <div className="acct-title">{t('rp_success_title')}</div>
          <div className="acct-sub">{t('rp_success_sub')}</div>
          <button className="acct-submit" onClick={onDone}>{t('rp_continue')}</button>
        </div>
      )}
    </div>
  );
}
