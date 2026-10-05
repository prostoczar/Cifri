import { chDoneToday, brDoneToday } from '../store/AppStateContext.jsx';
import { avatarSpecFor } from '../store/avatar.js';
import Avatar from './Avatar.jsx';
import Flame from './Flame.jsx';

// The streak pill on its own, so the Finish screen can fly an exact copy of it into the header
// (see FinishScreen's move into results) instead of keeping a second drawing of it.
//
// `state` is 'grey' | 'one' | 'both' — the three states described in Header below. Grey keeps the
// original static outline flame, untouched. Once either mode is done today the flame burns: the
// same burning flame as the Finish screen, with a dark edge in a darker shade of the pill.
// `paused` holds it lit and still while a game is being played, so nothing moves in the corner of
// the eye of someone doing mental arithmetic against a clock.
export function StreakPill({ state, streak, paused, id, className, ref }) {
  let cls = 'streak-pill';
  if (state === 'both') cls += ' both';
  else if (state === 'one') cls += ' one';
  if (className) cls += ' ' + className;
  return (
    <div className={cls} id={id} ref={ref}>
      {state === 'grey' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      ) : (
        <Flame burning paused={paused} edge={state === 'both' ? '#7a5200' : '#0a5c40'} />
      )}
      <span className="streak-badge">{streak || 0}</span>
    </div>
  );
}

// Ported from the reference prototype's header markup + updateStreakPill()/updateRefillPill().
export default function Header({ db, brState, streak, streakRestoreAvailable, username, avatar, onOpenProfile, flamePaused }) {
  // Three states, unchanged in code but no longer meaning what they used to. Green used to say
  // "halfway there"; under the loosened rule one mode is the whole requirement, so it now says
  // "today is secured". Yellow is no longer the streak being earned — it is the fuller day:
  // both modes done, which is also the day a Challenge boost was granted.
  //
  //   grey   nothing played yet — the streak is what is at risk
  //   green  one mode done — the day counts
  //   yellow both done — the day counts and Braining's boost was earned
  const chD = chDoneToday(db);
  const brD = brDoneToday(brState);
  const pillState = chD && brD ? 'both' : chD || brD ? 'one' : 'grey';

  const refillAvailable = streak > 0 && streakRestoreAvailable;

  return (
    <div className="hdr">
      <div className="hdr-left">
        <StreakPill state={pillState} streak={streak} paused={flamePaused} id="hdr-streak-pill" />
        <div className={'refill-pill' + (refillAvailable ? ' avail' : '')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.32 0z" />
          </svg>
          <span className="streak-badge">{refillAvailable ? '1' : '0'}</span>
        </div>
      </div>
      {/* Once a username exists the generic icon is replaced by the player's avatar, and the
          button's own background switches to light green — matching updateProfileBtn(). */}
      <button
        className="prof-btn"
        style={{ background: username ? 'var(--GL2)' : 'var(--card)' }}
        onClick={onOpenProfile}
      >
        {username ? (
          <Avatar spec={avatarSpecFor(avatar, username)} size={36} />
        ) : (
          <svg id="prof-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        )}
      </button>
    </div>
  );
}
