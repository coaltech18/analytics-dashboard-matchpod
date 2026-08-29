/**
 * MatchPod house mark, inlined from brand/logo2.svg.
 *
 * Inline rather than an <img>: it inherits colour through `currentColor`, so
 * one component serves the pink-on-dark and white-on-pink placements without
 * shipping a second file, and it cannot flash or 404 the way a fetched asset
 * can.
 *
 * The viewBox is cropped to the artwork's true bounds (the source files pad the
 * mark inside a 1000×1000 square). Do not re-add that padding — at header size
 * it reads as a misaligned logo rather than as breathing room.
 *
 * Brand palette: #ff007a pink, #252525 ink, #fff. See brand/README.md.
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="285.94 286.17 428.12 427.66"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      role="img"
      aria-label="MatchPod"
      focusable="false"
    >
      {/* keyhole */}
      <path d="M435.11,554.24c11.02-5.14,12.56-20.08,2.59-27.33-5.38-3.91-12.82-3.97-18.27-.17-10.26,7.16-8.71,22.28,2.37,27.6l-11.86,36.16h36.49l-11.32-36.27Z" />
      {/* house */}
      <polygon points="499.22 286.17 285.94 498.84 285.94 666.78 357.29 595.42 357.29 529.09 499.22 387.72 642.71 529.09 642.71 642.53 411.05 642.53 339.74 713.83 714.06 713.83 714.06 498.84 499.22 286.17" />
      {/* chimney */}
      <polygon points="672.25 435.91 672.25 384.61 619.08 331.43 619.08 382.73 672.25 435.91" />
    </svg>
  );
}
