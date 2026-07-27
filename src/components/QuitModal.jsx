import { useI18n } from '../store/useI18n.js';

// Ported from the reference prototype's #quit-mdl.
export default function QuitModal({ open, onKeepGoing, onQuit }) {
  const { t } = useI18n();
  return (
    <div className={'mbg' + (open ? ' on' : '')}>
      <div className="mdl" onClick={(e) => e.stopPropagation()}>
        <h3>{t('quit_game_title')}</h3>
        <p>{t('quit_game_desc')}</p>
        <div className="mbtns">
          <button className="mcancel" onClick={onKeepGoing}>{t('keep_going')}</button>
          <button className="mquit" onClick={onQuit}>{t('quit')}</button>
        </div>
      </div>
    </div>
  );
}
