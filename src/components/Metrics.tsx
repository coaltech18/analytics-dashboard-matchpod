import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { DailyRow, SeriesKey, Overview, CohortRow, UserRow } from '../lib/types';
import { num, pct, shortDate } from '../lib/format';
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
                <th scope="row">{shortDate(r.cohort_week)}</th>
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

/* ── people ─────────────────────────────────────────────────────────────
   The only table of individuals on this dashboard. Sorted and searched in
   the browser because the whole roster is already in the payload — a query
   per keystroke would be a round trip to answer a question the page can
   already answer. */

type SortKey = 'name' | 'age' | 'city' | 'joined' | 'last_seen' | 'swipes' | 'likes' | 'matches' | 'messages';

const PEOPLE_COLS: { key: SortKey; label: string; num?: boolean }[] = [
  { key: 'name',      label: 'Name' },
  { key: 'age',       label: 'Age',      num: true },
  { key: 'city',      label: 'City' },
  { key: 'joined',    label: 'Joined' },
  { key: 'last_seen', label: 'Last seen' },
  { key: 'swipes',    label: 'Swipes',   num: true },
  { key: 'likes',     label: 'Likes',    num: true },
  { key: 'matches',   label: 'Matches',  num: true },
  { key: 'messages',  label: 'Messages', num: true },
];

/** Nulls always sink to the bottom, whichever way the column is pointing —
 *  "no data" is not a low score and should not sort like one. */
function cmp(a: unknown, b: unknown, dir: 1 | -1): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b, undefined, { sensitivity: 'base' }) * dir;
  }
  return (a < b ? -1 : 1) * dir;
}

function status(u: UserRow): string {
  if (u.is_active === false) return 'Deactivated';
  if (u.is_onboarded) return 'Onboarded';
  if (u.waitlist_position !== null && u.waitlist_position !== undefined) {
    return `Waitlist #${u.waitlist_position}`;
  }
  return 'Signed up';
}

export function PeopleTable({ rows }: { rows: UserRow[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'last_seen', dir: -1 });

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = needle
      ? rows.filter((r) =>
          (r.name ?? '').toLowerCase().includes(needle) ||
          (r.city ?? '').toLowerCase().includes(needle) ||
          r.id.toLowerCase().startsWith(needle))
      : rows;
    return [...hit].sort((a, b) => cmp(a[sort.key], b[sort.key], sort.dir));
  }, [rows, q, sort]);

  if (!rows.length) return <div className="empty">No profiles yet.</div>;

  // Names sort A→Z first; every other column is more useful biggest-first.
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) } : { key, dir: key === 'name' ? 1 : -1 }));

  return (
    <>
      <div className="people-search">
        <label htmlFor="people-q">Find a person</label>
        <input
          id="people-q"
          type="search"
          value={q}
          placeholder="name, city or id"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table>
          <caption>
            Showing {num(shown.length)} of {num(rows.length)}. Newest activity first;
            click any heading to sort by it.
          </caption>
          <thead>
            <tr>
              {PEOPLE_COLS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                >
                  {/* The arrow is text inside the button, not a CSS marker, so
                      it reaches a screen reader and survives a print. */}
                  <button type="button" onClick={() => toggle(c.key)}>
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' \u25B2' : ' \u25BC') : ''}
                  </button>
                </th>
              ))}
              <th scope="col">Room</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id}>
                <th scope="row">{u.name || u.id.slice(0, 8)}</th>
                <td>{num(u.age)}</td>
                <td>{u.city || '—'}</td>
                <td>{shortDate(u.joined)}</td>
                <td>{shortDate(u.last_seen)}</td>
                <td>{num(u.swipes)}</td>
                <td>{num(u.likes)}</td>
                <td className="strong">{num(u.matches)}</td>
                <td>{num(u.messages)}</td>
                <td>{u.room_status || '—'}</td>
                <td>{status(u)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!shown.length && <p className="msg">Nobody matches &ldquo;{q}&rdquo;.</p>}
    </>
  );
}
