// Answer feedback — the shake on a wrong answer (docs/launch-celebrations-spec.md, Feature 2).
// Shared by every game screen: Challenge and the Practice tab, Braining, and Tricks.
//
// A RIGHT answer has no animation here. The spec gave it a bump and a slide to the next question;
// they were built, and then taken out on 7 Oct 2026 because they were distracting in the middle of
// a game. A right answer keeps exactly what it had before: the green tint (the `.ok` classes) and
// the tick, plus the light tap on phones.
//
// PURELY A REACTION. Nothing in a game waits on anything here, and the next question appears exactly
// when it always has.
//
// The Web Animations API rather than CSS classes: an animation can be restarted on the same element
// twice in a row (two wrong answers running) with no class juggling or re-render, and it never
// touches React state, so the keypad under the player's thumb does not re-render for a decoration.
//
// Reduced motion: tint only — the terracotta flash is a colour change, which reduced motion keeps.

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

// Clears whatever this module left on an element, so a second wrong answer starts its shake afresh.
function settle(el) {
  if (!el || !el.getAnimations) return;
  el.getAnimations().forEach((a) => { if (a.cifriFx) a.cancel(); });
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
