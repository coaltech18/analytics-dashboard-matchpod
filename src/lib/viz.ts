/**
 * Chart colour, decided once.
 *
 * Every ramp here was validated with the dataviz skill's checker against this
 * dashboard's actual surface (`--panel`, #121212), not eyeballed:
 *
 *   node scripts/validate_palette.js "#FF6FAF,#FF007A,#B8005A" \
 *     --ordinal --mode dark --surface "#121212"
 *   → lightness monotone PASS · adjacent ΔL PASS · light-end contrast PASS
 *     (#B8005A at 2.84:1) · single hue PASS (spread 8°)
 *
 * Why one hue rather than a categorical palette: almost nothing on this page is
 * an *identity*. Funnel stages and activity bands are ORDERED (recency, sequence)
 * and cohort retention is a MAGNITUDE. Ordered and magnitude data take an
 * ordinal/sequential ramp — one hue, light→dark. Reaching for eight hues here
 * would double-encode length as colour and burn the only free channel on
 * information the chart already shows.
 *
 * If a genuinely categorical chart is ever added (distinct entities, no order),
 * do NOT extend this ramp. Take the dataviz skill's categorical slots in fixed
 * order and re-run the validator against #121212.
 */

/** Ordered bands, light → dark. Lightest = most recent / earliest stage. */
export const RAMP_3 = ['#FF6FAF', '#FF007A', '#B8005A'] as const;

/** Sequential scale for magnitude (cohort retention heat). */
export const RAMP_5 = ['#FFD6E8', '#FFB3D4', '#FF6FAF', '#FF007A', '#B8005A'] as const;

/** The surface colour marks are separated by — see `gap` below. */
export const SURFACE = '#121212';

/**
 * The 2px surface gap. Touching marks are separated by a gap in the surface
 * colour, never by a border drawn around them: a stroke adds a third colour and
 * thickens the mark, a gap just removes surface.
 */
export const GAP = 2;

/**
 * Map a 0..1 magnitude onto the sequential ramp.
 * Returns a discrete step, not an interpolation — discrete steps stay
 * distinguishable, and a continuous gradient invites reading precision that
 * isn't there.
 */
export function heatStep(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const i = Math.min(RAMP_5.length - 1, Math.floor(clamped * RAMP_5.length));
  return RAMP_5[i]!;
}

/** Legend entries for the sequential scale, so the heat is never colour-alone. */
export const HEAT_LEGEND = RAMP_5.map((hex, i) => ({
  hex,
  from: Math.round((i / RAMP_5.length) * 100),
  to: Math.round(((i + 1) / RAMP_5.length) * 100),
}));

/**
 * Arc path for a donut segment.
 * SVG has no arc primitive that takes angles, so this is the standard
 * polar→cartesian + A-command construction.
 */
export function arc(
  cx: number, cy: number, rOuter: number, rInner: number,
  startDeg: number, endDeg: number,
): string {
  const pol = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const [x1, y1] = pol(rOuter, startDeg);
  const [x2, y2] = pol(rOuter, endDeg);
  const [x3, y3] = pol(rInner, endDeg);
  const [x4, y4] = pol(rInner, startDeg);
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}
