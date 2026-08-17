import { useI18n } from '../store/useI18n.js';

// The reminder opt-in. Uses the same modal shell as ConfirmModal.
//
// ── Why this is a card of ours and not the browser's dialog ───────────────────────────────────
//
// The browser's permission dialog has exactly one shot. A "Block" cannot be undone from inside the
// app — `requestPermission()` afterwards returns instantly, with no dialog and no way to appeal —
// so it must never be opened on someone who has not already said yes to a question they could
// answer with "not now". This card is that question. Only a tap on "Yes" opens the real one.
//
// ── Why here, and not in onboarding ───────────────────────────────────────────────────────────
//
// Onboarding is a stranger who has typed a username and played nothing. There is no reminder worth
// having yet, and on iPhone the prompt could not appear at all, because the app has not been
// installed. This card waits for a day to be banked — the player now has a streak, which is the
// thing a reminder protects.
//
// ── The iPhone branch ─────────────────────────────────────────────────────────────────────────
//
// Apple only delivers push to a site added to the Home Screen. In a normal tab there is nothing to
// grant, so offering a "Yes" would be offering a button that cannot work. That case gets the
// instructions instead — the same card, a different ask.
export default function NotifOptInCard({ open, needsInstall, busy, onAllow, onDismiss }) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="mbg on" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="mdl" onClick={(e) => e.stopPropagation()}>
        <h3>{needsInstall ? t('notif_install_title') : t('notif_ask_title')}</h3>
        <p>{needsInstall ? t('notif_install_body') : t('notif_ask_body')}</p>
        {needsInstall ? (
          // One button, because there is nothing to decide — the instructions either get followed
          // later or they do not, and a "no" here would record a refusal of a question we never
          // actually managed to ask.
          <div className="mbtns">
            <button className="mconfirm" onClick={onDismiss}>{t('notif_install_dismiss')}</button>
          </div>
        ) : (
          <div className="mbtns">
            <button className="mcancel" onClick={onDismiss}>{t('notif_ask_no')}</button>
            <button className="mconfirm" disabled={busy} onClick={onAllow}>{t('notif_ask_yes')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
