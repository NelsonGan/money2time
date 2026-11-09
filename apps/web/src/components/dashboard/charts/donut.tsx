"use client";

import { useState, type ReactNode } from "react";

type DonutSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

/**
 * A ring, not a pie: the hole carries the total, which is the number people
 * come for. Slices are separated by a 2px surface gap rather than a stroke.
 */
export function Donut({
  slices,
  size = 200,
  thickness = 30,
  center,
  activeKey,
  onHover,
  format,
  percent,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  activeKey?: string | null;
  onHover?: (key: string | null) => void;
  format?: (value: number) => string;
  /** A share as the page's locale writes it. */
  percent: (ratio: number) => string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const active = activeKey ?? hover;
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const r = size / 2 - 4;
  const inner = r - thickness;
  const c = size / 2;

  const point = (angle: number, radius: number) =>
    [c + radius * Math.sin(angle), c - radius * Math.cos(angle)] as const;

  const gap = slices.length > 1 ? 0.012 : 0;
  const arcs: { slice: DonutSlice; d: string }[] = [];
  let angle = 0;
  for (const s of slices) {
    if (s.value <= 0) continue;
    const sweep = total ? (s.value / total) * Math.PI * 2 : 0;
    const start = angle + gap / 2;
    const end = angle + sweep - gap / 2;
    angle += sweep;
    if (end <= start) continue;
    const grow = active === s.key ? 4 : 0;
    const outer = r + grow;
    const large = end - start > Math.PI ? 1 : 0;
    const [x1, y1] = point(start, outer);
    const [x2, y2] = point(end, outer);
    const [x3, y3] = point(end, inner);
    const [x4, y4] = point(start, inner);
    // A full ring cannot be one arc; split it in two.
    const d =
      sweep >= Math.PI * 2 - 0.0001
        ? `M${c},${c - outer}A${outer},${outer} 0 1 1 ${c - 0.01},${c - outer}ZM${c},${c - inner}A${inner},${inner} 0 1 0 ${c + 0.01},${c - inner}Z`
        : `M${x1},${y1}A${outer},${outer} 0 ${large} 1 ${x2},${y2}L${x3},${y3}A${inner},${inner} 0 ${large} 0 ${x4},${y4}Z`;
    arcs.push({ slice: s, d });
  }

  const hovered = slices.find((s) => s.key === active);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={slices.map((s) => s.label).join(", ")} className="overflow-visible">
        {total === 0 ? (
          <circle cx={c} cy={c} r={r - thickness / 2} fill="none" stroke="#EEEAE0" strokeWidth={thickness} />
        ) : null}
        {arcs.map(({ slice, d }) => (
          <path
            key={slice.key}
            d={d}
            fill={slice.color}
            fillRule="evenodd"
            opacity={active && active !== slice.key ? 0.45 : 1}
            onMouseEnter={() => {
              setHover(slice.key);
              onHover?.(slice.key);
            }}
            onMouseLeave={() => {
              setHover(null);
              onHover?.(null);
            }}
            style={{ transition: "opacity 120ms" }}
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        {hovered && format ? (
          <>
            <span className="max-w-full truncate text-[12px] font-semibold text-foreground-soft">{hovered.label}</span>
            <span className="tabular text-[17px] font-extrabold text-foreground">{format(hovered.value)}</span>
            <span className="text-[12px] font-semibold text-foreground-muted">
              {total ? percent(hovered.value / total) : ""}
            </span>
          </>
        ) : (
          center
        )}
      </div>
    </div>
  );
}
