import { createContext, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { dayKey, yesterday, addDaysStr, dateStrToDate } from './dates.js';
import { streakMilestoneThreshold } from './milestones.js';

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
    username: '',
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
    // The dedicated first-ever "you've lit a streak" popup — the one milestone that always
    // carries the account-creation CTA. Separate from the recurring 7/14/30-day thresholds.
    if (neverLitBefore && !nextMilestones.firstStreakLit) {
      nextMilestones = {
        ...nextMilestones,
        firstStreakLit: true,
        achievedLog: [...nextMilestones.achievedLog, 'streak_lit'],
      };
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

    case 'SET_BR_CHART_RANGE':
      return { ...state, brChartRange: action.range };

    case 'SET_BR_CHART_TYPE':
      return { ...state, brChartType: action.chartType };

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
        }
      }

      return {
        ...state,
        db: newDb,
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

  // Persist on every change.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) {
      /* ignore quota errors */
    }
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <AppStateStoreContext.Provider value={value}>{children}</AppStateStoreContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateStoreContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}

export { chDoneToday, brDoneToday, todayDone, isRecordedSession };
