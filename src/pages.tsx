import { useMemo, useState } from 'react';
import type { MetricsPayload, SeriesKey } from './lib/types';
import { SERIES } from './lib/types';
import { num, pct } from './lib/format';
import { MetricGrid, FunnelBars, CohortTable } from './components/Metrics';
import { Donut } from './components/Donut';
import { Chart } from './components/Chart';

export type PageProps = { data: MetricsPayload };

/** Every page opens with the same shape: a title and one honest sentence. */
function Head({ title, note }: { title: string; note: string }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      <p>{note}</p>
    </div>
  );
}

/** Shared: the three activity bands as a donut. */
function activitySlices(o: NonNullable<MetricsPayload['overview']>) {
  return [
    { label: 'Active 7d', value: o.active_7d ?? 0 },
    { label: 'Dormant 7–30d', value: o.dormant_7_30d ?? 0 },
    { label: 'Dormant 30d+', value: o.dormant_30d_plus ?? 0 },
  ].filter((s) => s.value > 0);
}

/* ── overview ─────────────────────────────────────────────────────────────
   The daily glance. Deliberately the smallest page: if it needs scrolling it
   has stopped being a glance. Everything here is repeated in depth elsewhere. */
export function Overview({ data }: PageProps) {
  const o = data.overview;
  const daily = data.daily ?? [];
  if (!o) return <div className="empty">No overview data.</div>;

  const total = (o.active_7d ?? 0) + (o.dormant_7_30d ?? 0) + (o.dormant_30d_plus ?? 0);

  return (
    <>
      <Head
        title="Overview"
        note="The six numbers worth checking daily. Each has its own section with the detail behind it."
      />
      <MetricGrid
        daily={daily}
        cells={[
          { label: 'Signed up', value: num(o.signed_up), sub: 'auth accounts', spark: 'signups' },
          { label: 'Onboarded', value: num(o.onboarded), key: true },
          { label: 'Active 7d', value: num(o.active_7d), sub: `${pct(o.active_7d_pct)} of onboarded`, key: true, spark: 'active_swipers' },
          { label: 'Matches', value: num(o.matches_total), sub: 'all time', spark: 'matches' },
          { label: 'Two-way chats', value: num(o.two_way_conversations), sub: 'both people spoke' },
          { label: 'Waitlisted', value: num(o.waitlisted), sub: o.gate_open ? 'gate OPEN' : 'gate CLOSED' },
        ]}
      />
      <h2 className="sub-head">Where everyone stands today</h2>
      <Donut centreLabel="profiles" centreValue={num(total)} slices={activitySlices(o)} />
    </>
  );
}

/* ── funnel ──────────────────────────────────────────────────────────────── */
export function Funnel({ data }: PageProps) {
  const o = data.overview;
  const daily = data.daily ?? [];
  if (!o) return <div className="empty">No funnel data.</div>;

  return (
    <>
      <Head
        title="Funnel"
        note="Auth account → started a profile → finished onboarding. Each step is a subset of the one above it."
      />
      <MetricGrid
        daily={daily}
        cells={[
          { label: 'Signed up', value: num(o.signed_up), sub: 'auth accounts', spark: 'signups' },
          { label: 'Started profile', value: num(o.started_profile) },
          { label: 'Onboarded', value: num(o.onboarded), key: true },
          { label: 'Deactivated', value: num(o.deactivated), sub: 'excluded from the rest' },
        ]}
      />
      <h2 className="sub-head">Drop-off between steps</h2>
      <FunnelBars o={o} />
      <p className="page-note">
        Seed profiles are excluded everywhere. &ldquo;Deactivated&rdquo; accounts
        still count as signed up — they were real people who left.
      </p>
    </>
  );
}

/* ── activity ────────────────────────────────────────────────────────────── */
export function Activity({ data }: PageProps) {
  const o = data.overview;
  const a = data.activity;
  const daily = data.daily ?? [];
  if (!o) return <div className="empty">No activity data.</div>;

  const total = (o.active_7d ?? 0) + (o.dormant_7_30d ?? 0) + (o.dormant_30d_plus ?? 0);

  return (
    <>
      <Head
        title="Activity &amp; dormancy"
        note="How many people still open the app, and how long the rest have been gone."
      />
      <MetricGrid
        daily={daily}
        cells={[
          { label: 'Active 24h', value: num(o.active_24h) },
          { label: 'Active 7d', value: num(o.active_7d), sub: `${pct(o.active_7d_pct)} of onboarded`, key: true, spark: 'active_swipers' },
          { label: 'Active 30d', value: num(o.active_30d) },
          { label: 'Dormant 7–30d', value: num(o.dormant_7_30d) },
          { label: 'Dormant 30d+', value: num(o.dormant_30d_plus) },
          { label: 'Never returned', value: num(o.never_returned), sub: 'signed up, no second day' },
          { label: 'last_seen unknown', value: num(a?.last_seen_unknown), sub: 'expect 0' },
        ]}
      />
      <h2 className="sub-head">Composition</h2>
      <Donut centreLabel="profiles" centreValue={num(total)} slices={activitySlices(o)} />
      <p className="page-note">
        <b>&ldquo;Active&rdquo; means opened the app, not used it.</b> It comes from{' '}
        <code>profiles.last_seen</code>, written when the app comes to the
        foreground, at most once every five minutes. Someone who opens the app
        and immediately closes it counts here. The cards above are cumulative
        (Active 30d includes Active 7d); the donut bands are disjoint.
      </p>
    </>
  );
}

/* ── engagement ──────────────────────────────────────────────────────────── */
export function Engagement({ data }: PageProps) {
  const o = data.overview;
  const e = data.engagement;
  const daily = data.daily ?? [];
  if (!o) return <div className="empty">No engagement data.</div>;

  return (
    <>
      <Head
        title="Engagement"
        note="What people actually do once they are in: swiping, matching, and whether anyone talks."
      />
      <MetricGrid
        daily={daily}
        cells={[
          { label: 'Swipes 7d', value: num(o.swipes_7d), spark: 'swipes' },
          { label: 'Swipers 7d', value: num(o.swipers_7d), sub: 'distinct users' },
          { label: 'Like rate', value: pct(o.like_rate_pct), sub: 'of all swipes' },
          { label: 'Matches', value: num(o.matches_total), sub: `${num(e?.matches_7d)} in last 7d`, key: true, spark: 'matches' },
          { label: 'Match rate', value: pct(o.match_rate_pct), sub: 'of likes sent' },
          { label: 'Messages 7d', value: num(o.messages_7d), spark: 'messages' },
          { label: 'Two-way chats', value: num(o.two_way_conversations), sub: 'both people spoke', key: true },
          { label: 'Msgs per chat', value: num(e?.avg_messages_per_chat), sub: 'average' },
        ]}
      />
      <p className="page-note">
        <b>Two-way chats is the honest one.</b> A match where nobody speaks is
        not a conversation, and total matches will always flatter the product
        compared with how many of them turned into anything.
      </p>
    </>
  );
}

/* ── trends ──────────────────────────────────────────────────────────────── */
export function Trends({ data }: PageProps) {
  const daily = useMemo(() => data.daily ?? [], [data]);
  const [range, setRange] = useState<7 | 30 | 90>(90);
  const [series, setSeries] = useState<SeriesKey>('signups');

  const available = useMemo(
    () => SERIES.filter((s) => daily.some((r) => r[s.key] !== null && r[s.key] !== undefined)),
    [daily],
  );
  const unavailable = SERIES.filter((s) => !available.includes(s));
  const active = available.some((s) => s.key === series) ? series : available[0]?.key ?? 'signups';
  const label = SERIES.find((s) => s.key === active)?.label ?? 'Signups';
  const windowed = daily.slice(Math.max(0, daily.length - range));

  if (!daily.length) return <div className="empty">No daily data yet.</div>;

  return (
    <>
      <Head title="Trends" note="One series at a time, day by day. Pick the measure, then the window." />

      <div className="filters">
        <div className="filter-row" role="group" aria-label="Measure">
          {available.map((s) => (
            <button key={s.key} className="btn" aria-pressed={active === s.key} onClick={() => setSeries(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="filter-row" role="group" aria-label="Time range">
          {([7, 30, 90] as const).map((r) => (
            <button key={r} className="btn" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r}D
            </button>
          ))}
        </div>
      </div>

      {unavailable.length > 0 && (
        <p className="msg" style={{ marginBottom: 14 }}>
          Not recorded by this database:{' '}
          <b style={{ color: 'var(--fg)' }}>{unavailable.map((s) => s.label).join(', ')}</b>. Shown
          as absent rather than zero.
        </p>
      )}

      <Chart rows={windowed} seriesKey={active} seriesLabel={label} range={range} />

      <p className="page-note">
        Only ever one measure on the axis. Two measures of different size on one
        chart would invent a relationship that is not in the data.
      </p>
    </>
  );
}

/* ── cohorts ─────────────────────────────────────────────────────────────── */
export function Cohorts({ data }: PageProps) {
  return (
    <>
      <Head
        title="Cohorts"
        note="Group people by the week they signed up, then ask how many are still around."
      />
      <CohortTable rows={data.cohorts ?? []} />
      <p className="page-note">
        <b>This is current retention, not day-N.</b> &ldquo;Still active&rdquo;
        means: of the people who joined that week, how many opened the app in
        the last 30 days. A true day-7 or day-30 curve is impossible from the
        current schema, because <code>last_seen</code> is a single column that
        gets overwritten — there is no history to reconstruct. Older cohorts
        have simply had longer to drift away, so read the column downward with
        that in mind.
      </p>
    </>
  );
}

/* ── waitlist ────────────────────────────────────────────────────────────── */
export function Waitlist({ data }: PageProps) {
  const o = data.overview;
  const daily = data.daily ?? [];
  if (!o) return <div className="empty">No waitlist data.</div>;

  return (
    <>
      <Head title="Waitlist" note="How many are queued, and whether the gate is currently letting people in." />
      <MetricGrid
        daily={daily}
        cells={[
          { label: 'Waitlisted', value: num(o.waitlisted), sub: 'holding a position' },
          { label: 'Cap', value: num(o.cap), sub: 'onboarded limit' },
          { label: 'Spots left', value: num(o.spots_left) },
          { label: 'Gate', value: o.gate_open ? 'OPEN' : 'CLOSED', key: !!o.gate_open },
        ]}
      />
      <p className="page-note">
        Spots left is the cap minus onboarded, floored at zero — so it reads 0
        rather than going negative if the cap is lowered below the current
        count. The gate is set in <code>app_config</code>, not here.
      </p>
    </>
  );
}
