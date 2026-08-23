import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AppStateProvider, useAppState, chDoneToday, brDoneToday, hasMeaningfulProgress,
} from './store/AppStateContext.jsx';
import { useI18n } from './store/useI18n.js';
import { useChallengeGame } from './hooks/useChallengeGame.js';
import { useBrainingGame } from './hooks/useBrainingGame.js';
import { useSwipeTabs, TAB_ORDER } from './hooks/useSwipeTabs.js';
import { diffLabel, engineFor } from './store/questionEngine.js';
import {
  getYestChallengeScore, getTodayChallengeScore, countingSessions, todaySessionsFor, dayAverage,
} from './store/selectors.js';
import { ACHIEVEMENT_BY_KEY, earnedCount } from './store/achievements.js';
import { track } from './lib/analytics.js';
import { initNotifications, syncTags, notificationDiagnostics } from './lib/notifications.js';
import { brAge, brMakeSession, getLastBrainingTime, getTodayBrainingTime } from './store/braining.js';
import { TRICKS_FLAT, trickOfDayIndex } from './store/tricks.js';
import { PRACTICE_LENGTH, TEST_LENGTH } from './store/trickTest.js';
import { attachAudioUnlock, attachGlobalClickSound } from './store/sound.js';
import { dayKey, dateStrToDate, daysBetweenKeys } from './store/dates.js';
import {
  changePassword, deleteAccount, errorKey, fetchAccount, onAuthChange, requestEmailChange,
  sendPasswordReset, signInWithIdentifier, signOut, signUpWithProfile, updateProfile,
} from './lib/accountApi.js';
import { toSyncPayload } from './lib/syncedState.js';
import { recordAttempt, endSession, discardSession } from './lib/attemptLog.js';
import { arrivedFromRecoveryLink, clearRecoveryUrl } from './lib/recoveryLink.js';
import { issueChallengeSet, submitChallengeAttempt, issueBrainingSet, submitBrainingAttempt } from './lib/verifiedPlay.js';

import Header from './components/Header.jsx';
import BottomNav from './components/BottomNav.jsx';
import QuitModal from './components/QuitModal.jsx';
import AchievementPopup from './components/AchievementPopup.jsx';
import NotifOptInCard from './components/NotifOptInCard.jsx';
import { useNotificationStatus } from './hooks/useNotificationStatus.js';
import ProfileSheet from './components/ProfileSheet.jsx';
import TutorialOverlay from './components/TutorialOverlay.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import StreakRestoreModal from './components/StreakRestoreModal.jsx';
import { SavePromptModal, GuestBanner } from './components/GuestConversion.jsx';
import OnboardingScreen from './screens/OnboardingScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen.jsx';
import ResetPasswordScreen from './screens/ResetPasswordScreen.jsx';
import AccountCreateScreen from './screens/AccountCreateScreen.jsx';
import EditAccountScreen from './screens/EditAccountScreen.jsx';
import IconPickerScreen from './screens/IconPickerScreen.jsx';
import { LegalScreen, AchievementsListScreen } from './screens/LegalScreen.jsx';
import BrainingQuitModal from './components/BrainingQuitModal.jsx';
import ChallengeHomeScreen from './screens/ChallengeHomeScreen.jsx';
import CountdownScreen from './screens/CountdownScreen.jsx';
import ChallengeGameScreen from './screens/ChallengeGameScreen.jsx';
import ChallengeResultScreen from './screens/ChallengeResultScreen.jsx';
import PracticeScreen from './screens/PracticeScreen.jsx';
import TricksScreen from './screens/TricksScreen.jsx';
import TrickGameScreen from './screens/TrickGameScreen.jsx';
import BrainingHomeScreen from './screens/BrainingHomeScreen.jsx';
import BrainingGameScreen from './screens/BrainingGameScreen.jsx';
import BrainingResultScreen from './screens/BrainingResultScreen.jsx';

function AppShell() {
  const { state, dispatch, beginSync, confirmProgressSaved } = useAppState();
  const { t, lang } = useI18n();
  const soundOn = state.settings.sound;

  const [activeTab, setActiveTab] = useState('challenge');
  // challenge|braining|practice|tricks|countdown|game|result|br-countdown|br-game|br-result
  const [screen, setScreen] = useState('challenge');
  // Reminder opt-in. `notifStatus` reads what this device can actually do; the card is only ever
  // opened by the effect below, never directly by anything the player taps.
  const [notifCardOpen, setNotifCardOpen] = useState(false);
  const notifStatus = useNotificationStatus();
  const [countdownInfo, setCountdownInfo] = useState(null); // {diff,isPrac,pcfg,origin,label}

  // ── The prefetched question set ─────────────────────────────────────────────
  //
  // Held in a ref rather than state because NOTHING RENDERS FROM IT. That is the whole design:
  // a set arriving, or failing to arrive, must not cause a re-render, must not gate a screen,
  // and must not be visible to the player in any way. The countdown runs its 3.2 seconds either
  // way and the game starts on time.
  //
  // Shape: {setId, diff, questions} or null.
  const pendingSetRef = useRef(null);

  // Which set request is the current one. A slow reply from an abandoned request must not be
  // adopted by the game that replaced it — that set was voided server-side the moment a newer one
  // was issued, so playing it would produce a run the server refuses. Cheaper to ignore it here.
  const setRequestRef = useRef(0);

  // The same pair for Braining. Kept separate rather than shared because the two modes hold one
  // live set EACH server-side — the uniqueness index is on (user_id, mode) — so starting a
  // Braining trial must not void a Challenge set, or vice versa.
  const pendingBrSetRef = useRef(null);
  const brSetRequestRef = useRef(0);
  const [brCountdownInfo, setBrCountdownInfo] = useState(null); // {isPrac,label,sub}
  const [quitOpen, setQuitOpen] = useState(false);
  const [brQuitOpen, setBrQuitOpen] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [brResultData, setBrResultData] = useState(null);
  const [achievementQueue, setAchievementQueue] = useState([]);
  const [brAchievementQueue, setBrAchievementQueue] = useState([]);
  const [tabAnimKey, setTabAnimKey] = useState(0);
  const [slide, setSlide] = useState(null); // {from, to, dir} while a swipe animation runs
  const [trickGame, setTrickGame] = useState(null); // {gi, ti} while drilling one trick
  const [tricksOpenIndex, setTricksOpenIndex] = useState(null); // deep-link from a TotD card
  const [trickAchievementQueue, setTrickAchievementQueue] = useState([]);
  const pendingTrickReqId = useRef(0);
  // Achievements earned outside a game: One Year Strong, which is time passing rather than
  // anything played, and Rebirth, which is earned by tapping Restore on the streak modal. Every
  // other card rides home on a finished session's result; these two have no session to ride.
  const [ambientAchievementQueue, setAmbientAchievementQueue] = useState([]);
  const pendingAmbientReqId = useRef(0);
  // Account / onboarding overlay state. The data behind it lives in the store; the network
  // calls behind the buttons live in src/lib/accountApi.js.
  const [acctBusy, setAcctBusy] = useState(false);
  const [acctError, setAcctError] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [emailPending, setEmailPending] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  // Set when a sign-out could not confirm the upload, so the device was left as it was.
  const [logoutKeptData, setLogoutKeptData] = useState(false);
  // Opened by a password-reset email. Seeded synchronously from the URL because supabase-js
  // strips the token as it starts up; the PASSWORD_RECOVERY listener below is the second route
  // in, for the auth flow where the token is not visible in the address bar at all.
  const [resetOpen, setResetOpen] = useState(arrivedFromRecoveryLink);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotPrefill, setForgotPrefill] = useState('');
  const [acctOpen, setAcctOpen] = useState(false);
  const [editAcctOpen, setEditAcctOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerReturnTo, setPickerReturnTo] = useState('profile');
  const [profileOpen, setProfileOpen] = useState(false);
  const [legal, setLegal] = useState(null);
  const [achListOpen, setAchListOpen] = useState(false);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  // Practice tab settings. Held here (not in the persisted store) so they survive tab switches
  // but reset on reload — the same lifetime the reference's DOM-held state has.
  const [pracCfg, setPracCfg] = useState({
    ops: ['addition', 'subtraction', 'multiplication', 'division', 'percentage'],
    digits: [1, 2],
    terms: [2],
    neg: false,
    dec: false,
    mode: 'time',
    timeMin: 1,
    count: 20,
  });
  const pendingReqId = useRef(0);
  const pendingBrReqId = useRef(0);
  const scrollRef = useRef(null);
  const slideElsRef = useRef({ from: null, to: null });
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // ── Analytics ───────────────────────────────────────────────────────────────
  //
  // Events are captured HERE rather than in the reducer, and that placement is a rule rather
  // than a convenience. The reducer holds every game rule and is driven directly by the scripts
  // in scripts/; a `case` that fired a network call would stop being a pure function of its
  // inputs, and `npm run check` would start emitting events into the real project. Everything
  // below hangs off a callback or reads state the reducer has already settled.

  // Which conversion surface opened the account screen. A ref because nothing renders from it and
  // it must survive the screen being open without causing a re-render of it.
  const convSourceRef = useRef({ source: 'unknown', achievementKey: null });

  // How the player got to the screen they are now on — tapping the nav, swiping between tabs, or
  // neither (a game flow moving them along). "Do people find the tabs by swiping?" is otherwise
  // unanswerable: both routes end in the same setScreen call.
  const navViaRef = useRef('auto');

  // One event per card. The catalogue is consulted for the readable name and rarity so charts do
  // not have to be read as 59 opaque keys — but `key` is what identifies it, because CLAUDE.md
  // says those are permanent and analytics must not invent a second identifier that could drift.
  const trackUnlocked = useCallback((list, milestones) => {
    for (const card of list || []) {
      // Two card shapes exist (see AchievementPopup): a catalogue `{ key }`, and the two ad-hoc
      // cards that have no catalogue row — the streak-lit prompt, and streaks past 365 which keep
      // celebrating forever. The ad-hoc pair are given stable synthetic keys rather than dropped:
      // streak-lit in particular is the centre of the whole conversion funnel.
      const key = card.key
        || (card.nameKey === 'ms_streaklit_name' ? 'streak_lit' : 'streak_beyond_catalogue');
      const ach = ACHIEVEMENT_BY_KEY[key];
      track('achievement_unlocked', {
        key,
        name_en: ach ? ach.en.name : null,
        rarity: ach ? ach.rarity : null,
        achievement_mode: ach ? ach.mode : null,
        counts_towards_total: !!ach,
        total_unlocked: earnedCount(milestones),
      });
    }
  }, []);

  // What this run did to the day's average — the payoff question of the whole averaging model,
  // and the one thing about a replay that cannot be reconstructed after the fact.
  //
  // Read back off the db the reducer has already written, where the run just played is the last
  // counting session of the day. Deliberately not recomputed from the session summary: CLAUDE.md
  // counts the places a day's score is derived and warns about them disagreeing, and analytics
  // must not quietly become another one.
  function challengeAverageMove(diff) {
    if (!diff) return null;
    const counted = countingSessions(todaySessionsFor(state.db, diff));
    if (!counted.length) return null;
    const after = dayAverage(counted);
    const before = counted.length > 1 ? dayAverage(counted.slice(0, -1)) : null;
    return {
      attempt_number_today: counted.length,
      is_replay: counted.length > 1,
      day_average_after: after,
      day_average_before: before,
      day_average_delta: before === null ? null : after - before,
    };
  }

  // Apply dark mode + font size to <body>, matching applyTheme()/applyFontSize().
  useEffect(() => {
    document.body.classList.toggle('dark', !!state.settings.dark);
    // Installed to the Home Screen, iOS paints the status bar area in `theme_color` rather than
    // in whatever the page happens to be showing. A static value in manifest.json would leave a
    // dark-mode player with a white bar above a near-black app, so the meta tag is kept in step
    // with the setting here. The two colours are --bg from index.css, light and dark.
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute('content', state.settings.dark ? '#161513' : '#ffffff');
  }, [state.settings.dark]);
  useEffect(() => {
    document.body.classList.remove('fs-small', 'fs-large');
    if (state.settings.fontSize === 'small') document.body.classList.add('fs-small');
    else if (state.settings.fontSize === 'large') document.body.classList.add('fs-large');
  }, [state.settings.fontSize]);

  useEffect(() => {
    attachAudioUnlock();
    attachGlobalClickSound(() => soundOnRef.current);
  }, []);

  // The other half of the reference's tickMidnightTimers(): if the app is left open across
  // midnight, re-run the streak-break check so the day rolls over without needing a reload.
  useEffect(() => {
    let last = dayKey();
    const iv = setInterval(() => {
      const now = dayKey();
      if (now !== last) {
        last = now;
        dispatch({ type: 'CHECK_STREAK_BREAK' });
        dispatch({ type: 'AMBIENT_ACHIEVEMENTS_CHECK', reqId: ++pendingAmbientReqId.current });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [dispatch]);

  // The same check on open. One Year Strong becomes true while the app is closed, so the moment
  // it is opened again is the only moment it can be noticed.
  useEffect(() => {
    dispatch({ type: 'AMBIENT_ACHIEVEMENTS_CHECK', reqId: ++pendingAmbientReqId.current });
  }, [dispatch]);

  // Cards from either of those, and from the streak restore. Same reqId handshake the session and
  // trick queues use, so a stale result can never be shown twice.
  useEffect(() => {
    const r = state._lastAmbientUnlocked;
    if (!r || r.reqId !== pendingAmbientReqId.current) return;
    trackUnlocked(r.unlocked, state.milestones);
    if (r.unlocked && r.unlocked.length) setAmbientAchievementQueue(r.unlocked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state._lastAmbientUnlocked]);

  const game = useChallengeGame({
    lang,
    soundOn,
    getYestScore: (diff) => getYestChallengeScore(state.db, diff),
    getTodayScore: (diff) => getTodayChallengeScore(state.db, diff),
    // Silent background logging. The standalone Practice tab is its own mode; a warm-up started
    // from the Challenge screen is still Challenge, just not a counting run.
    onAttempt: (a) => recordAttempt({
      sessionId: a.sessionId,
      mode: a.origin === 'practice' ? 'practice' : 'challenge',
      difficulty: a.diff,
      operation: a.operation,
      digits: a.digits,
      terms: a.terms,
      timeMs: a.timeMs,
      isCorrect: a.isCorrect,
    }),
    onGameEnd: (summary) => {
      // Whether this run counted for the day, stamped onto every question answered in it. Under
      // the averaging model that is simply "it was a Challenge run, not a Practice-tab run" —
      // the same condition the reducer applies (`real: !isPrac`), with the `diff` test covering
      // the Practice tab, which has no difficulty and never counts.
      const isReal = !summary.isPrac && !!summary.diff;
      endSession(summary.sessionId, { isReal });

      if (summary.correct === 0 && summary.wrong === 0) {
        // Nothing answered — discard, exactly like the reference's early-return in endGame().
        setScreen(summary.origin === 'practice' ? 'practice' : 'challenge');
        setActiveTab(summary.origin === 'practice' ? 'practice' : 'challenge');
        return;
      }
      const reqId = ++pendingReqId.current;
      dispatch({
        type: 'CHALLENGE_SESSION_COMPLETE',
        reqId,
        diff: summary.diff,
        score: summary.score,
        isPrac: summary.isPrac,
        origin: summary.origin,
        correct: summary.correct,
        wrong: summary.wrong,
        opTimes: summary.opTimes,
        breakdown: summary.breakdown,
        // Ties this stored run to the answers about to be sent, so the server's reply can find it.
        attemptId: summary.sessionId,
        lang,
      });

      // ── Sending the run to be verified ──────────────────────────────────────
      //
      // AFTER the dispatch above, and never awaited. By the time this line runs the score is
      // already computed, the achievements are already unlocked and the result screen is already
      // on its way up — so a slow submission delays nothing, and a failed one costs nothing.
      // The player can tap Play Again while it is still in flight.
      if (summary.verifiable) {
        submitChallengeAttempt({ setId: summary.setId, answers: summary.answers }).then((res) => {
          if (!res || !res.ok) return; // offline, timed out, or the server declined it

          // Compared on the RAW score, not the final one. The two differ by the Braining boost,
          // which the server applies from its own records — and until Braining is wired those
          // records are empty, so a boosted day would disagree by 5% for reasons that are not a
          // disagreement at all. Raw is also exactly what the achievements read.
          if (res.rawScore !== summary.score) {
            // Left alone deliberately. daily_results is what this device believes and
            // verified_daily_results is what the server proved; migration 0007 says they may
            // differ, and rewriting a number the player watched themselves earn would be worse
            // than a divergence nobody sees. Loud in the console, silent on screen.
            console.warn(
              '[verifiedPlay] score disagreement — server %d, this device %d (run left as played)',
              res.rawScore, summary.score
            );
            return;
          }
          // Silent in production: a verified run looks exactly like an unverified one to the
          // player, which is the whole point. The dev build says so out loud, because otherwise
          // the only way to tell the wiring is working is to go and read the database.
          if (import.meta.env.DEV) {
            console.info(
              '[verifiedPlay] run verified — server and device both scored %d (day average now %s over %s attempt(s))',
              res.rawScore, res.dayAverage, res.dayAttempts
            );
          }
          dispatch({ type: 'CHALLENGE_ATTEMPT_VERIFIED', diff: summary.diff, attemptId: summary.sessionId });
        });
      }
    },
  });

  // Reacts once the store has processed a just-finished session (see onGameEnd above).
  useEffect(() => {
    const r = state._lastSessionResult;
    if (!r || r.reqId !== pendingReqId.current) return;
    setResultData(r);
    setAchievementQueue(r.unlocked || []);
    setScreen('result');

    // Reported from here rather than from onGameEnd because the reducer has now run: the db holds
    // this session, so the day's average — before and after — is a fact to be read rather than a
    // number to be predicted.
    const total = r.correct + r.wrong;
    track('game_completed', {
      mode: r.origin === 'practice' ? 'practice' : 'challenge',
      difficulty: r.diff || null,
      is_practice: !!r.isPrac,
      correct: r.correct,
      wrong: r.wrong,
      questions_answered: total,
      accuracy_pct: total ? Math.round((r.correct / total) * 100) : 0,
      // Both numbers, always. `raw_score` is what was earned and `score` is what the day counted;
      // they differ only on the one boosted run a day, and `boost_applied` says which that was.
      // Reporting only the boosted figure would make the boost invisible to the analysis that
      // exists to check the boost.
      raw_score: r.rawScore,
      score: r.score,
      boost_applied: !!r.boosted,
      is_new_best: !!r.isNewBest,
      ...challengeAverageMove(r.isPrac ? null : r.diff),
    });
    trackUnlocked(r.unlocked, state.milestones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state._lastSessionResult]);

  const brGame = useBrainingGame({
    lang,
    soundOn,
    getLastTime: () => getLastBrainingTime(state.brState, dayKey()),
    getTodayTime: () => (brDoneToday(state.brState) ? getTodayBrainingTime(state.brState, dayKey()) : null),
    onAttempt: (a) => recordAttempt({
      sessionId: a.sessionId,
      mode: 'braining',
      difficulty: null, // Braining has a single fixed format, so there is no tier to record
      operation: a.operation,
      digits: a.digits,
      terms: a.terms,
      timeMs: a.timeMs,
      isCorrect: a.isCorrect,
    }),
    onGameEnd: (summary) => {
      // Same reasoning as Challenge above: read before the reducer moves brState.lastDay on.
      endSession(summary.sessionId, {
        isReal: !summary.isPrac && state.brState.lastDay !== dayKey(),
      });
      const reqId = ++pendingBrReqId.current;
      dispatch({
        type: 'BRAINING_SESSION_COMPLETE',
        reqId,
        sec: summary.sec,
        age: brAge(summary.sec),
        isPrac: summary.isPrac,
        // Flawless Brain is the only thing that reads this; the game itself still ignores it.
        wrong: summary.wrong,
        // How many questions this sitting asked, for the cumulative question count.
        total: summary.total,
        opTimes: summary.opTimes,
        // Ties this stored trial to the answers about to be sent, so the reply can find it.
        attemptId: summary.sessionId,
        lang,
      });

      // ── Sending the trial to be verified ────────────────────────────────────
      //
      // After the dispatch, never awaited — the brain-age result is already on its way up. This
      // is also what grants the Challenge boost: the server creates its own boost record when it
      // accepts a counting trial, and that record is the ONLY thing a later Challenge attempt is
      // paid from. Until this request lands the server knows of no boost, which is exactly right
      // — a boost nobody witnessed is a boost nobody earned.
      if (summary.verifiable) {
        submitBrainingAttempt({
          setId: summary.setId,
          answers: summary.answers,
          claimedSec: summary.sec,
        }).then((res) => {
          if (!res || !res.ok) return;
          // Compared on the recorded time, which for Braining is the whole result. The server
          // rounds the claim it was sent, so agreement here is agreement about the run itself.
          if (res.timeSec !== Math.round(summary.sec)) {
            console.warn(
              '[verifiedPlay] time disagreement — server %ds, this device %ds (trial left as played)',
              res.timeSec, Math.round(summary.sec)
            );
            return;
          }
          if (import.meta.env.DEV) {
            console.info(
              '[verifiedPlay] trial verified — %ds, brain age %d%s',
              res.timeSec, res.brainAge, res.recorded ? '' : ' (already recorded today)'
            );
          }
          dispatch({ type: 'BRAINING_ATTEMPT_VERIFIED', attemptId: summary.sessionId });
        });
      }
    },
  });

  useEffect(() => {
    const r = state._lastBrResult;
    if (!r || r.reqId !== pendingBrReqId.current) return;
    setBrResultData(r);
    setBrAchievementQueue(r.unlocked || []);
    setScreen('br-result');

    // A counting trial is also the moment the Challenge boost is granted, so this event doubles as
    // "boost earned". There is deliberately no separate event for that: the boost is spent on a
    // Challenge run that reports `boost_applied`, so earned-versus-unspent already falls out as a
    // funnel between the two, and a dedicated pair would be a second way to say the same thing.
    track('game_completed', {
      mode: 'braining',
      is_practice: !!r.isPrac,
      duration_sec: Math.round(r.sec),
      brain_age: r.age,
      is_first_ever: !!r.isFirst,
      is_personal_best: !!r.isPR,
      grants_boost: !r.isPrac,
    });
    trackUnlocked(r.unlocked, state.milestones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state._lastBrResult]);

  const chDone = chDoneToday(state.db);
  const brDone = brDoneToday(state.brState);

  const handleSelectTab = useCallback((tab) => {
    navViaRef.current = 'tap';
    setActiveTab(tab);
    setScreen(tab);
    // Re-key the screen so the .tab-fade-in animation replays on every switch, matching
    // showTab()'s fade in the reference.
    setTabAnimKey((k) => k + 1);
  }, []);

  // Swiping moves the nav highlight immediately and slides the screens underneath it, so the
  // pill travels alongside the content instead of snapping into place once the slide is over.
  // Only `screen` (what is actually rendered) waits for the animation to finish.
  const handleSwipeTab = useCallback(
    (tab, dir) => {
      if (slide) return; // already animating
      navViaRef.current = 'swipe';
      // Start from the top, the same place tapping a nav icon leaves you. Without this the
      // scroll offset carries into a screen of a different height and the page appears to jump.
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      setSlide({ from: activeTab, to: tab, dir });
      setActiveTab(tab);
    },
    [activeTab, slide]
  );

  // Drives the slide: park the incoming screen off-screen, let the browser paint that frame,
  // then transition both screens across.
  //
  // The wait for a painted frame matters — the incoming screen can be heavy (Tricks renders
  // ~180 nodes), and starting the transition in the same frame it mounts means the first frames
  // are eaten by that work, which is what reads as jitter. Transforms are 3D so the compositor
  // handles the movement rather than the main thread.
  useLayoutEffect(() => {
    if (!slide) return;
    const fromEl = slideElsRef.current.from;
    const toEl = slideElsRef.current.to;
    if (!fromEl || !toEl) return;

    const enterFrom = slide.dir === 'left' ? 100 : -100;
    const exitTo = slide.dir === 'left' ? -100 : 100;
    const EASE = 'transform .32s cubic-bezier(.32,.72,0,1)'; // iOS-style: quick out, soft settle

    [fromEl, toEl].forEach((el) => { el.style.willChange = 'transform'; });
    toEl.style.transition = 'none';
    toEl.style.transform = 'translate3d(' + enterFrom + '%,0,0)';
    fromEl.style.transition = 'none';
    fromEl.style.transform = 'translate3d(0,0,0)';

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        fromEl.style.transition = EASE;
        toEl.style.transition = EASE;
        fromEl.style.transform = 'translate3d(' + exitTo + '%,0,0)';
        toEl.style.transform = 'translate3d(0,0,0)';
      });
    });

    // Commit slightly after the transition ends so the final frame is never cut off.
    const timer = setTimeout(() => {
      setScreen(slide.to);
      setTabAnimKey((k) => k + 1);
      setSlide(null);
    }, 360);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
    };
  }, [slide]);

  // Swipe left/right between the four home screens (reference: attachSwipeHandlers).
  // Only enabled while one of those screens is showing — never mid-game, never mid-slide.
  useSwipeTabs({
    containerRef: scrollRef,
    activeTab,
    enabled: TAB_ORDER.indexOf(screen) !== -1 && !slide,
    onSwitchTab: handleSwipeTab,
  });

  // ── Screens ─────────────────────────────────────────────────────────────────
  //
  // A custom event rather than a $pageview, because this app has no router: the address bar never
  // changes, so PostHog's automatic pageview fires once on load and never again. Synthesising one
  // per screen was rejected — they would all carry the identical URL, and would corrupt bounce
  // rate and session length by looking like navigation that never happened.
  useEffect(() => {
    track('screen_viewed', { screen, via: navViaRef.current });
    navViaRef.current = 'auto'; // game-flow transitions are neither a tap nor a swipe
  }, [screen]);

  // ── Streak ──────────────────────────────────────────────────────────────────
  //
  // A break has no callback to hang off: the reducer notices it inside CHECK_STREAK_BREAK, which
  // can fire from the midnight timer with nobody touching the screen. So it is read off a state
  // transition instead — a previous-value ref compared each render. This notices; it decides
  // nothing and changes nothing.
  const prevStreakRef = useRef(null);
  useEffect(() => {
    const prev = prevStreakRef.current;
    prevStreakRef.current = {
      streak: state.streak || 0,
      pendingRestore: state.pendingRestore,
      creditedForDay: state.streakCreditedForDay,
    };
    if (!prev) return; // first render: nothing to compare against, and nothing has happened

    // The reducer sets pendingRestore at the same moment it zeroes the streak, so this is exactly
    // the break. `restore_offered` doubles as "the restore modal was shown" — it is the same
    // condition the modal itself renders on, so a separate shown-event would say nothing new.
    if (!prev.pendingRestore && state.pendingRestore) {
      track('streak_broken', {
        broken_value: state.pendingRestore.brokenValue,
        restore_offered: !!state.pendingRestore.availableAtBreak,
      });
    }

    // The day banked. `streakCreditedForDay` moving on is the reducer's own definition of that,
    // so this reports the rule rather than a second guess at it.
    if (state.streakCreditedForDay !== prev.creditedForDay && (state.streak || 0) > prev.streak) {
      track('streak_credited', {
        streak_length: state.streak,
        // Either mode earns the day now; this says which one actually did it today.
        via: chDoneToday(state.db) ? 'challenge' : 'braining',
        is_new_best: (state.streak || 0) >= (state.bestStreakEver || 0),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.streak, state.pendingRestore, state.streakCreditedForDay]);

  // ── Push notifications ────────────────────────────────────────────────────────────────────
  //
  // Loading the SDK asks for nothing and subscribes nobody. It only makes the capability checks
  // answerable, so the settings screen can say something true about this device instead of
  // guessing. The permission dialog is only ever opened from a tap on our own opt-in card.
  useEffect(() => {
    initNotifications();
    // Readable from the browser console as `__cifriNotif()`, on a real phone, where the interesting
    // failures happen. Push errors are deliberately swallowed so they can never reach the game —
    // which is also how an ordering bug once left a subscriber with no tags at all and nothing
    // anywhere to say so. This costs one global and makes that class of failure answerable.
    window.__cifriNotif = notificationDiagnostics;
  }, []);

  // Publish what the sender is allowed to know, whenever the state behind it settles.
  //
  // Read-only, like the analytics effects above and for the same reason: it watches state and
  // never changes it, so no game rule can come to depend on a network call having succeeded.
  // `syncTags` derives everything through the pure builder in notificationTags.js, which is what
  // `npm run check:notify` drives against the real reducer.
  //
  // The dependency list is every input that builder reads. `settings` covers both the reminder
  // preference and the language a notification should be written in.
  useEffect(() => {
    syncTags(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.streak,
    state.streakCreditedForDay,
    state.brBoostDay,
    state.pendingRestore,
    state.settings,
  ]);

  // ── The reminder opt-in ───────────────────────────────────────────────────────────────────
  //
  // Where it is allowed to appear. An ALLOWLIST rather than a list of screens to avoid, for the
  // reason analytics.js gives about production hostnames: a screen added later and forgotten
  // should default to silence, not to interrupting whatever it turned out to be. Interrupting a
  // running Challenge with a permission dialog would cost the player the run.
  const NOTIF_ASK_SCREENS = ['challenge', 'braining', 'result', 'br-result'];

  useEffect(() => {
    // Asked once on this device, ever. Not once a day: a browser "Block" cannot be undone from
    // inside the app, so a second ask has nothing to win and the settings row is the way back for
    // anyone who says no and later changes their mind.
    if (state.notifAskedDay) return;
    if (state.settings.notif && state.settings.notif.enabled) return;
    // A day has to be banked first — the card's whole claim is that there is now a streak worth
    // protecting, and before that it would be asking on behalf of nothing.
    if (!(state.streak > 0)) return;
    if (notifStatus.capability === 'unsupported' || notifStatus.blocked) return;
    // Never stack on top of something else that is already talking.
    if (trickAchievementQueue.length || ambientAchievementQueue.length) return;
    if (state.pendingRestore) return;
    if (NOTIF_ASK_SCREENS.indexOf(screen) === -1) return;
    setNotifCardOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.streak,
    state.notifAskedDay,
    state.settings.notif,
    state.pendingRestore,
    notifStatus.capability,
    notifStatus.blocked,
    trickAchievementQueue,
    ambientAchievementQueue,
    screen,
  ]);

  // Both answers record that the asking happened, so neither one leaves the card able to return.
  function closeNotifCard(outcome) {
    setNotifCardOpen(false);
    track('notif_prompt_answered', { outcome, streak: state.streak });
    dispatch({ type: 'NOTIF_ASKED' });
  }

  async function handleNotifAllow() {
    const ok = await notifStatus.enable();
    // The preference is only stored if permission actually arrived. Recording "on" after a refusal
    // would leave the settings toggle claiming to send something this device cannot send.
    if (ok) {
      dispatch({
        type: 'SET_SETTING',
        key: 'notif',
        value: { ...(state.settings.notif || { hour: 19 }), enabled: true },
      });
    }
    closeNotifCard(ok ? 'granted' : 'denied');
  }

  // No daily cap and no first-trial guard: Challenge can be started as many times as the player
  // wants, and each run is folded into today's average. (Braining keeps its own guard, in
  // handleStartBraining below — that mode is unchanged.)
  // Starts a counting Challenge run: asks for a question set and shows the countdown.
  //
  // THE REQUEST IS NOT AWAITED, and that is the point rather than an oversight. It is sent and
  // forgotten, and whatever it has managed by the time the countdown ends is what gets used — see
  // handleCountdownDone. The countdown is four 800ms steps and the request is typically a couple
  // of hundred milliseconds, so the set is there essentially always; but "essentially always" is
  // not a guarantee, and the guarantee that matters is that the game starts on time whatever the
  // network is doing.
  function startChallengeCountdown(diff) {
    // Counted before the run exists, so this is how many counting runs the day already had.
    const priorToday = countingSessions(todaySessionsFor(state.db, diff)).length;
    track('game_started', {
      mode: 'challenge',
      difficulty: diff,
      is_practice: false,
      is_replay: priorToday > 0,
      attempt_number_today: priorToday + 1,
    });

    pendingSetRef.current = null;
    const token = ++setRequestRef.current;

    issueChallengeSet(diff).then((set) => {
      // Null covers guest, offline, timed out and rate limited alike. All four mean the same
      // thing to the game — play locally — which is why none of them is handled separately.
      if (!set || setRequestRef.current !== token) return;
      // The questions are drawn HERE, during the countdown, rather than inside game.begin(), so
      // that generating eighty of them never lands in the frame the game starts on.
      pendingSetRef.current = {
        setId: set.setId,
        diff,
        questions: engineFor(lang, set.seed).challengeSet(diff, set.setSize),
      };
    });

    setCountdownInfo({
      diff, isPrac: false, pcfg: null, origin: 'challenge',
      label: diffLabel(lang, diff) + ' ' + t('challenge_word'),
    });
    setScreen('countdown');
  }

  function handleStartChallenge() {
    startChallengeCountdown(state.selDiff);
  }

  // The standalone Practice tab. `custom: true` routes question generation to the
  // parameter-driven practice engine, so the settings below actually take effect.
  function handleStartCustomPractice() {
    if (!pracCfg.ops.length || !pracCfg.digits.length || !pracCfg.terms.length) return;
    const cfg = {
      custom: true,
      ops: pracCfg.ops,
      digits: pracCfg.digits,
      terms: pracCfg.terms,
      neg: pracCfg.neg,
      dec: pracCfg.dec,
      mode: pracCfg.mode,
      timeSec: pracCfg.timeMin * 60,
      count: pracCfg.count,
      dm: 1.0,
    };
    // The Practice tab's settings are the interesting part of this event: they say which
    // operations people actually choose to drill, which no other mode can reveal.
    track('game_started', {
      mode: 'practice',
      is_practice: true,
      ops: pracCfg.ops,
      digits: pracCfg.digits,
      terms: pracCfg.terms,
      allow_negative: pracCfg.neg,
      allow_decimal: pracCfg.dec,
      length_mode: pracCfg.mode,
      duration_min: pracCfg.mode === 'time' ? pracCfg.timeMin : null,
      question_count: pracCfg.mode === 'time' ? null : pracCfg.count,
    });
    setCountdownInfo({ diff: null, isPrac: true, pcfg: cfg, origin: 'practice', label: t('practice_mode') });
    setScreen('countdown');
  }

  // A pending streak-restore offer expires 24 hours after the break. Checked on mount, the
  // same point the reference calls maybeShowStreakRestoreModal().
  useEffect(() => {
    if (!state.pendingRestore) return;
    const hoursSince = (Date.now() - state.pendingRestore.brokenAtMs) / 3600000;
    if (hoursSince >= 24) {
      track('streak_restore_expired', { broken_value: state.pendingRestore.brokenValue });
      dispatch({ type: 'STREAK_RESTORE_EXPIRE' });
    }
  }, [state.pendingRestore, dispatch]);

  // ── Account / onboarding (real Supabase auth; the calls live in src/lib/accountApi.js) ──
  // Onboarding shows for a brand-new player, and again after logging out — the reference
  // returns you there with your username prefilled rather than to a bare login screen.
  const needsOnboarding = !state.username || !!state._loggedOut;

  // `source` is which of the six conversion surfaces sent us here. It is threaded from the button
  // that was tapped rather than guessed at, because all six used to arrive here as one
  // indistinguishable call — and "which ask actually converts" is the question this whole flow
  // exists to answer.
  function openAccountCreation(source, achievementKey) {
    convSourceRef.current = { source: source || 'unknown', achievementKey: achievementKey || null };
    track('account_create_started', {
      source: convSourceRef.current.source,
      achievement_key: convSourceRef.current.achievementKey,
    });
    setSavePromptOpen(false);
    setProfileOpen(false);
    setAcctError('');
    setAcctOpen(true);
  }

  // Signup. The guest's existing progress is handed to signUpWithProfile and uploaded as part
  // of creating the account, so there is no window in which the account exists but the player's
  // streak and history do not.
  async function handleSignup(d) {
    if (acctBusy) return;
    setAcctBusy(true);
    setAcctError('');
    const payload = toSyncPayload(state);
    const res = await signUpWithProfile({
      email: d.email,
      password: d.password,
      username: d.username,
      fullName: d.fullName,
      avatar: state.avatar,
      localState: state,
    });
    setAcctBusy(false);
    if (!res.ok) {
      // The failure REASON only — never the address that failed. `res.error` is already a short
      // code rather than a message, which is what makes it safe to send.
      track('account_create_failed', { source: convSourceRef.current.source, reason: res.error || 'unknown' });
      // A lost race on the username is shown against the username field's own message, which
      // the live check already owns — everything else gets the shared error line.
      setAcctError(res.error === 'taken' ? 'username_taken' : errorKey(res.error));
      return;
    }

    // The shape of the guest life that led here. Every number is read off the state as it was a
    // moment ago, before ACCOUNT_CREATED lands — this is the only moment "what did they do before
    // signing up" can be answered, and it cannot be reconstructed afterwards.
    const guestSessions = ['easy', 'medium', 'hard']
      .reduce((n, dd) => n + (((state.db[dd] || {}).sessions) || []).length, 0);
    track('account_created', {
      source: convSourceRef.current.source,
      achievement_key: convSourceRef.current.achievementKey,
      days_as_guest: state.firstOpenDate ? daysBetweenKeys(state.firstOpenDate, dayKey()) : 0,
      streak_at_signup: state.streak || 0,
      best_streak_at_signup: state.bestStreakEver || 0,
      achievements_at_signup: earnedCount(state.milestones),
      challenge_runs_as_guest: guestSessions,
      braining_runs_as_guest: ((state.brState || {}).sessions || []).length,
    });

    dispatch({ type: 'ACCOUNT_CREATED', username: d.username, email: d.email, fullName: d.fullName });
    // Device and server now hold the same thing, so sync starts from that as its baseline.
    beginSync(payload);
    setAcctOpen(false);
  }

  // Login. Authenticating is only half of it — the account's saved progress is downloaded and
  // adopted before the screen closes, so the player never sees a blank app on a new device.
  async function handleLogin({ identifier, password }) {
    if (loginBusy) return { ok: false };
    setLoginBusy(true);
    const res = await signInWithIdentifier({ identifier, password });
    if (!res.ok) {
      setLoginBusy(false);
      return { ok: false, messageKey: res.error === 'invalid_credentials' ? 'login_error' : errorKey(res.error) };
    }
    const acct = await fetchAccount();
    setLoginBusy(false);
    if (!acct.ok || !acct.profile) return { ok: false, messageKey: 'err_generic' };

    track('logged_in', { had_local_progress: hasMeaningfulProgress(state) });

    dispatch({
      type: 'ACCOUNT_LOADED',
      username: acct.profile.username,
      email: acct.email,
      fullName: acct.profile.full_name || '',
      avatar: acct.profile.avatar,
      synced: acct.syncedState,
    });
    dispatch({ type: 'CHECK_STREAK_BREAK' });
    // If the account somehow has no saved progress yet, pass no baseline so the very next
    // change uploads the whole thing rather than being skipped as unchanged.
    beginSync(acct.hasRemoteState ? acct.syncedState : null);
    setLoginOpen(false);
    return { ok: true };
  }

  useEffect(() => onAuthChange((event) => {
    if (event === 'PASSWORD_RECOVERY') setResetOpen(true);
  }), []);

  // Saving the edit-account screen. Username and full name land immediately; an email change
  // only starts a confirmation, so the screen stays open to say so rather than closing on a
  // change that has not actually happened yet.
  async function handleEditAccount(d) {
    if (editBusy) return;
    setEditBusy(true);
    setEditError('');
    setEmailPending(false);

    const res = await updateProfile({ username: d.username, fullName: d.fullName });
    if (!res.ok) {
      setEditBusy(false);
      setEditError(res.error === 'taken' ? 'username_taken' : errorKey(res.error));
      return;
    }

    // The profile write has already landed on the server, so record it locally now. Doing this
    // only after the email step would mean a failed email change left the app showing the old
    // username while the database held the new one.
    dispatch({ type: 'ACCOUNT_EDIT', username: d.username, fullName: d.fullName });

    const emailChanged = d.email && d.email.toLowerCase() !== (state.acctData.email || '').toLowerCase();
    if (emailChanged) {
      const em = await requestEmailChange(d.email);
      if (!em.ok) {
        setEditBusy(false);
        setEditError(errorKey(em.error));
        return;
      }
    }

    setEditBusy(false);
    if (emailChanged) setEmailPending(true);
    else setEditAcctOpen(false);
  }

  // Verified by signing in again as the same account — see changePassword() for why that is the
  // safe way to prove knowledge of the old password.
  async function handleChangePassword({ currentPassword, newPassword }) {
    const res = await changePassword({ currentPassword, newPassword });
    if (!res.ok) return { ok: false, error: res.error, messageKey: errorKey(res.error) };
    return { ok: true };
  }

  // Permanent, and the local copy goes too — otherwise the next person on this device would
  // inherit the deleted player's history as guest progress.
  async function handleDeleteAccount() {
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    const res = await deleteAccount();
    setDeleteBusy(false);
    if (!res.ok) {
      // Stay on the confirmation rather than closing, so a failure is impossible to mistake for
      // a deletion that succeeded.
      setDeleteError('err_generic');
      return;
    }
    // Before the reload, for the same reason as logout above: after it there is no one to
    // attribute it to.
    track('account_deleted');
    setConfirm(null);
    localStorage.removeItem('cifri_react_v1');
    location.reload();
  }

  // Logout ends the real Supabase session. Local progress is kept, exactly as before — but it
  // is a local copy now, no longer syncing anywhere.
  async function handleLogout() {
    setConfirm(null);
    // Ask BEFORE signOut(), while the session still exists — the final upload needs it. Whether
    // this device may be wiped is entirely this answer: true only if the server is confirmed to
    // hold everything here, false if it could not be reached. Never assumed.
    const saved = await confirmProgressSaved();
    // Sent before signOut(), which is what triggers resetIdentity() — after it this event would
    // be attributed to a fresh anonymous person rather than to whoever actually left.
    track('logged_out', { progress_saved: saved });
    await signOut();
    dispatch({ type: 'ACCOUNT_SIGNED_OUT', wipeProgress: saved });
    // Said out loud rather than left to be discovered. A player who expects a clean device and
    // finds their history still on it deserves to know why, and that it is not yet backed up.
    if (!saved) setLogoutKeptData(true);
  }

  // Backing out without submitting counts as dismissing a dedicated conversion ask, so later
  // nudges become the small banner rather than another full-screen prompt.
  function closeAccountCreation() {
    setAcctOpen(false);
    if (!state.acctCreated) {
      // Backed out without signing up. Reported against the surface that made the ask, so the
      // funnel reads shown → started → abandoned-or-created per surface rather than in aggregate.
      track('account_prompt_dismissed', {
        source: convSourceRef.current.source,
        stage: 'create_screen',
      });
      dispatch({ type: 'GUEST_PROMPT_DISMISSED' });
    }
  }

  // The 5-day fallback prompt: once ever, only if a streak has never been lit (if it has, the
  // dedicated streak-lit popup already made this ask), and only for a guest.
  useEffect(() => {
    if (state.acctCreated || state.savePromptShown || !state.firstOpenDate) return;
    if (state.bestStreakEver > 0) return;
    const days = Math.round(
      (dateStrToDate(dayKey()).getTime() - dateStrToDate(state.firstOpenDate).getTime()) / 86400000
    );
    if (days >= 5) {
      track('account_prompt_shown', { source: 'fallback_prompt', days_as_guest: days });
      dispatch({ type: 'SAVE_PROMPT_SHOWN' });
      setSavePromptOpen(true);
    }
  }, [state.acctCreated, state.savePromptShown, state.firstOpenDate, state.bestStreakEver, dispatch]);

  const guestBannerVisible =
    !state.acctCreated && state.anyGuestPromptDismissed && state.guestBannerLastShownDay !== dayKey();

  // The banner is already capped to once a day by the condition above, so this needs no cap of
  // its own — it fires at most once per guest per day, which is what makes it comparable with the
  // other two prompts rather than drowning them.
  useEffect(() => {
    if (guestBannerVisible) track('account_prompt_shown', { source: 'guest_banner' });
  }, [guestBannerVisible]);

  // The picker covers the whole screen at a higher layer than everything that opens it, so a
  // screen underneath it is hidden just as completely as one that has been closed — and can be
  // left mounted. That difference is the whole fix for a real bug: closing the account screen
  // unmounted nothing but DID make it "reopen" on the way back, and reopening is what refills its
  // fields from the store. Someone who typed an email, a password and a name and then went to
  // pick a picture came back to three empty boxes. Only the profile sheet is genuinely dismissed,
  // because it is a bottom sheet that would otherwise sit half over the picker, and it holds
  // nothing a player could lose.
  function openIconPicker(returnTo) {
    setPickerReturnTo(returnTo);
    setProfileOpen(false);
    setPickerOpen(true);
  }

  // Approve commits the draft; Back throws it away, so nothing is ever half-saved. Either way
  // we return to whichever screen opened the picker.
  function closeIconPicker(draft) {
    if (draft) {
      // The reward ladder's payoff: which icons and symbols people actually choose to wear once
      // an achievement has unlocked them.
      track('avatar_changed', { avatar_type: draft.type, avatar_value: draft.value, color: draft.color });
      dispatch({ type: 'SET_AVATAR', avatar: draft });
      // The avatar lives in the profiles table, not in the synced progress blob, so it needs
      // its own write. Not awaited: the picker should close instantly, and a failed write just
      // means the server still holds the previous icon until the next change.
      if (state.acctCreated) updateProfile({ avatar: { ...draft, customized: true } });
    }
    setPickerOpen(false);
    if (pickerReturnTo === 'profile') setProfileOpen(true);
  }

  // ── Tricks ──
  // Both entry points may unlock an achievement, and the reference shows those BEFORE revealing
  // what you tapped (queueAndShowMilestones(unlocked, thenReveal)). This ref holds that reveal.
  const afterTrickAchievementsRef = useRef(null);

  // Opening a practice drill unlocks nothing, so this just opens it. It used to dispatch
  // PRACTICE_TRICK first, which awarded First Trick before the player had answered anything —
  // see the note above TRICK_PRACTICE_COMPLETE for where that credit lives now.
  // `gi-ti` is the same identifier trickStats and the achievement credit use, so a trick can be
  // followed from "opened" through to "passed" without a second naming scheme to keep in step.
  function handlePracticeTrick(gi, ti) {
    track('game_started', { mode: 'trick_practice', trick_id: gi + '-' + ti, trick_group: gi });
    setTrickGame({ gi, ti, mode: 'practice' });
    setScreen('trickgame');
  }

  function handleTestTrick(gi, ti) {
    track('game_started', { mode: 'trick_test', trick_id: gi + '-' + ti, trick_group: gi });
    setTrickGame({ gi, ti, mode: 'test' });
    setScreen('trickgame');
  }

  // A drill that ran all the way to its twentieth question. Called at the moment the run ends,
  // before the end card is even shown, so a result can never be lost by closing the app on it.
  // Any achievement earned pops over the end card; dismissing it leaves the player right there.
  const handleTrickRunComplete = useCallback((result) => {
    if (!trickGame) return;
    const { gi, ti, mode } = trickGame;

    // A failed Test stops at the wrong answer, so `correct` is how far it got rather than a score
    // out of twenty — which is exactly what makes it worth recording: it says where in a trick
    // people come unstuck.
    track('game_completed', {
      mode: mode === 'test' ? 'trick_test' : 'trick_practice',
      trick_id: gi + '-' + ti,
      trick_group: gi,
      ...(mode === 'test'
        ? { passed: !!result.passed, correct_before_end: result.correct, test_length: TEST_LENGTH }
        : { first_try_correct: result.correct, questions_answered: PRACTICE_LENGTH }),
    });

    const reqId = ++pendingTrickReqId.current;
    afterTrickAchievementsRef.current = null;
    if (mode === 'test') {
      dispatch({
        type: 'TRICK_TEST_COMPLETE', reqId, gi, ti,
        // `correct` is how far a failed Test got before the wrong answer ended it, which is what
        // the cumulative question count needs — a Test that stopped at question three asked three
        // questions, not twenty.
        passed: result.passed, correct: result.correct, total: TEST_LENGTH, totalTricks: TRICKS_FLAT.length,
      });
    } else {
      dispatch({
        type: 'TRICK_PRACTICE_COMPLETE', reqId, gi, ti,
        firstTryCorrect: result.correct, total: PRACTICE_LENGTH, totalTricks: TRICKS_FLAT.length,
      });
    }
  }, [trickGame, dispatch]);

  // "Play again" from the end card. Re-mounting resets the drill: a Test replays the same fixed
  // twenty, practice draws twenty fresh ones.
  const handleTrickAgain = useCallback(() => {
    setTrickGame((g) => (g ? { ...g, run: Date.now() } : g));
  }, []);

  function handleOpenTrickOfDay() {
    const idx = trickOfDayIndex();
    track('trick_of_day_opened', { trick_index: idx, first_time_today: state.totdLastViewed !== dayKey() });
    const reqId = ++pendingTrickReqId.current;
    afterTrickAchievementsRef.current = () => {
      handleSelectTab('tricks');
      setTricksOpenIndex(idx);
    };
    dispatch({ type: 'VIEW_TRICK_OF_DAY', reqId, total: TRICKS_FLAT.length });
  }

  useEffect(() => {
    const r = state._lastTrickUnlocked;
    if (!r || r.reqId !== pendingTrickReqId.current) return;
    trackUnlocked(r.unlocked, state.milestones);
    const reveal = afterTrickAchievementsRef.current;
    afterTrickAchievementsRef.current = null;
    if (r.unlocked && r.unlocked.length) {
      // Queue the cards; the reveal runs once the player dismisses the last one.
      setTrickAchievementQueue(r.unlocked);
      afterTrickAchievementsRef.current = reveal;
    } else if (reveal) {
      reveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state._lastTrickUnlocked]);

  function handleTrickAchievementsDone() {
    setTrickAchievementQueue([]);
    const reveal = afterTrickAchievementsRef.current;
    afterTrickAchievementsRef.current = null;
    if (reveal) reveal();
  }

  function handleExitTrick() {
    setTrickGame(null);
    setScreen('tricks');
  }

  function handleCountdownDone() {
    const { diff, isPrac, pcfg, origin } = countdownInfo;
    // The one moment the prefetch is consulted, and it is consulted exactly once. A set that has
    // not arrived by now is not waited for and not retried — the run plays locally and simply is
    // not verified. A reply landing a moment later finds its token stale and is discarded.
    //
    // The difficulty is re-checked because the set was issued for a specific tier: a player who
    // somehow changed difficulty between tapping Start and the countdown ending must not be given
    // Hard questions marked against an Easy key.
    const pending = pendingSetRef.current;
    pendingSetRef.current = null;
    setRequestRef.current++;
    const serverSet = pending && pending.diff === diff ? pending : null;

    game.begin(diff, isPrac, pcfg, origin, serverSet);
    setScreen('game');
  }

  // Where people give up. The counterpart to game_completed, and the more informative half of the
  // pair: a run that ended is a run that worked, while a run walked out of is the thing to fix.
  function handleQuitConfirm() {
    const s = game.session;
    track('game_quit', {
      mode: countdownInfo && countdownInfo.origin === 'practice' ? 'practice' : 'challenge',
      difficulty: (countdownInfo && countdownInfo.diff) || null,
      questions_answered: s ? (s.correct || 0) + (s.wrong || 0) : 0,
      seconds_remaining: s && !s.isUnlim && !s.isCountMode ? s.timer : null,
    });
    const { origin, sessionId } = game.quit();
    // A quit session is discarded by the game and records nothing, so its attempts are dropped
    // too rather than being logged as a partial run.
    discardSession(sessionId);
    setQuitOpen(false);
    setScreen(origin === 'practice' ? 'practice' : 'challenge');
    setActiveTab(origin === 'practice' ? 'practice' : 'challenge');
  }

  // againGame(): a Challenge-origin run replays as another COUNTING run on the same difficulty,
  // which is the same bet the green button on the home screen offers — it moves today's average.
  // A Practice-tab run replays the same custom setup and counts for nothing, as before.
  function handlePlayAgain() {
    const { origin, diff } = resultData;
    setResultData(null);
    if (origin === 'challenge') {
      // Goes through the same path as the home screen's button, so a replay gets its own freshly
      // issued set. It has to: a set is single-use, and replaying the questions just answered
      // would be the memorisation problem the per-attempt design exists to avoid.
      startChallengeCountdown(diff);
    } else {
      handleStartCustomPractice();
    }
  }

  // backHome(): origin decides where to return — the Challenge screen and the Practice tab both
  // end in a result screen, and only `origin` distinguishes which one to go back to.
  function handleBackHome() {
    const origin = resultData && resultData.origin;
    setResultData(null);
    setScreen(origin === 'practice' ? 'practice' : 'challenge');
    setActiveTab(origin === 'practice' ? 'practice' : 'challenge');
  }

  // ── Braining ──
  function handleStartBraining(isPrac) {
    if (!isPrac && brDoneToday(state.brState)) return; // today's trial already counted

    // Tracked after that guard, not before: a tap that the daily cap silently swallows started
    // no game, and recording it as one would invent trials that were never played.
    track('game_started', { mode: 'braining', is_practice: !!isPrac });

    // Only the day's counting trial is worth verifying. A practice run records nothing, so there
    // is nothing about it to check — and skipping the request is what keeps the practice button
    // as instant as it has always been.
    pendingBrSetRef.current = null;
    if (!isPrac) {
      const token = ++brSetRequestRef.current;
      issueBrainingSet().then((set) => {
        if (!set || brSetRequestRef.current !== token) return;
        pendingBrSetRef.current = {
          setId: set.setId,
          questions: brMakeSession(set.setSize, set.seed),
        };
      });
    }

    setBrCountdownInfo({
      isPrac,
      sub: t('br_cd_sub', { n: isPrac ? 20 : 50 }),
      mode: isPrac ? t('practice_mode_not_counted') : null,
    });
    setScreen('br-countdown');
  }

  function handleBrCountdownDone() {
    // Consulted once, exactly as Challenge does it. A set that has not arrived by now is not
    // waited for: the trial plays locally, counts locally, and simply is not verified.
    const pending = pendingBrSetRef.current;
    pendingBrSetRef.current = null;
    brSetRequestRef.current++;

    brGame.begin(brCountdownInfo.isPrac, brCountdownInfo.isPrac ? null : pending);
    setScreen('br-game');
  }

  function handleBrQuitConfirm() {
    // How far into the fifty a person got before quitting — the single most useful number about
    // Braining, since the mode's whole risk is that it is too long to finish.
    const s = brGame.session;
    track('game_quit', {
      mode: 'braining',
      is_practice: !!(s && s.isPrac),
      questions_answered: s ? s.qIdx : 0,
      questions_total: s ? s.total : null,
      elapsed_sec: s ? Math.round(s.elapsed) : null,
    });
    discardSession(brGame.quit().sessionId);
    setBrQuitOpen(false);
    setScreen('braining');
  }

  function handleBrTryAgain() {
    setBrResultData(null);
    handleStartBraining(true);
  }

  function handleBrBack() {
    setBrResultData(null);
    setScreen('braining');
  }

  const showNav = ['countdown', 'game', 'br-countdown', 'br-game', 'trickgame'].indexOf(screen) === -1;
  const isTabScreen = TAB_ORDER.indexOf(screen) !== -1;

  // One tab's content, so the swipe animation can render two of them side by side.
  function renderTabContent(tab) {
    if (tab === 'challenge') {
      return (
        <>
        <GuestBanner
          visible={guestBannerVisible}
          onCreateAccount={openAccountCreation}
          onDismiss={() => {
            track('account_prompt_dismissed', { source: 'guest_banner', stage: 'prompt' });
            dispatch({ type: 'DISMISS_GUEST_BANNER' });
          }}
        />
        <ChallengeHomeScreen
          db={state.db}
          selDiff={state.selDiff}
          onSelDiff={(d) => dispatch({ type: 'SET_SEL_DIFF', diff: d })}
          chRange={state.chRange}
          onChRange={(r) => dispatch({ type: 'SET_CH_RANGE', range: r })}
          onStartChallenge={handleStartChallenge}
          totdLastViewed={state.totdLastViewed}
          onOpenTrickOfDay={handleOpenTrickOfDay}
        />
        </>
      );
    }
    if (tab === 'braining') {
      return (
        <BrainingHomeScreen
          brState={state.brState}
          chartRange={state.brChartRange}
          chartType={state.brChartType}
          onChartRange={(r) => dispatch({ type: 'SET_BR_CHART_RANGE', range: r })}
          onChartType={(ty) => dispatch({ type: 'SET_BR_CHART_TYPE', chartType: ty })}
          onStart={() => handleStartBraining(false)}
          onPractice={() => handleStartBraining(true)}
          totdLastViewed={state.totdLastViewed}
          onOpenTrickOfDay={handleOpenTrickOfDay}
        />
      );
    }
    if (tab === 'practice') {
      return <PracticeScreen cfg={pracCfg} onChange={setPracCfg} onStart={handleStartCustomPractice} />;
    }
    if (tab === 'tricks') {
      return (
        <TricksScreen
          openIndex={tricksOpenIndex}
          onOpenedIndexConsumed={() => setTricksOpenIndex(null)}
          onPractice={handlePracticeTrick}
          onTest={handleTestTrick}
          trickStats={state.trickStats}
        />
      );
    }
    return null;
  }

  return (
    <div className="wrap">
      <Header
        db={state.db} brState={state.brState} streak={state.streak}
        streakRestoreAvailable={state.streakRestoreAvailable}
        username={state.username} avatar={state.avatar}
        onOpenProfile={() => setProfileOpen(true)}
      />
      <div className="scroll" ref={scrollRef}>
        {slide ? (
          // Mid-swipe: both screens are on-screen and absolutely positioned (.swiping), sliding
          // horizontally past each other.
          //
          // They need a wrapper that holds its own height: taken out of flow, they leave the
          // scroll container with nothing to size against, it collapses, and the page visibly
          // jumps. The wrapper keeps the viewport's height for the duration, and clips the
          // outgoing screen so it can't widen the page as it leaves.
          // height:100% (rather than the measured pixel height this used to need) works now that
          // .scroll has a definite height — and it is the only version that stays exactly the
          // visible area, so a swipe cannot itself introduce a scroll. See v16 item 1 in the CSS.
          <div style={{ position: 'relative', overflow: 'hidden', height: '100%' }}>
            <div className="scr on swiping" ref={(el) => (slideElsRef.current.from = el)}>
              {renderTabContent(slide.from)}
            </div>
            <div className="scr on swiping" ref={(el) => (slideElsRef.current.to = el)}>
              {renderTabContent(slide.to)}
            </div>
          </div>
        ) : (
          isTabScreen && (
            <div key={tabAnimKey} className="tab-fade-in">{renderTabContent(screen)}</div>
          )
        )}

        {screen === 'countdown' && countdownInfo && (
          <CountdownScreen label={countdownInfo.label} soundOn={soundOn} onDone={handleCountdownDone} />
        )}
        {screen === 'game' && <ChallengeGameScreen game={game} onShowQuit={() => setQuitOpen(true)} />}
        {screen === 'result' && resultData && (
          <ChallengeResultScreen
            result={resultData}
            db={state.db}
            streak={state.streak}
            lang={lang}
            achievementQueue={achievementQueue}
            onAchievementsDone={() => setAchievementQueue([])}
            guestConvoStarted={state.guestConvoStarted}
            acctCreated={state.acctCreated}
            onCreateAccount={(src, key) => { setAchievementQueue([]); openAccountCreation(src, key); }}
            onPlayAgain={handlePlayAgain}
            onBack={handleBackHome}
          />
        )}

        {screen === 'br-countdown' && brCountdownInfo && (
          <div className="br-cds">
            <div className="br-cdsub">{brCountdownInfo.sub}</div>
            {brCountdownInfo.mode && <div className="br-cdmode">{brCountdownInfo.mode}</div>}
            <CountdownScreen variant="braining" soundOn={soundOn} onDone={handleBrCountdownDone} />
          </div>
        )}
        {screen === 'br-game' && <BrainingGameScreen game={brGame} onShowQuit={() => setBrQuitOpen(true)} />}
        {screen === 'trickgame' && trickGame && (
          <TrickGameScreen
            key={trickGame.gi + '-' + trickGame.ti + '-' + trickGame.mode + '-' + (trickGame.run || 0)}
            gi={trickGame.gi} ti={trickGame.ti} mode={trickGame.mode}
            soundOn={soundOn}
            onComplete={handleTrickRunComplete}
            onAgain={handleTrickAgain}
            onExit={handleExitTrick}
          />
        )}
        {screen === 'br-result' && brResultData && (
          <BrainingResultScreen
            result={brResultData}
            brState={state.brState}
            streak={state.streak}
            chDone={chDone}
            achievementQueue={brAchievementQueue}
            onAchievementsDone={() => setBrAchievementQueue([])}
            guestConvoStarted={state.guestConvoStarted}
            acctCreated={state.acctCreated}
            onCreateAccount={(src, key) => { setBrAchievementQueue([]); openAccountCreation(src, key); }}
            onTryAgain={handleBrTryAgain}
            onBack={handleBrBack}
            onCompleteStreak={() => handleSelectTab('challenge')}
          />
        )}
      </div>
      <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} chDone={chDone} brDone={brDone} visible={showNav} />
      <QuitModal open={quitOpen} onKeepGoing={() => setQuitOpen(false)} onQuit={handleQuitConfirm} />
      <NotifOptInCard
        open={notifCardOpen}
        // On an iPhone that has not been added to the Home Screen there is no permission to grant,
        // so the card shows Apple's install steps instead of a button that could not work.
        needsInstall={notifStatus.capability === 'needs-install'}
        busy={notifStatus.busy}
        onAllow={handleNotifAllow}
        onDismiss={() => closeNotifCard(notifStatus.capability === 'needs-install' ? 'needs_install' : 'dismissed')}
      />
      <AchievementPopup
        queue={trickAchievementQueue}
        onDone={handleTrickAchievementsDone}
        guestConvoStarted={state.guestConvoStarted}
        acctCreated={state.acctCreated}
        onCreateAccount={(src, key) => { setTrickAchievementQueue([]); openAccountCreation(src, key); }}
      />
      <AchievementPopup
        queue={ambientAchievementQueue}
        onDone={() => setAmbientAchievementQueue([])}
        guestConvoStarted={state.guestConvoStarted}
        acctCreated={state.acctCreated}
        onCreateAccount={(src, key) => { setAmbientAchievementQueue([]); openAccountCreation(src, key); }}
      />
      <StreakRestoreModal
        pendingRestore={state.pendingRestore}
        // Restoring earns Rebirth, so it carries a reqId like every other card-producing action.
        // Both are tracked against the same condition the reducer guards on, so an event is never
        // recorded for a restore the reducer went on to refuse.
        onRestore={() => {
          if (state.pendingRestore && state.pendingRestore.availableAtBreak) {
            track('streak_restored', { restored_value: state.pendingRestore.brokenValue });
          }
          dispatch({ type: 'STREAK_RESTORE', reqId: ++pendingAmbientReqId.current });
        }}
        onStartOver={() => {
          track('streak_start_over', {
            broken_value: state.pendingRestore ? state.pendingRestore.brokenValue : null,
          });
          dispatch({ type: 'STREAK_START_OVER' });
        }}
      />

      <ProfileSheet
        open={profileOpen}
        state={state}
        onClose={() => setProfileOpen(false)}
        onEditPrimary={() => {
          setProfileOpen(false);
          if (state.acctCreated) setEditAcctOpen(true); else openAccountCreation('profile');
        }}
        onEditPicture={() => openIconPicker('profile')}
        onOpenAchievements={() => {
          track('achievements_list_opened', { unlocked: earnedCount(state.milestones) });
          setProfileOpen(false);
          setAchListOpen(true);
        }}
        onOpenLegal={(which) => { setProfileOpen(false); setLegal(which); }}
        // Settings carry the value as well as the key. On a bilingual app the language switch in
        // particular is a product fact, not a preference: it is the only way to find out what
        // share of players are reading the Russian copy.
        onSetting={(key, value) => {
          track('setting_changed', { setting: key, value });
          dispatch({ type: 'SET_SETTING', key, value });
        }}
        onSetFontSize={(sz) => {
          track('setting_changed', { setting: 'fontSize', value: sz });
          dispatch({ type: 'SET_SETTING', key: 'fontSize', value: sz });
        }}
        onSetLanguage={(l) => {
          track('setting_changed', { setting: 'lang', value: l });
          dispatch({ type: 'SET_SETTING', key: 'lang', value: l });
        }}
        // Merged rather than replaced, so changing the hour cannot silently switch reminders off.
        // The default is spelled out here because saved data from before this field existed
        // arrives with no `notif` at all — loading replaces the settings object wholesale.
        onSetNotif={(patch) => {
          const next = { ...(state.settings.notif || { enabled: false, hour: 19 }), ...patch };
          track('setting_changed', { setting: 'notif', value: next.enabled ? 'on_' + next.hour : 'off' });
          dispatch({ type: 'SET_SETTING', key: 'notif', value: next });
        }}
        onLogin={() => { setProfileOpen(false); setLoginOpen(true); }}
        onLogout={() => { setProfileOpen(false); setConfirm('logout'); }}
        onReset={() => { setProfileOpen(false); setConfirm('reset'); }}
        onDeleteAccount={() => { setProfileOpen(false); setConfirm('delete'); }}
      />

      <AccountCreateScreen
        open={acctOpen}
        username={state.username}
        acctData={state.acctData}
        avatar={state.avatar}
        busy={acctBusy}
        error={acctError}
        onEditPicture={() => openIconPicker('account')}
        onClose={closeAccountCreation}
        onSubmit={handleSignup}
      />

      <EditAccountScreen
        open={editAcctOpen}
        username={state.username}
        acctData={state.acctData}
        avatar={state.avatar}
        busy={editBusy}
        error={editError}
        emailPending={emailPending}
        onEditPicture={() => openIconPicker('editaccount')}
        onClose={() => { setEditAcctOpen(false); setEditError(''); setEmailPending(false); }}
        onSubmit={handleEditAccount}
        onSubmitPassword={handleChangePassword}
      />

      <IconPickerScreen
        open={pickerOpen}
        avatar={state.avatar}
        username={state.username}
        milestones={state.milestones}
        // Neither button reopens anything: whichever screen sent us here never closed, so it is
        // still sitting underneath with every field exactly as it was left.
        onApprove={(draft) => closeIconPicker(draft)}
        onBack={() => closeIconPicker(null)}
      />

      <LegalScreen open={!!legal} which={legal} onClose={() => { setLegal(null); setProfileOpen(true); }} />
      <AchievementsListScreen open={achListOpen} milestones={state.milestones} onClose={() => { setAchListOpen(false); setProfileOpen(true); }} />

      <SavePromptModal
        open={savePromptOpen}
        onCreateAccount={openAccountCreation}
        onDismiss={() => {
          track('account_prompt_dismissed', { source: 'fallback_prompt', stage: 'prompt' });
          setSavePromptOpen(false);
          dispatch({ type: 'GUEST_PROMPT_DISMISSED' });
        }}
      />

      <ConfirmModal
        open={confirm === 'logout'}
        title={t('logout_title')} desc={t('logout_desc')} confirmLabel={t('set_logout')}
        onCancel={() => setConfirm(null)}
        onConfirm={handleLogout}
      />
      <ConfirmModal
        open={logoutKeptData} notice topmost
        title={t('logout_kept_title')} desc={t('logout_kept_desc')} confirmLabel={t('logout_kept_ok')}
        onCancel={() => setLogoutKeptData(false)}
        onConfirm={() => setLogoutKeptData(false)}
      />
      <ConfirmModal
        open={confirm === 'reset'} danger
        title={t('reset_title')} desc={t('reset_desc')} confirmLabel={t('set_reset')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { localStorage.removeItem('cifri_react_v1'); location.reload(); }}
      />
      <ConfirmModal
        open={confirm === 'delete'} danger
        title={t('delete_account_title')}
        desc={deleteError ? t(deleteError) : t('delete_account_desc')}
        confirmLabel={deleteBusy ? t('deleting_account') : t('set_delete_account')}
        onCancel={() => { setConfirm(null); setDeleteError(''); }}
        onConfirm={handleDeleteAccount}
      />

      <BrainingQuitModal
        open={brQuitOpen}
        warning={brGame.quitWarningFor(brDone)}
        onKeepGoing={() => setBrQuitOpen(false)}
        onQuit={handleBrQuitConfirm}
      />
      {needsOnboarding && (
        <OnboardingScreen
          initialUsername={state.username}
          onOpenLogin={() => setLoginOpen(true)}
          // The true start of a player's life in the app — everything before this is a person
          // looking at a username box. The username itself is deliberately not sent.
          onFinish={(u) => {
            track('onboarding_completed', { returning: !!state._loggedOut });
            dispatch({ type: 'ONBOARDING_FINISH', username: u });
          }}
        />
      )}
      <LoginScreen
        open={loginOpen}
        busy={loginBusy}
        onClose={() => setLoginOpen(false)}
        onForgotPassword={(idf) => { setForgotPrefill(idf); setForgotOpen(true); }}
        onSubmit={handleLogin}
      />
      <ForgotPasswordScreen
        open={forgotOpen}
        prefillEmail={forgotPrefill}
        onSubmit={sendPasswordReset}
        onClose={() => setForgotOpen(false)}
      />
      <ResetPasswordScreen
        open={resetOpen}
        onDone={() => { setResetOpen(false); clearRecoveryUrl(); setLoginOpen(false); }}
      />

      <TutorialOverlay
        open={!!state._showTutorial}
        onSelectTab={handleSelectTab}
        onFinish={() => {
          track('tutorial_finished');
          dispatch({ type: 'TUTORIAL_DONE' });
          handleSelectTab('challenge');
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  );
}
