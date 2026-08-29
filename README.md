# MatchPod Analytics Dashboard

Single-operator metrics dashboard.

**There are two frontends in this repo, doing the same job against the same
backend. Deploy one.**

| | `index.html` | `app/` |
|---|---|---|
| stack | one file, no build | React 18 + TypeScript + Vite |
| deploy | upload one file | `npm run build`, upload `dist/` |
| size | 44 KB | ~110 KB gzipped |
| dependencies | supabase-js from a CDN | 77 packages |

Both have the same login, the same metrics, the same design system and the same
exports. The React one is easier to extend; the single file is easier to keep
alive. Pick whichever you will actually maintain, and delete the other —
carrying both means every change gets made twice, and the day they drift is the
day you stop trusting the numbers.

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
npx supabase secrets set --project-ref <prod-ref> METRICS_ADMIN_IDS=<your-user-uuid> METRICS_ALLOWED_ORIGINS=https://metrics.matchpod.in
```

`METRICS_ADMIN_IDS` takes a comma-separated list. If it is unset the function
denies everyone — it fails closed, so a half-finished deploy exposes nothing.

### 4. Configure this page

Edit `window.MP_CONFIG` at the top of `index.html` with the project URL and the
**anon** key (Supabase → Settings → API).

Point it at production for real numbers. The anon key is safe in public source:
it is designed to be public, already ships in the mobile app binary, and grants
nothing on its own.

> Never put the **service role** key in this file. See `CLAUDE.md`.

### 5. Host it

One static file, no build — upload it and you are done. It lives on Hostinger
shared hosting at `metrics.matchpod.in`.

1. hPanel → **Domains → Subdomains** → create `metrics`. This makes a document
   root, usually `public_html/metrics`.
2. If Hostinger leaves a parking page or `default.php` in that folder, delete
   it — it can win over your `index.html`.
3. **File Manager** → upload `index.html` into that folder. One file, drag and
   drop. There is nothing to compile.
4. hPanel → **SSL** → confirm a certificate is *issued* for
   `metrics.matchpod.in`, then turn on **Force HTTPS**.

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

Nothing deploys from git — changes go live by re-uploading `index.html`.

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
| "Not configured" | `MP_CONFIG` still has the placeholder values |
| "not on the metrics allowlist" | your user id is not in `METRICS_ADMIN_IDS` |
| "Dashboard not configured" (503) | `METRICS_ADMIN_IDS` was never set |
| "Some views failed" | `sql/metrics_views.sql` was never run on that project |
| CORS error in the console | this origin is not in `METRICS_ALLOWED_ORIGINS` |
| CORS error, but the origin *looks* right | you are on `http://`, the allowlist says `https://`. Finish SSL |
| Numbers look tiny / wrong | you are pointed at staging, not production |
