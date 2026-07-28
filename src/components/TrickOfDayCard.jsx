import { useI18n } from '../store/useI18n.js';
import { TRICKS } from '../store/tricksData.js';
import { trickOfDayRef, trTrick } from '../store/tricks.js';
import { dayKey } from '../store/dates.js';

// Ported from the reference prototype's updateTrickOfDayCard(). Appears on the Challenge and
// Braining home screens, but only once that screen's own mode is done for the day. Yellow until
// today's trick has been opened, light green afterwards (.viewed).
export default function TrickOfDayCard({ doneToday, totdLastViewed, onOpen }) {
  const { t, lang } = useI18n();
  if (!doneToday) return null;
  const ref = trickOfDayRef();
  if (!ref) return null;

  const group = TRICKS[ref.gi];
  const trick = group.items[ref.ti];
  const viewed = totdLastViewed === dayKey();

  return (
    <div className={'totd-card' + (viewed ? ' viewed' : '')} onClick={onOpen} style={{ display: 'block' }}>
      <div className="totd-top">
        <div className="totd-icon">
          <svg viewBox="0 0 24 24">
            <rect x="2" y="10" width="3" height="4" rx="1" />
            <rect x="19" y="10" width="3" height="4" rx="1" />
            <rect x="5" y="8" width="3" height="8" rx="1" />
            <rect x="16" y="8" width="3" height="8" rx="1" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </div>
        <span>{t('totd_label')}</span>
      </div>
      <div className="totd-name">{trTrick(lang, trick, group.group).name}</div>
    </div>
  );
}
