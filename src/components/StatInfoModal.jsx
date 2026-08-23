import { useI18n } from '../store/useI18n.js';
import { diffLabel } from '../store/questionEngine.js';
import { todayChallengeAvg, todayChallengeHigh, challengeStreak } from '../store/selectors.js';
import { attemptWord, dayWord } from '../i18n_data.js';

// Ported from the reference prototype's openMdl()/#info-mdl — the streak / today-avg /
// personal-best stat popups on the Challenge home screen.
export default function StatInfoModal({ type, db, selDiff, lang, onClose }) {
  const { t } = useI18n();
  if (!type) return null;

  const d = db[selDiff];
  let title = '', body = null;

  if (type === 'streak') {
    // v16 item 2: the pill this opens from now reports the CHALLENGE-only streak, so the popup
    // explains that number instead of the unified one. The unified streak is not dropped — it is
    // named in the last line, because a player looking at two different streak numbers on one
    // screen deserves to be told which is which rather than left to guess.
    const ch = challengeStreak(db);
    title = t('mdl_chstreak_title');
    body = (
      <>
        {ch.current === 0
          ? <p dangerouslySetInnerHTML={{ __html: t('mdl_chstreak_body0') }} />
          : <p dangerouslySetInnerHTML={{ __html: t('mdl_chstreak_body1', { n: ch.current, unit: dayWord(lang, ch.current) }) }} />}
        <p dangerouslySetInnerHTML={{ __html: t('mdl_chstreak_body2', { n: ch.best, unit: dayWord(lang, ch.best) }) }} />
        <p
          style={{ marginTop: 8, fontSize: 'calc(12px * var(--fs-mult))', color: 'var(--txt3)' }}
          dangerouslySetInnerHTML={{ __html: t('mdl_modestreak_body3') }}
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
