import { useEffect, useState } from 'react';
import { msToMidnight } from '../store/dates.js';

// The "next challenge / next Braining in …" label, ticking live once a second.
//
// Ports the reference's tickMidnightTimers(). Kept as its own component so the tick re-renders
// only this label — putting the interval higher up would re-render the whole tab every second
// for a string that just counts down.
export default function MidnightCountdown({ format }) {
  const [ms, setMs] = useState(() => msToMidnight());

  useEffect(() => {
    const iv = setInterval(() => setMs(msToMidnight()), 1000);
    return () => clearInterval(iv);
  }, []);

  return <>{format(ms)}</>;
}
