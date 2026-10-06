import { useEffect, useRef, useState } from 'react';
import { cdTone } from '../store/sound.js';
import { impact } from '../lib/haptics.js';
import { useI18n } from '../store/useI18n.js';

const CD_COLORS = { 3: '#d65a3a', 2: '#ffd166', 1: '#ecf7f3' };
const CD_TXT = { 3: '#fff', 2: '#7a4f00', 1: '#075c3d' };

// The polish (docs/launch-celebrations-spec.md, Feature 4), in ms from the countdown's start. The
// beat itself — 800 ms a step, the game starting at 3200 — is the interval below, unchanged: these
// only decorate the moments around it. Each number leaves in the last 160 ms of its beat so the
// next arrives exactly on time, and GO starts to leave 560 ms after it appears.
const LEAVE_MS = 160;
const GO_LEAVE_AT = 2400 + 560;
const GO_LEAVE_MS = 320;

function reducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

// GO grows away to 4× while its corners round further and it fades. It outlives the countdown: the
// game starts (3200 ms) before GO has finished leaving (3280 ms) and fades in underneath it, so the
// exit is played on a copy fixed over the page rather than on the countdown's own tile, which
// unmounts with the countdown.
function flyGoAway(el) {
  if (!el || !el.animate) return;
  const r = el.getBoundingClientRect();
  const copy = el.cloneNode(true);
  Object.assign(copy.style, {
    position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px',
    margin: '0', zIndex: '60', pointerEvents: 'none', animation: 'none',
  });
  copy.setAttribute('aria-hidden', 'true');
  document.body.appendChild(copy);
  el.style.visibility = 'hidden';
  const a = copy.animate([
    { transform: 'scale(1)', opacity: 1, borderRadius: '22px' },
    { transform: 'scale(4)', opacity: 0, borderRadius: '45px' },
  ], { duration: GO_LEAVE_MS, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });
  const remove = () => { if (copy.parentNode) copy.parentNode.removeChild(copy); };
  a.onfinish = remove;
  // Belt and braces: a background tab freezes animations, and the copy must not be left behind.
  setTimeout(remove, GO_LEAVE_MS + 400);
}

// Ported from the reference prototype's shared runCountdown() — 3, 2, 1, Go!, 800ms per step.
// Both modes use the identical .cdn/.cdgo visuals; Braining just supplies its own surrounding
// layout (subtitle + practice badge), so `variant="braining"` renders the digits only.
export default function CountdownScreen({ label, soundOn, onDone, variant }) {
  const { t } = useI18n();
  const [n, setN] = useState(3);
  const [showGo, setShowGo] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const goRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setN(3);
    setShowGo(false);
    setLeaving(false);
    setPopKey((k) => k + 1);
    cdTone(soundOn, 3);
    impact('light');
    let count = 3;
    const iv = setInterval(() => {
      count--;
      if (cancelled) return;
      if (count > 0) {
        setN(count);
        setLeaving(false);
        setPopKey((k) => k + 1);
        cdTone(soundOn, count);
        impact('light');
      } else if (count === 0) {
        setShowGo(true);
        cdTone(soundOn, 'go');
        impact('heavy');
      } else {
        clearInterval(iv);
        onDoneRef.current();
      }
    }, 800);

    // The decorations. Reduced motion is today's countdown exactly, with the haptics above.
    const extras = [];
    if (!reducedMotion()) {
      [800, 1600, 2400].forEach((beat) => {
        extras.push(setTimeout(() => { if (!cancelled) setLeaving(true); }, beat - LEAVE_MS));
      });
      extras.push(setTimeout(() => { if (!cancelled) flyGoAway(goRef.current); }, GO_LEAVE_AT));
    }
    return () => {
      cancelled = true;
      clearInterval(iv);
      extras.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn]);

  const digits = (
    <>
      {!showGo && (
        <div key={popKey} className={'cdn' + (leaving ? ' leave' : '')} style={{ background: CD_COLORS[n], color: CD_TXT[n] }}>
          {n}
        </div>
      )}
      {showGo && <div className="cdgo" ref={goRef}>{t('go')}</div>}
    </>
  );

  if (variant === 'braining') return digits;

  return (
    <div className="cds">
      <div className="cdd">{label}</div>
      {digits}
    </div>
  );
}
