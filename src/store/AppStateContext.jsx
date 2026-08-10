import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { dayKey, yesterday, addDaysStr, dateStrToDate, daysBetweenKeys } from './dates.js';
import { ACHIEVEMENTS, streakAchievementKey, streakMilestoneThreshold } from './achievements.js';
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

export function defaultState() {
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

      // ── The counters below exist because nothing else in the app records these facts ──
      //
      // Everything above this line is derived from history the app already keeps. These are not:
      // a Challenge session stores a score but never how many questions produced it, a Practice
      // session is not stored at all, and the per-question log is an outbox whose rows are deleted
      // from the device once they reach the server. So the totals have to be counted as they
      // happen or they cannot be known at all.
      //
      // They live inside `milestones` rather than beside it because this whole object is already
      // in SYNCED_KEYS — which means they follow the player between devices for free, and a total
      // counted on a phone is not a different total from the one counted on a laptop.
      //
      // EVERY READER MUST TOLERATE THESE BEING ABSENT. Saved data written before today has a
      // `milestones` object without them, and loading replaces the default object wholesale rather
      // than merging into it, so `undefined` is a shape that really turns up.

      // Questions answered across every mode combined, and percentage questions answered
      // correctly. Both start from zero: play from before they existed cannot be recovered.
      qTotal: 0,
      pctCorrect: 0,
      // Operation types tried in Practice, ever. Same idea as tricksPracticedSet.
      pracOpsSeen: [],
      // Last calendar day a Practice session, and a trick drill or test, was COMPLETED. Challenge
      // and Braining already carry their own `lastDay`; these two modes had nowhere to say when.
      pracLastDay: null,
      trickLastDay: null,
      // Has a streak ever actually been lost? A break is otherwise a passing event — it creates a
      // restore offer and then clears it — and New Record has to know it happened. Cleared again
      // if the break is restored, because a restored break did not stand.
      everBrokeStreak: false,
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

// Is there anything here worth protecting?
//
// Used by the download path below to tell "this device has a player's work on it" apart from
// "this device is blank". The distinction has to be made honestly in BOTH directions: a blank
// device must never trip the protection, because there is nothing on it to protect and refusing
// to adopt an account onto it would break picking up your history on a new phone — the whole
// reason accounts exist.
//
// It counts every kind of work, not only the kind that scores. A practice run, a trick drilled,
// an achievement earned and a streak lit are all things a person spent time on, and losing any of
// them is losing progress. Only view preferences and settings are ignored, because those are
// conveniences rather than progress.
export function hasMeaningfulProgress(s) {
  if (!s) return false;
  for (const d of ['easy', 'medium', 'hard']) {
    if (((s.db && s.db[d] && s.db[d].sessions) || []).length) return true;
  }
  if (((s.brState && s.brState.sessions) || []).length) return true;
  if (((s.milestones && s.milestones.achievedLog) || []).length) return true;
  const ts = s.trickStats || {};
  if (Object.keys(ts.practiceDone || {}).length) return true;
  if (Object.keys(ts.testDone || {}).length) return true;
  if ((ts.testPassed || []).length) return true;
  if ((s.streak || 0) > 0 || (s.bestStreakEver || 0) > 0) return true;
  return false;
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

// Records that a trick has genuinely been practiced, and runs the ladder that hangs off that:
// the first trick, five of them, then every one in the library.
//
// Shared by the two ways of earning it — finishing a practice drill and passing the Test — so the
// two can never drift into disagreeing about what counts. `m` must already be a copy.
function creditTrickPracticed(m, unlocked, key, totalTricks) {
  const set = [...(m.tricksPracticedSet || [])];
  if (set.indexOf(key) === -1) set.push(key);
  m.tricksPracticedSet = set;
  earn(m, unlocked, 'tr_first');
  if (set.length >= 5) earn(m, unlocked, 'tr_halfway');
  if (totalTricks > 0 && set.length >= totalTricks) earn(m, unlocked, 'trick_master');
}

// The five operation types a question can be. Braining is the one mode that does not use all of
// them — it has no percentage questions — which is why nothing there feeds Percentage Pro.
const ALL_OPS = ['addition', 'subtraction', 'multiplication', 'division', 'percentage'];

// ── Reading a finished run's operations ───────────────────────────────────────
//
// `breakdown.ops` is the per-operation tally useChallengeGame keeps AS THE SCORE IS EARNED: for
// each operation the player met, how many were asked and how many were right. It was built for the
// result screen's score breakdown; these three read the same tally rather than recounting from
// anything, so what an achievement says happened is what the score screen says happened.
//
// It can legitimately be missing — the verification scripts drive the reducer directly and pass
// none — so all three answer "nothing" rather than throwing.
function opsAsked(breakdown) {
  const ops = (breakdown && breakdown.ops) || {};
  return ALL_OPS.filter((o) => ops[o] && ops[o].asked > 0);
}
function opsAnsweredRight(breakdown) {
  const ops = (breakdown && breakdown.ops) || {};
  return ALL_OPS.filter((o) => ops[o] && ops[o].correct > 0);
}
function pctAnsweredRight(breakdown) {
  const ops = (breakdown && breakdown.ops) || {};
  return (ops.percentage && ops.percentage.correct) || 0;
}

// Adds one finished sitting to the running totals, and runs the ladder hanging off them.
//
// `answered` is questions, not attempts. Braining makes a player correct a wrong answer before
// moving on, so one question there can take several tries; it still asked one question.
//
// `m` must already be a copy.
function creditQuestionsAnswered(m, unlocked, answered, pctRight) {
  m.qTotal = (m.qTotal || 0) + (answered || 0);
  m.pctCorrect = (m.pctCorrect || 0) + (pctRight || 0);
  // Written out one line per tier rather than looped over a table, so the keys stay literal —
  // scripts/check-achievements.mjs reads which achievements are wired out of this file's source,
  // and a key assembled at runtime is a key it cannot see.
  if (m.qTotal >= 100) earn(m, unlocked, 'q_100');
  if (m.qTotal >= 500) earn(m, unlocked, 'q_500');
  if (m.qTotal >= 1000) earn(m, unlocked, 'q_1000');
  if (m.qTotal >= 2500) earn(m, unlocked, 'q_2500');
  if (m.qTotal >= 5000) earn(m, unlocked, 'q_5000');
  if (m.pctCorrect >= 70) earn(m, unlocked, 'q_pct_pro');
}

// Everything that asks a question about the player as a whole rather than about the run that just
// happened. Called at the END of every path that can earn anything, so no route into the app can
// leave these four permanently unreachable.
//
// `db` and `brState` must be the versions INCLUDING whatever was just recorded — the run that
// completes the set has to be visible to the check that the set is complete.
function creditCrossMode(m, unlocked, { db, brState, firstOpenDate }) {
  const today = dayKey();

  const everChallenge = ['easy', 'medium', 'hard'].some((d) => (((db && db[d]) || {}).sessions || []).length > 0);
  const everBraining = (((brState || {}).sessions) || []).length > 0;
  const everPractice = !!m.pracLastDay;
  const everTrick = ((m.tricksPracticedSet) || []).length > 0;
  if (everChallenge && everBraining && everPractice && everTrick) earn(m, unlocked, 'x_explorer');

  // The same four modes, but all on one day. Challenge and Braining are asked through the app's
  // own "did this mode today" helpers, so Well-Rounded agrees with the header pill rather than
  // having a private opinion about what counts as having played.
  if (chDoneToday(db) && brDoneToday(brState) && m.pracLastDay === today && m.trickLastDay === today) {
    earn(m, unlocked, 'x_well_rounded');
  }

  if (firstOpenDate && daysBetweenKeys(firstOpenDate, today) >= 365) earn(m, unlocked, 'x_one_year');

  // Last, always: it is the only achievement whose condition can be satisfied BY the lines above,
  // so it has to be asked after them or a player would earn their fifty-ninth and be told about
  // it a session later.
  earnCollector(m, unlocked);
}

// "Get all achievements" cannot include itself — a bar you can only clear by having already
// cleared it is not a bar — so it asks for all the OTHERS.
function earnCollector(m, unlocked) {
  for (const a of ACHIEVEMENTS) {
    if (a.key === 'x_collector') continue;
    if (m.achievedLog.indexOf(a.key) === -1) return;
  }
  earn(m, unlocked, 'x_collector');
}

// A day's counting Challenge runs for one difficulty, oldest first — the same set the visible
// daily average is computed from (see dayAverage in store/selectors.js).
function countingSessionsOn(bucket, dateStr) {
  return ((bucket && bucket.sessions) || []).filter((s) => s.date === dateStr && isRecordedSession(s));
}

// The average of a list of sessions, rounded exactly as selectors.dayAverage rounds it. The replay
// achievements are about a number the player watched move, so they have to read the number the
// player was actually shown — including the boost, on the one attempt a day that carries it.
function averageScore(sessions) {
  if (!sessions.length) return 0;
  return Math.round(sessions.reduce((a, s) => a + s.score, 0) / sessions.length);
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

  // New Record: past your own longest streak, having lost one before.
  //
  // The second half is the whole point of it — a first streak passes its own record every single
  // day, so without "you have lost one before" this would fire on day one and mean nothing. It is
  // compared against `state.bestStreakEver`, the value from BEFORE this day was credited, because
  // nextBestStreakEver has already been raised to match the streak it is supposed to be beaten by.
  //
  // `nextMilestones` is safe to write to here: checkStreakMilestonesPure above always hands back
  // a fresh object with a copied log, whatever it did or did not find.
  if (justCredited && nextMilestones.everBrokeStreak && nextStreak > (state.bestStreakEver || 0)) {
    earn(nextMilestones, unlocked, 'streak_record');
  }

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

// Exported for the verification scripts in scripts/. Nothing in the app imports it — the provider
// below is the only caller — but a reducer that can be driven directly is a reducer whose rules
// can be checked by running them rather than by reading them.
export function reducer(state, action) {
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
      // No questions were answered by opening a card, so nothing is counted — but something WAS
      // earned here, and the fifty-ninth achievement is allowed to be one of these two.
      creditCrossMode(m, unlocked, { db: state.db, brState: state.brState, firstOpenDate: state.firstOpenDate });
      return { ...state, totdLastViewed: today, milestones: m, _lastTrickUnlocked: { reqId: action.reqId, unlocked } };
    }

    // ── What "practiced a trick" means ───────────────────────────────────────────
    //
    // It used to mean opening one. `PRACTICE_TRICK` fired the moment the button was tapped, before
    // a single question had been asked, and First Trick popped up over a drill the player had not
    // started — congratulating them for arriving. Halfway There and Trick Master sat on the same
    // list, so five taps and forty-seven taps earned those too.
    //
    // Now the credit is given where the work is: finishing a practice drill, or passing the Test.
    // The list itself is the thing that moved, so all three read true rather than only the one
    // that was noticed. See TRICK_PRACTICE_COMPLETE and TRICK_TEST_COMPLETE below, which are the
    // only two places it can grow.

    // A finished 20-question practice drill on one trick. Counted on COMPLETION, not on opening
    // the screen — starting something is not an attempt at it, and counting starts would make the
    // number next to the button a measure of curiosity rather than of work.
    case 'TRICK_PRACTICE_COMPLETE': {
      const key = action.gi + '-' + action.ti;
      const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
      const unlocked = [];
      const stats = state.trickStats || { practiceDone: {}, testDone: {}, testPassed: [] };
      const practiceDone = { ...stats.practiceDone, [key]: (stats.practiceDone[key] || 0) + 1 };
      creditTrickPracticed(m, unlocked, key, action.totalTricks);
      // Clean Sweep: every question in the drill answered right first time.
      if (action.total > 0 && action.firstTryCorrect >= action.total) earn(m, unlocked, 'tr_clean_sweep');
      // A completed drill is the full twenty questions — it does not stop early the way a Test
      // does — so its length is what was answered.
      m.trickLastDay = dayKey();
      creditQuestionsAnswered(m, unlocked, action.total || 0, 0);
      creditCrossMode(m, unlocked, { db: state.db, brState: state.brState, firstOpenDate: state.firstOpenDate });
      return {
        ...state,
        milestones: m,
        trickStats: { ...stats, practiceDone },
        _lastTrickUnlocked: { reqId: action.reqId, unlocked },
      };
    }

    // A Test that is over, however it ended.
    //
    // Passing is now all 20 answered right at the first attempt, and a single mistake ends the
    // run there and then — so a Test that reaches its twentieth question IS a pass, and every
    // other ending is a fail. The pass is recorded once and never taken away, so a worse retake
    // cannot un-graduate a trick.
    //
    // The attempt counts either way. That is a deliberate consequence of the run being able to
    // stop at question three: `testDone` answers "how many times have you sat this?", and a test
    // walked out of at the first wrong answer was still sat. Only `testPassed` is about the
    // result, and it is the only thing a failed attempt leaves untouched.
    case 'TRICK_TEST_COMPLETE': {
      const key = action.gi + '-' + action.ti;
      const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
      const unlocked = [];
      const stats = state.trickStats || { practiceDone: {}, testDone: {}, testPassed: [] };
      const testDone = { ...stats.testDone, [key]: (stats.testDone[key] || 0) + 1 };
      const testPassed = [...(stats.testPassed || [])];
      if (action.passed && testPassed.indexOf(key) === -1) testPassed.push(key);
      if (action.passed) {
        // Passing the Test is the other way of proving you know a trick, so it credits the
        // practiced ladder too — someone who sat down and passed cold has plainly done the work,
        // and making them also grind a practice drill to earn First Trick would be pedantry.
        creditTrickPracticed(m, unlocked, key, action.totalTricks);
        earn(m, unlocked, 'tr_first_exam');
        if (action.totalTricks > 0 && testPassed.length >= action.totalTricks) {
          earn(m, unlocked, 'tr_graduation');
        }
      }
      // A Test stops dead at the first wrong answer, so a failed one asked as many questions as
      // were answered right, plus the one that ended it. A pass is the full set.
      m.trickLastDay = dayKey();
      creditQuestionsAnswered(m, unlocked, action.passed ? (action.total || 0) : (action.correct || 0) + 1, 0);
      creditCrossMode(m, unlocked, { db: state.db, brState: state.brState, firstOpenDate: state.firstOpenDate });
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

    // Has the streak died since we last looked?
    //
    // This used to open with `if (state.streakLastCheckedDay === today) return state;` — run once
    // a day, skip the rest. That guard was wrong, and wrong in the worst available direction: it
    // could decide the day was already settled BEFORE the state it was settling had arrived.
    //
    // The app checks on mount, against whatever this device happens to be holding, and again the
    // moment an account finishes downloading. The second check is the one that matters, because
    // the first ran before the account's real dates were known. But the first had already stamped
    // today as checked — so if the download did not itself carry a `streakLastCheckedDay` to
    // overwrite that stamp, the second check returned immediately and a streak dead for a month
    // sailed through untouched, then carried on counting from where it left off.
    //
    // So there is no gate now. The answer is a pure function of the dates and the history, it is
    // cheap, and it gives the same answer however many times it is asked — which is exactly what
    // makes running it twice on load safe rather than merely tolerable. `streakLastCheckedDay` is
    // still recorded, and still synced, but nothing branches on it any more: it says when we last
    // looked, and deliberately no longer claims that looking again would be a waste of time.
    case 'CHECK_STREAK_BREAK': {
      const today = dayKey();

      // Any boost still sitting here from a day that is over. Clearing it is housekeeping, not
      // the safety mechanism: what actually stops a stale boost being spent is that it is compared
      // against today's date at the moment it would be used, which holds even if the app is left
      // open across midnight and this never runs.
      const brBoostDay = state.brBoostDay && state.brBoostDay !== today ? null : state.brBoostDay;

      let streak = state.streak;
      let pendingRestore = state.pendingRestore;
      let milestones = state.milestones;

      // Only a live streak can break, which is also what makes this safe to re-run: once it has
      // broken, `streak` is 0 and the branch cannot be entered again to overwrite the restore
      // offer it just created.
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
            pendingRestore = {
              brokenValue: state.streak,
              brokenAtMs: dateStrToDate(addDaysStr(breakDay, 1)).getTime(),
              availableAtBreak: state.streakRestoreAvailable,
            };
            streak = 0;
            // The one durable trace a break leaves. Everything else about it is temporary —
            // `pendingRestore` is cleared whether the offer is taken, refused or left to expire —
            // and New Record needs to know, possibly months later, that this happened. Recorded
            // here at the break itself and undone by STREAK_RESTORE if the break does not stand.
            milestones = { ...milestones, everBrokeStreak: true };
          }
        }
      }

      // Nothing moved and today is already recorded, so hand back the identical object. Without
      // this the two checks on load would each produce a fresh state, and the sync effect would
      // dutifully upload a change that was not one.
      if (
        streak === state.streak &&
        pendingRestore === state.pendingRestore &&
        brBoostDay === state.brBoostDay &&
        milestones === state.milestones &&
        state.streakLastCheckedDay === today
      ) {
        return state;
      }
      return { ...state, streak, pendingRestore, brBoostDay, milestones, streakLastCheckedDay: today };
    }

    // Achievements that nothing a player DOES can trigger, checked when the app opens and again
    // when the date rolls over underneath it. One Year Strong is time passing rather than anything
    // earned, and the collector is swept here too so a player who finished their fifty-eighth on
    // one device is told about the fifty-ninth on the next.
    case 'AMBIENT_ACHIEVEMENTS_CHECK': {
      const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
      const unlocked = [];
      creditCrossMode(m, unlocked, { db: state.db, brState: state.brState, firstOpenDate: state.firstOpenDate });
      if (!unlocked.length) return state;
      return { ...state, milestones: m, _lastAmbientUnlocked: { reqId: action.reqId, unlocked } };
    }

    case 'STREAK_RESTORE': {
      if (!state.pendingRestore || !state.pendingRestore.availableAtBreak) return state;
      const streak = state.pendingRestore.brokenValue;
      const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
      const unlocked = [];
      earn(m, unlocked, 'streak_rebirth');
      // The break has been undone, so it must stop counting as one. Leaving this set would let a
      // player who has never actually lost a streak earn New Record on their very next best day.
      m.everBrokeStreak = false;
      creditCrossMode(m, unlocked, { db: state.db, brState: state.brState, firstOpenDate: state.firstOpenDate });
      return {
        ...state,
        streak,
        streakCreditedForDay: yesterday(),
        streakRestoreAvailable: false,
        bestStreakEver: Math.max(state.bestStreakEver, streak),
        pendingRestore: null,
        milestones: m,
        _lastAmbientUnlocked: { reqId: action.reqId, unlocked },
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
      // never stored and never touch streaks or bests.
      //
      // They do now earn things, though, which is the change here. Nothing about the day's SCORE
      // moves — no session is stored, no streak is credited, no best is touched — but a run that
      // is not worth recording is still work that was done, and the five Practice achievements and
      // the running question count are what say so. A Challenge run that scored nothing lands here
      // too, and its questions are counted for the same reason: they were answered.
      if (!diff || score <= 0) {
        const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
        const unlocked = [];
        const answered = correct + wrong;
        creditQuestionsAnswered(m, unlocked, answered, pctAnsweredRight(action.breakdown));

        // The Practice tab specifically. `origin` is what distinguishes it from a Challenge run
        // that happened to score zero — the two arrive here by different routes and only one of
        // them is Practice.
        if (action.origin === 'practice') {
          m.pracLastDay = today;
          // Reaching this point IS completing a session: a run abandoned part-way is discarded by
          // the game and never gets here at all.
          earn(m, unlocked, 'pr_first');
          if (wrong === 0 && correct >= 20) earn(m, unlocked, 'pr_sharpshooter');
          if (answered >= 100) earn(m, unlocked, 'pr_marathon');

          // Asked, not answered correctly — "used every operation type" and "tried every operation
          // type" are both about what the session contained, not about how it went. (Four for Four
          // in Challenge is the one that asks for them RIGHT, and reads a different tally.)
          const asked = opsAsked(action.breakdown);
          if (ALL_OPS.every((o) => asked.indexOf(o) !== -1)) earn(m, unlocked, 'pr_all_mixed');

          const seen = [...(m.pracOpsSeen || [])];
          for (const o of asked) if (seen.indexOf(o) === -1) seen.push(o);
          m.pracOpsSeen = seen;
          if (ALL_OPS.every((o) => seen.indexOf(o) !== -1)) earn(m, unlocked, 'pr_mix_master');
        }

        creditCrossMode(m, unlocked, { db: state.db, brState: state.brState, firstOpenDate: state.firstOpenDate });

        return {
          ...state,
          milestones: m,
          _lastSessionResult: {
            reqId: action.reqId,
            diff, score, correct, wrong, isPrac,
            // Same shape as a recorded run, so anything reading a result never has to ask which
            // path produced it. Nothing was boosted here — this run is not being recorded at all.
            rawScore: score, boosted: false,
            origin: action.origin,
            opTimes: action.opTimes,
            breakdown: action.breakdown,
            isNewBest: false, unlocked,
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
      // `correct` joins the entry for Challenger and Triple Crown, which ask for "at least N
      // correct answers in each" of the three difficulties on one day. That question is about
      // OTHER difficulties' runs as well as this one, so it cannot be answered from the action
      // alone — the count has to survive on the session, next to the score it produced.
      // `attemptId` is the id the game hook already minted to group this sitting's answers in the
      // attempt log, carried onto the stored run so that the server's verdict — which arrives
      // later, over the network, long after this reducer has returned — can find the run it is
      // about. Without it there is nothing to match on: a day holds many runs and `ts` is a
      // timestamp, not an identity.
      const entry = { date: today, score: countedScore, correct, real: !isPrac, ts: Date.now() };
      if (action.attemptId) entry.attemptId = action.attemptId;
      if (boostSpent) {
        entry.rawScore = score;
        entry.boosted = true;
      }
      const newSessions = [...d.sessions, entry];

      // Today's counting runs on this difficulty as they stood BEFORE this one, which is the whole
      // basis of the replay family: a run is a replay when there was already something to replay.
      const priorToday = countingSessionsOn(d, today);

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
        // The four score-based achievements the spreadsheet adds are the deliberate exception, and
        // they are wired below against `score` — the RAW number this run earned — never against
        // `countedScore`. That one word is what stops a Braining boost from buying them.
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

        // ── The score ladder ────────────────────────────────────────────────────
        // Raw, for the reason above. Nice! is an exact 69 rather than a threshold, so on a boosted
        // run it is the number the player watched themselves earn, not the inflated one.
        if (score >= 100) earn(m, unlocked, 'ch_peak');
        if (score >= 150) earn(m, unlocked, 'ch_sky');
        if (score >= 200) earn(m, unlocked, 'ch_moon');
        if (score === 69) earn(m, unlocked, 'ch_nice');

        // Four for Four: every operation type answered correctly in this one session. Challenge
        // asks all FIVE types, percentage included, and the trigger says "every operation type" —
        // so all five it is, whatever the name's 4x4 pun suggests.
        const rightOps = opsAnsweredRight(action.breakdown);
        if (ALL_OPS.every((o) => rightOps.indexOf(o) !== -1)) earn(m, unlocked, 'ch_four_for_four');

        // ── Challenger and Triple Crown ─────────────────────────────────────────
        // All three difficulties today, each with a run of at least N correct answers. Read off
        // newDb so the run that completes the set is included; the best run on each difficulty
        // stands for it, because "5 correct in each" is a bar one sitting has to clear, not a
        // total to accumulate over the day.
        const bestCorrectToday = (dd) =>
          countingSessionsOn(newDb[dd], today).reduce((b, s) => Math.max(b, s.correct || 0), 0);
        const eachDiff = ['easy', 'medium', 'hard'].map(bestCorrectToday);
        if (eachDiff.every((n) => n >= 5)) earn(m, unlocked, 'ch_challenger');
        if (eachDiff.every((n) => n >= 20)) earn(m, unlocked, 'ch_triple_crown');

        // ── The replay family ───────────────────────────────────────────────────
        //
        // Every Challenge play counts towards the day's average now, so a replay is not a special
        // mode — it is simply a run made when today already had one. That is what these five are
        // about: the nerve to put a good average back on the table.
        //
        // Unlike everything above, the two that talk about the average read the COUNTED score,
        // boost and all. The trigger describes a number the player watched move on their own
        // screen, and the boosted average is the average they were actually shown.
        if (priorToday.length >= 1) {
          earn(m, unlocked, 'rp_first');

          const avgBefore = averageScore(priorToday);
          const avgAfter = averageScore([...priorToday, entry]);
          if (avgAfter > avgBefore) earn(m, unlocked, 'rp_up');
          if (avgAfter - avgBefore >= 50) earn(m, unlocked, 'rp_plus50');

          // High Roller counts the day's replays across all three difficulties — the trigger says
          // "replayed Challenge", not "replayed Hard". Each difficulty's first run of the day is
          // not a replay, hence the minus one.
          const replaysToday = ['easy', 'medium', 'hard']
            .reduce((n, dd) => n + Math.max(0, countingSessionsOn(newDb[dd], today).length - 1), 0);
          if (replaysToday >= 7) earn(m, unlocked, 'rp_five');

          // Locked In: three replays in a row within a few points of each other. Three REPLAYS
          // means the day's second, third and fourth runs at the earliest, so four runs are needed
          // before it can be true — which is why the length test is 4 and not 3.
          const todayList = countingSessionsOn(newDb[diff], today);
          if (todayList.length >= 4) {
            const last3 = todayList.slice(-3).map((s) => s.score);
            if (Math.max(...last3) - Math.min(...last3) <= 5) earn(m, unlocked, 'rp_consistent');
          }
        }

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

      // Counted for every recorded run, and last, so the cross-mode sweep sees everything this
      // session earned before deciding whether the collection is complete. The copy-if-needed
      // dance is because `nextMilestones` is only guaranteed to be a fresh object on the paths
      // above that made one — writing to the state's own object would mutate live state.
      {
        const mCount = nextMilestones === state.milestones
          ? { ...state.milestones, achievedLog: [...state.milestones.achievedLog] }
          : nextMilestones;
        creditQuestionsAnswered(mCount, unlocked, correct + wrong, pctAnsweredRight(action.breakdown));
        creditCrossMode(mCount, unlocked, { db: newDb, brState: state.brState, firstOpenDate: state.firstOpenDate });
        nextMilestones = mCount;
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

    // The server has confirmed a run, some time after it was played.
    //
    // This is the ONLY thing the server's reply changes locally, and the restraint is deliberate.
    // It does not touch the score, the average, the streak or any achievement — all of those were
    // settled the moment the run ended, from numbers the player watched themselves earn, and a
    // network reply arriving seconds later has no business moving them. It records one fact:
    // this run was witnessed.
    //
    // A run WITHOUT the flag is not a suspect run. Guests never get it, offline play never gets
    // it, and a submission that timed out never gets it. It means "eligible to be ranked", not
    // "believed" — the player's own history treats every run the same either way.
    //
    // Nothing reads this yet. It exists now because it cannot be added retrospectively: a run
    // played today and confirmed today can only be marked today, and a leaderboard built later
    // would otherwise start with a history it has no way to judge.
    case 'CHALLENGE_ATTEMPT_VERIFIED': {
      const { diff, attemptId } = action;
      const d = diff && state.db[diff];
      if (!d || !attemptId) return state;

      let found = false;
      const sessions = d.sessions.map((s) => {
        if (found || s.attemptId !== attemptId || s.verified) return s;
        found = true;
        return { ...s, verified: true };
      });
      // Returning the identical state object when there is nothing to change is not a
      // micro-optimisation here: a new object would be a new sync payload, and this action can
      // fire for a run that was never stored (a Practice-tab run, or one that scored zero).
      if (!found) return state;

      return { ...state, db: { ...state.db, [diff]: { ...d, sessions } } };
    }

    // The server has confirmed a Braining trial, some time after it was played.
    //
    // Same restraint as the Challenge equivalent: it records one fact and changes nothing else.
    // In particular it does NOT grant the boost — `brBoostDay` was already set by the trial
    // itself, on the device, because the boost has to work offline like every other game rule.
    // What the server's own boost record does is decide whether the 5% is actually PAID into a
    // stored score, which is a different question and one the client has no say in.
    //
    // So the two can legitimately disagree: an offline trial grants a local boost that the server
    // will never honour. The player sees their boosted score exactly as before; the competitive
    // record simply does not include a bonus nobody witnessed.
    case 'BRAINING_ATTEMPT_VERIFIED': {
      const { attemptId } = action;
      const br = state.brState;
      if (!attemptId || !br || !br.sessions) return state;

      let found = false;
      const sessions = br.sessions.map((sn) => {
        if (found || sn.attemptId !== attemptId || sn.verified) return sn;
        found = true;
        return { ...sn, verified: true };
      });
      if (!found) return state;

      return { ...state, brState: { ...br, sessions } };
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
            sessions: [...sessions, { date: today, time: sec, age, real: true, ts: Date.now(), attemptId: action.attemptId }],
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
            sessions: [...sessions, { date: today, time: sec, age, real: false, ts: Date.now(), attemptId: action.attemptId }],
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

      // Questions answered. A Braining session is a fixed length — 50 for the day's trial, 20 for
      // a practice run — and that length is what gets counted, not the number of attempts: the
      // mode makes a wrong answer be corrected before moving on, so one question can take several
      // tries and is still one question. `action.total` is that length as the game itself reports
      // it, with the constants as a fallback for callers that do not send it.
      //
      // Nothing here feeds Percentage Pro: Braining asks addition, subtraction, multiplication and
      // division only.
      {
        const mCount = nextMilestones === state.milestones
          ? { ...state.milestones, achievedLog: [...state.milestones.achievedLog] }
          : nextMilestones;
        creditQuestionsAnswered(mCount, unlocked, action.total || (isPrac ? 20 : 50), 0);
        creditCrossMode(mCount, unlocked, { db: state.db, brState: nextBr, firstOpenDate: state.firstOpenDate });
        nextMilestones = mCount;
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
      const local = stateRef.current;
      const baseline = uid ? readBaseline(uid) : null;
      const deviceIsAhead =
        baseline !== null && fingerprint(toSyncPayload(local)) !== baseline;

      // The second net, independent of the baseline above and answering a different question.
      //
      // The baseline asks "has this device already sent the server what it is holding?" and is
      // silent when there is no baseline at all — and with no baseline the server simply wins.
      // That is right for a phone picking up an account for the first time, and catastrophic
      // when a session turns up that the app was not expecting: a guest in the middle of signing
      // up watches their history replaced by somebody else's.
      //
      // So this asks a narrower question: is the app being handed an account it did not believe
      // it was signed in to, while this device is carrying a player's real work that no server
      // has ever seen? Only then is adopting a destructive act, and only then is it refused.
      //
      // `acctCreated` is what keeps ordinary cross-device sync untouched. Once the app knows it
      // is signed in, a download is the account catching this device up and is expected to win.
      // And a blank device fails hasMeaningfulProgress outright, so first-login on a new phone
      // works exactly as it always did — there is nothing there to defend.
      const wouldDestroyUnsyncedWork =
        baseline === null && !local.acctCreated && hasMeaningfulProgress(local);

      const keepLocal = deviceIsAhead || wouldDestroyUnsyncedWork;

      dispatch({
        type: 'ACCOUNT_LOADED',
        username: res.profile.username,
        email: res.email,
        fullName: res.profile.full_name || '',
        avatar: res.profile.avatar,
        // The profile above (name, avatar) is always taken from the server. Only the PROGRESS is
        // withheld when this device holds work the server has not got — an empty patch leaves the
        // local history intact.
        synced: keepLocal ? {} : res.syncedState,
      });
      // The downloaded state may have last been checked on an earlier day, on another device.
      dispatch({ type: 'CHECK_STREAK_BREAK' });
      if (keepLocal) {
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
