import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMetrics, supabase, MetricsError } from '../lib/supabase';
import { exportCsv } from '../lib/csv';
import { useHashRoute, PAGES } from '../lib/router';
import type { MetricsPayload } from '../lib/types';
import { Nav } from './Nav';
import { Overview, Funnel, Activity, Engagement, Trends, Cohorts, Waitlist, People } from '../pages';

type Status = 'READING' | 'LIVE' | 'PARTIAL' | 'DENIED' | 'ERROR' | 'OFFLINE';

const VIEWS = {
  overview: Overview, funnel: Funnel, activity: Activity, engagement: Engagement,
  trends: Trends, cohorts: Cohorts, waitlist: Waitlist, users: People,
};

/**
 * The shell: fetches once, then hands the same payload to whichever page is
 * open. Pages never fetch for themselves — switching sections should not cost
 * a round trip or flash a spinner, and seven self-loading pages would be seven
 * times the load on the function for identical data.
 */
export function Dashboard() {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [status, setStatus] = useState<Status>('READING');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page] = useHashRoute();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

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

  // Changing page swaps the whole main region. Without moving focus, a keyboard
  // or screen-reader user stays parked on the nav link and is never told the
  // content changed. Skipped on first render so loading does not steal focus.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    mainRef.current?.focus();
  }, [page]);

  useEffect(() => {
    const open = () => document.querySelectorAll('details').forEach((d) => {
      d.dataset['was'] = String(d.open); d.open = true;
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

  const View = VIEWS[page];
  const meta = PAGES.find((p) => p.id === page);

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>

      <Nav page={page} onSignOut={() => void supabase.auth.signOut()} />

      <div className="body">
        <header className="bar">
          <div className="bar-meta">
            <span>STATUS <b>{status}</b></span>
            {data?.generatedAt && (
              <span>
                UPDATED{' '}
                <b>
                  {new Date(data.generatedAt).toLocaleString('en-IN', {
                    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                  }).toUpperCase()}
                </b>
              </span>
            )}
          </div>
          <div className="controls">
            <button className="btn" onClick={() => void load()} disabled={busy}>
              {busy ? 'Reading…' : 'Refresh'}
            </button>
            <button className="btn" onClick={() => data && exportCsv(data)} disabled={!data}>
              CSV
            </button>
            <button className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </header>

        <p className="sr-only" role="status" aria-live="polite">
          {status === 'LIVE' ? `${meta?.label ?? 'Metrics'} loaded.` : `Status ${status}.`}
        </p>

        {error && <p className="msg error" role="alert">{error}</p>}

        {/* tabIndex -1 makes the focus move above possible without turning the
            region into a tab stop of its own. */}
        <main id="main" ref={mainRef} tabIndex={-1}>
          {!data && !error && <div className="empty">Reading metrics…</div>}
          {data && <View data={data} />}
        </main>

        <footer className="foot">
          Seeded demo profiles are excluded from every figure. CSV exports every
          section, not just this page.
        </footer>
      </div>
    </div>
  );
}
