# MatchPod Analytics Dashboard

React 18 + TypeScript + Vite at the repo root. Built with `npm run build`, deployed
as static files — there is no server.

The frontend is the frontend only. It reads numbers from the MatchPod Supabase project
over HTTPS and renders them.

---

## The rule that matters most

**The Supabase service role key must never appear in this repo.**

It grants unrestricted read/write on the entire production database. This page
is public HTML — anything in it is readable by anyone who opens the page.

The page holds only the **anon key**, which is safe: it is designed to be public
and already ships inside the mobile app binary. It grants nothing here, because
the metrics views are revoked from `authenticated`.

If a change ever seems to need the service key in this file, the change is
wrong. The correct place for it is the edge function (see below).

Concretely, do not "simplify" the fetch in this page into a direct
`supabase.from('mp_metrics_overview')` call. That cannot work — the views are
revoked from every app role — and making it work would mean leaking the key.

---

## Where the backend lives

All three pieces are **here**. This repo deploys itself; the app repo is never
touched.

| thing | what it is |
|---|---|
| `sql/metrics_views.sql` | Creates `mp_metrics_overview`, `_activity`, `_cohorts`, `_engagement`, `_daily`, plus the `mp_real_profiles` base view. Service-role only. |
| `supabase/functions/metrics/index.ts` | Edge function. Holds the service key, checks the caller against an allowlist, returns aggregate JSON. |
| `docs/METRICS.md` | What every metric is honestly worth — read it before quoting a number. |

`sql/metrics_views.sql` is **run by hand, once**, in the Supabase SQL editor —
it is deliberately not a numbered migration. It is idempotent
(`create or replace view` throughout) and creates no tables and writes no rows,
so re-running it is free and dropping it is a no-op. That is what lets it live
outside the app's migration chain.

Two consequences of that choice, both accepted on purpose:

- A fresh or reset environment will not have these views — nothing recreates
  them automatically. Re-run the file.
- If the app ever renames a column these views read (`profiles.last_seen` is
  the fragile one), they break here and nobody in the app repo sees it. A
  number goes wrong quietly. Check this dashboard after app schema changes.

The function deploys from this repo with an explicit ref:

```bash
npx supabase functions deploy metrics --project-ref <prod-ref>
```

Standalone means standalone from the app **codebase**, not from its
**database**. These views read `profiles`, `swipes`, `matches`, `messages`,
`analytics_events` and `app_config` — that is where the numbers are.

**The app repo does not hold copies of any of this, and must not again.** It
briefly did, before this repo became standalone. Those copies were deleted on
2026-08-29 once they had drifted: the app repo's `functions/metrics/index.ts`
still had `metrics.matchpod.in` in `DEFAULT_ORIGINS` and still queried
`analytics_events`. A `supabase functions deploy metrics` from there would have
overwritten production with that older version and broken the live dashboard —
silently, since a deploy reports success either way.

Production's function is deployed from **here**, with an explicit
`--project-ref`. If you ever find `metrics` under the app repo's
`supabase/functions/` again, it is a stale copy: delete it, do not merge it.

## The data flow

```
this page  ──JWT──▶  functions/v1/metrics  ──service role──▶  mp_metrics_* views
 (anon key)          (allowlist check)                        (revoked from app roles)
```

## Configuration

`.env`: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Point them at
**production** for real numbers; the staging project holds demo seeds and a
couple of testers.

`VITE_*` values are inlined into the bundle at build time, not read at runtime,
so a change means a rebuild. That inlining is also why the service role key
must never be a `VITE_` var — it would ship inside the JavaScript.

Two secrets are set on the edge function itself, never in this page's source:

- `METRICS_ADMIN_IDS` — comma-separated user uuids. **Unset means nobody gets
  in.** It fails closed on purpose.
- `METRICS_ALLOWED_ORIGINS` — must include this page's deployed origin.

## Login

One operator account. There is no sign-up screen and there should never be one —
a metrics page that can mint its own logins is a metrics page anyone can
register for. The account is created by hand in Supabase and its id is pinned in
`METRICS_ADMIN_IDS`. Any other account that authenticates receives a `404`, not
a `403`, so the endpoint does not confirm it exists to a signed-in stranger.

---

## Do not undo these

**Contrast.** Every colour used for text is measured against WCAG AA and the
ratio is recorded in the `:root` token block. `--fg-faint` is pinned at
`#8C8983` because the more obvious `#7C7A76` measured **4.37:1** and failed AA
on every metric label. Do not darken the greys to make it look moodier.

**Pink is for large numerals, rules and accents — never body copy.** It sits at
4.9:1, which is comfortable at 34px and tiring at 11px.

**Text ON pink must be ink, never white.** White on `#FF007A` measures
**3.8:1 and fails AA**; `--on-pink` (`#121212`) is **4.94:1** and passes. This
caught the pressed range/series buttons, the primary button and the skip link.
It is also the brand's own ink-on-pink pairing (`brand/logo4`, `logo8`).

**The faces are Anton (display) and Smooch Sans (everything else).** Two
consequences that are easy to trip over:

- **Anton has one weight.** Setting `font-weight: 700` on display text gets a
  synthesised bold, which looks smeared. Leave it at 400.
- **Neither face has tabular figures.** `font-variant-numeric: tabular-nums` is
  declared and is currently *inert* — measured, five digits vary by 27.8px in
  Anton and 10.8px in Smooch Sans. Number columns are right-aligned so the right
  edge stays flush, which is what matters when scanning one. If ragged digits
  ever become a real problem the answer is a face with `tnum`, not more CSS.
- Smooch Sans is **condensed and light at 400**. UI labels sit at **600** to
  survive at small sizes; do not drop them back to 400 to "clean it up".

**Type is set from `--fs-label` / `--fs-body` / `--fs-lead`, not literals.**
The page was originally 10/11px, which passed contrast but was genuinely hard
to read for a tool opened daily. Nothing renders below 11px, including the SVG
chart axis labels — those are `fontSize` attributes in `Chart.tsx` that a CSS
pass will silently miss. Do not take these back down.

**Nothing depends on colour alone.** The activity composition bar and the cohort
heat tint both carry their values as text in the same element.

**The chart exposes a real table.** A `<polyline>` tells a screen reader
nothing, so the numbers behind it live in the `<details>` underneath, and the
chart carries a prose summary. Keep both if you change the chart.

**Motion stays minimal** and gated behind `prefers-reduced-motion`. This is a
tool checked daily, not a landing page — scroll reveals and count-up animations
actively hurt it.

## Branding

The mark, palette and placement rules live in `brand/README.md`. Read it before
touching the logo or the favicon.

The short version: pink `#ff007a`, ink `#252525`, paper `#fff`. The house mark
is **inlined** in `src/components/Logo.tsx` with `currentColor` and cropped to
its true bounds — not loaded as a file, and not padded back out to the source
1000×1000 square. The favicon is `public/favicon.svg`, white on pink,
full-bleed because a circle throws away its corners at 16px.

Do not use the full lockup (`brand/logo1.svg`) in the app: the header already
sets the name in Anton, and the lockup carries its own wordmark, so the
two together show "MatchPod" twice in two typefaces.

Note that brand ink `#252525` and this page's `--panel` `#121212` differ on
purpose — see `brand/README.md` for why lightening the panel would break the
measured contrast ratios.

## Pages

Seven sections, one concern each, listed in `src/lib/router.ts`. Adding a page
means adding an entry there and a component in `src/pages.tsx` — the nav and
the view map are both driven off that array, so they cannot drift apart.

**Routing is hash-based on purpose.** Path routing (`/activity`) on static
hosting needs a server rewrite, or a refresh and a pasted link 404. That would
mean an `.htaccess` uploaded separately from `dist/` and easy to forget. A hash
never reaches the server. Do not "upgrade" this to react-router without also
shipping the rewrite rule.

**The shell fetches once.** `Dashboard.tsx` loads the payload and hands it to
whichever page is open; pages never fetch for themselves. Seven self-loading
pages would be seven times the load on the function for identical data, and
would flash a spinner on every section change.

Two things a multi-page shell must keep:

- **Focus moves to `<main>` on navigation.** Otherwise a keyboard or
  screen-reader user stays parked on the nav link and is never told the content
  changed. `<main>` is `tabIndex={-1}` so this is possible without making it a
  tab stop.
- **The active nav item is a bar plus a weight change plus `aria-current`**, not
  colour alone.

Every page carries one honest sentence about what its numbers are worth. That
is the point of splitting them up — `docs/METRICS.md` has the full version.

## Charts

Chart colour lives in `src/lib/viz.ts` and nowhere else. Every ramp there was
run through the dataviz skill's validator against this page's real surface
(`#121212`) — not eyeballed. Re-run it if you touch a value:

```bash
node scripts/validate_palette.js "#FF6FAF,#FF007A,#B8005A" --ordinal --mode dark --surface "#121212"
```

**One hue, not a categorical palette.** Almost nothing here is an *identity*.
Funnel stages and activity bands are **ordered** (sequence, recency) and cohort
retention is a **magnitude** — both take an ordinal/sequential ramp, one hue
light→dark. Eight hues would double-encode bar length as colour and spend the
only free channel on information the chart already shows. If a genuinely
categorical chart ever appears, do not extend the pink ramp: take the skill's
categorical slots in fixed order and validate them against `#121212`.

**Rules carried from the skill, and worth keeping:**

- Touching marks are separated by a **2px gap in the surface colour**, never by
  a stroke around them — a stroke adds a third colour and thickens the mark.
- A **sequential scale ships its legend**, or darker means nothing.
- Heat is a **discrete step shown as a chip beside the value**, not a wash
  behind it: a tint dark enough to read as "high" drags the text contrast down
  with it.
- The donut is legitimate only because it is part-to-whole, at a glance, with
  three segments. It is the wrong form for comparing close values or past ~6
  segments — use bars. Never a 2-slice pie; that is a stat tile.
- **Never a dual-axis chart.** Two measures of different scale become two
  charts, not two y-scales.

**Where this repo deliberately departs from the skill:** its mark spec calls for
4px rounded data-ends. This design system is 90° corners throughout, and
rounding is not among the skill's non-negotiables, so squared ends win.

## Design

Tactical Telemetry: 90° corners throughout (no `border-radius`), hairline rules
drawn as a 1px ring per cell, Anton for numerals, Smooch Sans for every
label, MatchPod's ink/paper/pink.

Note the hairline technique: rules come from `box-shadow: 0 0 0 1px` on each
cell, **not** from the grid container's background showing through the gap. With
`auto-fit`, the last row is partly empty whenever the cell count is not a
multiple of the column count, and a container painted in the line colour turns
that remainder into a large grey slab.

## Verifying a change

There is no test suite and it does not need one — but `npm run build` passing
is not evidence the page works, and neither is a clean typecheck. Do not claim
a change works without loading it.

Without the live backend, use the built-in mock:

```bash
echo VITE_MOCK=1 > .env.local && npm run dev
```

Then check: the chart at 7/30/90 days, both exports, and the page at 375px
wide. The mock is gated behind `import.meta.env.DEV`; confirm it never reaches
a build with `grep -c mockPayload dist/assets/*.js`, which must print 0.

The exports are the easiest thing to break silently:

- **CSV** must start with a UTF-8 BOM (`EF BB BF`) or Excel mangles it, and must
  escape per RFC 4180.
- **PNG** — page CSS does *not* follow an SVG into serialisation. The export
  inlines a `<style>` block and paints a background rect. Remove either and you
  get a blank or transparent image that still "downloads fine".
