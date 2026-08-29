import type { ReactNode } from 'react';
import type { DailyRow, SeriesKey, Overview, CohortRow } from '../lib/types';
import { num, pct, cohortWeek } from '../lib/format';

/* ── metric cell ──────────────────────────────────────────────────────────
   A label/value pair IS a definition list, so the grid is a <dl> and each
   cell a <div> inside it. */

export type Cell = {
  label: string;
  value: ReactNode;
  sub?: string;
  /** Renders in pink on the lighter panel — the number that matters most. */
  key?: boolean;
  spark?: SeriesKey;
};

export function MetricGrid({ cells, daily }: { cells: Cell[]; daily: DailyRow[] }) {
  return (
    <dl className="grid">
      {cells.map((c) => (
        <div key={c.label} className={c.key ? 'cell key' : 'cell'}>
          <dt>{c.label}</dt>
          <dd>
            <div className="value">{c.value}</div>
            {c.sub && <div className="sub">{c.sub}</div>}
            {c.spark && <Sparkline series={c.spark} daily={daily} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 30-day sparkline. Decorative: the number it accompanies sits right above. */
function Sparkline({ series, daily }: { series: SeriesKey; daily: DailyRow[] }) {
  const rows = daily.slice(-30);
  if (rows.length < 2) return null;
  // All-null means the database does not record this. Drawing it would put a
  // flat line under the number, implying a measured zero.
  if (!rows.some((r) => r[series] !== null && r[series] !== undefined)) return null;

  const values = rows.map((r) => Number(r[series]) || 0);
  const max = Math.max(...values, 1);
  const W = 100;
  const H = 26;
  const pts = values
    .map((n, i) => `${(i / (values.length - 1)) * W},${H - (n / max) * (H - 3) - 1.5}`)
    .join(' ');

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden focusable="false">
      <polyline
        points={pts}
        fill="none"
        stroke="#FF007A"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── funnel ─────────────────────────────────────────────────────────────── */

export function FunnelBars({ o }: { o: Overview }) {
  const all: [string, number | null][] = [
    ['Signed up', o.signed_up],
    ['Started profile', o.started_profile],
    ['Onboarded', o.onboarded],
  ];
  const steps = all.filter((s): s is [string, number] => typeof s[1] === 'number');

  if (!steps.length) return null;
  const top = Math.max(steps[0]![1], 1);

  return (
    <div className="bars">
      {steps.map(([label, v], i) => {
        const prev = i ? steps[i - 1]![1] : null;
        const conv = prev ? Math.round((v / Math.max(prev, 1)) * 1000) / 10 : null;
        return (
          <div className="bar-row" key={label}>
            <span className="bar-label">{label}</span>
            <span className="bar-val">{num(v)}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${(v / top) * 100}%` }} />
            </div>
            {conv !== null && prev !== null && (
              <div className="bar-drop">
                {conv}% of previous step · {num(prev - v)} lost
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── activity composition ─────────────────────────────────────────────────
   Disjoint bands, unlike the cumulative cells above. The legend carries each
   label, count and share as text, so colour is never the only way to read it. */

export function ActivityStack({ o }: { o: Overview }) {
  const all: [string, number | null, string][] = [
    ['Active 7d', o.active_7d, '#FF007A'],
    ['Dormant 7–30d', o.dormant_7_30d, '#8C8983'],
    ['Dormant 30d+', o.dormant_30d_plus, '#3D3D3D'],
  ];
  const bands = all.filter((b): b is [string, number, string] => typeof b[1] === 'number');

  const total = bands.reduce((a, b) => a + b[1], 0);
  if (!total) return null;

  return (
    <>
      <div className="stack" role="img" aria-label={
        bands.map(([l, v]) => `${l}: ${v}`).join(', ')
      }>
        {bands.map(([label, v, colour]) => (
          <span key={label} style={{ width: `${(v / total) * 100}%`, background: colour }} />
        ))}
      </div>
      <div className="legend">
        {bands.map(([label, v, colour]) => (
          <span key={label}>
            <i style={{ background: colour }} />
            {label} — <b style={{ color: 'var(--fg)' }}>{num(v)}</b> (
            {Math.round((v / total) * 1000) / 10}%)
          </span>
        ))}
      </div>
    </>
  );
}

/* ── cohorts ────────────────────────────────────────────────────────────── */

export function CohortTable({ rows }: { rows: CohortRow[] }) {
  if (!rows.length) return <div className="empty">No cohort data yet.</div>;

  return (
    <div className="table-wrap">
      <table>
        <caption>
          Signup cohorts by week. &ldquo;Still active&rdquo; is current, not day-N: of the
          people who joined that week, how many opened the app in the last 30 days.
        </caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">Signed up</th>
            <th scope="col">Onboarded</th>
            <th scope="col">Onboarded %</th>
            <th scope="col">Active 7d</th>
            <th scope="col">Active 30d</th>
            <th scope="col">Still active %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const heat = Math.min(1, (Number(r.still_active_pct) || 0) / 100);
            return (
              <tr key={r.cohort_week}>
                <th scope="row">{cohortWeek(r.cohort_week)}</th>
                <td className="strong">{num(r.signed_up)}</td>
                <td className="strong">{num(r.onboarded)}</td>
                <td>{pct(r.onboarded_pct)}</td>
                <td>{num(r.active_last_7d)}</td>
                <td>{num(r.active_last_30d)}</td>
                {/* Tint plus the value as text in the same cell. */}
                <td className="heat strong" style={{ ['--heat' as string]: heat }}>
                  <span>{pct(r.still_active_pct)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
