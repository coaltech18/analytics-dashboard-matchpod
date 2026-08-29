import type { ReactNode } from 'react';
import type { DailyRow, SeriesKey, Overview, CohortRow } from '../lib/types';
import { num, pct, cohortWeek } from '../lib/format';
import { RAMP_3, heatStep, HEAT_LEGEND } from '../lib/viz';

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
              {/* Stages are ordered, so they take the ordinal ramp rather than
                  one flat accent — the darkening reads as progression. */}
              <div
                className="bar-fill"
                style={{ width: `${(v / top) * 100}%`, background: RAMP_3[i % RAMP_3.length] }}
              />
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

/* ── cohorts ────────────────────────────────────────────────────────────── */

export function CohortTable({ rows }: { rows: CohortRow[] }) {
  if (!rows.length) return <div className="empty">No cohort data yet.</div>;

  return (
    <>
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
            const t = Math.min(1, (Number(r.still_active_pct) || 0) / 100);
            return (
              <tr key={r.cohort_week}>
                <th scope="row">{cohortWeek(r.cohort_week)}</th>
                <td className="strong">{num(r.signed_up)}</td>
                <td className="strong">{num(r.onboarded)}</td>
                <td>{pct(r.onboarded_pct)}</td>
                <td>{num(r.active_last_7d)}</td>
                <td>{num(r.active_last_30d)}</td>
                {/* Discrete step from the sequential ramp, with the value as
                    text in the same cell — the tint never carries it alone. */}
                <td className="heat strong">
                  <i className="heat-chip" style={{ background: heatStep(t) }} aria-hidden />
                  <span>{pct(r.still_active_pct)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Outside .table-wrap on purpose: inside it, the legend scrolls away
          with the columns exactly when a reader needs it. */}
      <div className="heat-scale">
        <span className="hs-label">Still active</span>
        {HEAT_LEGEND.map((step) => (
          <span className="hs-step" key={step.hex}>
            <i style={{ background: step.hex }} aria-hidden />
            {step.from}–{step.to}%
          </span>
        ))}
      </div>
    </>
  );
}
