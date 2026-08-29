# MatchPod Analytics Dashboard

A single self-contained `index.html`. No build step, no framework, no
dependencies, no bundler. Open it, edit it, deploy it.

It is the **frontend only**. It reads numbers from the MatchPod Supabase project
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

## The data flow

```
this page  ──JWT──▶  functions/v1/metrics  ──service role──▶  mp_metrics_* views
 (anon key)          (allowlist check)                        (revoked from app roles)
```

## Configuration

`window.MP_CONFIG` at the top of `index.html`: the project URL and the anon key.
Point it at **production** for real numbers; the staging project holds demo
seeds and a couple of testers.

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

**Nothing depends on colour alone.** The activity composition bar and the cohort
heat tint both carry their values as text in the same element.

**The chart exposes a real table.** A `<polyline>` tells a screen reader
nothing, so the numbers behind it live in the `<details>` underneath, and the
chart carries a prose summary. Keep both if you change the chart.

**Motion stays minimal** and gated behind `prefers-reduced-motion`. This is a
tool checked daily, not a landing page — scroll reveals and count-up animations
actively hurt it.

## Design

Tactical Telemetry: 90° corners throughout (no `border-radius`), hairline rules
drawn as a 1px ring per cell, Archivo Black for numerals, Space Mono for every
label, MatchPod's ink/paper/pink.

Note the hairline technique: rules come from `box-shadow: 0 0 0 1px` on each
cell, **not** from the grid container's background showing through the gap. With
`auto-fit`, the last row is partly empty whenever the cell count is not a
multiple of the column count, and a container painted in the line colour turns
that remainder into a large grey slab.

## Verifying a change

There is no test suite and it does not need one — but do not claim a change
works without loading the page. If you cannot reach the live backend, stub the
fetch with mock data and check: the chart at 7/30/90 days, both exports, and the
page at 375px wide.

The exports are the easiest thing to break silently:

- **CSV** must start with a UTF-8 BOM (`EF BB BF`) or Excel mangles it, and must
  escape per RFC 4180.
- **PNG** — page CSS does *not* follow an SVG into serialisation. The export
  inlines a `<style>` block and paints a background rect. Remove either and you
  get a blank or transparent image that still "downloads fine".
