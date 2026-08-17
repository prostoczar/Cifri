import { useI18n } from '../store/useI18n.js';
import { opName, diffLabel } from '../store/questionEngine.js';
import { BRAINING_BOOST_PCT } from '../store/scoring.js';

// Shows where a Challenge score came from.
//
// Every number on this card is a number the game already produced: the per-operation points were
// recorded by useChallengeGame at the moment calcSc awarded them, and the boost line is simply the
// difference between the raw score and the score that counted. Nothing here re-derives a score
// from times or multipliers — if it did, a rounding difference could make the breakdown disagree
// with the big number at the top of the screen, which is the one thing this card must never do.
//
// The difficulty multiplier is stated rather than applied. That is not a simplification: scoring
// multiplies and ROUNDS it into each question individually (see calcSc), so pulling it out into a
// bottom-line "× 4.2" step would produce a total a point or two away from the real score. The
// operation rows therefore carry their true awarded points, difficulty already inside them, and
// the difficulty row says so in words.
//
// Rows that do not apply are not rendered at all. An unboosted attempt shows no boost line rather
// than a "+0%" one, because a line that is always there teaches a player to stop reading it.

// The app writes minus signs as U+2212 throughout (see the question generators), so negative
// values here match the typography of the questions that produced them.
function signed(n) {
  if (n < 0) return '−' + Math.abs(n);
  return '+' + n;
}

export default function ScoreBreakdown({ breakdown, rawScore, boosted, score, diff, lang }) {
  const { t } = useI18n();
  if (!breakdown || !breakdown.ops) return null;

  // Biggest earner first — the ordering answers "what carried this run?" before the player has
  // read a single number. Ties fall back to the operation key so the order is stable between
  // renders rather than depending on the order questions happened to come up.
  const ops = Object.keys(breakdown.ops)
    .map((op) => ({ op, ...breakdown.ops[op] }))
    .sort((a, b) => b.points - a.points || a.op.localeCompare(b.op));
  if (ops.length === 0) return null;

  const wrong = breakdown.wrong || 0;
  const penalty = breakdown.penalty || 0;
  const floorAbsorbed = breakdown.floorAbsorbed || 0;
  // The boost's actual worth in points, taken as the difference between the two stored figures
  // rather than recalculated from the percentage — those two can differ by the rounding step.
  const boostGain = boosted ? score - rawScore : 0;

  return (
    <div className="sb-card">
      <div className="sb-title">{t('sb_title')}</div>

      {ops.map((o) => (
        <div className="sb-row" key={o.op}>
          <span className="sb-name">{opName(lang, o.op)}</span>
          <span className="sb-detail">
            {o.correct > 0 ? t('sb_right', { n: o.correct }) : t('sb_none_right')}
          </span>
          <span className="sb-val">{o.points}</span>
        </div>
      ))}

      {wrong > 0 && (
        <div className="sb-row neg">
          <span className="sb-name">{t('sb_mistakes')}</span>
          <span className="sb-detail">{t('sb_wrong_n', { n: wrong })}</span>
          <span className="sb-val">{signed(penalty)}</span>
        </div>
      )}

      {/* Only on a run that started badly enough to hit the floor. Without this line the rows
          above would sum to less than the score, and the card would look wrong while being
          right. */}
      {floorAbsorbed > 0 && (
        <div className="sb-row">
          <span className="sb-name">{t('sb_floor')}</span>
          <span className="sb-detail">{t('sb_floor_detail')}</span>
          <span className="sb-val">{signed(floorAbsorbed)}</span>
        </div>
      )}

      {diff && (
        <div className="sb-row factor">
          <span className="sb-name">{t('sb_difficulty', { diff: diffLabel(lang, diff) })}</span>
          {/* One decimal always, so Easy reads "×1.0" rather than a bare "×1" — the three tiers
              line up as 1.0 / 1.9 / 4.2, which is the comparison a player is actually making.
              DIFF_MULT is kept to one decimal for this reason: anything finer would be displayed
              here as a number that is not the one the score was computed from. */}
          <span className="sb-detail">{t('sb_diff_factor', { m: breakdown.dm.toFixed(1) })}</span>
        </div>
      )}

      <div className="sb-rule" />

      {boosted && (
        <>
          <div className="sb-row">
            <span className="sb-name">{t('sb_subtotal')}</span>
            <span className="sb-detail" />
            <span className="sb-val">{rawScore}</span>
          </div>
          <div className="sb-row boost">
            <span className="sb-name">{t('sb_boost')}</span>
            <span className="sb-detail">{t('sb_boost_detail', { pct: BRAINING_BOOST_PCT })}</span>
            <span className="sb-val">{signed(boostGain)}</span>
          </div>
          <div className="sb-rule" />
        </>
      )}

      <div className="sb-row total">
        <span className="sb-name">{t('sb_final')}</span>
        <span className="sb-detail" />
        <span className="sb-val">{score}</span>
      </div>
    </div>
  );
}
