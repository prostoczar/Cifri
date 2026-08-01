import { useI18n } from '../store/useI18n.js';
import { diffLabel } from '../store/questionEngine.js';
import { todayChallengeAvg, todayChallengeHigh } from '../store/selectors.js';
import { attemptWord } from '../i18n_data.js';

// Ported from the reference prototype's openMdl()/#info-mdl — the streak / today-avg /
// personal-best stat popups on the Challenge home screen.
export default function StatInfoModal({ type, db, selDiff, streak, bestStreakEver, lang, onClose }) {
  const { t } = useI18n();
  if (!type) return null;

  const d = db[selDiff];
  let title = '', body = null;

  if (type === 'streak') {
    const bse = bestStreakEver || 0;
    title = t('mdl_streak_title');
    body = (
      <>
        <p dangerouslySetInnerHTML={{ __html: t('mdl_streak_body1', { n: bse, unit: bse !== 1 ? t('days_word') : t('day_word') }) }} />
        <p
          style={{ marginTop: 8, fontSize: 'calc(12px * var(--fs-mult))', color: 'var(--txt3)' }}
          dangerouslySetInnerHTML={{ __html: t('mdl_streak_body2', { n: streak || 0 }) }}
        />
      </>
    );
  } else if (type === 'today') {
    // Three different numbers that are easy to confuse, so the modal names all three side by
    // side: the best single run today, the average those runs add up to (which is what the day
    // actually scores), and how many runs there have been.
    const { avg, count } = todayChallengeAvg(db, selDiff);
    const high = todayChallengeHigh(db, selDiff);
    title = t('mdl_today_title', { diff: diffLabel(lang, selDiff) });
    body = (
      <>
        <p dangerouslySetInnerHTML={{ __html: t('mdl_today_body1', { high: high == null ? '--' : high }) }} />
        <p dangerouslySetInnerHTML={{ __html: t('mdl_today_body2', { avg: avg == null ? '--' : avg, att: count, unit: attemptWord(lang, count) }) }} />
        <p style={{ marginTop: 8, fontSize: 'calc(12px * var(--fs-mult))', color: 'var(--txt3)' }}>{t('mdl_today_body3')}</p>
      </>
    );
  } else {
    title = t('mdl_pb_title', { diff: diffLabel(lang, selDiff) });
    body = (
      <>
        <p dangerouslySetInnerHTML={{ __html: t('mdl_pb_body1', { diff: diffLabel(lang, selDiff), best: d.best || '--' }) }} />
        <p style={{ marginTop: 8, fontSize: 'calc(12px * var(--fs-mult))', color: 'var(--txt3)' }}>{t('mdl_pb_body2')}</p>
      </>
    );
  }

  return (
    <div className="mbg on" onClick={onClose}>
      <div className="mdl" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div>{body}</div>
        <button className="mclose" onClick={onClose}>{t('close')}</button>
      </div>
    </div>
  );
}
