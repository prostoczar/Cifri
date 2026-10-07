import { useEffect, useMemo, useState } from 'react';
import { buildCeremonies } from './ceremonyQueue.js';
import CeremonyScene from './CeremonyScene.jsx';
import StreakCeremony from './StreakCeremony.jsx';
import AchievementPopup from './AchievementPopup.jsx';

// Plays a batch of unlocked cards as ceremonies, one after another (docs/launch-celebrations-spec.md,
// Features 5 and 6). The drop-in successor to AchievementPopup everywhere a batch of cards is shown: after
// a result screen has finished entering, over the Tricks screens, and over whatever screen an
// achievement earned outside a game happens to find.
//
// `cards` is the reducer's list, exactly as AchievementPopup took it; buildCeremonies decides what
// plays and in what order. A new list starts again from the top. `onDone` is called once the last
// one has been continued past.
//
// The ad-hoc cards the ceremonies do not cover still get AchievementPopup's simple card, unchanged.
export default function Ceremonies({ cards, onDone, guestConvoStarted, acctCreated, onCreateAccount }) {
  const items = useMemo(() => buildCeremonies(cards), [cards]);
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [items]);

  if (!items.length || idx >= items.length) return null;
  const item = items[idx];
  const next = () => {
    if (idx + 1 < items.length) setIdx(idx + 1);
    else onDone();
  };
  const cta = { guestConvoStarted, acctCreated, onCreateAccount };

  if (item.kind === 'legacy') {
    return <AchievementPopup key={idx} queue={item.queue} onDone={next} {...cta} />;
  }
  if (item.kind === 'streak') {
    return <StreakCeremony key={idx + ':streak:' + item.days} item={item} onDone={next} {...cta} />;
  }
  return <CeremonyScene key={idx + ':' + item.kind + ':' + (item.card.key || item.card.nameKey)} item={item} onDone={next} {...cta} />;
}
