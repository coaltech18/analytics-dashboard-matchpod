# Metrics

Every product number in one place. Migration `048_metrics_views.sql` adds five
views; this is how to read them.

They are **service-role only** — revoked from `anon` and `authenticated`, same
as `podder_stats` and `onboarding_funnel`. That means the Supabase SQL editor
(or any tool connecting with the Postgres connection string) can read them, and
the app cannot. Do not grant these to `authenticated` to make a screen work.

---

## Daily driver

```sql
select * from public.mp_metrics_overview;
```

One row, everything headline: signed up, onboarded, active 24h/7d/30d, dormant
buckets, never-returned, swipes, like rate, matches, match rate, messages,
two-way conversations, waitlist and gate state.

In the Supabase SQL editor, save it (`Ctrl/Cmd+S`) so it lands in your saved
queries and is one click away.

## The other four

| view | answers |
|---|---|
| `mp_metrics_activity` | Who is still here — active/dormant buckets, never-returned |
| `mp_metrics_cohorts` | Per signup week: how many onboarded, how many are still active |
| `mp_metrics_engagement` | Swipes, like rate, matches, match rate, real conversations |
| `mp_metrics_daily` | 90-day zero-filled time series — **this is the one to chart** |

`mp_real_profiles` is a plumbing view (profiles minus seeds) the others build
on. It carries every private profile column, so leave it revoked.

---

# The dashboard at metrics.matchpod.in

Two pieces, because the views are service-role only and **the service key can
never go in a browser** — it grants unrestricted read/write on the whole
database:

```
browser (anon key, your login)
   │  JWT
   ▼
supabase/functions/metrics    ← holds SERVICE_ROLE_KEY, checks the allowlist
   │
   ▼
mp_metrics_* views
```

The page (`web/metrics/index.html`) only ever receives aggregate numbers.

## Deploy

**1. Apply the migration** (see the top of this file for which project).

**2. Create the one operator account.** The dashboard has no sign-up screen and
never will — a metrics page that can mint its own logins is a metrics page
anyone can register for. Create the single account by hand, once, in the
Supabase dashboard: Authentication → Users → **Add user** → *Create new user*,
with "Auto Confirm User" ticked.

Use an address that is **not** a MatchPod app account, so the operator login and
your podder profile stay separate. Then read its id back:

```sql
select id, email from auth.users where email = 'you@example.com';
```

**3. Deploy the function and set its secrets:**

```bash
supabase functions deploy metrics
```

```bash
supabase secrets set METRICS_ADMIN_IDS=<your-user-uuid> METRICS_ALLOWED_ORIGINS=https://metrics.matchpod.in
```

`METRICS_ADMIN_IDS` takes a comma-separated list. **If it is unset the function
denies everyone** — it fails closed, so a half-finished deploy exposes nothing.

**4. Configure the page.** Edit the `MP_CONFIG` block at the top of
`web/metrics/index.html` with the project URL and **anon** key (Settings → API).
Point it at production for real numbers. The anon key is safe in public source —
it already ships inside the mobile app binary and grants nothing on its own.

**5. Host it.** It is one static file, no build step. Cloudflare Pages, Netlify
and Vercel all work on their free tiers:

- Cloudflare Pages → Create project → connect the repo → build command *(none)*,
  output directory `web/metrics`.
- Then Custom domains → `metrics.matchpod.in`, which adds the CNAME for you if
  the domain's DNS is on Cloudflare.

**6. Sign in** on the page with the account whose id you allowlisted.

## Access

Anyone can load the page — it is just HTML. Only an allowlisted account gets
data; everyone else is refused by the edge function. A signed-in non-admin gets
a plain `404` rather than a `403`, so the endpoint does not confirm it exists.

There are two independent locks and you want both: the account must exist (no
sign-up path creates one), **and** its id must be in `METRICS_ADMIN_IDS`.
Adding an account to Supabase alone grants nothing.

CORS is set from `METRICS_ALLOWED_ORIGINS`, but treat that as tidiness rather
than security: `curl` ignores CORS entirely. The JWT check plus the allowlist is
the actual boundary.

To revoke access, remove the id from `METRICS_ADMIN_IDS` and redeploy the
secret. To add a co-founder, append their uuid.

## What's on the page

- **KPI cells** for funnel, activity, engagement and waitlist, several carrying
  a 30-day sparkline.
- **Funnel bars** — signed up → started profile → onboarded, each step labelled
  with its conversion off the previous step and how many were lost.
- **Activity composition bar** — one disjoint split of the whole population into
  active 7d / dormant 7–30d / dormant 30d+. Note this differs from the KPI
  cells above it, which are deliberately *cumulative*.
- **Trend chart** — any of six series, over 7 / 30 / 90 days, with a 7-day
  moving average, a hover crosshair, and total / peak / average for the window.
- **Cohort table** with a retention heat tint. The tint is a secondary cue only;
  the number is always in the cell.

## Export

| Button | Gives you |
|---|---|
| **CSV** | `matchpod-metrics-<date>.csv` — overview, the full daily series, and cohorts as three sections in one file. UTF-8 BOM so Excel opens it correctly. |
| **PNG** | The current chart at 2× (1840×536), series and range in the filename. |
| **Print** | Print/save-as-PDF with a light print stylesheet; collapsed data tables are opened first so the PDF carries the numbers behind the chart. |

CSV values are escaped per RFC 4180, so a stray comma or quote in future data
cannot shift a column.

## Design notes

Tactical Telemetry: 90° corners throughout, hairline rules, Archivo Black for
numerals, Space Mono for every label, MatchPod's ink/paper/pink rather than the
archetype's hazard red.

Two rules worth not undoing:

- **Do not darken the greys.** `--fg-faint` is pinned at `#8C8983` because the
  obvious darker choice measured 4.37:1 and failed WCAG AA on every metric
  label. The token block records the measured ratio for each colour.
- **Pink is for large numerals, rules and accents — never body copy.** It sits
  at 4.9:1, which is fine at 34px and tiring at 11px.

Motion is deliberately minimal (hover and focus only) and everything is gated
behind `prefers-reduced-motion`. The chart exposes its numbers as a real table
under the disclosure, because a `<polyline>` tells a screen reader nothing.

## If it breaks

| symptom | cause |
|---|---|
| "not configured" | `MP_CONFIG` still has the placeholder values |
| "not on the metrics allowlist" | your user id is not in `METRICS_ADMIN_IDS` |
| "Dashboard not configured" (503) | `METRICS_ADMIN_IDS` secret was never set |
| "Some views failed" | migration 048 is not applied to that project |
| CORS error in the console | the origin is not in `METRICS_ALLOWED_ORIGINS` |

## Not building a page after all?

`mp_metrics_daily` returns one row per day and charts directly in the Supabase
SQL editor. [Metabase](https://www.metabase.com) pointed at the database with a
**read-only** Postgres user also works, and needs no edge function. The views do
not change either way — that is the whole reason they exist as views rather
than queries pasted into a tool.

---

## What these numbers are and are not

**Activity is "opened the app", not "used the app".** It comes from
`profiles.last_seen`, written by `hooks/usePresence.ts` on foreground, at most
once per 5 minutes. Open-and-immediately-close counts as active. There is no
session length and no per-screen activity, because nothing records those.

**Retention is current, not day-N.** `mp_metrics_cohorts` answers "of the people
who joined in week W, how many are still active now". It cannot answer "what
share were still active on day 7", because `last_seen` is a single overwritten
column — once someone is active on day 30, the day-7 answer is gone. Real day-N
curves need a daily snapshot; see the upgrade path below.

**Engagement comes from the domain tables, not the event log.**
`analytics_events` only carries `onboarding_step_viewed`,
`onboarding_step_completed` and `onboarding_completed`, so it can answer nothing
about swipes, matches or messages.

**Seed profiles are excluded** via the `5eed0000…` id sentinel both
`maintenance/seed_*.sql` scripts use. A future seed script with a different
prefix will be silently counted as real users — keep the sentinel, or update
`mp_real_profiles`.

**Onboarding is already covered elsewhere** and is not duplicated here:
`podder_stats` (034), `podder_dropoff` (035), `onboarding_funnel` (041).

---

## Upgrade path, when the numbers earn it

Add these only once you are actually reading the current ones weekly.

- **True day-N retention** — a `daily_active` rollup table (`user_id`, `day`,
  unique on both), written either by a cron job snapshotting `last_seen` or by
  the client emitting a `session_started` event. Cohort curves become a
  self-join over it. This is the only one that needs new writes.
- **Depth of use** — `screen_viewed` / `swipe_session` analytics events, if
  "opened the app" stops being a good enough proxy.
- **Funnel past onboarding** — first swipe, first match, first message, keyed
  off days-since-signup.
