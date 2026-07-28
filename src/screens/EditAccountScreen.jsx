import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { EMAIL_RE, stripSpaces } from '../store/mockAccounts.js';
import { useUsernameCheck } from '../hooks/useUsernameCheck.js';
import { avatarSpecFor } from '../store/avatar.js';
import Avatar from '../components/Avatar.jsx';

// Ported from the reference prototype's edit-account screen. Reached from the profile sheet once
// an account exists; lets every account field be edited in one place. Mocked and local only —
// same as account creation, it just updates the stored fields everything else already reads.
export default function EditAccountScreen({
  open, username, acctData, avatar, onSubmit, onSubmitPassword, onClose, onEditPicture,
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  const [pwOpen, setPwOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwDone, setPwDone] = useState(false);

  // Every visit starts with the password section collapsed and cleared, so nothing typed
  // previously lingers on screen.
  // Reset only when the screen actually opens. Depending on `acctData` here would re-run this
  // the instant a password is saved (the object identity changes), collapsing the section and
  // wiping the "Password updated" confirmation the player just earned.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setName(username || '');
      setEmail(acctData.email || '');
      setFullName(acctData.fullName || '');
      setPwOpen(false);
      setCurrent(''); setNext(''); setConfirm(''); setPwDone(false);
    }
    wasOpen.current = open;
  }, [open, username, acctData]);

  const { avail, ok: nameOk } = useUsernameCheck(name, username);
  const emailOk = EMAIL_RE.test(email.trim());
  const canSave = nameOk && emailOk;

  const curOk = current.length > 0 && current === (acctData.password || '');
  const curMsg = current.length === 0
    ? { text: '', cls: '' }
    : curOk
    ? { text: t('ea_current_password_ok'), cls: 'ok' }
    : { text: t('ea_current_password_wrong'), cls: 'bad' };
  const newOk = next.length >= 6;
  const matchOk = next.length > 0 && next === confirm;
  const pwMsg = confirm.length > 0 && !matchOk
    ? { text: t('ea_passwords_no_match'), cls: 'bad' }
    : pwDone
    ? { text: t('ea_password_updated'), cls: 'ok' }
    : { text: '', cls: '' };
  const canUpdatePw = curOk && newOk && matchOk;

  return (
    <div className={'acct-screen' + (open ? ' on' : '')}>
      <div className="acct-title">{t('ea_title')}</div>
      <div className="acct-sub">{t('ea_sub')}</div>

      <div className="acct-field-label">{t('acct_username')}</div>
      <input className="acct-input" type="text" maxLength={20} autoComplete="off"
        value={name} onChange={(e) => setName(stripSpaces(e.target.value))} />
      <div className={'acct-avail ' + avail.cls}>{avail.text}</div>

      <div className="acct-field-label">{t('acct_email')}</div>
      <input className="acct-input" type="email" autoComplete="off" placeholder="you@example.com"
        value={email} onChange={(e) => setEmail(e.target.value)} />

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

      <div className="acct-field-label" style={{ marginTop: 22 }}>{t('ea_password_section')}</div>
      <button className="prof-edit-btn" style={{ margin: '2px 0 4px' }} onClick={() => setPwOpen((o) => !o)}>
        {t('ea_reset_password')}
      </button>
      {pwOpen && (
        <div>
          <div className="acct-field-label">{t('ea_current_password')}</div>
          <input className="acct-input" type="password" autoComplete="off"
            value={current} onChange={(e) => { setCurrent(e.target.value); setPwDone(false); }} />
          <div className={'acct-avail ' + curMsg.cls}>{curMsg.text}</div>
          <div className="acct-field-label">{t('ea_new_password')}</div>
          <input className="acct-input" type="password" autoComplete="off" placeholder={t('acct_password_ph')}
            value={next} onChange={(e) => { setNext(e.target.value); setPwDone(false); }} />
          <div className="acct-field-label">{t('ea_confirm_password')}</div>
          <input className="acct-input" type="password" autoComplete="off"
            value={confirm} onChange={(e) => { setConfirm(e.target.value); setPwDone(false); }} />
          <div className={'acct-avail ' + pwMsg.cls}>{pwMsg.text}</div>
          <button
            className="acct-submit"
            style={{ marginTop: 10, padding: 12 }}
            disabled={!canUpdatePw}
            onClick={() => {
              if (!canUpdatePw) return;
              onSubmitPassword(next);
              setCurrent(''); setNext(''); setConfirm('');
              setPwDone(true);
            }}
          >
            {t('ea_update_password')}
          </button>
        </div>
      )}

      <div className="acct-disclaimer">{t('ob_disclaimer')}</div>

      <button
        className="acct-submit"
        disabled={!canSave}
        onClick={() => canSave && onSubmit({
          username: stripSpaces(name.trim()), email: email.trim(), fullName: fullName.trim(),
        })}
      >
        {t('save')}
      </button>
      <button className="acct-cancel" onClick={onClose}>{t('cancel')}</button>
    </div>
  );
}
