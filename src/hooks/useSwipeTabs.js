import { useEffect } from 'react';

export const TAB_ORDER = ['challenge', 'braining', 'practice', 'tricks'];

// Ported from the reference prototype's attachSwipeHandlers(): swipe left/right to move between
// the four home screens, in the same left-to-right order as the bottom nav. The gesture
// thresholds are the reference's exactly — at least 60px of horizontal travel, and clearly more
// horizontal than vertical, so ordinary vertical scrolling never triggers a tab change.
export function useSwipeTabs({ containerRef, activeTab, enabled, onSwitchTab }) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const track = { tracking: false, startX: 0, startY: 0 };

    const onTouchStart = (e) => {
      if (!enabled || e.touches.length !== 1) {
        track.tracking = false;
        return;
      }
      track.tracking = true;
      track.startX = e.touches[0].clientX;
      track.startY = e.touches[0].clientY;
    };

    const onTouchEnd = (e) => {
      if (!track.tracking) return;
      track.tracking = false;
      if (!enabled || !e.changedTouches || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - track.startX;
      const dy = e.changedTouches[0].clientY - track.startY;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const idx = TAB_ORDER.indexOf(activeTab);
      if (idx === -1) return;
      if (dx < 0) {
        // swiped left → forward to the next tab
        if (idx < TAB_ORDER.length - 1) onSwitchTab(TAB_ORDER[idx + 1], 'left');
      } else {
        // swiped right → back to the previous tab
        if (idx > 0) onSwitchTab(TAB_ORDER[idx - 1], 'right');
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [containerRef, activeTab, enabled, onSwitchTab]);
}
