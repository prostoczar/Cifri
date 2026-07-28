import { useEffect, useLayoutEffect, useRef } from 'react';
import { useI18n } from '../store/useI18n.js';

const TABS = [
  { id: 'challenge', labelKey: 'nav_challenge', urgent: true },
  { id: 'braining', labelKey: 'nav_braining', urgent: true },
  { id: 'practice', labelKey: 'nav_practice', urgent: false },
  { id: 'tricks', labelKey: 'nav_tricks', urgent: false },
];

// Ported from the reference prototype's bottom nav + positionNavIndicator()/updateNavUrgency().
export default function BottomNav({ activeTab, onSelectTab, chDone, brDone, visible }) {
  const { t } = useI18n();
  const navRef = useRef(null);
  const indicatorRef = useRef(null);
  const btnRefs = useRef({});

  const positionIndicator = (animate) => {
    const ind = indicatorRef.current;
    const active = btnRefs.current[activeTab];
    const bnav = navRef.current;
    if (!ind || !active || !bnav) return;
    const br = bnav.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    if (!animate) ind.style.transition = 'none';
    ind.style.left = ar.left - br.left + 'px';
    ind.style.top = ar.top - br.top + 'px';
    ind.style.width = ar.width + 'px';
    ind.style.height = ar.height + 'px';
    if (!animate) {
      // eslint-disable-next-line no-unused-expressions
      ind.offsetWidth;
      ind.style.transition = '';
    }
  };

  const prevTabRef = useRef(activeTab);

  useLayoutEffect(() => {
    // Never measure while the nav is hidden (during countdown/game): a display:none element
    // reports a zero-sized rect, which would write left/top/width/height:0 onto the indicator
    // and leave it animating in from the corner at the wrong size when the nav comes back.
    if (!visible) return;
    // Animate only on a genuine tab change — restoring visibility after a game should put the
    // pill straight back in place, matching the reference's positionNavIndicator(false) calls.
    const animate = prevTabRef.current !== activeTab;
    prevTabRef.current = activeTab;
    positionIndicator(animate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, visible]);

  // These two handlers outlive the render that created them, so they must not close over
  // `positionIndicator` directly — that would pin them to whichever tab was active at mount and
  // snap the pill back there. A resize fires on every phone rotation, and on mobile Safari every
  // time the toolbar collapses during a scroll, so a stale one is very visible.
  const positionRef = useRef(positionIndicator);
  positionRef.current = positionIndicator;

  useEffect(() => {
    const onResize = () => positionRef.current(false);
    window.addEventListener('resize', onResize);
    // The nav labels are set in Nunito, loaded asynchronously from Google Fonts. On first paint
    // the buttons are still measured in the fallback font, so the pill can end up sized to the
    // wrong text metrics until something else triggers a re-measure. Re-position once the real
    // font is in — most visible on a phone over the network, where that gap is longest.
    let cancelled = false;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) positionRef.current(false);
      });
    }
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const urgentFor = (id) => (id === 'challenge' ? !chDone : id === 'braining' ? !brDone : false);

  return (
    <div className="bnav" ref={navRef} style={{ display: visible ? 'flex' : 'none' }}>
      <div className="nb-indicator" ref={indicatorRef}></div>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          ref={(el) => (btnRefs.current[tab.id] = el)}
          className={'nb' + (activeTab === tab.id ? ' on' : '') + (urgentFor(tab.id) ? ' urgent' : '')}
          onClick={() => onSelectTab(tab.id)}
        >
          <TabIcon id={tab.id} />
          <span>{t(tab.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

function TabIcon({ id }) {
  if (id === 'challenge')
    return (
      <svg viewBox="0 0 24 24" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  if (id === 'braining')
    return (
      <svg viewBox="0 0 24 24" strokeWidth="2">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    );
  if (id === 'practice')
    return (
      <svg viewBox="0 0 24 24" strokeWidth="2">
        <rect x="2" y="10" width="3" height="4" rx="1" />
        <rect x="19" y="10" width="3" height="4" rx="1" />
        <rect x="5" y="8" width="3" height="8" rx="1" />
        <rect x="16" y="8" width="3" height="8" rx="1" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" strokeWidth="2">
      <circle cx="8" cy="10" r="4" />
      <path d="M12 10h9M18 10v3" />
    </svg>
  );
}
