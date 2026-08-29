import { arc, RAMP_3, SURFACE, GAP } from '../lib/viz';
import { num } from '../lib/format';

export type Slice = { label: string; value: number };

/**
 * Part-to-whole for a small number of ordered bands.
 *
 * A donut is only legitimate here because this is part-to-whole at a glance
 * with three segments. It would be the wrong form for comparing close values,
 * or for anything past ~6 segments — use bars for those.
 *
 * The bands are ordered (most recent → least), so they take the ordinal ramp
 * rather than categorical hues.
 */
export function Donut({
  slices, size = 190, thickness = 30, centreLabel, centreValue,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centreLabel?: string;
  centreValue?: string;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total) return <div className="empty">No data yet.</div>;

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = rOuter - thickness;

  // The 2px surface gap between touching marks, expressed as degrees at the
  // outer radius so it looks constant regardless of segment size.
  const gapDeg = (GAP / (2 * Math.PI * rOuter)) * 360;

  let cursor = 0;
  const segs = slices.map((s) => {
    const sweep = (s.value / total) * 360;
    const start = cursor;
    cursor += sweep;
    return { ...s, start, end: start + sweep, share: (s.value / total) * 100 };
  });

  return (
    <div className="donut-wrap">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="donut"
        role="img"
        aria-label={
          `${centreLabel ?? 'Composition'}: ` +
          segs.map((s) => `${s.label} ${num(s.value)}, ${s.share.toFixed(1)} percent`).join('; ')
        }
      >
        {segs.map((s, i) => {
          // Only inset by the gap when there is a neighbour to separate from.
          const half = segs.length > 1 ? gapDeg / 2 : 0;
          const a = s.start + half;
          const b = Math.max(a, s.end - half);
          return (
            <path
              key={s.label}
              d={arc(cx, cy, rOuter, rInner, a, b)}
              fill={RAMP_3[i % RAMP_3.length]}
              stroke={SURFACE}
              strokeWidth={0}
            />
          );
        })}

        {centreValue && (
          <>
            <text
              x={cx} y={cy - 2} textAnchor="middle"
              fill="#FAF7F2" fontFamily="'Anton', Impact, sans-serif" fontSize="30"
            >
              {centreValue}
            </text>
            <text
              x={cx} y={cy + 16} textAnchor="middle"
              fill="#A8A5A0" fontFamily="'Smooch Sans', system-ui, sans-serif" fontSize="13"
            >
              {centreLabel}
            </text>
          </>
        )}
      </svg>

      {/* Legend carries label, count and share as text — the arcs are never the
          only way to read this. */}
      <ul className="donut-legend">
        {segs.map((s, i) => (
          <li key={s.label}>
            <i style={{ background: RAMP_3[i % RAMP_3.length] }} aria-hidden />
            <span className="dl-label">{s.label}</span>
            <b className="dl-value">{num(s.value)}</b>
            <span className="dl-share">{s.share.toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
