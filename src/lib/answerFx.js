// Answer feedback — the bump, slide and shake on every answer (docs/launch-celebrations-spec.md,
// Feature 2). Shared by every game screen: Challenge and the Practice tab, Braining, and Tricks.
//
// PURELY A REACTION. Nothing in a game waits on anything here: the game decides when the next
// question appears exactly as it always has, and these animations are fitted inside the pause it
// already takes. Each screen passes its own pause, and the slide is shortened to fit it rather
// than the question being held back for the slide.
//
// The Web Animations API on transform and opacity rather than CSS classes, for two reasons: an
// animation can be restarted on the same element twice in a row (two wrong answers running) with no
// class juggling or re-render, and it never touches React state, so the keypad under the player's
// thumb does not re-render for a decoration.
//
// Reduced motion: tint only. The green tint on a right answer is the existing `.ok` class; the
// terracotta one on a wrong answer is drawn here as a colour change, which reduced motion keeps.

const SLIDE_PX = 28;
const TINT_BAD = '#fcebeb';

function reducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function play(el, frames, opts) {
  if (!el || !el.animate) return null;
  try {
    const a = el.animate(frames, opts);
    a.cifriFx = true;
    return a;
  } catch {
    return null;
  }
}

// Clears whatever this module left on an element — in particular a finished slide-out, which holds
// its element invisible (fill: forwards) until the next question replaces it.
function settle(el) {
  if (!el || !el.getAnimations) return;
  el.getAnimations().forEach((a) => { if (a.cifriFx) a.cancel(); });
}

/**
 * A right answer: the answer box bumps (1 → 1.08 → 1, 140 ms), then the question card and the box
 * slide 28 px left and fade, starting at `outAt` and lasting `outMs` — chosen by each screen to end
 * before its next question appears (Challenge and Tricks: 150 + 90 of a 250 ms pause).
 */
export function answerCorrect({ box, card }, { outAt = 150, outMs = 90 } = {}) {
  if (reducedMotion()) return;
  settle(box);
  settle(card);
  play(box, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.45 }, { transform: 'scale(1)' }],
    { duration: 140, easing: 'ease-out' });
  [card, box].forEach((el) => play(el, [
    { transform: 'translateX(0)', opacity: 1 },
    { transform: 'translateX(' + -SLIDE_PX + 'px)', opacity: 0 },
  ], { duration: outMs, delay: outAt, easing: 'ease-in', fill: 'forwards' }));
}

/**
 * A new question has just appeared. After a right answer it slides in from 28 px to the right
 * (120 ms); otherwise it simply is there. Either way, anything left over from the last answer is
 * cleared first.
 */
export function questionIn({ box, card }, afterCorrect) {
  settle(box);
  settle(card);
  if (!afterCorrect || reducedMotion()) return;
  [card, box].forEach((el) => play(el, [
    { transform: 'translateX(' + SLIDE_PX + 'px)', opacity: 0 },
    { transform: 'translateX(0)', opacity: 1 },
  ], { duration: 120, easing: 'ease-out' }));
}

/**
 * A wrong answer: the answer box tints terracotta and shakes sideways (0 → −9 → 8 → −6 → 4 → 0 px,
 * 220 ms), and the tint clears by 300 ms. The red digits and the "Answer: X" line are the screen's
 * own and stay exactly as before.
 */
export function answerWrong({ box }) {
  if (!box) return;
  settle(box);
  const base = getComputedStyle(box).backgroundColor;
  play(box, [
    { backgroundColor: TINT_BAD }, { backgroundColor: TINT_BAD, offset: 0.7 }, { backgroundColor: base },
  ], { duration: 300, easing: 'ease-out' });
  if (reducedMotion()) return;
  play(box, [
    { transform: 'translateX(0)' }, { transform: 'translateX(-9px)', offset: 0.18 },
    { transform: 'translateX(8px)', offset: 0.38 }, { transform: 'translateX(-6px)', offset: 0.58 },
    { transform: 'translateX(4px)', offset: 0.8 }, { transform: 'translateX(0)' },
  ], { duration: 220, easing: 'ease-out' });
}
