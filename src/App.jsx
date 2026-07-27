import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppStateProvider, useAppState, chDoneToday, brDoneToday, todayDone } from './store/AppStateContext.jsx';
import { useI18n } from './store/useI18n.js';
import { useChallengeGame } from './hooks/useChallengeGame.js';
import { useBrainingGame } from './hooks/useBrainingGame.js';
import { useSwipeTabs, TAB_ORDER } from './hooks/useSwipeTabs.js';
import { DIFFS, diffLabel } from './store/questionEngine.js';
import { getYestChallengeScore, getTodayChallengeScore } from './store/selectors.js';
import { brAge, getLastBrainingTime, getTodayBrainingTime } from './store/braining.js';
import { attachAudioUnlock, attachGlobalClickSound } from './store/sound.js';
import { dayKey } from './store/dates.js';

import Header from './components/Header.jsx';
import BottomNav from './components/BottomNav.jsx';
import QuitModal from './components/QuitModal.jsx';
import BrainingQuitModal from './components/BrainingQuitModal.jsx';
import ChallengeHomeScreen from './screens/ChallengeHomeScreen.jsx';
import CountdownScreen from './screens/CountdownScreen.jsx';
import ChallengeGameScreen from './screens/ChallengeGameScreen.jsx';
import ChallengeResultScreen from './screens/ChallengeResultScreen.jsx';
import PracticeScreen from './screens/PracticeScreen.jsx';
import BrainingHomeScreen from './screens/BrainingHomeScreen.jsx';
import BrainingGameScreen from './screens/BrainingGameScreen.jsx';
import BrainingResultScreen from './screens/BrainingResultScreen.jsx';
import PlaceholderTab from './screens/PlaceholderTab.jsx';

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

  // The standalone Practice tab. Note (faithful port): the reference builds this config and
  // passes it to makeQ(), but makeQ() only ever reads cfg._diff — which this config does not
  // set — so it falls back to the Easy engine and the operations/digits/terms/negatives/
  // decimals choices do not affect the questions generated. Only the mode (time / exercise
  // limit / unlimited) and its duration or count take effect. Replicated as-is; see the notes
  // to the user if this should instead be made to honour the settings.
  function handleStartCustomPractice() {
    if (!pracCfg.ops.length || !pracCfg.digits.length || !pracCfg.terms.length) return;
    const cfg = {
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

  const showNav = ['countdown', 'game', 'br-countdown', 'br-game'].indexOf(screen) === -1;
  const isTabScreen = TAB_ORDER.indexOf(screen) !== -1;

  // One tab's content, so the swipe animation can render two of them side by side.
  function renderTabContent(tab) {
    if (tab === 'challenge') {
      return (
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
        />
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
        />
      );
    }
    if (tab === 'practice') {
      return <PracticeScreen cfg={pracCfg} onChange={setPracCfg} onStart={handleStartCustomPractice} />;
    }
    if (tab === 'tricks') return <PlaceholderTab name={t('nav_tricks')} />;
    return null;
  }

  return (
    <div className="wrap">
      <Header db={state.db} brState={state.brState} streak={state.streak} streakRestoreAvailable={state.streakRestoreAvailable} />
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
        {screen === 'br-result' && brResultData && (
          <BrainingResultScreen
            result={brResultData}
            brState={state.brState}
            streak={state.streak}
            chDone={chDone}
            milestoneQueue={brMilestoneQueue}
            onMilestonesDone={() => setBrMilestoneQueue([])}
            onTryAgain={handleBrTryAgain}
            onBack={handleBrBack}
            onCompleteStreak={() => handleSelectTab('challenge')}
          />
        )}
      </div>
      <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} chDone={chDone} brDone={brDone} visible={showNav} />
      <QuitModal open={quitOpen} onKeepGoing={() => setQuitOpen(false)} onQuit={handleQuitConfirm} />
      <BrainingQuitModal
        open={brQuitOpen}
        warning={brGame.quitWarningFor(brDone)}
        onKeepGoing={() => setBrQuitOpen(false)}
        onQuit={handleBrQuitConfirm}
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
