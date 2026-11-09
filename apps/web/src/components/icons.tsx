import type { SVGProps } from "react";

/**
 * The handful of line glyphs that stay as SVG: small UI marks where a 128px
 * clay PNG would turn to mush. Anything with a subject — categories, features,
 * mascots — uses the app's clay icons instead, see components/clay-icon.tsx.
 */
const paths = {
  arrowRight: (
    <>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.6 1.9" />
    </>
  ),
  currency: (
    <>
      <path d="M12 2.6v18.8" />
      <path d="M17 6.2H9.8a3.4 3.4 0 0 0 0 6.8h4.4a3.4 3.4 0 0 1 0 6.8H6.5" />
    </>
  ),
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
  ...props
}: { name: IconName; size?: number; strokeWidth?: number } & Omit<
  SVGProps<SVGSVGElement>,
  "name"
>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

export function StarIcon({
  filled = true,
  ...props
}: { filled?: boolean } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path
        d="M12 2.6l2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 16.4l-5.6 3.3 1.4-6.3L3 9.1l6.4-.6z"
        opacity={filled ? 1 : 0.25}
      />
    </svg>
  );
}

export function AppleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M17.05 12.54c.01-2.2 1.79-3.25 1.87-3.3-1.02-1.5-2.61-1.7-3.17-1.73-1.35-.11-2.63.79-3.31.79-.7 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.11 8.76.73 1.06 1.6 2.24 2.75 2.2 1.1-.05 1.52-.71 2.86-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.94-1.07 2.67-2.13.83-1.22 1.17-2.4 1.19-2.46-.03-.01-2.29-.88-2.31-3.49zM14.9 5.72c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.55 1.31-.56.64-1.05 1.68-.92 2.67.97.08 1.96-.49 2.57-1.22z" />
    </svg>
  );
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M3.6 2.4a1 1 0 0 0-.6.9v17.4a1 1 0 0 0 .6.9l9.1-9.6z" fill="#EA4335" />
      <path d="M16.3 8.1 12.7 12l3.6 3.9 4.3-2.9a1.3 1.3 0 0 0 0-2.1z" fill="#FBBC04" />
      <path d="M3.6 2.4 12.7 12l3.6-3.9L5.1 2.2a1.3 1.3 0 0 0-1.5.2z" fill="#34A853" />
      <path d="M3.6 21.6 12.7 12l3.6 3.9L5.1 21.8a1.3 1.3 0 0 1-1.5-.2z" fill="#4285F4" />
    </svg>
  );
}

/**
 * One half of an award laurel, as the App Store draws it: a stem that bows
 * outward with leaves fanning up and away from it on both sides. Mirror it
 * with `-scale-x-100` for the other half.
 *
 * Each leaf is `[x, y, length, width, angle]`, sampled at even arc-length
 * intervals along the stem so they never bunch where the curve runs slow.
 */
const LAUREL_LEAVES: [number, number, number, number, number][] = [
  // The outer row, sweeping away from the number.
  [18.85, 67.1, 10.6, 3.9, -170.5],
  [13.58, 58.43, 10.03, 3.67, -157.8],
  [10.38, 48.75, 9.47, 3.45, -147.1],
  [9.12, 38.65, 8.9, 3.22, -138.1],
  [9.56, 28.44, 8.33, 3.0, -130.5],
  [11.51, 18.41, 7.77, 2.77, -123.6],
  [14.79, 8.82, 7.2, 2.55, -117.3],
  // The inner row, shorter so it tucks behind the outer one.
  [15.78, 62.65, 8.4, 3.2, -74.8],
  [11.67, 53.51, 7.84, 2.98, -60.4],
  [9.52, 43.69, 7.28, 2.76, -47.8],
  [9.14, 33.59, 6.72, 2.54, -36.8],
  [10.33, 23.54, 6.16, 2.32, -26.7],
  [12.91, 13.8, 5.6, 2.1, -17.3],
];

/** An almond leaf lying along +x: round at the stem, pointed at the tip. */
function leafPath(length: number, width: number) {
  const a = length * 0.34;
  const b = length * 0.76;
  const c = width * 0.78;
  return `M0 0C${a} ${-width} ${b} ${-c} ${length} 0C${b} ${c} ${a} ${width} 0 0Z`;
}

export function LaurelBranch(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="1 1 26.4 74.4" fill="currentColor" aria-hidden="true" {...props}>
      <path
        d="M26 74C7 60 4 30 17 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      {LAUREL_LEAVES.map(([x, y, length, width, angle], index) => (
        <path
          key={index}
          d={leafPath(length, width)}
          transform={`translate(${x} ${y})rotate(${angle})`}
        />
      ))}
    </svg>
  );
}
