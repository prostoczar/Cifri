// The adjustable parts of Challenge scoring.
//
// These used to be defined here. They now live in supabase/functions/_shared/scoring.js, and
// this file is a re-export — one line of indirection kept so that every existing import
// (`from './scoring.js'`) still resolves, and so there is somewhere to explain the move.
//
// WHY THE DEFINITION MOVED TO THE SERVER SIDE OF THE TREE
//
// The server now recomputes every Challenge score from the answers it was sent and stores its
// own figure. That only works if both sides round identically — a boost the app computed as 74
// and the server computed as 73 would mean an honest player's run being rejected as tampered.
// A shared constant cannot disagree with itself, which is a stronger guarantee than any amount
// of care taken over two copies.
//
// It also puts the 5% somewhere the client cannot reach. The app still imports the number, but
// only to PRINT it on the score breakdown; the boost that lands in a stored score is applied by
// the server, to the server's own raw number, after the server has established from its own
// records that a boost was genuinely available. Editing the copy in the browser changes the
// label and nothing else.

export {
  BRAINING_BOOST_PCT,
  BRAINING_BOOST_MULT,
  CHALLENGE_DURATION_SEC,
  applyBrainingBoost,
  isValidBoost,
  scoreAttempt,
} from '../../supabase/functions/_shared/scoring.js';
