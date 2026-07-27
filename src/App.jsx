import { useEffect, useRef, useState } from 'react';
import { AppStateProvider, useAppState, chDoneToday, brDoneToday, todayDone } from './store/AppStateContext.jsx';
import { useI18n } from './store/useI18n.js';
import { useChallengeGame } from './hooks/useChallengeGame.js';
import { DIFFS, diffLabel } from './store/questionEngine.js';
import { getYestChallengeScore, getTodayChallengeScore } from './store/selectors.js';
import { attachAudioUnlock, attachGlobalClickSound } from './store/sound.js';

import Header from './components/Header.jsx';
import BottomNav from './components/BottomNav.jsx';
import QuitModal from './components/QuitModal.jsx';
import ChallengeHomeScreen from './screens/ChallengeHomeScreen.jsx';
import CountdownScreen from './screens/CountdownScreen.jsx';
import ChallengeGameScreen from './screens/ChallengeGameScreen.jsx';
import ChallengeResultScreen from './screens/ChallengeResultScreen.jsx';
import PlaceholderTab from './screens/PlaceholderTab.jsx';

function AppShell() {
  const { state, dispatch } = useAppState();
  const { t, lang } = useI18n();
  const soundOn = state.settings.sound;

  const [activeTab, setActiveTab] = useState('challenge');
  const [screen, setScreen] = useState('challenge'); // challenge|braining|practice|tricks|countdown|game|result
  const [countdownInfo, setCountdownInfo] = useState(null); // {diff,isPrac,pcfg,origin,label}
  const [quitOpen, setQuitOpen] = useState(false);
  const [resultData, setResultData] = useState(null);
  const [milestoneQueue, setMilestoneQueue] = useState([]);
  const pendingReqId = useRef(0);
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
        return;
      }
      const reqId = ++pendingReqId.current;
      dispatch({
        type: 'CHALLENGE_SESSION_COMPLETE',
        reqId,
        diff: summary.diff,
        score: summary.score,
        isPrac: summary.isPrac,
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

  const chDone = chDoneToday(state.db);
  const brDone = brDoneToday(state.brState);

  function handleSelectTab(tab) {
    setActiveTab(tab);
    setScreen(tab);
  }

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

  function handleCountdownDone() {
    const { diff, isPrac, pcfg, origin } = countdownInfo;
    game.begin(diff, isPrac, pcfg, origin);
    setScreen('game');
  }

  function handleQuitConfirm() {
    const { origin } = game.quit();
    setQuitOpen(false);
    setScreen(origin === 'practice' ? 'practice' : 'challenge');
  }

  function handlePlayAgain() {
    const diff = resultData.diff;
    setResultData(null);
    handleStartPractice(diff);
  }

  function handleBackHome() {
    setResultData(null);
    setScreen(resultData && resultData.origin === 'practice' ? 'practice' : 'challenge');
  }

  const showNav = screen !== 'countdown' && screen !== 'game';

  return (
    <div className="wrap">
      <Header db={state.db} brState={state.brState} streak={state.streak} streakRestoreAvailable={state.streakRestoreAvailable} />
      <div className="scroll" style={{ paddingBottom: showNav ? 80 : 0 }}>
        {screen === 'challenge' && (
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
        )}
        {screen === 'braining' && <PlaceholderTab name={t('nav_braining')} />}
        {screen === 'practice' && <PlaceholderTab name={t('nav_practice')} />}
        {screen === 'tricks' && <PlaceholderTab name={t('nav_tricks')} />}
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
      </div>
      <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} chDone={chDone} brDone={brDone} visible={showNav} />
      <QuitModal open={quitOpen} onKeepGoing={() => setQuitOpen(false)} onQuit={handleQuitConfirm} />
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
