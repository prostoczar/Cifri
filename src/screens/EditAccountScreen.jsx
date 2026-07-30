import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { EMAIL_RE, stripSpaces } from '../store/accountRules.js';
import { useUsernameCheck } from '../hooks/useUsernameCheck.js';
import { avatarSpecFor } from '../store/avatar.js';
import Avatar from '../components/Avatar.jsx';

// Ported from the reference prototype's edit-account screen. Reached from the profile sheet once
// an account exists; lets every account field be edited in one place. Now backed by real
// Supabase calls.
//
// One timing change was unavoidable. The mocked version checked the current password on every
// keystroke, because the password was sitting in local state. Under real authentication that
// would mean a network round trip per letter and would trip Supabase's auth rate limits within
// a few characters — so the correct/incorrect message now appears when "Update password" is
// pressed instead. The field, the labels, the wording and the position of the message are all
// unchanged; only the moment it appears is different.
export default function EditAccountScreen({
  open, username, acctData, avatar, busy, error, emailPending,
  onSubmit, onSubmitPassword, onClose, onEditPicture,
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
  const [pwBusy, setPwBusy] = useState(false);
  // Set only after a rejected attempt, which is what moves the check from per-keystroke to
  // on-submit. Cleared as soon as anything is retyped.
  const [pwWrong, setPwWrong] = useState(false);
  const [pwError, setPwError] = useState('');

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
      setPwWrong(false); setPwError(''); setPwBusy(false);
    }
    wasOpen.current = open;
  }, [open, username, acctData]);

  const { avail, ok: nameOk } = useUsernameCheck(name, username);
  const emailOk = EMAIL_RE.test(email.trim());
  const canSave = nameOk && emailOk && !busy;

  // Same row, same wording, same red styling as before — it just waits for the attempt now.
  const curMsg = pwWrong
    ? { text: t('ea_current_password_wrong'), cls: 'bad' }
    : { text: '', cls: '' };
  const newOk = next.length >= 6;
  const matchOk = next.length > 0 && next === confirm;
  const pwMsg = confirm.length > 0 && !matchOk
    ? { text: t('ea_passwords_no_match'), cls: 'bad' }
    : pwError
    ? { text: t(pwError), cls: 'bad' }
    : pwDone
    ? { text: t('ea_password_updated'), cls: 'ok' }
    : { text: '', cls: '' };
  const canUpdatePw = current.length > 0 && newOk && matchOk && !pwBusy;

  function touchPw(setter) {
    return (e) => {
      setter(e.target.value);
      setPwDone(false); setPwWrong(false); setPwError('');
    };
  }

  async function submitPassword() {
    if (!canUpdatePw) return;
    setPwBusy(true);
    setPwWrong(false);
    setPwError('');
    const res = await onSubmitPassword({ currentPassword: current, newPassword: next });
    setPwBusy(false);
    if (!res.ok) {
      // A rejected sign-in means the current password was wrong; anything else is a real
      // failure and belongs in the lower message row.
      if (res.error === 'invalid_credentials') setPwWrong(true);
      else setPwError(res.messageKey || 'err_generic');
      return;
    }
    setCurrent(''); setNext(''); setConfirm('');
    setPwDone(true);
  }

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
      {/* Changing an email is not instant — Supabase only applies it once the link sent to the
          new address is clicked. Saying so here is what stops the unchanged field looking broken. */}
      {emailPending && <div className="acct-avail ok">{t('ea_email_pending')}</div>}

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
            value={current} onChange={touchPw(setCurrent)} />
          <div className={'acct-avail ' + curMsg.cls}>{curMsg.text}</div>
          <div className="acct-field-label">{t('ea_new_password')}</div>
          <input className="acct-input" type="password" autoComplete="off" placeholder={t('acct_password_ph')}
            value={next} onChange={touchPw(setNext)} />
          <div className="acct-field-label">{t('ea_confirm_password')}</div>
          <input className="acct-input" type="password" autoComplete="off"
            value={confirm} onChange={touchPw(setConfirm)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPassword(); }} />
          <div className={'acct-avail ' + pwMsg.cls}>{pwMsg.text}</div>
          <button
            className="acct-submit"
            style={{ marginTop: 10, padding: 12 }}
            disabled={!canUpdatePw}
            onClick={submitPassword}
          >
            {pwBusy ? t('ea_saving') : t('ea_update_password')}
          </button>
        </div>
      )}

      <div className="acct-disclaimer">{t('ob_disclaimer')}</div>

      <div className={'acct-avail' + (error ? ' bad' : '')}>{error ? t(error) : ''}</div>

      <button
        className="acct-submit"
        disabled={!canSave}
        onClick={() => canSave && onSubmit({
          username: stripSpaces(name.trim()), email: email.trim(), fullName: fullName.trim(),
        })}
      >
        {busy ? t('ea_saving') : t('save')}
      </button>
      <button className="acct-cancel" onClick={onClose}>{t('cancel')}</button>
    </div>
  );
}
