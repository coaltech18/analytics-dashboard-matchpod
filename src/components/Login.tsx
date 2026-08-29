import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Logo } from './Logo';

/**
 * The one operator login. There is deliberately no sign-up, no magic link and
 * no password reset: a metrics page that can mint its own logins is a metrics
 * page anyone can register for. The account is created by hand in Supabase and
 * its id pinned in METRICS_ADMIN_IDS.
 */
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);

    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);
    // Supabase already returns a non-committal "Invalid login credentials"
    // rather than saying which half was wrong. Pass it through unchanged.
    if (err) setError(err.message);
    // On success the onAuthStateChange listener in App swaps the view.
  }

  return (
    <div className="gate">
      <div className="gate-box">
        <Logo size={44} className="gate-logo" />
        <h1>
          MATCH<span>POD</span>
        </h1>
        <p className="gate-sub">
          Operator access only. This account is created by hand and pinned to
          the metrics allowlist.
        </p>

        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            autoFocus
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="msg error" role="alert" style={{ marginBottom: 16 }}>
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Authenticating…' : 'Authenticate'}
          </button>
        </form>
      </div>
    </div>
  );
}
