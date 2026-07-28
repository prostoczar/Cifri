import { useI18n } from '../store/useI18n.js';

// Shared confirm dialog for log out / reset all data / delete account, using the same modal
// shell as the reference's individual ones.
export default function ConfirmModal({ open, title, desc, confirmLabel, danger, onConfirm, onCancel }) {
  const { t } = useI18n();
  return (
    <div className={'mbg' + (open ? ' on' : '')} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="mdl" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{desc}</p>
        <div className="mbtns">
          <button className="mcancel" onClick={onCancel}>{t('cancel')}</button>
          <button className={danger ? 'mquit' : 'mconfirm'} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
