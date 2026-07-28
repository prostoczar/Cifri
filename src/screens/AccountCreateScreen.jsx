import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { EMAIL_RE, stripSpaces } from '../store/mockAccounts.js';
import { useUsernameCheck } from '../hooks/useUsernameCheck.js';
import { avatarSpecFor } from '../store/avatar.js';
import Avatar from '../components/Avatar.jsx';

// Ported from the reference prototype's account-creation screen + acctSubmit().
// Fully mocked: submitting sets a local flag and keeps every bit of existing local data exactly
// as it is. No Supabase call, no authentication, nothing sent anywhere.
export default function AccountCreateScreen({
  open, username, acctData, avatar, onSubmit, onClose, onEditPicture,
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  // Reset only when the screen actually opens. Depending on `acctData` here would re-run this
  // the instant a password is saved (the object identity changes), collapsing the section and
  // wiping the "Password updated" confirmation the player just earned.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setName(username || '');
      setEmail(acctData.email || '');
      setFullName(acctData.fullName || '');
      setPassword('');
    }
    wasOpen.current = open;
  }, [open, username, acctData]);

  const { avail, ok: nameOk } = useUsernameCheck(name, username);
  const emailOk = EMAIL_RE.test(email.trim());
  const pwOk = password.length >= 6;
  const canSubmit = nameOk && emailOk && pwOk;

  return (
    <div className={'acct-screen' + (open ? ' on' : '')}>
      <div className="acct-title">{t('acct_title')}</div>
      <div className="acct-sub">{t('acct_sub')}</div>

      <div className="acct-field-label">{t('acct_username')}</div>
      <input className="acct-input" type="text" maxLength={20} autoComplete="off"
        value={name} onChange={(e) => setName(stripSpaces(e.target.value))} />
      <div className={'acct-avail ' + avail.cls}>{avail.text}</div>

      <div className="acct-field-label">{t('acct_email')}</div>
      <input className="acct-input" type="email" autoComplete="off" placeholder="you@example.com"
        value={email} onChange={(e) => setEmail(e.target.value)} />

      <div className="acct-field-label">{t('acct_password')}</div>
      <input className="acct-input" type="password" autoComplete="off" placeholder={t('acct_password_ph')}
        value={password} onChange={(e) => setPassword(e.target.value)} />

      <div className="acct-field-label">
        <span>{t('acct_fullname')}</span>{' '}
        <span style={{ textTransform: 'none', fontWeight: 600 }}>{t('acct_optional')}</span>
      </div>
      <input className="acct-input" type="text" autoComplete="off"
        value={fullName} onChange={(e) => setFullName(e.target.value)} />

      <div className="acct-avatar-row">
        <Avatar spec={avatarSpecFor(avatar, name || username)} size={44} />
        <div style={{ fontSize: 'calc(12px * var(--fs-mult))', color: 'var(--txt2)', fontWeight: 700 }}>
          {t('acct_profile_picture')}
        </div>
        <button onClick={onEditPicture}>{t('acct_change')}</button>
      </div>

      <div className="acct-disclaimer">{t('ob_disclaimer')}</div>

      <button
        className="acct-submit"
        disabled={!canSubmit}
        onClick={() => canSubmit && onSubmit({
          username: stripSpaces(name.trim()), email: email.trim(), fullName: fullName.trim(), password,
        })}
      >
        {t('create_account')}
      </button>
      <button className="acct-cancel" onClick={onClose}>{t('not_now')}</button>
    </div>
  );
}
