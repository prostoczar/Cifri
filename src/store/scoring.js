// The adjustable parts of Challenge scoring, kept in one file.
//
// Right now that is one rule: completing Braining earns a single 5% boost, spent by the very
// next Challenge attempt played that day. The percentage lives here rather than inline at the
// place it is applied, because it is a balance figure that will be tuned, and a number that
// appears in two places eventually disagrees with itself.
//
// The ROUNDING is as much a part of the rule as the percentage. A boosted score has to be a
// whole number — it is summed and averaged alongside ordinary scores, and stored in an integer
// column server-side — so exactly one rounding step is defined here and everything else calls
// it. When the next session re-derives a boosted score on the server to check it, this is the
// definition it has to reproduce; anything that rounded differently would reject honest scores.

// The boost as a percentage. Change this one number to retune it.
export const BRAINING_BOOST_PCT = 5;

// The multiplier that percentage implies. Derived, never written out separately.
export const BRAINING_BOOST_MULT = 1 + BRAINING_BOOST_PCT / 100;

// Apply the boost to a raw score. The single definition of what "boosted" means numerically.
export function applyBrainingBoost(rawScore) {
  return Math.round(rawScore * BRAINING_BOOST_MULT);
}

// True when `boostedScore` really is what the boost does to `rawScore`. Used by the projection
// check to verify stored attempts rather than trusting them, and written as its own function so
// the check cannot drift from the calculation it is checking.
export function isValidBoost(rawScore, boostedScore) {
  return Number.isFinite(rawScore)
    && Number.isFinite(boostedScore)
    && boostedScore === applyBrainingBoost(rawScore);
}
