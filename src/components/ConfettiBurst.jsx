import { useEffect, useState } from 'react';

// Ported from the reference prototype's spawnConfetti().
export default function ConfettiBurst() {
  const [dots, setDots] = useState([]);

  useEffect(() => {
    const n = 15 + Math.floor(Math.random() * 6);
    const list = [];
    for (let i = 0; i < n; i++) {
      const size = 4 + Math.random() * 4;
      const left = Math.random() * 100;
      const duration = 1.1 + Math.random() * 0.4;
      const delay = Math.random() * 0.3;
      list.push({
        key: i,
        style: {
          position: 'absolute', top: -10, left: left + '%', width: size, height: size,
          borderRadius: '50%', background: Math.random() > 0.5 ? '#ffd166' : '#ffe29a', opacity: 0.95,
          animation: `confettiFall ${duration}s ease-in ${delay}s forwards`,
        },
      });
    }
    setDots(list);
    const timer = setTimeout(() => setDots([]), 1600);
    return () => clearTimeout(timer);
  }, []);

  if (!dots.length) return null;
  return (
    <div className="confetti-wrap">
      {dots.map((dot) => (
        <div key={dot.key} style={dot.style}></div>
      ))}
    </div>
  );
}
