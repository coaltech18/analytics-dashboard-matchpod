import { useRef, useState } from 'react';
import type { DailyRow, SeriesKey } from '../lib/types';
import { num, dayMonth, download, stamp } from '../lib/format';

const W = 920;
const H = 268;
const PAD_L = 52;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 30;

const px = (i: number, n: number): number =>
  PAD_L + (n <= 1 ? (W - PAD_L - PAD_R) / 2 : (i / (n - 1)) * (W - PAD_L - PAD_R));
const py = (v: number, max: number): number =>
  PAD_T + (H - PAD_T - PAD_B) - (v / max) * (H - PAD_T - PAD_B);

/** Trailing 7-day mean — smooths the daily spikes without hiding them. */
function movingAvg(v: number[], win = 7): number[] {
  return v.map((_, i) => {
    const slice = v.slice(Math.max(0, i - win + 1), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

type Props = {
  rows: DailyRow[];
  seriesKey: SeriesKey;
  seriesLabel: string;
  range: number;
};

export function Chart({ rows, seriesKey, seriesLabel, range }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const values = rows.map((r) => Number(r[seriesKey]) || 0);
  const max = Math.max(...values, 1);
  const avg = movingAvg(values);

  if (rows.length < 2) {
    return <div className="empty">Not enough data to draw a trend yet.</div>;
  }

  const line = values.map((v, i) => `${px(i, values.length)},${py(v, max)}`).join(' ');
  const trend = avg.map((v, i) => `${px(i, avg.length)},${py(v, max)}`).join(' ');
  const area = `${PAD_L},${py(0, max)} ${line} ${px(values.length - 1, values.length)},${py(0, max)}`;

  const total = values.reduce((a, b) => a + b, 0);
  const peakIdx = values.indexOf(Math.max(...values));
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;

  // Y gridlines at 0 / 50% / 100% of max.
  const ticks = [0, 0.5, 1].map((f) => ({ v: Math.round(max * f), y: py(max * f, max) }));

  // X labels: first, middle, last — more than three collide at 375px.
  const xLabels = [0, Math.floor(rows.length / 2), rows.length - 1];

  function onMove(ev: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const x = ((ev.clientX - box.left) / box.width) * W;
    const i = Math.round(((x - PAD_L) / (W - PAD_L - PAD_R)) * (values.length - 1));
    setHover(i >= 0 && i < values.length ? i : null);
  }

  function exportPng() {
    const svg = svgRef.current;
    if (!svg) return;

    const clone = svg.cloneNode(true) as SVGSVGElement;
    // Page CSS does not follow an SVG into serialisation. Inline the rules the
    // chart depends on and paint a background rect, or the export is a blank
    // or transparent image that still "downloads fine".
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `
      text { font-family: 'Space Mono', monospace; font-size: 11px; fill: #8C8983; }
      .grid-line { stroke: #2A2A2A; stroke-width: 1; }
      .series { fill: none; stroke: #FF007A; stroke-width: 2; stroke-linejoin: round; }
      .trend { fill: none; stroke: #A8A5A0; stroke-width: 1.2; stroke-dasharray: 4 3; }
      .area { fill: rgba(255, 0, 122, 0.14); stroke: none; }
      .crosshair, .dot { display: none; }
    `;
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(W));
    bg.setAttribute('height', String(H));
    bg.setAttribute('fill', '#121212');

    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.insertBefore(bg, clone.firstChild);
    clone.insertBefore(style, clone.firstChild);

    const svgText = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = W * 2; // 2× for a legible export
      c.height = H * 2;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((blob) => {
        if (blob) download(blob, `matchpod-${seriesKey}-${range}d-${stamp()}.png`);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  }

  const hoverRow = hover !== null ? rows[hover] : undefined;

  return (
    <>
      <div className="chart-panel">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${seriesLabel} over the last ${range} days. The same numbers are in the table below.`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t.y}>
              <line className="grid-line" x1={PAD_L} y1={t.y} x2={W - PAD_R} y2={t.y} stroke="#2A2A2A" />
              <text x={PAD_L - 8} y={t.y + 3} textAnchor="end" fill="#A8A5A0" fontSize="11" fontFamily="'Space Mono', monospace">
                {num(t.v)}
              </text>
            </g>
          ))}

          <polygon className="area" points={area} fill="rgba(255,0,122,0.14)" />
          <polyline className="trend" points={trend} fill="none" stroke="#A8A5A0" strokeWidth="1.2" strokeDasharray="4 3" />
          <polyline className="series" points={line} fill="none" stroke="#FF007A" strokeWidth="2" strokeLinejoin="round" />

          {xLabels.map((i) => (
            <text
              key={i}
              x={px(i, rows.length)}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'}
              fill="#A8A5A0"
              fontSize="11"
              fontFamily="'Space Mono', monospace"
            >
              {dayMonth(rows[i]!.day)}
            </text>
          ))}

          {hover !== null && (
            <g className="crosshair">
              <line
                x1={px(hover, values.length)}
                y1={PAD_T}
                x2={px(hover, values.length)}
                y2={H - PAD_B}
                stroke="#3D3D3D"
              />
              <circle
                className="dot"
                cx={px(hover, values.length)}
                cy={py(values[hover]!, max)}
                r="3.5"
                fill="#FF007A"
              />
            </g>
          )}
        </svg>

        <p className="chart-summary">
          {hoverRow ? (
            <>
              <b style={{ color: 'var(--fg)' }}>{dayMonth(hoverRow.day)}</b> — {num(values[hover!])} {seriesLabel.toLowerCase()}
            </>
          ) : (
            <>
              {seriesLabel} from {dayMonth(first.day)} to {dayMonth(last.day)}: {num(total)} total,
              peak {num(values[peakIdx])} on {dayMonth(rows[peakIdx]!.day)}, latest{' '}
              {num(values[values.length - 1])}. Dashed line is the trailing 7-day mean.
            </>
          )}
        </p>

        <div className="controls" style={{ marginTop: 12 }}>
          <button className="btn" onClick={exportPng}>PNG</button>
        </div>
      </div>

      {/* A <polyline> tells a screen reader nothing. The numbers behind the
          chart live here, and this is what makes the chart accessible. */}
      <details>
        <summary>Show the {rows.length} numbers behind this chart</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <caption>{seriesLabel}, last {range} days</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">{seriesLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.day}>
                  <th scope="row">{dayMonth(r.day)}</th>
                  <td className="strong">{num(values[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
