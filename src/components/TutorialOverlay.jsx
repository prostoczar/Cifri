import { useEffect, useState } from 'react';
import { useI18n } from '../store/useI18n.js';

// Ported from the reference prototype's onboarding tutorial. Shown once, right after a
// brand-new username is created. Each step switches the tab behind the card so the walkthrough
// happens over the real screen it is describing.
const TUTORIAL_STEPS = [
  { tab: 'challenge', titleKey: 'tut_welcome_title', descKey: 'tut_welcome_desc' },
  { tab: 'challenge', titleKey: 'nav_challenge', descKey: 'tut_challenge_desc' },
  { tab: 'braining', titleKey: 'nav_braining', descKey: 'tut_braining_desc' },
  { tab: 'practice', titleKey: 'nav_practice', descKey: 'tut_practice_desc' },
  { tab: 'tricks', titleKey: 'nav_tricks', descKey: 'tut_tricks_desc' },
];

export default function TutorialOverlay({ open, onSelectTab, onFinish }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // The final screen explains the streak rule, over the Challenge home screen.
  const total = TUTORIAL_STEPS.length + 1;
  const isFinal = step >= TUTORIAL_STEPS.length;
  const tab = isFinal ? 'challenge' : TUTORIAL_STEPS[step].tab;

  useEffect(() => {
    if (open) onSelectTab(tab);
  }, [open, tab, onSelectTab]);

  if (!open) return null;

  const title = isFinal ? t('tut_streak_title') : t(TUTORIAL_STEPS[step].titleKey);
  const desc = isFinal ? t('tut_streak_desc') : t(TUTORIAL_STEPS[step].descKey);

  return (
    <div className="tut-overlay on">
      <div className="tut-scrim"></div>
      <div key={step} className="tut-card show">
        <div className="tut-step">{t('step_of', { a: step + 1, b: total })}</div>
        <div className="tut-title">{title}</div>
        <div className="tut-desc">{desc}</div>
        <div className="tut-actions">
          <button className="tut-skip" onClick={onFinish}>{t('tut_skip')}</button>
          <button
            className="tut-next"
            onClick={() => (isFinal ? onFinish() : setStep((s) => s + 1))}
          >
            {isFinal ? t('ob_btn_short') : t('tut_next')}
          </button>
        </div>
      </div>
    </div>
  );
}
