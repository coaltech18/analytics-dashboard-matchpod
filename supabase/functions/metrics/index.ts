// ─── Supabase Dashboard setup ─────────────────────────────────────────────────
// 1. Deploy:    supabase functions deploy metrics
//    (keep JWT verification ON — the dashboard calls this with the signed-in
//    user's JWT. Note that gateway-level verify_jwt is NOT authorisation on its
//    own: the project's anon key is itself a valid JWT, so anyone with the
//    public anon key passes it. The allowlist check below is the real gate.)
//
// 2. Secrets:   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected
//    automatically. You must set these two yourself:
//
//      supabase secrets set METRICS_ADMIN_IDS=<your-auth-user-uuid>
//      supabase secrets set METRICS_ALLOWED_ORIGINS=https://analytics.matchpod.in
//
//    Find your uuid with:  select id, email from auth.users where email = '...';
//    METRICS_ADMIN_IDS accepts a comma-separated list. If it is unset or empty
//    this function denies EVERYONE — it fails closed on purpose, so a
//    misconfigured deploy exposes nothing.
//
// 3. Requires sql/metrics_views.sql to have been run on the project.
// ──────────────────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS AT ALL
// The mp_metrics_* views are revoked from anon and authenticated, so only the
// service role can read them. The service role key grants unrestricted
// read/write on the entire database and must never reach a browser. This
// function is the smallest thing that holds that key server-side and hands back
// nothing but aggregate numbers.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Views the dashboard reads. Single-row ones are unwrapped to an object. */
const VIEWS = {
  overview:   { view: 'mp_metrics_overview',   single: true },
  activity:   { view: 'mp_metrics_activity',   single: true },
  engagement: { view: 'mp_metrics_engagement', single: true },
  cohorts:    { view: 'mp_metrics_cohorts',    single: false },
  daily:      { view: 'mp_metrics_daily',      single: false },
  // The only non-aggregate view. Capped at 500 rows in SQL, not here.
  users:      { view: 'mp_metrics_users',      single: false },
} as const;

const DEFAULT_ORIGINS = [
  'https://analytics.matchpod.in',
  'http://localhost:5173',
  'http://localhost:5183',
];

function allowedOrigins(): string[] {
  const raw = Deno.env.get('METRICS_ALLOWED_ORIGINS');
  if (!raw) return DEFAULT_ORIGINS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Echo the caller's origin only when it is allowlisted.
 *
 * CORS is a browser convenience here, not the security boundary — curl ignores
 * it entirely. The JWT + allowlist check is what actually protects the data.
 */
function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const ok = allowedOrigins().includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowedOrigins()[0] ?? '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ── 1. Who is calling ────────────────────────────────────────────────────
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!jwt) return json({ error: 'Not authenticated' }, 401, cors);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !user) return json({ error: 'Invalid session' }, 401, cors);

    // ── 2. Are they allowed ──────────────────────────────────────────────────
    // Fail closed: an unset or empty METRICS_ADMIN_IDS denies everyone rather
    // than defaulting to open. A deploy that forgot the secret leaks nothing.
    const admins = (Deno.env.get('METRICS_ADMIN_IDS') ?? '')
      .split(',').map((s) => s.trim()).filter(Boolean);

    if (admins.length === 0) {
      console.error('[metrics] METRICS_ADMIN_IDS is not set — denying all requests');
      return json({ error: 'Dashboard not configured' }, 503, cors);
    }
    if (!admins.includes(user.id)) {
      console.warn(`[metrics] denied non-admin ${user.id}`);
      // Deliberately identical to an unknown-route 404 in wording: do not
      // confirm to a signed-in non-admin that this endpoint exists.
      return json({ error: 'Not found' }, 404, cors);
    }

    // ── 3. Read the views ────────────────────────────────────────────────────
    // In parallel; one failing view reports itself rather than sinking the
    // whole response, so a partially-applied migration is obvious.
    const entries = Object.entries(VIEWS);
    const results = await Promise.all(
      entries.map(async ([, cfg]) => {
        const { data, error } = await admin.from(cfg.view).select('*');
        return { cfg, data, error };
      }),
    );

    const payload: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    results.forEach(({ cfg, data, error }, i) => {
      const key = entries[i][0];
      if (error) {
        errors[key] = error.message;
        payload[key] = cfg.single ? null : [];
        return;
      }
      payload[key] = cfg.single ? (data?.[0] ?? null) : (data ?? []);
    });

    if (Object.keys(errors).length > 0) {
      console.error('[metrics] view errors:', JSON.stringify(errors));
    }

    return json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        ...payload,
        ...(Object.keys(errors).length ? { errors } : {}),
      },
      200,
      cors,
    );
  } catch (err) {
    console.error('[metrics] unhandled:', err);
    return json({ error: String(err) }, 500, cors);
  }
});
