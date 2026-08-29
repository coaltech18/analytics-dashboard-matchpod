import type { MetricsPayload, DailyRow, CohortRow } from './types';

/**
 * Deterministic fake payload for local work without a backend.
 *
 * Only reachable when BOTH import.meta.env.DEV and VITE_MOCK are set. `vite
 * build` sets DEV to false, so every call site folds to a constant and this
 * module is dropped from the production bundle entirely — it cannot be
 * switched on in a deployed page. Verify with: grep mock dist/assets/*.js
 */
export const mockEnabled = import.meta.env.DEV && import.meta.env['VITE_MOCK'] === '1';

/** Seeded PRNG so the chart looks the same on every reload. */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function daily(): DailyRow[] {
  const r = rng(42);
  const out: DailyRow[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const growth = 1 + (89 - i) / 60;         // gentle upward drift
    const weekend = [0, 6].includes(d.getDay()) ? 1.35 : 1;
    const signups = Math.round((4 + r() * 9) * growth * weekend);
    const swipes = Math.round((60 + r() * 150) * growth);
    return_row(out, d, signups, swipes, r);
  }
  return out;
}

function return_row(out: DailyRow[], d: Date, signups: number, swipes: number, r: () => number) {
  const matches = Math.round(swipes * (0.06 + r() * 0.05));
  out.push({
    day: d.toISOString().slice(0, 10),
    signups,
    onboardings: Math.round(signups * (0.55 + r() * 0.3)),
    active_swipers: Math.round(swipes / (6 + r() * 4)),
    swipes,
    matches,
    messages: Math.round(matches * (1.5 + r() * 4)),
  });
}

function cohorts(): CohortRow[] {
  const r = rng(7);
  const out: CohortRow[] = [];
  for (let w = 11; w >= 0; w--) {
    const d = new Date();
    d.setDate(d.getDate() - w * 7);
    const signed = Math.round(30 + r() * 70);
    const onboarded = Math.round(signed * (0.5 + r() * 0.35));
    // Older cohorts have decayed further — makes the heat column meaningful.
    const active = Math.round(onboarded * (0.2 + (12 - w) / 22 + r() * 0.12));
    out.push({
      cohort_week: d.toISOString().slice(0, 10),
      signed_up: signed,
      onboarded,
      onboarded_pct: Math.round((onboarded / signed) * 1000) / 10,
      active_last_7d: Math.round(active * 0.45),
      active_last_30d: active,
      still_active_pct: Math.round(Math.min(100, (active / Math.max(onboarded, 1)) * 100) * 10) / 10,
    });
  }
  return out;
}

export function mockPayload(): MetricsPayload {
  const d = daily();
  const totalSignups = d.reduce((a, x) => a + (x.signups ?? 0), 0);
  const onboarded = d.reduce((a, x) => a + (x.onboardings ?? 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      signed_up: totalSignups,
      started_profile: Math.round(totalSignups * 0.81),
      onboarded,
      deactivated: 14,
      active_24h: 96,
      active_7d: 372,
      active_30d: 664,
      active_7d_pct: Math.round((372 / onboarded) * 1000) / 10,
      dormant_7_30d: 292,
      dormant_30d_plus: 233,
      never_returned: 118,
      swipes_7d: 4820,
      swipers_7d: 288,
      like_rate_pct: 38.4,
      matches_total: 1442,
      match_rate_pct: 11.7,
      messages_7d: 2610,
      two_way_conversations: 486,
      waitlisted: 214,
      cap: 1500,
      spots_left: 1500 - onboarded,
      gate_open: true,
    },
    activity: { last_seen_unknown: 0 },
    engagement: { matches_7d: 168, avg_messages_per_chat: 9 },
    daily: d,
    cohorts: cohorts(),
  };
}
