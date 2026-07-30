import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { dayKey, yesterday, addDaysStr, dateStrToDate } from './dates.js';
import { streakMilestoneThreshold } from './milestones.js';
import { fetchAccount, getSession, onAuthChange, pushPlayerState } from '../lib/accountApi.js';
import { sameSyncPayload, toSyncPayload } from '../lib/syncedState.js';

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
    milestones: {
      streakShown: [],
      chFirst: false, chPerfect: false, chMedium: false, chHard: false,
      brFirst: false, brSub4: false, brAge20: false,
      trickCount: 0, trickShown: false,
      tricksPracticedSet: [], allTricksShown: false,
      firstStreakLit: false,
      achievedLog: [],
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

function checkStreakMilestonesPure(lang, milestones, prevStreak, newStreak) {
  const unlocked = [];
  const nextMilestones = { ...milestones, streakShown: [...milestones.streakShown], achievedLog: [...milestones.achievedLog] };
  if (newStreak > prevStreak) {
    for (let n = prevStreak + 1; n <= newStreak; n++) {
      const thr = streakMilestoneThreshold(n);
      if (thr && nextMilestones.streakShown.indexOf(thr) === -1) {
        nextMilestones.streakShown.push(thr);
        if (thr <= 90 && nextMilestones.achievedLog.indexOf('streak_' + thr) === -1) {
          nextMilestones.achievedLog.push('streak_' + thr);
        }
        unlocked.push({ icon: 'flame', nameKey: 'ms_streak_name', descKey: 'ms_streak_desc', vars: { n: thr } });
      }
    }
  }
  return { milestones: nextMilestones, unlocked };
}

// creditStreakIfBothDone() from the reference, as a pure helper shared by both modes.
// `chDone`/`brDone` must reflect the db/brState as they will be AFTER the session being
// recorded. Returns the streak-related fields to merge, plus any milestone cards unlocked.
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

  if (state.streakCreditedForDay !== today && chDone && brDone) {
    const wasZero = state.streak === 0;
    const neverLitBefore = state.bestStreakEver === 0;
    nextStreak = (state.streak || 0) + 1;
    nextStreakCreditedForDay = today;
    if (nextStreak > nextBestStreakEver) nextBestStreakEver = nextStreak;
    if (wasZero) nextStreakRestoreAvailable = true;
    justCredited = true;
    // The dedicated first-ever "you've lit a streak" popup — separate from the recurring
    // 7/14/30-day thresholds. This is also the moment guest-conversion nudging begins: from
    // here every milestone popup carries the CTA until a real account exists. Skipped
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
    // milestones start carrying the CTA.
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
    // which is what makes Trick Explorer a "10 distinct days" milestone rather than 10 taps.
    case 'VIEW_TRICK_OF_DAY': {
      const today = dayKey();
      if (state.totdLastViewed === today) return { ...state, _lastTrickUnlocked: null };
      const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
      const unlocked = [];
      m.trickCount = (m.trickCount || 0) + 1;
      if (m.trickCount >= 10 && !m.trickShown) {
        m.trickShown = true;
        m.achievedLog.push('trick_explorer');
        unlocked.push({ icon: 'trick', nameKey: 'ms_trickexplorer_name', descKey: 'ms_trickexplorer_desc' });
      }
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
      if (!m.allTricksShown && action.total > 0 && set.length >= action.total) {
        m.allTricksShown = true;
        m.achievedLog.push('trick_master');
        unlocked.push({ icon: 'trick', nameKey: 'ms_trickmaster_name', descKey: 'ms_trickmaster_desc' });
      }
      return { ...state, milestones: m, _lastTrickUnlocked: { reqId: action.reqId, unlocked } };
    }

    case 'SET_USERNAME':
      return { ...state, username: action.username };

    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case 'CHECK_STREAK_BREAK': {
      const today = dayKey();
      if (state.streakLastCheckedDay === today) return state;
      let next = { ...state, streakLastCheckedDay: today };
      if (state.streak > 0 && state.streakCreditedForDay) {
        const breakDay = addDaysStr(state.streakCreditedForDay, 1);
        if (today > breakDay) {
          const wasCh = chCompletedOnDate(state.db, breakDay);
          const wasBr = brCompletedOnDate(state.brState, breakDay);
          if (!(wasCh && wasBr)) {
            const reason = !wasCh && !wasBr ? 'both' : !wasCh ? 'Challenge' : 'Braining';
            next = {
              ...next,
              pendingRestore: {
                brokenValue: state.streak,
                brokenReason: reason,
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
    // and milestone unlocks. Returns the unlocked-milestones list via action.onUnlocked.
    case 'CHALLENGE_SESSION_COMPLETE': {
      const { diff, score, isPrac, correct, wrong, lang } = action;
      const today = dayKey();

      // The reference only records into db when there is a difficulty AND a non-zero score
      // (`if(cur.diff&&sc>0)`). The standalone Practice tab has no difficulty, so its runs are
      // never stored and never touch streaks, bests or milestones — just show a result.
      if (!diff || score <= 0) {
        return {
          ...state,
          _lastSessionResult: {
            reqId: action.reqId,
            diff, score, correct, wrong, isPrac,
            origin: action.origin,
            opTimes: action.opTimes,
            isNewBest: false, unlocked: [], isFirstToday: false,
          },
        };
      }

      const d = state.db[diff];
      const isFirstToday = d.lastDay !== today;
      const newSessions = [...d.sessions, { date: today, score, real: !isPrac && isFirstToday }];
      const prevBest = d.best;
      const newBest = score > prevBest ? score : prevBest;
      const newDb = {
        ...state.db,
        [diff]: {
          ...d,
          sessions: newSessions,
          best: newBest,
          lastDay: !isPrac && isFirstToday ? today : d.lastDay,
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
        isNewBest = score > prevBest;

        // checkChallengeMilestones
        const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
        if (!m.chFirst) {
          m.chFirst = true;
          m.achievedLog.push('ch_first');
          unlocked.push({ icon: 'star', nameKey: 'ms_ch_first_name', descKey: 'ms_ch_first_desc' });
        }
        const total = correct + wrong;
        if (total >= 10 && wrong === 0 && !m.chPerfect) {
          m.chPerfect = true;
          m.achievedLog.push('ch_perfect');
          unlocked.push({ icon: 'star', nameKey: 'ms_perfect_name', descKey: 'ms_perfect_desc' });
        }
        if (diff === 'medium' && !m.chMedium) {
          m.chMedium = true;
          m.achievedLog.push('ch_medium');
          unlocked.push({ icon: 'star', nameKey: 'ms_medium_name', descKey: 'ms_medium_desc' });
        }
        if (diff === 'hard' && !m.chHard) {
          m.chHard = true;
          m.achievedLog.push('ch_hard');
          unlocked.push({ icon: 'star', nameKey: 'ms_hard_name', descKey: 'ms_hard_desc' });
        }
        nextMilestones = m;

        if (isFirstToday) {
          const credit = applyStreakCredit(state, {
            chDone: chDoneToday(newDb),
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
      }

      return {
        ...state,
        db: newDb,
        guestConvoStarted: nextGuestConvoStarted,
        milestones: nextMilestones,
        streak: nextStreak,
        streakCreditedForDay: nextStreakCreditedForDay,
        streakRestoreAvailable: nextStreakRestoreAvailable,
        bestStreakEver: nextBestStreakEver,
        _lastSessionResult: {
          reqId: action.reqId,
          diff, score, correct, wrong, isPrac,
          origin: action.origin,
          opTimes: action.opTimes,
          isNewBest, unlocked, isFirstToday,
        },
      };
    }

    // Mirrors the reference's brFinish(): records the session, updates best time/age, credits
    // the unified streak, and collects milestone unlocks.
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

      if (!isPrac) {
        isFirst = br.lastDay !== today;
        if (isFirst) {
          const bestTime = br.bestTime === null || sec < br.bestTime ? sec : br.bestTime;
          if (br.bestTime === null || sec < br.bestTime) isPR = true;
          const bestAge = br.bestAge === null || age < br.bestAge ? age : br.bestAge;
          nextBr = {
            ...br,
            sessions: [...sessions, { date: today, time: sec, age, real: true }],
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
            sessions: [...sessions, { date: today, time: sec, age, real: false }],
            bestTime, bestAge,
          };
        }

        // checkBrainingMilestones
        const m = { ...state.milestones, achievedLog: [...state.milestones.achievedLog] };
        if (!m.brFirst) {
          m.brFirst = true;
          m.achievedLog.push('br_first');
          unlocked.push({ icon: 'brain', nameKey: 'ms_br_first_name', descKey: 'ms_br_first_desc' });
        }
        if (sec < 240 && !m.brSub4) {
          m.brSub4 = true;
          m.achievedLog.push('br_sub4');
          unlocked.push({ icon: 'brain', nameKey: 'ms_sub4_name', descKey: 'ms_sub4_desc' });
        }
        if (age <= 20 && !m.brAge20) {
          m.brAge20 = true;
          m.achievedLog.push('br_age20');
          unlocked.push({ icon: 'brain', nameKey: 'ms_age20_name', descKey: 'ms_age20_desc' });
        }
        nextMilestones = m;

        if (isFirst) {
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
        // Practice: recorded as non-counting, but may still improve the stored best.
        const bestTime = br.bestTime === null || sec < br.bestTime ? sec : br.bestTime;
        const bestAge = br.bestAge === null || age < br.bestAge ? age : br.bestAge;
        nextBr = {
          ...br,
          sessions: [...sessions, { date: today, time: sec, age, real: false }],
          bestTime, bestAge,
        };
      }

      return {
        ...state,
        brState: nextBr,
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
  const sync = useRef({ ready: false, lastPushed: null });
  const [syncRetry, setSyncRetry] = useState(0);

  // Adopt an existing session at startup, and follow it if it ends elsewhere (token expiry, or
  // logging out in another tab).
  useEffect(() => {
    let cancelled = false;

    async function adopt() {
      const res = await fetchAccount();
      if (cancelled || !res.ok || !res.profile) return;
      dispatch({
        type: 'ACCOUNT_LOADED',
        username: res.profile.username,
        email: res.email,
        fullName: res.profile.full_name || '',
        avatar: res.profile.avatar,
        synced: res.syncedState,
      });
      // The downloaded state may have last been checked on an earlier day, on another device.
      // Re-running the break check is a no-op if it has already run today.
      dispatch({ type: 'CHECK_STREAK_BREAK' });
      sync.current.lastPushed = res.hasRemoteState ? res.syncedState : null;
      sync.current.ready = true;
    }

    getSession().then((session) => {
      if (!cancelled && session) adopt();
    });

    const unsubscribe = onAuthChange((event) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        sync.current.ready = false;
        sync.current.lastPushed = null;
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

  // Called by the account screens once a signup or login has completed, so uploading can begin
  // from a known-good baseline rather than guessing.
  const beginSync = useCallback((baseline) => {
    sync.current.lastPushed = baseline || null;
    sync.current.ready = true;
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
