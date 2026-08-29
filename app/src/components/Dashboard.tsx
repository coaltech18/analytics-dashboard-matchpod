import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMetrics, supabase, MetricsError } from '../lib/supabase';
import { exportCsv } from '../lib/csv';
import { num, pct } from '../lib/format';
import { SERIES, type MetricsPayload, type SeriesKey } from '../lib/types';
import { MetricGrid, FunnelBars, ActivityStack, CohortTable } from './Metrics';
import { Chart } from './Chart';

type Status = 'READING' | 'LIVE' | 'PARTIAL' | 'DENIED' | 'ERROR' | 'OFFLINE';

export function Dashboard() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [status, setStatus] = useState<Status>('READING');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<7 | 30 | 90>(90);
  const [series, setSeries] = useState<SeriesKey>('signups');

  const load = useCallback(async () => {
    setBusy(true);
    setStatus('READING');
    try {
      const body = await fetchMetrics();
      setData(body);
      if (body.errors) {
        setStatus('PARTIAL');
        setError(
          'Some views failed — has sql/metrics_views.sql been run? ' +
            Object.entries(body.errors).map(([k, v]) => `${k}: ${v}`).join(' · '),
        );
      } else {
        setStatus('LIVE');
        setError(null);
      }
    } catch (err) {
      const e = err as MetricsError;
      setStatus(e.status === 404 ? 'DENIED' : e.status === 0 ? 'OFFLINE' : 'ERROR');
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Collapsed <details> print as a closed summary. Open them so a saved PDF
  // carries the numbers behind the chart too, then restore.
  useEffect(() => {
    const open = () => document.querySelectorAll('details').forEach((d) => {
      d.dataset['was'] = String(d.open);
      d.open = true;
    });
    const restore = () => document.querySelectorAll('details').forEach((d) => {
      d.open = d.dataset['was'] === 'true';
    });
    window.addEventListener('beforeprint', open);
    window.addEventListener('afterprint', restore);
    return () => {
      window.removeEventListener('beforeprint', open);
      window.removeEventListener('afterprint', restore);
    };
  }, []);

  const daily = useMemo(() => data?.daily ?? [], [data]);
  const windowed = useMemo(
    () => daily.slice(Math.max(0, daily.length - range)),
    [daily, range],
  );

  const o = data?.overview;
  const a = data?.activity;
  const e = data?.engagement;
  const seriesLabel = SERIES.find((s) => s.key === series)?.label ?? 'Signups';

  return (
    <>
      <a className="skip" href="#main">Skip to metrics</a>

      <div className="wrap">
        <header className="top">
          <div>
            <h1 className="brand">MATCH<span>POD</span> METRICS</h1>
            <div className="meta" style={{ marginTop: 8 }}>
              <span>STATUS <b>{status}</b></span>
              {data?.generatedAt && (
                <span>
                  UPDATED{' '}
                  <b>
                    {new Date(data.generatedAt)
                      .toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })
                      .toUpperCase()}
                  </b>
                </span>
              )}
            </div>
          </div>

          <div className="controls">
            <button className="btn" onClick={() => void load()} disabled={busy}>
              {busy ? 'Reading…' : 'Refresh'}
            </button>
            <button className="btn" onClick={() => data && exportCsv(data)} disabled={!data}>
              CSV
            </button>
            <button className="btn" onClick={() => window.print()}>Print</button>
            <button className="btn" onClick={() => void supabase.auth.signOut()}>Sign out</button>
          </div>
        </header>

        {/* Live region: status changes announce without stealing focus. */}
        <p className="sr-only" role="status" aria-live="polite">
          {status === 'LIVE' ? 'Metrics loaded.' : `Status ${status}.`}
        </p>

        {error && (
          <p className="msg error" role="alert" style={{ marginBottom: 24 }}>
            {error}
          </p>
        )}

        <main id="main">
          {!data && !error && <div className="empty">Reading metrics…</div>}

          {o && (
            <>
              <section>
                <div className="sec-head">
                  <h2>Funnel</h2>
                  <span className="sec-note">auth account → profile → onboarded</span>
                </div>
                <MetricGrid
                  daily={daily}
                  cells={[
                    { label: 'Signed up', value: num(o.signed_up), sub: 'auth accounts', spark: 'signups' },
                    { label: 'Started profile', value: num(o.started_profile) },
                    { label: 'Onboarded', value: num(o.onboarded), key: true, spark: 'onboardings' },
                    { label: 'Deactivated', value: num(o.deactivated) },
                  ]}
                />
                <FunnelBars o={o} />
              </section>

              <section>
                <div className="sec-head">
                  <h2>Activity &amp; dormancy</h2>
                  <span className="sec-note">
                    &ldquo;active&rdquo; means opened the app, not used it
                  </span>
                </div>
                <MetricGrid
                  daily={daily}
                  cells={[
                    { label: 'Active 24h', value: num(o.active_24h) },
                    {
                      label: 'Active 7d',
                      value: num(o.active_7d),
                      sub: `${pct(o.active_7d_pct)} of onboarded`,
                      key: true,
                      spark: 'active_swipers',
                    },
                    { label: 'Active 30d', value: num(o.active_30d) },
                    { label: 'Dormant 7–30d', value: num(o.dormant_7_30d) },
                    { label: 'Dormant 30d+', value: num(o.dormant_30d_plus) },
                    { label: 'Never returned', value: num(o.never_returned), sub: 'signed up, no second day' },
                    { label: 'last_seen unknown', value: num(a?.last_seen_unknown), sub: 'expect 0' },
                  ]}
                />
                <ActivityStack o={o} />
              </section>

              <section>
                <div className="sec-head">
                  <h2>Engagement</h2>
                </div>
                <MetricGrid
                  daily={daily}
                  cells={[
                    { label: 'Swipes 7d', value: num(o.swipes_7d), spark: 'swipes' },
                    { label: 'Swipers 7d', value: num(o.swipers_7d), sub: 'distinct users' },
                    { label: 'Like rate', value: pct(o.like_rate_pct) },
                    {
                      label: 'Matches',
                      value: num(o.matches_total),
                      sub: `${num(e?.matches_7d)} in last 7d`,
                      key: true,
                      spark: 'matches',
                    },
                    { label: 'Match rate', value: pct(o.match_rate_pct), sub: 'of likes sent' },
                    { label: 'Messages 7d', value: num(o.messages_7d), spark: 'messages' },
                    { label: 'Two-way chats', value: num(o.two_way_conversations), sub: 'both people spoke', key: true },
                    { label: 'Msgs per chat', value: num(e?.avg_messages_per_chat), sub: 'average' },
                  ]}
                />
              </section>

              <section>
                <div className="sec-head">
                  <h2>Waitlist</h2>
                </div>
                <MetricGrid
                  daily={daily}
                  cells={[
                    { label: 'Waitlisted', value: num(o.waitlisted) },
                    { label: 'Cap', value: num(o.cap) },
                    { label: 'Spots left', value: num(o.spots_left) },
                    { label: 'Gate', value: o.gate_open ? 'OPEN' : 'CLOSED', key: !!o.gate_open },
                  ]}
                />
              </section>
            </>
          )}

          {daily.length > 0 && (
            <section>
              <div className="sec-head">
                <h2>Trend</h2>
              </div>

              <div className="controls" style={{ marginBottom: 12 }}>
                {SERIES.map((s) => (
                  <button
                    key={s.key}
                    className="btn"
                    aria-pressed={series === s.key}
                    onClick={() => setSeries(s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="controls" style={{ marginBottom: 12 }}>
                {([7, 30, 90] as const).map((r) => (
                  <button
                    key={r}
                    className="btn"
                    aria-pressed={range === r}
                    onClick={() => setRange(r)}
                  >
                    {r}D
                  </button>
                ))}
              </div>

              <Chart rows={windowed} seriesKey={series} seriesLabel={seriesLabel} range={range} />
            </section>
          )}

          {data?.cohorts && (
            <section>
              <div className="sec-head">
                <h2>Cohorts</h2>
                <span className="sec-note">retention is current, not day-N</span>
              </div>
              <CohortTable rows={data.cohorts} />
            </section>
          )}
        </main>
      </div>
    </>
  );
}
