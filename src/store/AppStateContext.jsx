import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { dayKey, yesterday, addDaysStr, dateStrToDate } from './dates.js';
import { streakAchievementKey, streakMilestoneThreshold } from './achievements.js';
import { applyBrainingBoost } from './scoring.js';
import { brainAge20Count, isSharperEveryDay } from './braining.js';
import { fetchAccount, getSession, onAuthChange, pushPlayerState, pushDailyResults } from '../lib/accountApi.js';
import { sameSyncPayload, toSyncPayload } from '../lib/syncedState.js';
import { projectDailyRows } from '../lib/dailyResults.js';
import { clearBaseline, fingerprint, readBaseline, writeBaseline } from '../lib/syncBaseline.js';
import { flushOutbox, setLogOwner } from '../lib/attemptLog.js';

// Remembers which account has already had its full history projected into daily_results, so the
// backfill runs once per account rather than on every app start.
const BACKFILL_KEY = 'cifri_daily_backfill_v1';

const LS_KEY = 'cifri_react_v1';

function freshDb() {
  return {
    easy: { sessions: [], best: 0, lastDay: null },
    medium: { sessions: [], best: 0, lastDay: null },
    hard: { sessions: [], best: 0, lastDay: null },
  };
}

function defaultState() {
  return {
    db: freshDb(),
    brState: { sessions: [], lastDay: null, bestTime: null, bestAge: null },
    streak: 0,
    streakCreditedForDay: null,
    streakRestoreAvailable: true,
    streakLastCheckedDay: null,
    pendingRestore: null,
    bestStreakEver: 0,
    // The one-shot Challenge boost earned by completing Braining. Holds the DAY the boost was
    // granted for, not a bare true/false — see BRAINING_SESSION_COMPLETE for why that difference
    // is what makes the boost expire on its own at midnight.
    brBoostDay: null,
    // What has been earned, and the running counts a few achievements are measured against.
    // The per-achievement booleans that used to live here are gone: `achievedLog` already says
    // whether a thing was earned, and a second copy of that fact could only ever disagree with
    // it. Saved data from before the change still carries them; nothing reads them any more.
    milestones: {
      // Streak lengths already celebrated, so a restore cannot replay them.
      streakShown: [],
      // Distinct calendar days the Trick of the Day was opened, and which tricks were practiced.
      trickCount: 0,
      tricksPracticedSet: [],
      // Not an achievement — the guard for the one-off "You've lit a streak!" conversion prompt.
      firstStreakLit: false,
      // The single source of truth: achievement keys, in the order they were earned.
      achievedLog: [],
    },
    // Per-trick progress, keyed "gi-ti". Practice and Test are counted separately because they
    // are different claims: practice says how much work went in, the Test says the trick is done.
    // Only COMPLETED sessions count — walking out after three questions is not an attempt.
    trickStats: {
      practiceDone: {},
      testDone: {},
      testPassed: [],
    },
    settings: { sound: true, dark: null, fontSize: 'medium', lang: null },
    selDiff: 'easy',
    chRange: 7,
    brChartRange: 7,
    brChartType: 'age',
    // Last calendar day the Trick of the Day card was opened. Drives both the card's
    // yellow→green styling and the "distinct days viewed" count behind Trick Explorer.
    totdLastViewed: null,
    username: '',

    // ── Guest → account flow. Backed by real Supabase authentication. ──
    // `acctCreated` mirrors "there is a live Supabase session"; it is set from the session on
    // boot rather than being an independent source of truth.
    acctCreated: false,
    // No password field: under real authentication the app never holds one. Supabase stores
    // only a one-way encrypted version, and the current-password check at edit time is done by
    // signing in again rather than by comparing anything locally.
    acctData: { email: '', fullName: '' },
    guestConvoStarted: false,    // true from the moment the first conversion ask has been shown
    savePromptShown: false,      // the 5-day fallback prompt fires once, ever
    firstOpenDate: null,         // day the onboarding username screen was completed
    guestBannerLastShownDay: null, // caps the home-screen reminder banner to once per day
    anyGuestPromptDismissed: false, // true once a dedicated conversion prompt was dismissed
    tutorialShown: false,
    avatar: { type: 'letters', value: '', color: 'green', size: 55, customized: false },
  };
}

// Lazy initializer for useReducer — reads localStorage synchronously so the very first render
// already has the correct persisted data. This avoids a mount-effect race where the persist
// effect could fire (and overwrite localStorage with blank defaults) before an async hydrate
// dispatch had actually been applied to state.
function loadInitialState() {
  const base = defaultState();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      Object.assign(base, parsed);
    }
  } catch (e) {
    /* ignore corrupt storage */
  }
  return base;
}

function isRecordedSession(s) {
  return s.real === true || typeof s.real === 'undefined';
}

function chDoneToday(db) {
  const t = dayKey();
  return ['easy', 'medium', 'hard'].some((d) => db[d].lastDay === t);
}
function brDoneToday(brState) {
  return brState.lastDay === dayKey();
}
function todayDone(db, d) {
  return db[d].lastDay === dayKey();
}
function chCompletedOnDate(db, dateStr) {
  return ['easy', 'medium', 'hard'].some((d) =>
    (db[d].sessions || []).some((s) => s.date === dateStr && isRecordedSession(s))
  );
}
function brCompletedOnDate(brState, dateStr) {
  return (brState.sessions || []).some((s) => s.date === dateStr && isRecordedSession(s));
}

// A reached streak length either has a catalogue entry — 7, 14, 30, 60, 90, 180, 365 — or it does
// not, and the two cases produce different cards. The ladder ends at 365 because that is where the
// reward icons end, but the streak itself keeps hitting a threshold every 30 days forever, and
// those later ones still deserve their moment. They get an ad-hoc card carrying the day count
// instead of a catalogue key, so they celebrate without claiming to unlock anything.
function cardForStreak(threshold) {
  const key = streakAchievementKey(threshold);
  if (key) return { key };
  return { icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: threshold } };
}

// Records one achievement as earned, once. The earned log is the only thing consulted, which is
// what let the per-achievement booleans this used to keep go away: with 59 of them, a parallel
// flag for each was 59 more chances for the flag and the log to disagree about the same fact.
//
// `m.achievedLog` must already be a copy — every caller clones it before touching it.
function earn(m, unlocked, key) {
  if (m.achievedLog.indexOf(key) !== -1) return false;
  m.achievedLog.push(key);
  unlocked.push({ key });
  return true;
}

function checkStreakMilestonesPure(lang, milestones, prevStreak, newStreak) {
  const unlocked = [];
  const nextMilestones = { ...milestones, streakShown: [...milestones.streakShown], achievedLog: [...milestones.achievedLog] };
  if (newStreak > prevStreak) {
    for (let n = prevStreak + 1; n <= newStreak; n++) {
      const thr = streakMilestoneThreshold(n);
      if (thr && nextMilestones.streakShown.indexOf(thr) === -1) {
        nextMilestones.streakShown.push(thr);
        // Only thresholds the catalogue knows about are recorded as earned. Asking the catalogue
        // rather than testing `thr <= 90` is what let the ladder grow to 365 without this line
        // needing to know it had.
        const key = streakAchievementKey(thr);
        if (key && nextMilestones.achievedLog.indexOf(key) === -1) {
          nextMilestones.achievedLog.push(key);
        }
        unlocked.push(cardForStreak(thr));
      }
    }
  }
  return { milestones: nextMilestones, unlocked };
}

// Credits the day to the unified streak, as a pure helper shared by both modes.
// `chDone`/`brDone` must reflect the db/brState as they will be AFTER the session being
// recorded. Returns the streak-related fields to merge, plus any achievement cards unlocked.
//
// EITHER MODE EARNS THE DAY. This used to require both, and the change to `||` below is the
// whole of the loosened rule on the earning side. Doing both modes is still the better day —
// it is what lights the header pill yellow and what grants the Challenge boost — but it is no
// longer what the streak asks for.
//
// Playing the second mode afterwards cannot bank the day twice: the `streakCreditedForDay`
// guard is what makes this safe to call from every counting session rather than only the
// first one of the day.
function applyStreakCredit(state, { chDone, brDone, milestones, lang }) {
  const today = dayKey();
  let unlocked = [];
  let nextMilestones = milestones;
  let nextStreak = state.streak;
  let nextStreakCreditedForDay = state.streakCreditedForDay;
  let nextStreakRestoreAvailable = state.streakRestoreAvailable;
  let nextBestStreakEver = state.bestStreakEver;
  let nextGuestConvoStarted = state.guestConvoStarted;
  const prevStreak = state.streak;
  let justCredited = false;

  if (state.streakCreditedForDay !== today && (chDone || brDone)) {
    const wasZero = state.streak === 0;
    const neverLitBefore = state.bestStreakEver === 0;
    nextStreak = (state.streak || 0) + 1;
    nextStreakCreditedForDay = today;
    if (nextStreak > nextBestStreakEver) nextBestStreakEver = nextStreak;
    if (wasZero) nextStreakRestoreAvailable = true;
    justCredited = true;
    // The dedicated first-ever "you've lit a streak" popup — separate from the recurring
    // 7/14/30-day thresholds. This is also the moment guest-conversion nudging begins: from
    // here every achievement popup carries the CTA until a real account exists. Skipped
    // entirely when an account already exists, matching the reference's guard.
    if (neverLitBefore && !nextMilestones.firstStreakLit && !state.acctCreated) {
      nextMilestones = {
        ...nextMilestones,
        firstStreakLit: true,
        achievedLog: [...nextMilestones.achievedLog, 'streak_lit'],
      };
      nextGuestConvoStarted = true;
      unlocked.push({ icon: 'flame', nameKey: 'ms_streaklit_name', descKey: 'ms_streaklit_desc', cta: true });
    }
  }

  const streakResult = checkStreakMilestonesPure(lang, nextMilestones, prevStreak, nextStreak);
  nextMilestones = streakResult.milestones;
  unlocked = unlocked.concat(streakResult.unlocked);

  return {
    milestones: nextMilestones,
    unlocked,
    justCredited,
    streak: nextStreak,
    streakCreditedForDay: nextStreakCreditedForDay,
    streakRestoreAvailable: nextStreakRestoreAvailable,
    bestStreakEver: nextBestStreakEver,
    guestConvoStarted: nextGuestConvoStarted,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, ...action.payload };

    case 'SET_SEL_DIFF':
      return { ...state, selDiff: action.diff };

    case 'SET_CH_RANGE':
      return { ...state, chRange: action.range };

    // ── Guest → account flow (real Supabase auth; the network calls themselves live in
    // src/lib/accountApi.js — this reducer only records their outcome) ──

    // Onboarding finished: the guest experience starts here, which is what the 5-day fallback
    // prompt counts from. The tutorial only ever shows on this very first completion.
    case 'ONBOARDING_FINISH':
      return {
        ...state,
        _loggedOut: false,
        username: action.username,
        firstOpenDate: state.firstOpenDate || dayKey(),
        tutorialShown: true,
        _showTutorial: !state.tutorialShown,
      };

    case 'TUTORIAL_DONE':
      return { ...state, _showTutorial: false };

    // A real account was loaded — either just logged into, or found already signed in at app
    // start. `synced` is the progress downloaded from the server and has already been filtered
    // through SYNCED_KEYS, so it can only ever contain known game/settings keys.
    //
    // The server's copy wins over whatever is on the device. That is what makes "play on any
    // device" mean anything: the account's history is the truth, and a second phone adopts it
    // rather than competing with it.
    case 'ACCOUNT_LOADED':
      return {
        ...state,
        ...action.synced,
        _loggedOut: false,
        _showTutorial: false,
        username: action.username,
        avatar: action.avatar || state.avatar,
        acctData: { email: action.email, fullName: action.fullName },
        acctCreated: true,
        tutorialShown: true,
        firstOpenDate: action.synced.firstOpenDate || state.firstOpenDate || dayKey(),
      };

    // Signup succeeded. Every bit of existing local data stays exactly as it is — it has just
    // been uploaded to the new account, so device and server already agree.
    case 'ACCOUNT_CREATED':
      return {
        ...state,
        username: action.username,
        acctData: { email: action.email, fullName: action.fullName },
        acctCreated: true,
      };

    case 'ACCOUNT_EDIT':
      return {
        ...state,
        username: action.username,
        // The email is deliberately NOT updated here. Supabase only changes it once the player
        // clicks the link sent to the new address, so showing the new one immediately would be
        // claiming something that has not happened yet.
        acctData: { ...state.acctData, fullName: action.fullName },
      };

    // The confirmed email finally landing, read back from the session.
    case 'ACCOUNT_EMAIL_CONFIRMED':
      return { ...state, acctData: { ...state.acctData, email: action.email } };

    // Backing out of a dedicated conversion ask. From here on nudges switch to the small
    // occasional banner rather than another full-screen prompt.
    case 'GUEST_PROMPT_DISMISSED':
      return { ...state, anyGuestPromptDismissed: true };

    // The 5-day fallback prompt: fires once ever, and counts as the first ask, so later
    // achievements start carrying the CTA.
    case 'SAVE_PROMPT_SHOWN':
      return { ...state, savePromptShown: true, guestConvoStarted: true };

    case 'DISMISS_GUEST_BANNER':
      return { ...state, guestBannerLastShownDay: dayKey() };

    // Logging out keeps all local progress — only the "logged in" status changes — and reopens
    // a fresh conversion cycle. The player lands back on the onboarding screen with their
    // username prefilled, so continuing as the same guest is one tap away, and logging back in
    // is reachable from the same screen.
    //
    // The real session has already been ended by the time this runs, so the retained progress
    // is a local copy only: it is no longer being synced anywhere, and logging in as anyone
    // else replaces it outright with that account's own history.
    case 'ACCOUNT_SIGNED_OUT':
      return {
        ...state,
        acctCreated: false,
        guestConvoStarted: false,
        _loggedOut: true,
        acctData: { email: '', fullName: '' },
      };

    case 'SET_AVATAR':
      return { ...state, avatar: { ...action.avatar, customized: true } };

    case 'SET_SETTING':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };

    case 'SET_BR_CHART_RANGE':
      return { ...state, brChartRange: action.range };

    case 'SET_BR_CHART_TYPE':
      return { ...state, brChartType: action.chartType };

    // Opening the Trick of the Day card. Only the first open on a given calendar day counts,
    // which is what makes Trick Explorer a "10 distinct days" achievement rather than 10 taps.
    case 'VIEW_TRICK_OF_DAY': {
      const today = dayKey();
      if (state.totdLastViewed === today) return { ...state, _lastTrickUnlocked: null };
      const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
      const unlocked = [];
      m.trickCount = (m.trickCount || 0) + 1;
      if (m.trickCount >= 10) earn(m, unlocked, 'trick_explorer');
      // Curious Mind wants every trick of the day seen at least once. The trick of the day cycles
      // through the library in order, one per day, so seeing as many distinct days as there are
      // tricks is the same thing as having seen them all — `action.total` is the library size.
      if (action.total > 0 && m.trickCount >= action.total) earn(m, unlocked, 'tr_curious');
      return { ...state, totdLastViewed: today, milestones: m, _lastTrickUnlocked: { reqId: action.reqId, unlocked } };
    }

    // Opening a trick via "Practice this trick" counts it as practiced. Once every trick in the
    // library has been practiced at least once, Trick Master unlocks.
    case 'PRACTICE_TRICK': {
      const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
      const set = [...(m.tricksPracticedSet || [])];
      const key = action.gi + '-' + action.ti;
      if (set.indexOf(key) === -1) set.push(key);
      m.tricksPracticedSet = set;
      const unlocked = [];
      // The ladder of distinct tricks practiced: the first one, five of them, then all of them.
      earn(m, unlocked, 'tr_first');
      if (set.length >= 5) earn(m, unlocked, 'tr_halfway');
      if (action.total > 0 && set.length >= action.total) earn(m, unlocked, 'trick_master');
      return { ...state, milestones: m, _lastTrickUnlocked: { reqId: action.reqId, unlocked } };
    }

    // A finished 20-question practice drill on one trick. Counted on COMPLETION, not on opening
    // the screen — starting something is not an attempt at it, and counting starts would make the
    // number next to the button a measure of curiosity rather than of work.
    case 'TRICK_PRACTICE_COMPLETE': {
      const key = action.gi + '-' + action.ti;
      const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
      const unlocked = [];
      const stats = state.trickStats || { practiceDone: {}, testDone: {}, testPassed: [] };
      const practiceDone = { ...stats.practiceDone, [key]: (stats.practiceDone[key] || 0) + 1 };
      // Clean Sweep: every question in the drill answered right first time.
      if (action.total > 0 && action.firstTryCorrect >= action.total) earn(m, unlocked, 'tr_clean_sweep');
      return {
        ...state,
        milestones: m,
        trickStats: { ...stats, practiceDone },
        _lastTrickUnlocked: { reqId: action.reqId, unlocked },
      };
    }

    // A finished Test. Passing is 16 of 20 answered right first time; the pass is recorded once
    // and never taken away, so a worse retake cannot un-graduate a trick.
    case 'TRICK_TEST_COMPLETE': {
      const key = action.gi + '-' + action.ti;
      const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
      const unlocked = [];
      const stats = state.trickStats || { practiceDone: {}, testDone: {}, testPassed: [] };
      const testDone = { ...stats.testDone, [key]: (stats.testDone[key] || 0) + 1 };
      const testPassed = [...(stats.testPassed || [])];
      if (action.passed && testPassed.indexOf(key) === -1) testPassed.push(key);
      if (action.passed) {
        earn(m, unlocked, 'tr_first_exam');
        if (action.total > 0 && testPassed.length >= action.totalTricks) {
          earn(m, unlocked, 'tr_graduation');
        }
      }
      return {
        ...state,
        milestones: m,
        trickStats: { ...stats, testDone, testPassed },
        _lastTrickUnlocked: { reqId: action.reqId, unlocked },
      };
    }

    case 'SET_USERNAME':
      return { ...state, username: action.username };

    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case 'CHECK_STREAK_BREAK': {
      const today = dayKey();
      if (state.streakLastCheckedDay === today) return state;
      let next = { ...state, streakLastCheckedDay: today };

      // First check of a new day, so any boost still sitting here belongs to a day that is over.
      // Clearing it is housekeeping, not the safety mechanism: what actually stops a stale boost
      // being spent is that it is compared against today's date at the moment it would be used,
      // which holds even if the app is left open across midnight and this never runs.
      if (state.brBoostDay && state.brBoostDay !== today) next.brBoostDay = null;

      if (state.streak > 0 && state.streakCreditedForDay) {
        const breakDay = addDaysStr(state.streakCreditedForDay, 1);
        if (today > breakDay) {
          const wasCh = chCompletedOnDate(state.db, breakDay);
          const wasBr = brCompletedOnDate(state.brState, breakDay);
          // A day with EITHER mode played keeps the streak alive. Only a day with nothing at all
          // breaks it, so there is no longer a reason to record: every break has the same cause,
          // and the modal simply says so. (The field that used to carry it is gone rather than
          // pinned to a constant — a stored value nobody can vary is a value nobody should read.)
          if (!(wasCh || wasBr)) {
            next = {
              ...next,
              pendingRestore: {
                brokenValue: state.streak,
                brokenAtMs: dateStrToDate(addDaysStr(breakDay, 1)).getTime(),
                availableAtBreak: state.streakRestoreAvailable,
              },
              streak: 0,
            };
          }
        }
      }
      return next;
    }

    case 'STREAK_RESTORE': {
      if (!state.pendingRestore || !state.pendingRestore.availableAtBreak) return state;
      const streak = state.pendingRestore.brokenValue;
      return {
        ...state,
        streak,
        streakCreditedForDay: yesterday(),
        streakRestoreAvailable: false,
        bestStreakEver: Math.max(state.bestStreakEver, streak),
        pendingRestore: null,
      };
    }

    case 'STREAK_START_OVER':
      return { ...state, streak: 0, streakCreditedForDay: null, pendingRestore: null };

    // The restore offer expires 24 hours after the break — once the window closes it is gone
    // for good, and the modal is never shown.
    case 'STREAK_RESTORE_EXPIRE':
      if (!state.pendingRestore) return state;
      return { ...state, pendingRestore: null };

    // Records a completed Challenge session (real trial or practice) and runs every piece of
    // derived state that the reference app's endGame() touches: best score, streak crediting,
    // and achievement unlocks. Returns the unlocked-achievements list via action.onUnlocked.
    case 'CHALLENGE_SESSION_COMPLETE': {
      const { diff, score, isPrac, correct, wrong, lang } = action;
      const today = dayKey();

      // The reference only records into db when there is a difficulty AND a non-zero score
      // (`if(cur.diff&&sc>0)`). The standalone Practice tab has no difficulty, so its runs are
      // never stored and never touch streaks, bests or achievements — just show a result.
      if (!diff || score <= 0) {
        return {
          ...state,
          _lastSessionResult: {
            reqId: action.reqId,
            diff, score, correct, wrong, isPrac,
            // Same shape as a recorded run, so anything reading a result never has to ask which
            // path produced it. Nothing was boosted here — this run is not being recorded at all.
            rawScore: score, boosted: false,
            origin: action.origin,
            opTimes: action.opTimes,
            breakdown: action.breakdown,
            isNewBest: false, unlocked: [],
          },
        };
      }

      const d = state.db[diff];

      // ── Spending the Braining boost ──────────────────────────────────────────────
      //
      // `brBoostDay` holds the day a boost was granted for. Comparing it against today is what
      // gives the boost its lifetime for free: a value left over from yesterday is simply not
      // equal to today, so it can never be spent, and there is no midnight timer that could fail
      // to fire. It is also a single field holding a single date, which is why boosts cannot
      // stack — a second Braining run that day re-grants nothing.
      //
      // Two guards sit in the position of this code rather than in its condition. `isPrac` keeps
      // a standalone Practice run from burning it. And the `score <= 0` early return above means
      // a run that scored nothing has already left this reducer, so it cannot spend a boost on a
      // zero either.
      const boostSpent = !isPrac && state.brBoostDay === today;
      const countedScore = boostSpent ? applyBrainingBoost(score) : score;
      const nextBrBoostDay = boostSpent ? null : state.brBoostDay;

      // EVERY Challenge play counts now. There is no longer a first-trial-only rule and no
      // practice mode on this screen, so a run is recorded unless it came from the standalone
      // Practice tab. Each recorded score becomes one more term in today's average — which is
      // computed where it is read (see dayAverage in store/selectors.js), not stored here, so
      // there is no second copy of the day's score that could fall out of step with the sessions
      // it is supposed to summarise.
      //
      // `score` on the entry is the value that counts, boosted or not, so every existing reader —
      // the average, the chart, the projection — picks the boost up without having to know it
      // exists. A boosted entry additionally carries the two things that make the boost provable
      // rather than merely asserted: `rawScore`, the number actually earned in the run, and
      // `boosted`, saying plainly that this specific attempt is the one that consumed the day's
      // boost. Given both, the boost can be recalculated and checked by anything reading the
      // history back — which is what next session's server-side validation will do.
      //
      // `ts` is stamped on every entry, boosted or not. Challenge and Braining sessions live in
      // separate lists, so without a wall-clock time on each there is no way to prove after the
      // fact that the boosted attempt came AFTER the Braining trial that granted it, rather than
      // being applied backwards to a run that was already finished.
      const entry = { date: today, score: countedScore, real: !isPrac, ts: Date.now() };
      if (boostSpent) {
        entry.rawScore = score;
        entry.boosted = true;
      }
      const newSessions = [...d.sessions, entry];

      // Untouched by the averaging, deliberately: personal best has always been the best single
      // run, and a day's average being dragged down by a bad replay must not cost a player the
      // record they actually set. It reads the counted score, so a boosted run can set a record —
      // the boosted number is that attempt's score everywhere, not a separate parallel figure.
      const prevBest = d.best;
      const newBest = countedScore > prevBest ? countedScore : prevBest;

      const newDb = {
        ...state.db,
        [diff]: {
          ...d,
          sessions: newSessions,
          best: newBest,
          // Stamped on the first counting play and then left alone. This is what `todayDone`
          // reads, so it now means exactly "has played Challenge today" — which is both the
          // green-styling condition and the streak condition.
          lastDay: !isPrac ? today : d.lastDay,
        },
      };

      let unlocked = [];
      let nextMilestones = state.milestones;
      let nextStreak = state.streak;
      let nextStreakCreditedForDay = state.streakCreditedForDay;
      let nextStreakRestoreAvailable = state.streakRestoreAvailable;
      let nextBestStreakEver = state.bestStreakEver;
      let nextGuestConvoStarted = state.guestConvoStarted;
      let isNewBest = false;

      if (!isPrac) {
        isNewBest = countedScore > prevBest;

        // checkChallengeMilestones
        //
        // Every condition below reads how the run was PLAYED — how many questions were answered,
        // how many were wrong, which difficulty was chosen. Not one of them reads the score, and
        // that is deliberate rather than incidental: it is what makes a boosted score unable to
        // unlock anything a raw score could not. Perfect Run is still ten answers with none
        // wrong; Medium and Hard are still the tier actually played. Keep it that way — an
        // achievement that keyed off the score number would start firing on the boost.
        //
        // The three score-based achievements the spreadsheet adds (To the Peak/Sky/Moon) are the
        // deliberate exception and are NOT wired here yet — they need the raw score, not the
        // boosted one, or the boost would buy them.
        const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
        earn(m, unlocked, 'ch_first');
        const total = correct + wrong;
        if (total >= 10 && wrong === 0) earn(m, unlocked, 'ch_perfect');
        if (diff === 'easy') earn(m, unlocked, 'ch_easy');
        if (diff === 'medium') earn(m, unlocked, 'ch_medium');
        if (diff === 'hard') earn(m, unlocked, 'ch_hard');
        if (diff === 'hard' && total >= 10 && wrong === 0) earn(m, unlocked, 'ch_perfect_hard');
        // Speed Demon is a plain count of correct answers inside the fixed 60-second Challenge.
        // It cannot be reached from the Practice tab, which never gets here (`isPrac`).
        if (correct >= 20) earn(m, unlocked, 'ch_speed_demon');
        nextMilestones = m;

        // A single Challenge play now earns the day outright — Braining is no longer needed
        // alongside it — so this runs on every counting play rather than only the first on this
        // difficulty. It does not need the first-play-of-the-day gate it used to have — that flag
        // has since been deleted, nothing being left that read it — because applyStreakCredit is
        // guarded on `streakCreditedForDay`, so the second, fifth and fiftieth play of the day all
        // find the day already banked and change nothing.
        const credit = applyStreakCredit(state, {
          chDone: true, // this session is what makes Challenge done today
          brDone: brDoneToday(state.brState),
          milestones: nextMilestones,
          lang,
        });
        nextMilestones = credit.milestones;
        unlocked = unlocked.concat(credit.unlocked);
        nextStreak = credit.streak;
        nextStreakCreditedForDay = credit.streakCreditedForDay;
        nextStreakRestoreAvailable = credit.streakRestoreAvailable;
        nextBestStreakEver = credit.bestStreakEver;
        nextGuestConvoStarted = credit.guestConvoStarted;
      }

      return {
        ...state,
        db: newDb,
        brBoostDay: nextBrBoostDay,
        guestConvoStarted: nextGuestConvoStarted,
        milestones: nextMilestones,
        streak: nextStreak,
        streakCreditedForDay: nextStreakCreditedForDay,
        streakRestoreAvailable: nextStreakRestoreAvailable,
        bestStreakEver: nextBestStreakEver,
        _lastSessionResult: {
          reqId: action.reqId,
          diff,
          // The score this run counted for, which is the boosted number when it was boosted.
          score: countedScore,
          // Carried alongside so the result screen can eventually break the number down instead
          // of presenting it as one unexplained figure. Nothing displays them yet.
          rawScore: score,
          boosted: boostSpent,
          correct, wrong, isPrac,
          origin: action.origin,
          opTimes: action.opTimes,
          // Where the raw score came from, question by question, as tallied while it was earned.
          // The result screen turns this into the visible breakdown; `rawScore` and `boosted`
          // above are what let it show the boost as its own line.
          breakdown: action.breakdown,
          isNewBest, unlocked,
        },
      };
    }

    // Mirrors the reference's brFinish(): records the session, updates best time/age, credits
    // the unified streak, and collects achievement unlocks.
    case 'BRAINING_SESSION_COMPLETE': {
      const { sec, age, isPrac, lang } = action;
      const today = dayKey();
      const br = state.brState;
      const sessions = br.sessions || [];

      let isFirst = false;
      let isPR = false;
      let nextBr;
      let unlocked = [];
      let nextMilestones = state.milestones;
      let nextStreak = state.streak;
      let nextStreakCreditedForDay = state.streakCreditedForDay;
      let nextStreakRestoreAvailable = state.streakRestoreAvailable;
      let nextBestStreakEver = state.bestStreakEver;
      let nextGuestConvoStarted = state.guestConvoStarted;
      let nextBrBoostDay = state.brBoostDay;

      if (!isPrac) {
        isFirst = br.lastDay !== today;
        if (isFirst) {
          // ── Granting the Challenge boost ────────────────────────────────────────
          //
          // Only the day's counting trial grants it. A retry below, and a practice run further
          // down, both leave this alone — so finishing Braining five times cannot hand out five
          // boosts, and neither can it hand out a second one after the first has been spent.
          //
          // What is stored is the DAY, not a bare `true`. That one decision is what gives the
          // boost its expiry: whoever spends it compares this against today's date, so a boost
          // left unspent is dead the moment the date rolls over, with nothing needing to run at
          // midnight to kill it. Carrying over to tomorrow is not a case that has to be
          // prevented — it is a case that cannot be expressed.
          nextBrBoostDay = today;

          const bestTime = br.bestTime === null || sec < br.bestTime ? sec : br.bestTime;
          if (br.bestTime === null || sec < br.bestTime) isPR = true;
          const bestAge = br.bestAge === null || age < br.bestAge ? age : br.bestAge;
          nextBr = {
            ...br,
            // `ts` pairs with the one stamped on Challenge attempts: it is what lets a boosted
            // attempt be shown to have come after the trial that granted the boost.
            sessions: [...sessions, { date: today, time: sec, age, real: true, ts: Date.now() }],
            todayTime: sec, todayAge: age,
            bestTime, bestAge,
            prevDay: today, lastDay: today,
          };
        } else {
          // A retry after today's trial is already logged: it can still quietly improve the
          // stored personal best, but never re-credits the day.
          let bestTime = br.bestTime, bestAge = br.bestAge;
          if (br.bestTime !== null && sec < br.bestTime) {
            isPR = true;
            bestTime = sec;
            bestAge = Math.min(br.bestAge === null ? age : br.bestAge, age);
          }
          nextBr = {
            ...br,
            sessions: [...sessions, { date: today, time: sec, age, real: false, ts: Date.now() }],
            bestTime, bestAge,
          };
        }

        // ── The Braining achievements ────────────────────────────────────────
        //
        // Every condition here reads how the session was PLAYED — its time, its result, whether
        // any answer was missed — so a retry earns exactly what a first trial would for the same
        // performance. That is why these sit outside the `isFirst` branch: the day's counting
        // trial is what moves the streak and the boost, but a personal best set on a retry is
        // still a personal best.
        const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
        earn(m, unlocked, 'br_first');
        if (sec < 240) earn(m, unlocked, 'br_sub4');
        if (sec < 180) earn(m, unlocked, 'br_sub3');
        if (age <= 20) earn(m, unlocked, 'br_age20');
        // Braining makes you correct every wrong answer before moving on, so "zero wrong" means
        // no question was ever missed on the first attempt — not merely that you finished.
        if (action.wrong === 0) earn(m, unlocked, 'br_flawless');
        // `br` is the history as it stood BEFORE this session, so the trial that sets the
        // baseline can never be the one that clears it. See isSharperEveryDay for the tiers.
        if (isSharperEveryDay(br, age)) earn(m, unlocked, 'br_sharper');
        // These two read the history WITH this session folded in, because they are about totals.
        if (brainAge20Count(nextBr) >= 5) earn(m, unlocked, 'br_steady');
        if ((nextBr.sessions || []).filter(isRecordedSession).length >= 50) earn(m, unlocked, 'br_half_century');
        nextMilestones = m;

        if (isFirst) {
          // Braining alone now earns the day, so this credits the streak whether or not
          // Challenge has been played — `chDone` no longer has to be true for the day to count.
          const credit = applyStreakCredit(state, {
            chDone: chDoneToday(state.db),
            brDone: true, // this session is what makes Braining done today
            milestones: nextMilestones,
            lang,
          });
          nextMilestones = credit.milestones;
          unlocked = unlocked.concat(credit.unlocked);
          nextStreak = credit.streak;
          nextStreakCreditedForDay = credit.streakCreditedForDay;
          nextStreakRestoreAvailable = credit.streakRestoreAvailable;
          nextBestStreakEver = credit.bestStreakEver;
          nextGuestConvoStarted = credit.guestConvoStarted;
        }
      } else {
        // Practice: recorded as non-counting, but may still improve the stored best. It grants
        // no boost — `nextBrBoostDay` is untouched on this path — because the boost is the
        // reward for the day's real trial, not for opening the practice mode.
        const bestTime = br.bestTime === null || sec < br.bestTime ? sec : br.bestTime;
        const bestAge = br.bestAge === null || age < br.bestAge ? age : br.bestAge;
        nextBr = {
          ...br,
          sessions: [...sessions, { date: today, time: sec, age, real: false, ts: Date.now() }],
          bestTime, bestAge,
        };
      }

      return {
        ...state,
        brState: nextBr,
        brBoostDay: nextBrBoostDay,
        guestConvoStarted: nextGuestConvoStarted,
        milestones: nextMilestones,
        streak: nextStreak,
        streakCreditedForDay: nextStreakCreditedForDay,
        streakRestoreAvailable: nextStreakRestoreAvailable,
        bestStreakEver: nextBestStreakEver,
        _lastBrResult: {
          reqId: action.reqId,
          sec, age, isPrac, isFirst, isPR,
          opTimes: action.opTimes,
          unlocked,
        },
      };
    }

    default:
      return state;
  }
}

const AppStateStoreContext = createContext(null);

export function AppStateProvider({ children }) {
  // State is already correctly hydrated from localStorage by the time of the first render
  // (see loadInitialState above) — no separate async hydrate step, so there's no window where
  // a persist effect could run against stale/blank state and clobber saved data.
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const didInit = useRef(false);

  // Runs once on mount: fills in device-default dark-mode/language only if this is a genuinely
  // first-ever load (no saved choice yet), and settles any streak break that happened while the
  // app was closed. Guarded so React StrictMode's dev-only double-invoke doesn't run it twice.
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const settingsPatch = {};
    if (typeof state.settings.dark !== 'boolean') {
      settingsPatch.dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    if (typeof state.settings.lang !== 'string') {
      const deviceLang = (navigator.language || (navigator.languages && navigator.languages[0]) || 'en').toLowerCase();
      settingsPatch.lang = deviceLang.indexOf('ru') === 0 ? 'ru' : 'en';
    }
    if (Object.keys(settingsPatch).length) {
      dispatch({ type: 'SET_SETTINGS', settings: settingsPatch });
    }
    dispatch({ type: 'CHECK_STREAK_BREAK' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change. localStorage stays the primary store even when signed in — the
  // app must keep working offline, and the server copy is a mirror of it, not a replacement.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore quota errors */
    }
  }, [state]);

  // ── Account sync ─────────────────────────────────────────────────────────────
  //
  // `ready` gates uploading. It is false until we know the server's copy, which is what stops
  // the worst possible bug here: a signed-in player opening the app on a second device and
  // uploading that device's empty state over their real history before the download lands.
  const sync = useRef({ ready: false, lastPushed: null, uid: null });
  const [syncRetry, setSyncRetry] = useState(0);

  // The startup effect below runs once and closes over the state as it was at mount. It needs to
  // ask what the state is NOW, so it can tell whether this device is carrying unsynced progress.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Adopt an existing session at startup, and follow it if it ends elsewhere (token expiry, or
  // logging out in another tab).
  useEffect(() => {
    let cancelled = false;

    async function adopt() {
      const session = await getSession();
      const res = await fetchAccount();
      if (cancelled || !res.ok || !res.profile) return;
      const uid = session ? session.user.id : null;

      // Does this device hold progress the server has never received? That is precisely the case
      // where adopting the server's copy would destroy it — playing offline, then reconnecting.
      //
      // Only true when this device has synced with THIS account before AND the local state has
      // moved on since. On a phone logging in for the first time there is no baseline, so the
      // server still wins and picking up an account on a new device works exactly as it did.
      const baseline = uid ? readBaseline(uid) : null;
      const deviceIsAhead =
        baseline !== null && fingerprint(toSyncPayload(stateRef.current)) !== baseline;

      dispatch({
        type: 'ACCOUNT_LOADED',
        username: res.profile.username,
        email: res.email,
        fullName: res.profile.full_name || '',
        avatar: res.profile.avatar,
        // The profile above (name, avatar) is always taken from the server. Only the PROGRESS is
        // withheld when this device is ahead — an empty patch leaves the local history intact.
        synced: deviceIsAhead ? {} : res.syncedState,
      });
      // The downloaded state may have last been checked on an earlier day, on another device.
      // Re-running the break check is a no-op if it has already run today.
      dispatch({ type: 'CHECK_STREAK_BREAK' });
      if (deviceIsAhead) {
        // Nothing on the server matches what is on this device, so treat everything here as
        // unsent. The sync effect below then uploads it, which is how the offline session gets
        // to the account instead of being rolled back.
        sync.current.lastPushed = null;
      } else {
        sync.current.lastPushed = res.hasRemoteState ? res.syncedState : null;
        // Just downloaded, so the server's contents are known — safe to record as the baseline.
        if (uid && res.hasRemoteState) writeBaseline(uid, res.syncedState);
      }
      sync.current.ready = true;
      sync.current.uid = uid;
      // From here, attempts belong to this account. Set immediately rather than waiting for the
      // bootstrap effect below, so nothing logged during startup is misattributed as guest data.
      if (uid) setLogOwner(uid);
    }

    getSession().then((session) => {
      if (!cancelled && session) adopt();
    });

    const unsubscribe = onAuthChange((event) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        sync.current.ready = false;
        sync.current.lastPushed = null;
        // Anything played from now on is guest data again. Rows already queued keep the previous
        // owner, so they can never be handed to whoever signs in next.
        setLogOwner(null);
        bootstrap.current.doneFor = null;
        sync.current.uid = null;
        clearBaseline();
      }
      // A session that appears after startup — most importantly the one a password-reset link
      // creates, since that URL is parsed asynchronously and usually lands after this effect has
      // already run. Without this the app would not realise the player is signed in until they
      // reloaded. Guarded on `ready` so the ordinary login and signup paths, which have already
      // loaded the account themselves, do not repeat the work.
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        if (!sync.current.ready) adopt();
      }
      // USER_UPDATED fires when a pending email change is finally confirmed.
      if (event === 'USER_UPDATED') {
        getSession().then((s) => {
          if (!cancelled && s) dispatch({ type: 'ACCOUNT_EMAIL_CONFIRMED', email: s.user.email });
        });
      }
    });

    return () => { cancelled = true; unsubscribe(); };
  }, []);

  // Upload progress whenever it changes. Debounced, because a finished game updates several
  // fields at once and there is no reason to send five near-identical writes.
  useEffect(() => {
    if (!state.acctCreated || !sync.current.ready) return;
    const payload = toSyncPayload(state);
    if (sameSyncPayload(payload, sync.current.lastPushed)) return;

    const id = setTimeout(async () => {
      const res = await pushPlayerState(payload);
      if (res.ok) {
        sync.current.lastPushed = payload;
        // The upload is confirmed, so this is now genuinely what the server holds. Recorded here
        // and nowhere optimistic, so the baseline can never claim a sync that did not happen.
        if (sync.current.uid) writeBaseline(sync.current.uid, payload);
        // The normalized mirror of what was just saved. Only today's rows: earlier days are
        // already stored and cannot change. Upserted on the primary key, so this repeats
        // harmlessly all day rather than accumulating rows.
        pushDailyResults(projectDailyRows(state, { todayOnly: true }));
      } else {
        // Leave lastPushed alone so this payload is still considered unsent, and nudge the
        // effect to run again. Progress is already safe in localStorage either way — a failed
        // upload delays the copy on the server, it never loses anything on the device.
        setTimeout(() => setSyncRetry((n) => n + 1), 15000);
      }
    }, 1500);
    return () => clearTimeout(id);
  }, [state, syncRetry]);

  // Mobile browsers can discard a backgrounded tab without warning, which would strand the
  // 1.5s debounce above. Flush immediately when the app is hidden instead.
  useEffect(() => {
    function flush() {
      if (document.visibilityState !== 'hidden') return;
      if (!state.acctCreated || !sync.current.ready) return;
      const payload = toSyncPayload(state);
      if (sameSyncPayload(payload, sync.current.lastPushed)) return;
      sync.current.lastPushed = payload;
      pushPlayerState(payload).then((res) => {
        if (!res.ok) sync.current.lastPushed = null; // unsent after all — let the retry catch it
      });
    }
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
  }, [state]);

  // ── Once-per-account bootstrap ───────────────────────────────────────────────
  //
  // Two jobs that must happen however the account arrived — adopted at startup, freshly signed
  // up, or just logged in. Those three paths do not share a code route, but they all end with
  // `acctCreated` true and sync ready, so this watches for that state instead of hooking each
  // one and hoping none is ever missed.
  //
  // It reads `state` at the moment it runs, which is what makes it correct for signup (the
  // guest's own history, just uploaded) and for login (the account's history, just downloaded)
  // without either case needing to pass a snapshot in.
  const bootstrap = useRef({ busy: false, doneFor: null });
  useEffect(() => {
    if (!state.acctCreated || !sync.current.ready) return;
    if (bootstrap.current.doneFor || bootstrap.current.busy) return;
    bootstrap.current.busy = true;
    (async () => {
      try {
        const session = await getSession();
        const uid = session ? session.user.id : null;
        if (!uid) return;
        sync.current.uid = uid;
        setLogOwner(uid);

        // Everything queued on this device, including every question answered as a guest before
        // signing up — this is the only moment that history can reach an account.
        await flushOutbox();

        // Project the full history into daily_results, once. Past days cannot change, so from
        // here only the day in progress is rewritten (see the sync effect above).
        if (localStorage.getItem(BACKFILL_KEY) !== uid) {
          const out = await pushDailyResults(projectDailyRows(state, { todayOnly: false }));
          // Left unmarked on failure, so the next state change retries rather than skipping a
          // player's entire history for good.
          if (!out.ok) return;
          localStorage.setItem(BACKFILL_KEY, uid);
        }
        bootstrap.current.doneFor = uid;
      } finally {
        bootstrap.current.busy = false;
      }
    })();
  }, [state]);

  // Called by the account screens once a signup or login has completed, so uploading can begin
  // from a known-good baseline rather than guessing.
  const beginSync = useCallback((baseline) => {
    sync.current.lastPushed = baseline || null;
    sync.current.ready = true;
    // `baseline` is what the caller just confirmed the server holds — the payload signup uploaded,
    // or the state login downloaded. When it is null the server's contents are NOT known, so
    // nothing is recorded and the first successful push sets the baseline instead.
    getSession().then((s) => {
      if (!s) return;
      sync.current.uid = s.user.id;
      if (baseline) writeBaseline(s.user.id, baseline);
    });
  }, []);

  const value = useMemo(() => ({ state, dispatch, beginSync }), [state, beginSync]);

  return <AppStateStoreContext.Provider value={value}>{children}</AppStateStoreContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateStoreContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

export { chDoneToday, brDoneToday, todayDone, isRecordedSession };
