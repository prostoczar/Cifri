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
      const n = TAB_ORDER.length;
      if (dx < 0) {
        // Swiped left → forward. Past the last tab this wraps round to the first, so Tricks
        // continues on to Challenge with the new screen still entering from the right.
        onSwitchTab(TAB_ORDER[(idx + 1) % n], 'left');
      } else {
        // Swiped right → back, wrapping the other way: Challenge goes round to Tricks, which
        // enters from the left just like any other backwards move.
        onSwitchTab(TAB_ORDER[(idx - 1 + n) % n], 'right');
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
