import { useEffect, useRef } from 'react';
import { dateToKey } from '../store/dates.js';
import { useI18n } from '../store/useI18n.js';
import { dayAverage } from '../store/selectors.js';

const G = '#0f9d6c', GD = '#096e4a', TC = '#d65a3a';
// The personal-best marker. Same yellow / dark-yellow pair as the streak pill and the Trick of the
// Day card, so "your best" is one colour across the whole app. The label goes to --YLT's brown
// rather than the white used on the green bubbles, which would be unreadable on yellow.
const YL = '#ffd166', YLD = '#c49030', YLT = '#7a4f00';

// Ported from the reference prototype's drawSpk() — draws directly into an <svg> via the DOM
// API (createElementNS) rather than JSX, since the layout math is easiest expressed that way
// and this keeps the port a close 1:1 match with the original.
//
// What each day shows:
//   the big green circle — the day's official score, which is now the AVERAGE of every counting
//                          run that day, and moves every time the player plays again
//   the yellow candle    — the spread between the day's lowest and highest single run
//   the green numerals   — that low and that high, spelled out
//
// The average sits inside the candle by definition, so the three numbers always read as a range
// with its middle marked. On a day with one run there is no spread, so no candle and no
// high/low labels — one number, stated once.
export default function ChallengeChart({ db, diff, range }) {
  const svgRef = useRef(null);
  // The empty state is the only text this chart writes, and it was English for every player until
  // the 2026-08-14 audit found it — the first thing a brand-new account sees.
  const { t } = useI18n();

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = '';
    // Taller than it was, to leave room above the high label and below the low one. Read from
    // the element so the CSS height stays the single place the number is set.
    const W = svg.clientWidth || 320, H = svg.clientHeight || 100, days = range;
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
        pts.push({ avg: null, min: null, max: null, day: dt.getDay(), date: k });
      } else {
        const sc = sess.map((s) => s.score);
        // The one definition of a day's score, shared with the home screen, the result screen and
        // the server-side projection, so the chart can never draw a different number from the one
        // the stat boxes report.
        pts.push({
          avg: dayAverage(sess),
          min: Math.min.apply(null, sc),
          max: Math.max.apply(null, sc),
          day: dt.getDay(), date: k, count: sc.length,
        });
      }
    }

    const hasSess = pts.some((p) => p.avg !== null);
    if (!hasSess) {
      const empty = ns('text', { x: W / 2, y: H / 2 + 4, 'text-anchor': 'middle', 'font-size': 'calc(11px * var(--fs-mult))', fill: '#bbbbbb' });
      empty.textContent = t('chart_empty');
      svg.appendChild(empty);
      return;
    }

    // The top and bottom margins are what the new numerals live in: `topPad` clears the high
    // label above the tallest candle, `botPad` clears the low label and the weekday letters.
    const topPad = 16, botPad = 30;
    const maxV = Math.max.apply(null, pts.map((p) => p.max || p.avg || 0).concat([10]));
    const pad = days > 14 ? 8 : 14, bw = (W - pad * 2) / days;
    const ys = (v) => H - botPad - (v / maxV) * (H - botPad - topPad);

    // Which days get a spelled-out bubble in the 30-day view. Thirty numerals across 315px is
    // unreadable, so it is these three: the best, the worst, and the most recent. `latestIdx` is
    // the newest day that was actually PLAYED — days run oldest-first, so the last one to pass
    // this test is the latest, and missed days never do. Where the latest day is also the best or
    // the worst the two collapse into one bubble, which is the honest picture: one day, one point.
    let hiAvg = null, loAvg = null, hiIdx = -1, loIdx = -1, latestIdx = -1;
    pts.forEach((p, idx) => {
      if (p.avg !== null) {
        if (hiAvg === null || p.avg > hiAvg) { hiAvg = p.avg; hiIdx = idx; }
        if (loAvg === null || p.avg < loAvg) { loAvg = p.avg; loIdx = idx; }
        latestIdx = idx;
      }
    });

    const dotY = (p) => (p.avg !== null ? ys(p.avg) : ys(0));

    for (let j = 0; j < pts.length - 1; j++) {
      const p = pts[j], nx = pts[j + 1];
      const missedLine = p.avg === null || nx.avg === null;
      svg.appendChild(ns('line', { x1: pad + j * bw + bw / 2, y1: dotY(p), x2: pad + (j + 1) * bw + bw / 2, y2: dotY(nx), stroke: missedLine ? TC : G, 'stroke-width': '1.5', 'stroke-linecap': 'round' }));
    }

    pts.forEach((p, idx) => {
      const cx = pad + idx * bw + bw / 2;
      if (p.avg !== null) {
        const hasSpread = p.max > p.min;
        if (hasSpread) {
          svg.appendChild(ns('rect', { x: cx - 2.5, y: ys(p.max), width: 5, height: Math.max(6, ys(p.min) - ys(p.max)), rx: 2.5, fill: '#ffd166' }));
        } else if (p.count > 1) {
          svg.appendChild(ns('circle', { cx, cy: ys(p.avg), r: 2.5, fill: '#ffd166' }));
        }

        // The candle's endpoints, written out. Only in the 7-day view: thirty days means sixty
        // numerals across the same width, which would be unreadable — and the 30-day view already
        // drops the per-day circles and weekday letters for exactly that reason.
        //
        // Only on days with an actual spread, too. Where min, max and average are the same number,
        // printing it three times says nothing three times.
        if (days <= 14 && hasSpread) {
          // Place each label clear of BOTH the candle and the average circle, not just the
          // candle. On a day whose average happens to equal its own high or low — which is
          // exactly what a day with one counting run and some old practice runs looks like —
          // the candle's end is underneath the circle, and measuring from the candle alone
          // would print the number on top of the circle.
          const R = 10;
          const topEdge = Math.min(ys(p.max), ys(p.avg) - R);
          const botEdge = Math.max(ys(p.min), ys(p.avg) + R);

          const hiLbl = ns('text', { x: cx, y: topEdge - 4, 'text-anchor': 'middle', 'font-size': 'calc(8px * var(--fs-mult))', 'font-weight': '700', fill: G });
          hiLbl.textContent = p.max;
          svg.appendChild(hiLbl);

          const loLbl = ns('text', { x: cx, y: botEdge + 9, 'text-anchor': 'middle', 'font-size': 'calc(8px * var(--fs-mult))', 'font-weight': '700', fill: G });
          loLbl.textContent = p.min;
          svg.appendChild(loLbl);
        }

        const cy = ys(p.avg);
        // The best day is the highest AVERAGE, not the day holding the best single run. The
        // bubbles draw averages, so marking anything else would put the badge on a number that
        // is not the one printed inside it. (The home screen's "personal best" is the single-run
        // figure, and the two legitimately differ.)
        const isBest = idx === hiIdx;
        if (days <= 14 || idx === hiIdx || idx === loIdx || idx === latestIdx) {
          // Identical to the best bubble in BrainingChart: the darker yellow offset down by 2,
          // the flat yellow on top, and nothing else. The ring this used to carry — a
          // background-coloured stroke, to stop the bubble merging with the yellow spread candle
          // behind it — was removed deliberately on 20 August 2026, because it made the same
          // marker look like two different things across the app's two charts. The candle is
          // still separable: the YLD circle underneath shows as a dark arc along the bottom of
          // the bubble, which is exactly what Braining relies on.
          svg.appendChild(ns('circle', { cx, cy: cy + 2, r: 10, fill: isBest ? YLD : GD }));
          svg.appendChild(ns('circle', { cx, cy, r: 10, fill: isBest ? YL : G }));
          const scoreLbl = ns('text', { x: cx, y: cy, dy: '0.35em', 'text-anchor': 'middle', 'font-size': 'calc(9px * var(--fs-mult))', 'font-weight': '800', fill: isBest ? YLT : '#fff' });
          scoreLbl.textContent = p.avg;
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
  }, [db, diff, range, t]);

  return <svg className="spk" ref={svgRef}></svg>;
}
