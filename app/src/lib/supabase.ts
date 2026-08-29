import { createClient } from '@supabase/supabase-js';
import type { MetricsPayload } from './types';
import { mockEnabled, mockPayload } from './mock';

const URL = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const ANON = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

/** False until .env is filled in; the app shows a setup notice instead of a
 *  login form it could never satisfy. */
export const configured =
  mockEnabled ||
  (!!URL && !!ANON && !URL.includes('YOUR-PROJECT-REF') && !ANON.startsWith('YOUR-'));

export const supabase = createClient(URL ?? 'https://placeholder.supabase.co', ANON ?? 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true },
});

export class MetricsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'MetricsError';
  }
}

/**
 * Read aggregates from the edge function. The page never queries the metrics
 * views directly — they are revoked from every app role, and the service key
 * that can read them lives only in the function.
 */
export async function fetchMetrics(): Promise<MetricsPayload> {
  if (mockEnabled) return mockPayload();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new MetricsError('Your session expired. Sign in again.', 401);

  let res: Response;
  try {
    res = await fetch(`${URL}/functions/v1/metrics`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
  } catch (err) {
    throw new MetricsError(`Could not reach the metrics function: ${String(err)}`, 0);
  }

  const body = (await res.json().catch(() => null)) as (MetricsPayload & { error?: string }) | null;

  if (!res.ok) {
    // 404 is deliberate for a signed-in non-admin: the function does not
    // confirm the endpoint exists to a stranger. Do not report it as "denied".
    throw new MetricsError(
      res.status === 404
        ? 'This account is not on the metrics allowlist. Add its user id to METRICS_ADMIN_IDS.'
        : `${res.status} — ${body?.error ?? 'unknown error'}`,
      res.status,
    );
  }
  if (!body) throw new MetricsError('The metrics function returned no JSON.', res.status);
  return body;
}
