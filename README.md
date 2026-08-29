# MatchPod Analytics Dashboard

Single-operator metrics dashboard. React 18 + TypeScript + Vite.

Funnel, activity and dormancy, engagement, waitlist, a 90-day trend chart, and
signup cohorts. CSV / PNG / PDF export.

---

## First-time setup

Everything the dashboard needs lives in this repo. The app repo is not
involved. All of this is one-time.

### 1. Create the views

Open `sql/metrics_views.sql`, paste it into the Supabase SQL editor for the
**production** project, run it.

It creates five read-only `mp_metrics_*` views plus `mp_real_profiles`, all
revoked from every app role so only the service role can read them. It creates
no tables and writes no rows, and every statement is `create or replace`, so
running it twice is harmless.

It is deliberately not a numbered migration — see `CLAUDE.md` for why, and for
the two things that costs you.

### 2. Create the one operator account

There is no sign-up. Create it by hand, once:

Supabase → Authentication → Users → **Add user** → *Create new user*, with
"Auto Confirm User" ticked. Use an address that is **not** a MatchPod app
account, so the operator login and your podder profile stay separate.

Then read its id back:

```sql
select id, email from auth.users where email = 'you@example.com';
```

### 3. Deploy the edge function

From this repo:

```bash
npx supabase functions deploy metrics --project-ref <prod-ref>
```

```bash
npx supabase secrets set --project-ref <prod-ref> METRICS_ADMIN_IDS=<your-user-uuid> METRICS_ALLOWED_ORIGINS=https://analytics.matchpod.in
```

`METRICS_ADMIN_IDS` takes a comma-separated list. If it is unset the function
denies everyone — it fails closed, so a half-finished deploy exposes nothing.

### 4. Configure this page

```bash
cp .env.example .env
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Supabase → Settings
→ API. These are inlined into the bundle at build time, so rebuild after
changing them — they are not read at runtime.

Point it at production for real numbers. The anon key is safe in public source:
it is designed to be public, already ships in the mobile app binary, and grants
nothing on its own.

> Never put the **service role** key in this file. See `CLAUDE.md`.

### 5. Host it

One static file, no build — upload it and you are done. It lives on Hostinger
shared hosting at `analytics.matchpod.in`.

1. hPanel → **Domains → Subdomains** → create `metrics`. This makes a document
   root, usually `public_html/metrics`.
2. If Hostinger leaves a parking page or `default.php` in that folder, delete
   it — it can win over the `index.html` you are about to upload.
3. Build, then upload **the contents of `dist/`** into that folder — the
   files, not the folder itself:

   ```bash
   npm install && npm run build
   ```

   `base` is `./`, so the bundle works at a subdomain root or a subfolder
   without editing anything. There is no router, so Hostinger needs **no SPA
   rewrite rule**; any 404 is a genuinely missing file.
4. hPanel → **SSL** → confirm a certificate is *issued* for
   `analytics.matchpod.in`, then turn on **Force HTTPS**.

Step 4 is not cosmetic. Until the certificate exists the page is served over
`http://`, and that origin does not match the `https://` entry in
`METRICS_ALLOWED_ORIGINS` — you get a CORS error that looks like a broken edge
function but is only the scheme. Do not debug anything until the padlock is
there.

**DNS.** If `matchpod.in`'s nameservers are at Hostinger, the subdomain's record
is created for you. If they are anywhere else, add an A record to the Hostinger
server IP by hand — and if that record is *proxied* through Cloudflare,
certificate issuance fails until you grey-cloud it.

Whatever origin you land on must be in `METRICS_ALLOWED_ORIGINS`.

Nothing deploys from git — changes go live by re-running `npm run build` and
re-uploading `dist/`.

---

## Layout

```
index.html          Vite entry
src/
  main.tsx          mounts App
  App.tsx           session gate: login or dashboard
  components/
    Login.tsx       the one operator login
    Dashboard.tsx   sections, controls, data loading
    Chart.tsx       trend chart, PNG export, accessible data table
    Metrics.tsx     metric cells, funnel bars, activity bar, cohorts
  lib/
    supabase.ts     client + the one fetch to the metrics function
    types.ts        payload shape, every field nullable
    csv.ts          CSV export: RFC 4180 + UTF-8 BOM
    format.ts       number/date formatting, download helper
    mock.ts         dev-only fake data
sql/                the views — run once in the SQL editor
supabase/functions/ the edge function
docs/METRICS.md     what each number is honestly worth
```

## Working on it

```bash
npm install && npm run dev
```

### Without a backend

```bash
echo VITE_MOCK=1 > .env.local && npm run dev
```

Skips the login gate and feeds the dashboard deterministic fake data. Gated
behind `import.meta.env.DEV`, so `npm run build` folds it to a constant and
drops the module — it cannot be switched on in a deployed page. Confirm with:

```bash
grep -c mockPayload dist/assets/*.js
```

which must print `0`.

---

## Using it

| control | does |
|---|---|
| Series buttons | Switch the trend chart between signups, onboardings, active swipers, swipes, matches, messages |
| 7D / 30D / 90D | Change the chart window |
| Hover the chart | Crosshair with that day's value |
| **CSV** | Overview + full daily series + cohorts, one file, Excel-safe |
| **PNG** | Current chart at 2×, series and range in the filename |
| **Print** | Save as PDF; collapsed tables are opened first so the numbers come too |

## Reading the numbers honestly

Two things to keep in mind — `docs/METRICS.md` has the full list:

- **Activity means "opened the app", not "used it".** It comes from
  `profiles.last_seen`, written on foreground at most once every five minutes.
- **Cohort retention is *current*, not day-N.** "Still active" is: of the people
  who joined that week, how many have opened the app in the last 30 days. True
  day-N curves are impossible from the current schema, because `last_seen` is a
  single overwritten column.

Seeded demo profiles are excluded from every figure.

## Troubleshooting

| symptom | cause |
|---|---|
| "Not configured" | `.env` is missing or still has placeholder values |
| "not on the metrics allowlist" | your user id is not in `METRICS_ADMIN_IDS` |
| "Dashboard not configured" (503) | `METRICS_ADMIN_IDS` was never set |
| "Some views failed" | `sql/metrics_views.sql` was never run on that project |
| Onboardings series missing from the chart | expected on production — no `analytics_events` table. See docs/METRICS.md |
| CORS error in the console | this origin is not in `METRICS_ALLOWED_ORIGINS` |
| CORS error, but the origin *looks* right | you are on `http://`, the allowlist says `https://`. Finish SSL |
| Numbers look tiny / wrong | you are pointed at staging, not production |
