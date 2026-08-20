import { useI18n } from '../store/useI18n.js';

// Shared confirm dialog for log out / reset all data / delete account, using the same modal
// shell as the reference's individual ones.
// `notice` turns it into an acknowledgement rather than a choice: one button, no Cancel. Used
// where something has already happened and the player is being told, not asked.
// `topmost` lifts it above the onboarding screen. Only the sign-out notice needs it, because that
// is the one modal raised at the exact moment onboarding takes the screen — at the normal z-index
// it opened correctly and was then covered up, which is indistinguishable from never showing.
export default function ConfirmModal({ open, title, desc, confirmLabel, danger, notice, topmost, onConfirm, onCancel }) {
  const { t } = useI18n();
  return (
    <div className={'mbg' + (open ? ' on' : '') + (topmost ? ' topmost' : '')} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="mdl" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{desc}</p>
        <div className="mbtns">
          {!notice && <button className="mcancel" onClick={onCancel}>{t('cancel')}</button>}
          <button className={danger ? 'mquit' : 'mconfirm'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
