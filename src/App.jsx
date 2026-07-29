import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppStateProvider, useAppState, chDoneToday, brDoneToday, todayDone } from './store/AppStateContext.jsx';
import { useI18n } from './store/useI18n.js';
import { useChallengeGame } from './hooks/useChallengeGame.js';
import { useBrainingGame } from './hooks/useBrainingGame.js';
import { useSwipeTabs, TAB_ORDER } from './hooks/useSwipeTabs.js';
import { DIFFS, diffLabel } from './store/questionEngine.js';
import { getYestChallengeScore, getTodayChallengeScore } from './store/selectors.js';
import { brAge, getLastBrainingTime, getTodayBrainingTime } from './store/braining.js';
import { TRICKS_FLAT, trickOfDayIndex } from './store/tricks.js';
import { attachAudioUnlock, attachGlobalClickSound } from './store/sound.js';
import { dayKey, dateStrToDate } from './store/dates.js';

import Header from './components/Header.jsx';
import BottomNav from './components/BottomNav.jsx';
import QuitModal from './components/QuitModal.jsx';
import MilestonePopup from './components/MilestonePopup.jsx';
import ProfileSheet from './components/ProfileSheet.jsx';
import TutorialOverlay from './components/TutorialOverlay.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import StreakRestoreModal from './components/StreakRestoreModal.jsx';
import { SavePromptModal, GuestBanner } from './components/GuestConversion.jsx';
import OnboardingScreen from './screens/OnboardingScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen.jsx';
import AccountCreateScreen from './screens/AccountCreateScreen.jsx';
import EditAccountScreen from './screens/EditAccountScreen.jsx';
import IconPickerScreen from './screens/IconPickerScreen.jsx';
import { LegalScreen, MilestonesListScreen } from './screens/LegalScreen.jsx';
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
  const { state, dispatch } = useAppState();
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
  const [milestoneQueue, setMilestoneQueue] = useState([]);
  const [brMilestoneQueue, setBrMilestoneQueue] = useState([]);
  const [tabAnimKey, setTabAnimKey] = useState(0);
  const [slide, setSlide] = useState(null); // {from, to, dir} while a swipe animation runs
  const [trickGame, setTrickGame] = useState(null); // {gi, ti} while drilling one trick
  const [tricksOpenIndex, setTricksOpenIndex] = useState(null); // deep-link from a TotD card
  const [trickMilestoneQueue, setTrickMilestoneQueue] = useState([]);
  const pendingTrickReqId = useRef(0);
  // Account / onboarding overlay state. All of it is local UI — the data behind it lives in the
  // store, and nothing here performs a network or auth call.
  const [loginOpen, setLoginOpen] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotPrefill, setForgotPrefill] = useState('');
  const [acctOpen, setAcctOpen] = useState(false);
  const [editAcctOpen, setEditAcctOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerReturnTo, setPickerReturnTo] = useState('profile');
  const [profileOpen, setProfileOpen] = useState(false);
  const [legal, setLegal] = useState(null);
  const [msListOpen, setMsListOpen] = useState(false);
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

  const game = useChallengeGame({
    lang,
    soundOn,
    getYestScore: (diff) => getYestChallengeScore(state.db, diff),
    getTodayScore: (diff) => getTodayChallengeScore(state.db, diff),
    onGameEnd: (summary) => {
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
        lang,
      });
    },
  });

  // Reacts once the store has processed a just-finished session (see onGameEnd above).
  useEffect(() => {
    const r = state._lastSessionResult;
    if (!r || r.reqId !== pendingReqId.current) return;
    setResultData(r);
    setMilestoneQueue(r.unlocked || []);
    setScreen('result');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state._lastSessionResult]);

  const brGame = useBrainingGame({
    lang,
    soundOn,
    getLastTime: () => getLastBrainingTime(state.brState, dayKey()),
    getTodayTime: () => (brDoneToday(state.brState) ? getTodayBrainingTime(state.brState, dayKey()) : null),
    onGameEnd: (summary) => {
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
    setBrMilestoneQueue(r.unlocked || []);
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

  // Swiping runs the horizontal slide first, then commits the tab change once it finishes —
  // the same order as the reference's slideToTab(), which calls showTab() in its timeout.
  const handleSwipeTab = useCallback(
    (tab, dir) => {
      if (slide) return; // already animating (reference: swipeAnimating guard)
      setSlide({ from: activeTab, to: tab, dir });
    },
    [activeTab, slide]
  );

  // Drives the slide exactly as slideToTab() does: park the incoming screen off-screen with no
  // transition, force a reflow, then transition both to their final positions.
  useLayoutEffect(() => {
    if (!slide) return;
    const fromEl = slideElsRef.current.from;
    const toEl = slideElsRef.current.to;
    if (!fromEl || !toEl) return;
    const enterFrom = slide.dir === 'left' ? 100 : -100;
    const exitTo = slide.dir === 'left' ? -100 : 100;
    const EASE = 'transform .28s cubic-bezier(.4,0,.2,1)';

    toEl.style.transition = 'none';
    toEl.style.transform = 'translateX(' + enterFrom + '%)';
    // eslint-disable-next-line no-unused-expressions
    toEl.offsetWidth; // force reflow so the starting position actually takes effect
    fromEl.style.transition = EASE;
    toEl.style.transition = EASE;
    fromEl.style.transform = 'translateX(' + exitTo + '%)';
    toEl.style.transform = 'translateX(0)';

    const timer = setTimeout(() => {
      handleSelectTab(slide.to);
      setSlide(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [slide, handleSelectTab]);

  // Swipe left/right between the four home screens (reference: attachSwipeHandlers).
  // Only enabled while one of those screens is showing — never mid-game, never mid-slide.
  useSwipeTabs({
    containerRef: scrollRef,
    activeTab,
    enabled: TAB_ORDER.indexOf(screen) !== -1 && !slide,
    onSwitchTab: handleSwipeTab,
  });

  function handleStartChallenge() {
    if (todayDone(state.db, state.selDiff)) return;
    setCountdownInfo({
      diff: state.selDiff, isPrac: false, pcfg: null, origin: 'challenge',
      label: diffLabel(lang, state.selDiff) + ' ' + t('challenge_word'),
    });
    setScreen('countdown');
  }

  function handleStartPractice(diff) {
    const pc = { ...DIFFS[diff], isPrac: true, mode: 'time', timeSec: 60 };
    setCountdownInfo({ diff, isPrac: true, pcfg: pc, origin: 'challenge', label: t('practice_mode') });
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

  // ── Account / onboarding (all mocked — no network or auth call anywhere below) ──
  // Onboarding shows for a brand-new player, and again after logging out — the reference
  // returns you there with your username prefilled rather than to a bare login screen.
  const needsOnboarding = !state.username || !!state._loggedOut;

  function openAccountCreation() {
    setSavePromptOpen(false);
    setProfileOpen(false);
    setAcctOpen(true);
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
    if (draft) dispatch({ type: 'SET_AVATAR', avatar: draft });
    setPickerOpen(false);
    if (pickerReturnTo === 'profile') setProfileOpen(true);
  }

  // ── Tricks ──
  // Both entry points may unlock a milestone, and the reference shows those BEFORE revealing
  // what you tapped (queueAndShowMilestones(unlocked, thenReveal)). This ref holds that reveal.
  const afterTrickMilestonesRef = useRef(null);

  function handlePracticeTrick(gi, ti) {
    const reqId = ++pendingTrickReqId.current;
    afterTrickMilestonesRef.current = () => {
      setTrickGame({ gi, ti });
      setScreen('trickgame');
    };
    dispatch({ type: 'PRACTICE_TRICK', reqId, gi, ti, total: TRICKS_FLAT.length });
  }

  function handleOpenTrickOfDay() {
    const idx = trickOfDayIndex();
    const reqId = ++pendingTrickReqId.current;
    afterTrickMilestonesRef.current = () => {
      handleSelectTab('tricks');
      setTricksOpenIndex(idx);
    };
    dispatch({ type: 'VIEW_TRICK_OF_DAY', reqId });
  }

  useEffect(() => {
    const r = state._lastTrickUnlocked;
    if (!r || r.reqId !== pendingTrickReqId.current) return;
    const reveal = afterTrickMilestonesRef.current;
    afterTrickMilestonesRef.current = null;
    if (r.unlocked && r.unlocked.length) {
      // Queue the cards; the reveal runs once the player dismisses the last one.
      setTrickMilestoneQueue(r.unlocked);
      afterTrickMilestonesRef.current = reveal;
    } else if (reveal) {
      reveal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state._lastTrickUnlocked]);

  function handleTrickMilestonesDone() {
    setTrickMilestoneQueue([]);
    const reveal = afterTrickMilestonesRef.current;
    afterTrickMilestonesRef.current = null;
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
    const { origin } = game.quit();
    setQuitOpen(false);
    setScreen(origin === 'practice' ? 'practice' : 'challenge');
    setActiveTab(origin === 'practice' ? 'practice' : 'challenge');
  }

  // againGame(): a Challenge-origin run replays as an uncounted warm-up on the same difficulty;
  // a Practice-tab run replays the same custom setup.
  function handlePlayAgain() {
    const { origin, diff } = resultData;
    setResultData(null);
    if (origin === 'challenge') handleStartPractice(diff);
    else handleStartCustomPractice();
  }

  // backHome(): origin (not isPrac) decides where to return — Challenge's own practice button
  // and the Practice tab both set isPrac, so isPrac alone can't tell them apart.
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
    brGame.quit();
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
          onStartPractice={handleStartPractice}
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
          // horizontally past each other. The tab change itself commits when the slide ends.
          <>
            <div className="scr on swiping" ref={(el) => (slideElsRef.current.from = el)}>
              {renderTabContent(slide.from)}
            </div>
            <div className="scr on swiping" ref={(el) => (slideElsRef.current.to = el)}>
              {renderTabContent(slide.to)}
            </div>
          </>
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
            milestoneQueue={milestoneQueue}
            onMilestonesDone={() => setMilestoneQueue([])}
            guestConvoStarted={state.guestConvoStarted}
            acctCreated={state.acctCreated}
            onCreateAccount={() => { setMilestoneQueue([]); openAccountCreation(); }}
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
            milestoneQueue={brMilestoneQueue}
            onMilestonesDone={() => setBrMilestoneQueue([])}
            guestConvoStarted={state.guestConvoStarted}
            acctCreated={state.acctCreated}
            onCreateAccount={() => { setBrMilestoneQueue([]); openAccountCreation(); }}
            onTryAgain={handleBrTryAgain}
            onBack={handleBrBack}
            onCompleteStreak={() => handleSelectTab('challenge')}
          />
        )}
      </div>
      <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} chDone={chDone} brDone={brDone} visible={showNav} />
      <QuitModal open={quitOpen} onKeepGoing={() => setQuitOpen(false)} onQuit={handleQuitConfirm} />
      <MilestonePopup
        queue={trickMilestoneQueue}
        onDone={handleTrickMilestonesDone}
        guestConvoStarted={state.guestConvoStarted}
        acctCreated={state.acctCreated}
        onCreateAccount={() => { setTrickMilestoneQueue([]); openAccountCreation(); }}
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
        onOpenMilestones={() => { setProfileOpen(false); setMsListOpen(true); }}
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
        onEditPicture={() => { setAcctOpen(false); openIconPicker('account'); }}
        onClose={closeAccountCreation}
        onSubmit={(d) => { dispatch({ type: 'ACCOUNT_CREATE', ...d }); setAcctOpen(false); }}
      />

      <EditAccountScreen
        open={editAcctOpen}
        username={state.username}
        acctData={state.acctData}
        avatar={state.avatar}
        onEditPicture={() => { setEditAcctOpen(false); openIconPicker('editaccount'); }}
        onClose={() => setEditAcctOpen(false)}
        onSubmit={(d) => { dispatch({ type: 'ACCOUNT_EDIT', ...d }); setEditAcctOpen(false); }}
        onSubmitPassword={(password) => dispatch({ type: 'ACCOUNT_SET_PASSWORD', password })}
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
      <MilestonesListScreen open={msListOpen} milestones={state.milestones} onClose={() => { setMsListOpen(false); setProfileOpen(true); }} />

      <SavePromptModal
        open={savePromptOpen}
        onCreateAccount={openAccountCreation}
        onDismiss={() => { setSavePromptOpen(false); dispatch({ type: 'GUEST_PROMPT_DISMISSED' }); }}
      />

      <ConfirmModal
        open={confirm === 'logout'}
        title={t('logout_title')} desc={t('logout_desc')} confirmLabel={t('set_logout')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); dispatch({ type: 'MOCK_LOGOUT' }); }}
      />
      <ConfirmModal
        open={confirm === 'reset'} danger
        title={t('reset_title')} desc={t('reset_desc')} confirmLabel={t('set_reset')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { localStorage.removeItem('cifri_react_v1'); location.reload(); }}
      />
      <ConfirmModal
        open={confirm === 'delete'} danger
        title={t('delete_account_title')} desc={t('delete_account_desc')} confirmLabel={t('set_delete_account')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { localStorage.removeItem('cifri_react_v1'); location.reload(); }}
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
        onClose={() => setLoginOpen(false)}
        onForgotPassword={(idf) => { setForgotPrefill(idf); setForgotOpen(true); }}
        onLoggedIn={(account) => { dispatch({ type: 'MOCK_LOGIN', account }); setLoginOpen(false); }}
      />
      <ForgotPasswordScreen open={forgotOpen} prefillEmail={forgotPrefill} onClose={() => setForgotOpen(false)} />

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
