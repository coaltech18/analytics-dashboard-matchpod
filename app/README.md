# MatchPod Metrics — React app

React 18 + TypeScript + Vite. The dashboard itself — the repo root holds the
backend (`../sql`, `../supabase`) and the docs.

## Run it

```bash
npm install
```

```bash
cp .env.example .env && npm run dev
```

Without a `.env` the app renders a setup notice instead of a login form it
could never satisfy.

### Working without a backend

```bash
echo VITE_MOCK=1 > .env.local && npm run dev
```

Skips the login gate and feeds the dashboard a deterministic fake payload.
Gated behind `import.meta.env.DEV`, so `vite build` folds it to a constant and
drops the module — it cannot be switched on in a deployed page. Verify with:

```bash
grep -c mockPayload dist/assets/*.js
```

## Build and deploy

```bash
npm run build
```

Upload the **contents of `dist/`** to the Hostinger subdomain folder — not the
folder itself. `base` is `./`, so the bundle works at a subdomain root or in a
subfolder without editing anything.

There is no router (login vs dashboard is one boolean, not two URLs), so the
host needs **no SPA rewrite rule**. Any 404 you see is a genuinely missing file.

`VITE_*` vars are inlined into the bundle at build time. That is fine for the
anon key, which is public by design. The **service role key must never be a
`VITE_` var** — it belongs only in the edge function's secrets.

Rebuild and re-upload after changing `.env`; the values are baked in, not read
at runtime.

## Layout

```
src/lib/supabase.ts   client + the one fetch to the metrics function
src/lib/types.ts      the payload shape, every field nullable
src/lib/csv.ts        RFC 4180 + UTF-8 BOM
src/lib/mock.ts       dev-only fake data
src/components/       Login, Dashboard, Chart, Metrics
```

Read `../CLAUDE.md` before changing colours, the chart, or the exports — the
contrast ratios are measured and the exports have two silent failure modes.
