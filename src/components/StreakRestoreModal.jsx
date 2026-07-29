import { useI18n } from '../store/useI18n.js';

// Ported from the reference prototype's maybeShowStreakRestoreModal()/doStreakRestore()/
// doStreakStartOver(). Offered once when a streak breaks: restoring is a one-per-streak
// allowance, and the offer itself expires 24 hours after the break.
//
// Tapping outside counts as starting over — the reference deliberately treats dismissal as a
// decision, because leaving the offer open indefinitely would undermine "one and only chance".
export default function StreakRestoreModal({ pendingRestore, onRestore, onStartOver }) {
  const { t } = useI18n();
  if (!pendingRestore) return null;

  const n = pendingRestore.brokenValue;
  const reason =
    pendingRestore.brokenReason === 'both'
      ? t('restore_reason_both')
      : pendingRestore.brokenReason === 'Challenge'
      ? t('nav_challenge')
      : t('nav_braining');
  const available = !!pendingRestore.availableAtBreak;

  return (
    <div className="mbg on" onClick={onStartOver}>
      <div className="restore-card" onClick={(e) => e.stopPropagation()}>
        <h3>{t('restore_title')}</h3>
        <p>{t('restore_body', { n, unit: n !== 1 ? t('days_word') : t('day_word'), reason })}</p>
        <div className="restore-btns">
          <button
            className={'restore-btn grn' + (available ? '' : ' disabled')}
            onClick={available ? onRestore : undefined}
          >
            {available ? t('restore_btn_avail') : t('restore_btn_unavail')}
          </button>
          <button className="restore-btn red" onClick={onStartOver}>{t('start_over')}</button>
        </div>
      </div>
    </div>
  );
}
