import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../store/useI18n.js';
import { TRICKS } from '../store/tricksData.js';
import { TRICKS_FLAT, trGroupName, trTrick, trickOfDayIndex } from '../store/tricks.js';

// Ported from the reference prototype's buildTricks(). The library is a set of collapsible
// items grouped by operation; today's featured trick carries the .totd highlight.
export default function TricksScreen({ openIndex, onOpenedIndexConsumed, onPractice }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState({}); // keyed by flat index
  const itemRefs = useRef({});
  const todIdx = trickOfDayIndex();

  // Arriving from a Trick of the Day card: expand that trick and scroll it into view.
  useEffect(() => {
    if (openIndex == null) return;
    setOpen((prev) => ({ ...prev, [openIndex]: true }));
    const id = setTimeout(() => {
      const el = itemRefs.current[openIndex];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      onOpenedIndexConsumed();
    }, 60);
    return () => clearTimeout(id);
  }, [openIndex, onOpenedIndexConsumed]);

  let flatIdx = -1;

  return (
    <div className="tscr">
      {TRICKS.map((g, gi) => (
        <div className="tg" key={g.group}>
          <div className="tgh">
            {g.symbol && <span className="tg-sym">{g.symbol}</span>}
            {trGroupName(lang, g.group)}
          </div>
          {g.items.map((trick, ti) => {
            flatIdx++;
            const idx = flatIdx;
            const tr = trTrick(lang, trick, g.group);
            const cls =
              'ti' + (open[idx] ? ' on' : '') + (idx === todIdx ? ' totd' : '');
            return (
              <div className={cls} key={g.group + '::' + trick.name} ref={(el) => (itemRefs.current[idx] = el)}>
                <div className="tn2" onClick={() => setOpen((prev) => ({ ...prev, [idx]: !prev[idx] }))}>
                  {tr.name}
                  <span className="arr">&#9658;</span>
                </div>
                <div className="tb">
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
                  <button className="tpb" onClick={() => onPractice(gi, ti)}>{t('practice_this_trick')}</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export { TRICKS_FLAT };
