import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppStateProvider, useAppState, chDoneToday, brDoneToday } from './store/AppStateContext.jsx';
import { useI18n } from './store/useI18n.js';
import { useChallengeGame } from './hooks/useChallengeGame.js';
import { useBrainingGame } from './hooks/useBrainingGame.js';
import { useSwipeTabs, TAB_ORDER } from './hooks/useSwipeTabs.js';
import { diffLabel } from './store/questionEngine.js';
import { getYestChallengeScore, getTodayChallengeScore } from './store/selectors.js';
import { brAge, getLastBrainingTime, getTodayBrainingTime } from './store/braining.js';
import { TRICKS_FLAT, trickOfDayIndex } from './store/tricks.js';
import { attachAudioUnlock, attachGlobalClickSound } from './store/sound.js';
import { dayKey, dateStrToDate } from './store/dates.js';
import {
  changePassword, deleteAccount, errorKey, fetchAccount, onAuthChange, requestEmailChange,
  sendPasswordReset, signInWithIdentifier, signOut, signUpWithProfile, updateProfile,
} from './lib/accountApi.js';
import { toSyncPayload } from './lib/syncedState.js';
import { recordAttempt, endSession, discardSession } from './lib/attemptLog.js';
import { arrivedFromRecoveryLink, clearRecoveryUrl } from './lib/recoveryLink.js';

import Header from './components/Header.jsx';
import BottomNav from './components/BottomNav.jsx';
import QuitModal from './components/QuitModal.jsx';
import AchievementPopup from './components/AchievementPopup.jsx';
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
  const { state, dispatch, beginSync } = useAppState();
  const { t, lang } = useI18n();
  const soundOn = state.settings.sound;

  const [activeTab, setActiveTab] = useState('challenge');
  // challenge|braining|practice|tricks|countdown|game|result|br-countdown|br-game|br-result
  const [screen, setScreen] = useState('challenge');
  const [countdownInfo, setCountdownInfo] = useState(null); // {diff,isPrac,pcfg,origin,label}
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
  const slideWrapRef = useRef(null);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  // Apply dark mode + font size to <body>, matching applyTheme()/applyFontSize().
  useEffect(() => {
    document.body.classList.toggle('dark', !!state.settings.dark);
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
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [dispatch]);

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
        lang,
      });
    },
  });

  // Reacts once the store has processed a just-finished session (see onGameEnd above).
  useEffect(() => {
    const r = state._lastSessionResult;
    if (!r || r.reqId !== pendingReqId.current) return;
    setResultData(r);
    setAchievementQueue(r.unlocked || []);
    setScreen('result');
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
        opTimes: summary.opTimes,
        lang,
      });
    },
  });

  useEffect(() => {
    const r = state._lastBrResult;
    if (!r || r.reqId !== pendingBrReqId.current) return;
    setBrResultData(r);
    setBrAchievementQueue(r.unlocked || []);
    setScreen('br-result');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state._lastBrResult]);

  const chDone = chDoneToday(state.db);
  const brDone = brDoneToday(state.brState);

  const handleSelectTab = useCallback((tab) => {
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

    // A percentage min-height does not resolve against a flex-sized scroll container, so the
    // wrapper is sized from the container's own measured height instead. Without this it
    // collapses to zero the moment both screens go out of flow.
    if (slideWrapRef.current && scrollRef.current) {
      slideWrapRef.current.style.height = scrollRef.current.clientHeight + 'px';
    }

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

  // No daily cap and no first-trial guard: Challenge can be started as many times as the player
  // wants, and each run is folded into today's average. (Braining keeps its own guard, in
  // handleStartBraining below — that mode is unchanged.)
  function handleStartChallenge() {
    setCountdownInfo({
      diff: state.selDiff, isPrac: false, pcfg: null, origin: 'challenge',
      label: diffLabel(lang, state.selDiff) + ' ' + t('challenge_word'),
    });
    setScreen('countdown');
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
    setCountdownInfo({ diff: null, isPrac: true, pcfg: cfg, origin: 'practice', label: t('practice_mode') });
    setScreen('countdown');
  }

  // A pending streak-restore offer expires 24 hours after the break. Checked on mount, the
  // same point the reference calls maybeShowStreakRestoreModal().
  useEffect(() => {
    if (!state.pendingRestore) return;
    const hoursSince = (Date.now() - state.pendingRestore.brokenAtMs) / 3600000;
    if (hoursSince >= 24) dispatch({ type: 'STREAK_RESTORE_EXPIRE' });
  }, [state.pendingRestore, dispatch]);

  // ── Account / onboarding (real Supabase auth; the calls live in src/lib/accountApi.js) ──
  // Onboarding shows for a brand-new player, and again after logging out — the reference
  // returns you there with your username prefilled rather than to a bare login screen.
  const needsOnboarding = !state.username || !!state._loggedOut;

  function openAccountCreation() {
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
      // A lost race on the username is shown against the username field's own message, which
      // the live check already owns — everything else gets the shared error line.
      setAcctError(res.error === 'taken' ? 'username_taken' : errorKey(res.error));
      return;
    }
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
    setConfirm(null);
    localStorage.removeItem('cifri_react_v1');
    location.reload();
  }

  // Logout ends the real Supabase session. Local progress is kept, exactly as before — but it
  // is a local copy now, no longer syncing anywhere.
  async function handleLogout() {
    setConfirm(null);
    await signOut();
    dispatch({ type: 'ACCOUNT_SIGNED_OUT' });
  }

  // Backing out without submitting counts as dismissing a dedicated conversion ask, so later
  // nudges become the small banner rather than another full-screen prompt.
  function closeAccountCreation() {
    setAcctOpen(false);
    if (!state.acctCreated) dispatch({ type: 'GUEST_PROMPT_DISMISSED' });
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
      dispatch({ type: 'SAVE_PROMPT_SHOWN' });
      setSavePromptOpen(true);
    }
  }, [state.acctCreated, state.savePromptShown, state.firstOpenDate, state.bestStreakEver, dispatch]);

  const guestBannerVisible =
    !state.acctCreated && state.anyGuestPromptDismissed && state.guestBannerLastShownDay !== dayKey();

  function openIconPicker(returnTo) {
    setPickerReturnTo(returnTo);
    setProfileOpen(false);
    setPickerOpen(true);
  }

  // Approve commits the draft; Back throws it away, so nothing is ever half-saved. Either way
  // we return to whichever screen opened the picker.
  function closeIconPicker(draft) {
    if (draft) {
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

  function handlePracticeTrick(gi, ti) {
    const reqId = ++pendingTrickReqId.current;
    afterTrickAchievementsRef.current = () => {
      setTrickGame({ gi, ti });
      setScreen('trickgame');
    };
    dispatch({ type: 'PRACTICE_TRICK', reqId, gi, ti, total: TRICKS_FLAT.length });
  }

  function handleOpenTrickOfDay() {
    const idx = trickOfDayIndex();
    const reqId = ++pendingTrickReqId.current;
    afterTrickAchievementsRef.current = () => {
      handleSelectTab('tricks');
      setTricksOpenIndex(idx);
    };
    dispatch({ type: 'VIEW_TRICK_OF_DAY', reqId });
  }

  useEffect(() => {
    const r = state._lastTrickUnlocked;
    if (!r || r.reqId !== pendingTrickReqId.current) return;
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
    game.begin(diff, isPrac, pcfg, origin);
    setScreen('game');
  }

  function handleQuitConfirm() {
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
      setCountdownInfo({
        diff, isPrac: false, pcfg: null, origin: 'challenge',
        label: diffLabel(lang, diff) + ' ' + t('challenge_word'),
      });
      setScreen('countdown');
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
    setBrCountdownInfo({
      isPrac,
      sub: t('br_cd_sub', { n: isPrac ? 20 : 50 }),
      mode: isPrac ? t('practice_mode_not_counted') : null,
    });
    setScreen('br-countdown');
  }

  function handleBrCountdownDone() {
    brGame.begin(brCountdownInfo.isPrac);
    setScreen('br-game');
  }

  function handleBrQuitConfirm() {
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
          onDismiss={() => dispatch({ type: 'DISMISS_GUEST_BANNER' })}
        />
        <ChallengeHomeScreen
          db={state.db}
          selDiff={state.selDiff}
          onSelDiff={(d) => dispatch({ type: 'SET_SEL_DIFF', diff: d })}
          chRange={state.chRange}
          onChRange={(r) => dispatch({ type: 'SET_CH_RANGE', range: r })}
          streak={state.streak}
          bestStreakEver={state.bestStreakEver}
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
          streak={state.streak}
          bestStreakEver={state.bestStreakEver}
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
      <div className="scroll" ref={scrollRef} style={{ paddingBottom: showNav ? 80 : 0 }}>
        {slide ? (
          // Mid-swipe: both screens are on-screen and absolutely positioned (.swiping), sliding
          // horizontally past each other.
          //
          // They need a wrapper that holds its own height: taken out of flow, they leave the
          // scroll container with nothing to size against, it collapses, and the page visibly
          // jumps. The wrapper keeps the viewport's height for the duration, and clips the
          // outgoing screen so it can't widen the page as it leaves.
          <div ref={slideWrapRef} style={{ position: 'relative', overflow: 'hidden' }}>
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
            onCreateAccount={() => { setAchievementQueue([]); openAccountCreation(); }}
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
          <TrickGameScreen gi={trickGame.gi} ti={trickGame.ti} soundOn={soundOn} onExit={handleExitTrick} />
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
            onCreateAccount={() => { setBrAchievementQueue([]); openAccountCreation(); }}
            onTryAgain={handleBrTryAgain}
            onBack={handleBrBack}
            onCompleteStreak={() => handleSelectTab('challenge')}
          />
        )}
      </div>
      <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} chDone={chDone} brDone={brDone} visible={showNav} />
      <QuitModal open={quitOpen} onKeepGoing={() => setQuitOpen(false)} onQuit={handleQuitConfirm} />
      <AchievementPopup
        queue={trickAchievementQueue}
        onDone={handleTrickAchievementsDone}
        guestConvoStarted={state.guestConvoStarted}
        acctCreated={state.acctCreated}
        onCreateAccount={() => { setTrickAchievementQueue([]); openAccountCreation(); }}
      />
      <StreakRestoreModal
        pendingRestore={state.pendingRestore}
        onRestore={() => dispatch({ type: 'STREAK_RESTORE' })}
        onStartOver={() => dispatch({ type: 'STREAK_START_OVER' })}
      />

      <ProfileSheet
        open={profileOpen}
        state={state}
        onClose={() => setProfileOpen(false)}
        onEditPrimary={() => {
          setProfileOpen(false);
          if (state.acctCreated) setEditAcctOpen(true); else openAccountCreation();
        }}
        onEditPicture={() => openIconPicker('profile')}
        onOpenAchievements={() => { setProfileOpen(false); setAchListOpen(true); }}
        onOpenLegal={(which) => { setProfileOpen(false); setLegal(which); }}
        onSetting={(key, value) => dispatch({ type: 'SET_SETTING', key, value })}
        onSetFontSize={(sz) => dispatch({ type: 'SET_SETTING', key: 'fontSize', value: sz })}
        onSetLanguage={(l) => dispatch({ type: 'SET_SETTING', key: 'lang', value: l })}
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
        onEditPicture={() => { setAcctOpen(false); openIconPicker('account'); }}
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
        onEditPicture={() => { setEditAcctOpen(false); openIconPicker('editaccount'); }}
        onClose={() => { setEditAcctOpen(false); setEditError(''); setEmailPending(false); }}
        onSubmit={handleEditAccount}
        onSubmitPassword={handleChangePassword}
      />

      <IconPickerScreen
        open={pickerOpen}
        avatar={state.avatar}
        username={state.username}
        onApprove={(draft) => {
          closeIconPicker(draft);
          if (pickerReturnTo === 'account') setAcctOpen(true);
          if (pickerReturnTo === 'editaccount') setEditAcctOpen(true);
        }}
        onBack={() => {
          closeIconPicker(null);
          if (pickerReturnTo === 'account') setAcctOpen(true);
          if (pickerReturnTo === 'editaccount') setEditAcctOpen(true);
        }}
      />

      <LegalScreen open={!!legal} which={legal} onClose={() => { setLegal(null); setProfileOpen(true); }} />
      <AchievementsListScreen open={achListOpen} milestones={state.milestones} onClose={() => { setAchListOpen(false); setProfileOpen(true); }} />

      <SavePromptModal
        open={savePromptOpen}
        onCreateAccount={openAccountCreation}
        onDismiss={() => { setSavePromptOpen(false); dispatch({ type: 'GUEST_PROMPT_DISMISSED' }); }}
      />

      <ConfirmModal
        open={confirm === 'logout'}
        title={t('logout_title')} desc={t('logout_desc')} confirmLabel={t('set_logout')}
        onCancel={() => setConfirm(null)}
        onConfirm={handleLogout}
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
          onFinish={(u) => dispatch({ type: 'ONBOARDING_FINISH', username: u })}
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
        onFinish={() => { dispatch({ type: 'TUTORIAL_DONE' }); handleSelectTab('challenge'); }}
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
