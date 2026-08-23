import { useI18n } from '../store/useI18n.js';
import { trTrick } from '../store/tricks.js';

// The trick's own explanation, reachable from the green name pill while practising it. v16 item 9.
//
// It renders the SAME fields the Tricks library card renders — `explain` and the worked `steps` —
// through the same .tex / .teg-* classes, rather than a second presentation of the same content.
// That is the point: a player who half-remembers the method mid-drill should meet the wording they
// already read, not a paraphrase of it.
export default function TrickInfoModal({ open, trick, groupName, onClose }) {
  const { t, lang } = useI18n();
  if (!open) return null;

  const tr = trTrick(lang, trick, groupName);

  return (
    // Backdrop click closes; the click inside is stopped so a stray tap while reading does not.
    <div className="mbg on" onClick={onClose}>
      <div className="mdl trick-info-mdl" onClick={(e) => e.stopPropagation()}>
        <div className="trick-info-hdr">
          <h3>{tr.name}</h3>
          <button className="trick-info-close" onClick={onClose} aria-label={t('close')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {/* The scrolling part is the body, not the whole dialog, so the title and the way out stay
            put — the same arrangement the profile sheet uses, and for the same reason: the longest
            explanations run past the height of a phone. */}
        <div className="trick-info-body">
          <p className="tex">{tr.explain}</p>
          <div className="teg-wrap">
            <div className="teg-title">{t('example_word')}</div>
            <div className="teg-steps">
              {tr.steps.map((step, si) => {
                const isLast = si === tr.steps.length - 1;
                return (
                  <div key={si}>
                    <div className={'teg-step' + (isLast ? ' final' : '')}>{step}</div>
                    {!isLast && <div className="teg-step arrow">↓</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
