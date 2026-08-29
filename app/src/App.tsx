import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, configured } from './lib/supabase';
import { mockEnabled } from './lib/mock';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';

/**
 * Login and dashboard are one boolean, not two URLs — so there is no router
 * here on purpose. Adding one would mean a /dashboard path that renders
 * nothing useful when unauthenticated, plus an SPA rewrite rule on the host.
 */
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured) { setReady(true); return; }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <div className="gate">
        <div className="msg" role="alert">
          Not configured — copy <code>.env.example</code> to <code>.env</code> and set
          VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.
        </div>
      </div>
    );
  }

  // Render nothing until the stored session is read, or the login form flashes
  // for an already-signed-in operator on every reload.
  if (!ready) return null;

  // Mock mode skips the gate; it exists only in dev builds.
  return session || mockEnabled ? <Dashboard /> : <Login />;
}
