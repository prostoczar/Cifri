import { useCallback, useEffect, useRef } from 'react';
import { useI18n } from '../store/useI18n.js';

// A finger-drawable scratch area for working out a question, on all four playing screens
// (Challenge, Braining, Practice and Tricks practice). v16 item 5.
//
// NOTHING IS EVER PERSISTED. Not to state, not to localStorage, not to the server, and not even
// across a question. That is a deliberate rule rather than an omission: the whole point of the
// pad is a surface to think on, and anything kept would have to be synced, wiped on sign-out,
// and reasoned about in the anti-cheat rules. A canvas that is cleared on every question, on
// every collapse and on unmount is one that raises none of those questions.
//
// It is a <canvas> rather than an SVG or a div full of dots because a finger produces a hundred
// points a second and the only thing that has to survive is the pixels.
export default function ScribblePad({ open, onToggle, resetKey }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  // Sets the backing store to the box's real pixel size. Two things make this necessary rather
  // than optional: a canvas defaults to 300x150 whatever CSS says, so without it every stroke
  // lands somewhere other than under the finger; and on a phone the device pixel ratio is 2 or 3,
  // so drawing at CSS resolution gives visibly soft lines.
  //
  // THE `resized` GUARD IS NOT AN OPTIMISATION. Assigning to canvas.width wipes the canvas even
  // when the value assigned is the one already there, and a ResizeObserver fires on layout
  // notifications that are not size changes — so without the comparison, an unrelated re-render
  // erased whatever the player had just written. That is the worst possible failure for a scratch
  // pad: silent, and it takes the working out with it.
  //
  // A genuine resize does still clear, and that is left alone. Nothing here is meant to survive.
  const sizeCanvas = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    const ctx = cv.getContext('2d');
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    // Re-applied every time rather than only after a resize, because a resize resets the whole
    // context. The ink comes from the stylesheet rather than a literal here so the two cannot
    // drift — see .scribble-canvas, which pins it to a dark ink because the pad's surface is
    // light green in BOTH themes.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(cv).color || '#000';
  }, []);

  useEffect(() => {
    if (!open) return;
    sizeCanvas();
    const cv = canvasRef.current;
    if (!cv || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [open, sizeCanvas]);

  // Cleared between questions. `resetKey` changes once per question on every screen that uses
  // this, so last question's arithmetic never sits under this question's.
  useEffect(() => {
    const cv = canvasRef.current;
    if (cv) {
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
    }
  }, [resetKey, open]);

  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e) => {
    const cv = canvasRef.current;
    if (!cv) return;
    // Capture means a stroke that wanders off the pad still belongs to the pad, and still ENDS
    // when the finger lifts outside it — without this a finger lifted over the keypad leaves the
    // pad convinced it is still drawing, and the next touch draws a line from wherever it stopped.
    //
    // It has to be allowed to fail. setPointerCapture throws if the browser does not consider the
    // pointer active, and an exception here would abort the handler BEFORE drawing is switched on
    // — the stroke would simply never appear. Capture is a nicety; drawing is the feature, so the
    // feature must not be downstream of the nicety.
    try {
      if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId);
    } catch {
      // No capture on this pointer — strokes that leave the pad end at its edge instead.
    }
    drawingRef.current = true;
    lastRef.current = pos(e);
    // A tap with no movement should still leave a dot, the way a pen would.
    const ctx = cv.getContext('2d');
    ctx.beginPath();
    ctx.arc(lastRef.current.x, lastRef.current.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
  };

  const onMove = (e) => {
    if (!drawingRef.current) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const p = pos(e);
    const ctx = cv.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  };

  const endStroke = () => { drawingRef.current = false; };


  if (!open) {
    return (
      <button className="scribble-btn" onClick={() => onToggle(true)} aria-label={t('scribble_open')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
          <path d="m15 5 3 3" />
        </svg>
      </button>
    );
  }

  return (
    <div className="scribble-pad">
      {/* The pad cannot be dismissed by tapping it — every tap on it is a pen stroke — so it needs
          an explicit way out. Same terracotta circle as the quit button and the sheet close, so it
          reads as "close this" without having to be learnt. */}
      <button className="scribble-close" onClick={() => onToggle(false)} aria-label={t('scribble_close')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <canvas
        ref={canvasRef}
        className="scribble-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
    </div>
  );
}
