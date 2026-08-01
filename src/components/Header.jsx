import { chDoneToday, brDoneToday } from '../store/AppStateContext.jsx';
import { avatarSpecFor } from '../store/avatar.js';
import Avatar from './Avatar.jsx';

// Ported from the reference prototype's header markup + updateStreakPill()/updateRefillPill().
export default function Header({ db, brState, streak, streakRestoreAvailable, username, avatar, onOpenProfile }) {
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
  let pillCls = 'streak-pill';
  if (chD && brD) pillCls += ' both';
  else if (chD || brD) pillCls += ' one';

  const refillAvailable = streak > 0 && streakRestoreAvailable;

  return (
    <div className="hdr">
      <div className="hdr-left">
        <div className={pillCls} id="hdr-streak-pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
          </svg>
          <span className="streak-badge">{streak || 0}</span>
        </div>
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
