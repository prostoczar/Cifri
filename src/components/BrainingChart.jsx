import { useEffect, useRef } from 'react';
import { dateToKey } from '../store/dates.js';
import { brFmtSec } from '../store/braining.js';

const G = '#0f9d6c', GD = '#096e4a', TC = '#d65a3a';

// Ported from the reference prototype's brDrawChart().
export default function BrainingChart({ brState, range, type }) {
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = '';
    const W = svg.clientWidth || 320, H = 68, days = range;
    const ns = (tag, attrs) => {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
      return el;
    };

    const pts = [];
    for (let i = days - 1; i >= 0; i--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      const k = dateToKey(dt);
      const sess = (brState.sessions || []).filter((s) => s.date === k);
      if (!sess.length) {
        pts.push({ val: null, min: null, max: null, empty: true, day: dt.getDay(), date: k });
      } else {
        const metricArr = sess.map((s) => (type === 'age' ? s.age : s.time));
        let recorded = null;
        for (let ri = 0; ri < sess.length; ri++) {
          if (sess[ri].real === true) { recorded = sess[ri]; break; }
        }
        let val;
        if (recorded) val = type === 'age' ? recorded.age : recorded.time;
        else if (sess.length === 1 && typeof sess[0].real === 'undefined') val = metricArr[0];
        else val = null;
        pts.push({
          val, min: Math.min.apply(null, metricArr), max: Math.max.apply(null, metricArr),
          empty: val === null, day: dt.getDay(), date: k, count: metricArr.length,
        });
      }
    }

    const filled = pts.filter((p) => !p.empty);
    if (!filled.length) {
      const txt = ns('text', { x: W / 2, y: H / 2 + 4, 'text-anchor': 'middle', 'font-size': 'calc(11px * var(--fs-mult))', fill: '#bbbbbb' });
      txt.textContent = 'Complete a session to see your progress';
      svg.appendChild(txt);
      return;
    }

    const allVals = [];
    pts.forEach((p) => { if (!p.empty) allVals.push(p.min, p.max); });
    let maxV = Math.max.apply(null, allVals);
    if (maxV <= 0) maxV = 10;
    const pad = days > 14 ? 8 : 14, bw = (W - pad * 2) / days;
    const ys = (v) => H - 16 - (v / maxV) * (H - 28);

    let hiVal = null, loVal = null, hiIdx = -1, loIdx = -1;
    pts.forEach((p, idx) => {
      if (!p.empty) {
        if (hiVal === null || p.val > hiVal) { hiVal = p.val; hiIdx = idx; }
        if (loVal === null || p.val < loVal) { loVal = p.val; loIdx = idx; }
      }
    });

    const dotY = (p) => (p.empty ? ys(0) : ys(p.val));

    for (let j = 0; j < pts.length - 1; j++) {
      const pj = pts[j], pn = pts[j + 1];
      const missedLine = pj.empty || pn.empty;
      svg.appendChild(ns('line', {
        x1: pad + j * bw + bw / 2, y1: dotY(pj),
        x2: pad + (j + 1) * bw + bw / 2, y2: dotY(pn),
        stroke: missedLine ? TC : G, 'stroke-width': '1.5', 'stroke-linecap': 'round',
      }));
    }

    pts.forEach((p, i) => {
      const cx = pad + i * bw + bw / 2;
      if (!p.empty) {
        const cy = ys(p.val);
        if (type === 'time') {
          // Time keeps the original small dot with the value in plain text above it — "4:32"
          // doesn't fit legibly inside a circle.
          svg.appendChild(ns('circle', { cx, cy, r: 4, fill: G }));
          if (days <= 14 || i === hiIdx || i === loIdx) {
            const tlbl = ns('text', { x: cx, y: cy - 7, 'text-anchor': 'middle', 'font-size': 'calc(9px * var(--fs-mult))', fill: 'var(--txt)' });
            tlbl.textContent = brFmtSec(p.val);
            svg.appendChild(tlbl);
          }
        } else if (days <= 14 || i === hiIdx || i === loIdx) {
          svg.appendChild(ns('circle', { cx, cy: cy + 2, r: 10, fill: GD }));
          svg.appendChild(ns('circle', { cx, cy, r: 10, fill: G }));
          const lbl = ns('text', { x: cx, y: cy, dy: '0.35em', 'text-anchor': 'middle', 'font-size': 'calc(9px * var(--fs-mult))', 'font-weight': '800', fill: '#fff' });
          lbl.textContent = p.val;
          svg.appendChild(lbl);
        } else {
          svg.appendChild(ns('circle', { cx, cy, r: 4.5, fill: G }));
        }
      } else {
        svg.appendChild(ns('circle', { cx, cy: ys(0), r: 2.5, fill: TC }));
      }
      if (days <= 14) {
        const dl = ns('text', { x: cx, y: H - 1, 'text-anchor': 'middle', 'font-size': 'calc(9px * var(--fs-mult))', fill: '#8fa07a' });
        dl.textContent = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][p.day];
        svg.appendChild(dl);
      } else if (i % 5 === 0) {
        const dl2 = ns('text', { x: cx, y: H - 1, 'text-anchor': 'middle', 'font-size': 'calc(8px * var(--fs-mult))', fill: '#8fa07a' });
        dl2.textContent = new Date(p.date + 'T12:00:00').getDate();
        svg.appendChild(dl2);
      }
    });
  }, [brState, range, type]);

  return <svg className="br-spk" ref={svgRef}></svg>;
}
