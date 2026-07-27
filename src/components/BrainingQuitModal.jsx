import { useI18n } from '../store/useI18n.js';

// Ported from the reference prototype's #br-quit-mdl. The warning line changes depending on
// whether the run in progress could still have counted (see quitWarningFor in the game hook).
export default function BrainingQuitModal({ open, warning, onKeepGoing, onQuit }) {
  const { t } = useI18n();
  return (
    <div className={'br-mbg' + (open ? ' on' : '')}>
      <div className="br-mdl" onClick={(e) => e.stopPropagation()}>
        <h3>{t('quit_session_title')}</h3>
        <p>{t('quit_session_desc')}</p>
        <div className="br-warn">{warning}</div>
        <div className="br-mbtns">
          <button className="br-mcancel" onClick={onKeepGoing}>{t('keep_going')}</button>
          <button className="br-mquit" onClick={onQuit}>{t('quit')}</button>
        </div>
      </div>
    </div>
  );
}
