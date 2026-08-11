import { useI18n } from '../store/useI18n.js';

// The three non-achievement guest-conversion surfaces, ported from the reference prototype.
//
// Each passes its own name to onCreateAccount. Nothing in the app branches on it — it exists so
// analytics can tell these three surfaces apart, which they otherwise cannot be: all of them, plus
// the achievement popup's CTA, used to arrive at openAccountCreation() as one indistinguishable
// call. "Which ask actually converts" is unanswerable without this argument.

// The 5-day fallback: a plain, non-celebratory prompt. Fires once, ever, and only if a streak
// has never been lit — if one has, the dedicated streak-lit popup already made this ask.
export function SavePromptModal({ open, onCreateAccount, onDismiss }) {
  const { t } = useI18n();
  return (
    <div className={'save-prompt-mbg' + (open ? ' on' : '')}>
      <div className="save-prompt-card">
        <div className="save-prompt-title">{t('save_prompt_title')}</div>
        <div className="save-prompt-desc">{t('save_prompt_desc')}</div>
        <button className="save-prompt-cta" onClick={() => onCreateAccount('fallback_prompt')}>{t('create_account')}</button>
        <button className="save-prompt-dismiss" onClick={onDismiss}>{t('not_now')}</button>
      </div>
    </div>
  );
}

// Small, non-modal reminder on the Challenge home screen. Only appears after a dedicated
// conversion ask has already been dismissed once, and can be dismissed for the rest of the day.
export function GuestBanner({ visible, onCreateAccount, onDismiss }) {
  const { t } = useI18n();
  if (!visible) return null;
  return (
    <div className="guest-banner on">
      <span>{t('guest_banner_text')}</span>
      <button onClick={() => onCreateAccount('guest_banner')}>{t('guest_banner_cta')}</button>
      <button
        style={{ background: 'none', color: 'var(--GDK)', padding: '6px 4px', boxShadow: 'none' }}
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}

// The persistent Create Account button on both result screens — shown on every playthrough,
// independent of achievements or streak, for as long as no account exists.
export function ResultAccountButton({ visible, onClick }) {
  const { t } = useI18n();
  return (
    <button className={'result-acct-btn' + (visible ? ' on' : '')} onClick={() => onClick('result_button')}>
      {t('create_account')}
    </button>
  );
}
