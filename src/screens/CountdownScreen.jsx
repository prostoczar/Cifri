import { useEffect, useRef, useState } from 'react';
import { cdTone } from '../store/sound.js';
import { useI18n } from '../store/useI18n.js';

const CD_COLORS = { 3: '#d65a3a', 2: '#ffd166', 1: '#ecf7f3' };
const CD_TXT = { 3: '#fff', 2: '#7a4f00', 1: '#075c3d' };

// Ported from the reference prototype's shared runCountdown() — 3, 2, 1, Go!, 800ms per step.
export default function CountdownScreen({ label, soundOn, onDone }) {
  const { t } = useI18n();
  const [n, setN] = useState(3);
  const [showGo, setShowGo] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let cancelled = false;
    setN(3);
    setShowGo(false);
    setPopKey((k) => k + 1);
    cdTone(soundOn, 3);
    let count = 3;
    const iv = setInterval(() => {
      count--;
      if (cancelled) return;
      if (count > 0) {
        setN(count);
        setPopKey((k) => k + 1);
        cdTone(soundOn, count);
      } else if (count === 0) {
        setShowGo(true);
        cdTone(soundOn, 'go');
      } else {
        clearInterval(iv);
        onDoneRef.current();
      }
    }, 800);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn]);

  return (
    <div className="cds">
      <div className="cdd">{label}</div>
      {!showGo && (
        <div key={popKey} className="cdn" style={{ background: CD_COLORS[n], color: CD_TXT[n] }}>
          {n}
        </div>
      )}
      {showGo && <div className="cdgo">{t('go')}</div>}
    </div>
  );
}
