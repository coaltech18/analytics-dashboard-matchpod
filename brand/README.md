# MatchPod brand assets

Source SVGs. Treat these as the reference — do not recolour or redraw the mark.

## Palette

| token | hex | use |
|---|---|---|
| pink | `#ff007a` | the mark, large numerals, rules, accents |
| ink | `#252525` | the mark on light grounds, the "Match" half of the wordmark |
| paper | `#fff` | the mark on pink grounds |

## The nine files

| file | ground | mark | when |
|---|---|---|---|
| `logo1.svg` | white | pink house + `MatchPod` wordmark | the full lockup — documents, decks, anywhere the name is not already set in type |
| `logo2.svg` | white | pink | mark alone on light |
| `logo3.svg` | ink | pink | **mark alone on dark — what this dashboard uses** |
| `logo4.svg` | pink | ink | mark on a pink field |
| `logo5.svg` | pink | white | **the favicon** |
| `logo6.svg` | white circle | pink | avatars, app icons on light |
| `logo7.svg` | ink circle | pink | avatars on dark |
| `logo8.svg` | pink circle | ink | avatars on pink |
| `logo9.svg` | pink circle | white | avatars on pink, higher contrast |

## How the dashboard uses them

Neither file is loaded at runtime. Both placements are **inlined**, so they
inherit colour and cannot 404 or flash:

- `src/components/Logo.tsx` — the house mark, cropped to its true bounds and
  filled with `currentColor`. One component covers every placement.
- `public/favicon.svg` — `logo5` (white on pink), full-bleed.

Placements:

| where | which | size |
|---|---|---|
| Dashboard header, left of the wordmark | pink on `--panel` | 30px |
| Login card, above the wordmark | pink on `--panel` | 44px |
| Browser tab | white on pink | favicon |

The full lockup (`logo1`) is deliberately **not** used in the app: the
dashboard already sets `MATCHPOD METRICS` in Anton, and pairing that
with the lockup's own wordmark would show the name twice in two typefaces.

## Two things to know before changing this

**The source files pad the mark inside a 1000×1000 square.** `Logo.tsx` crops
to `viewBox="285.94 286.17 428.12 427.66"`, the artwork's real bounds. Re-adding
that padding makes the logo look misaligned rather than generous, because the
flex row centres the box, not the mark.

**The brand ink is `#252525`, but this dashboard's `--panel` is `#121212`.**
That is not an error to "fix". Every text colour here is contrast-measured
against `#121212`, and lightening the panel to the brand ink would invalidate
those ratios — `--fg-faint` in particular has almost no headroom. The mark is
pink on dark in both cases, so nothing about the logo depends on the
difference. See the token block in `src/styles.css`.
