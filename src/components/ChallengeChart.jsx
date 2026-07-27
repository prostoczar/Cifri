import { useEffect, useRef } from 'react';
import { dateToKey } from '../store/dates.js';

const G = '#0f9d6c', GD = '#096e4a', TC = '#d65a3a';

// Ported from the reference prototype's drawSpk() — draws directly into an <svg> via the DOM
// API (createElementNS) rather than JSX, since the layout math is easiest expressed that way
// and this keeps the port a close 1:1 match with the original.
export default function ChallengeChart({ db, diff, range }) {
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = '';
    const W = svg.clientWidth || 320, H = 72, days = range;
    const d = db[diff];
    const pts = [];
    const ns = (tag, attrs) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      return el;
    };

    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const k = dateToKey(dt);
      const sess = (d.sessions || []).filter((s) => s.date === k);
      if (!sess.length) {
        pts.push({ first: null, min: null, max: null, day: dt.getDay(), date: k });
      } else {
        const sc = sess.map((s) => s.score);
        let recorded = null;
        for (let ri = 0; ri < sess.length; ri++) {
          if (sess[ri].real === true) { recorded = sess[ri]; break; }
        }
        let firstScore;
        if (recorded) firstScore = recorded.score;
        else if (sess.length === 1 && typeof sess[0].real === 'undefined') firstScore = sess[0].score;
        else firstScore = null;
        pts.push({ first: firstScore, min: Math.min.apply(null, sc), max: Math.max.apply(null, sc), day: dt.getDay(), date: k, count: sc.length });
      }
    }

    const hasSess = pts.some((p) => p.first !== null);
    if (!hasSess) {
      const empty = ns('text', { x: W / 2, y: H / 2 + 4, 'text-anchor': 'middle', 'font-size': 'calc(11px * var(--fs-mult))', fill: '#bbbbbb' });
      empty.textContent = 'Complete a session to see your progress';
      svg.appendChild(empty);
      return;
    }

    const maxV = Math.max.apply(null, pts.map((p) => p.max || p.first || 0).concat([10]));
    const pad = days > 14 ? 8 : 14, bw = (W - pad * 2) / days;
    const ys = (v) => H - 20 - (v / maxV) * (H - 30) + 2;

    let hiFirst = null, loFirst = null, hiIdx = -1, loIdx = -1;
    pts.forEach((p, idx) => {
      if (p.first !== null) {
        if (hiFirst === null || p.first > hiFirst) { hiFirst = p.first; hiIdx = idx; }
        if (loFirst === null || p.first < loFirst) { loFirst = p.first; loIdx = idx; }
      }
    });

    const dotY = (p) => (p.first !== null ? ys(p.first) : ys(0));

    for (let j = 0; j < pts.length - 1; j++) {
      const p = pts[j], nx = pts[j + 1];
      const missedLine = p.first === null || nx.first === null;
      svg.appendChild(ns('line', { x1: pad + j * bw + bw / 2, y1: dotY(p), x2: pad + (j + 1) * bw + bw / 2, y2: dotY(nx), stroke: missedLine ? TC : G, 'stroke-width': '1.5', 'stroke-linecap': 'round' }));
    }

    pts.forEach((p, idx) => {
      const cx = pad + idx * bw + bw / 2;
      if (p.first !== null) {
        if (p.max > p.min) {
          svg.appendChild(ns('rect', { x: cx - 2.5, y: ys(p.max), width: 5, height: Math.max(6, ys(p.min) - ys(p.max)), rx: 2.5, fill: '#ffd166' }));
        } else if (p.count > 1) {
          svg.appendChild(ns('circle', { cx, cy: ys(p.first), r: 2.5, fill: '#ffd166' }));
        }
        const cy = ys(p.first);
        if (days <= 14 || idx === hiIdx || idx === loIdx) {
          svg.appendChild(ns('circle', { cx, cy: cy + 2, r: 10, fill: GD }));
          svg.appendChild(ns('circle', { cx, cy, r: 10, fill: G }));
          const scoreLbl = ns('text', { x: cx, y: cy, dy: '0.35em', 'text-anchor': 'middle', 'font-size': 'calc(9px * var(--fs-mult))', 'font-weight': '800', fill: '#fff' });
          scoreLbl.textContent = p.first;
          svg.appendChild(scoreLbl);
        } else {
          svg.appendChild(ns('circle', { cx, cy, r: 4.5, fill: G }));
        }
      } else {
        svg.appendChild(ns('circle', { cx, cy: ys(0), r: 2.5, fill: TC }));
      }
      if (days <= 14) {
        const lbl = ns('text', { x: cx, y: H - 1, 'text-anchor': 'middle', 'font-size': 'calc(9px * var(--fs-mult))', fill: '#aaaaaa' });
        lbl.textContent = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][p.day];
        svg.appendChild(lbl);
      } else if (idx % 5 === 0) {
        const lbl2 = ns('text', { x: cx, y: H - 1, 'text-anchor': 'middle', 'font-size': 'calc(8px * var(--fs-mult))', fill: '#aaaaaa' });
        lbl2.textContent = new Date(p.date + 'T12:00:00').getDate();
        svg.appendChild(lbl2);
      }
    });
  }, [db, diff, range]);

  return <svg className="spk" ref={svgRef}></svg>;
}
