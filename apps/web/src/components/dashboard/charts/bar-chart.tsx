"use client";

import { useState } from "react";

import { ChartTooltip } from "./tooltip";
import { AXIS, barPath, GRID, INK_MUTED, niceTicks, useElementWidth } from "./scale";

type BarSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

type Props = {
  labels: string[];
  /** Full label for the tooltip title; falls back to `labels`. */
  titles?: string[];
  series: BarSeries[];
  stacked?: boolean;
  /** A line drawn on the same axis, such as net cash flow. */
  line?: { label: string; color: string; values: number[] };
  height?: number;
  format: (value: number) => string;
  formatAxis: (value: number) => string;
  /** Highlights one band, e.g. the current month. */
  activeIndex?: number;
  onSelect?: (index: number) => void;
};

const PAD = { top: 12, right: 8, bottom: 26, left: 52 };

export function BarChart({
  labels,
  titles,
  series,
  stacked = false,
  line,
  height = 260,
  format,
  formatAxis,
  activeIndex,
  onSelect,
}: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const count = labels.length;
  const values: number[] = [0];
  for (let i = 0; i < count; i++) {
    if (stacked) {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = s.values[i] ?? 0;
        if (v >= 0) pos += v;
        else neg += v;
      }
      values.push(pos, neg);
    } else {
      for (const s of series) values.push(s.values[i] ?? 0);
    }
    if (line) values.push(line.values[i] ?? 0);
  }
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const min = ticks[0];
  const max = ticks[ticks.length - 1];

  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = innerW / Math.max(1, count);
  const y = (v: number) => PAD.top + ((max - v) / (max - min || 1)) * innerH;
  const zero = y(0);

  const groups = stacked ? 1 : series.length;
  const barW = Math.max(2, Math.min(24, (band * 0.72 - (groups - 1) * 2) / groups));
  const groupW = barW * groups + (groups - 1) * 2;
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(innerW / 44))));

  const linePoints = line
    ? line.values.map((v, i) => [PAD.left + band * i + band / 2, y(v)] as const)
    : [];

  const hoverX = hover === null ? 0 : PAD.left + band * hover + band / 2;
  const tooltipRows =
    hover === null
      ? []
      : [
          ...series.map((s) => ({
            color: s.color,
            label: s.label,
            value: format(s.values[hover] ?? 0),
          })),
          ...(line
            ? [{ color: line.color, label: line.label, value: format(line.values[hover] ?? 0) }]
            : []),
        ];

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={series.map((s) => s.label).join(", ")}
        className="block overflow-visible"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? AXIS : GRID}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="tabular"
              fontSize={11}
              fill={INK_MUTED}
            >
              {formatAxis(tick)}
            </text>
          </g>
        ))}

        {labels.map((label, i) => {
          const x0 = PAD.left + band * i + (band - groupW) / 2;
          const dim = (hover !== null && hover !== i) || (activeIndex !== undefined && hover === null && activeIndex !== i);
          let pos = 0;
          let neg = 0;
          return (
            <g key={i} opacity={dim ? 0.55 : 1}>
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                if (v === 0) return null;
                const x = x0 + (stacked ? 0 : si * (barW + 2));
                if (!stacked) {
                  const top = v >= 0 ? y(v) : zero;
                  return (
                    <path
                      key={s.key}
                      d={barPath(x, top, barW, Math.abs(y(v) - zero), v < 0)}
                      fill={s.color}
                    />
                  );
                }
                // Stacked: each segment sits on the previous one, with a 2px
                // surface gap left between them; only the outermost segment
                // gets the rounded data-end.
                const base = v >= 0 ? pos : neg;
                const end = base + v;
                if (v >= 0) pos = end;
                else neg = end;
                const top = y(Math.max(base, end));
                const h = Math.max(0, Math.abs(y(end) - y(base)) - (base === 0 ? 0 : 2));
                const outermost = series
                  .slice(si + 1)
                  .every((next) => Math.sign(next.values[i] ?? 0) !== Math.sign(v));
                const segTop = v >= 0 ? top : top + (base === 0 ? 0 : 2);
                return outermost ? (
                  <path key={s.key} d={barPath(x, segTop, barW, h, v < 0)} fill={s.color} />
                ) : (
                  <rect key={s.key} x={x} y={segTop} width={barW} height={h} fill={s.color} />
                );
              })}
              {i % labelEvery === 0 ? (
                <text
                  x={PAD.left + band * i + band / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill={INK_MUTED}
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}

        {line ? (
          <>
            <polyline
              points={linePoints.map((p) => p.join(",")).join(" ")}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {linePoints.map(([px, py], i) => (
              <circle
                key={i}
                cx={px}
                cy={py}
                r={hover === i ? 5 : 3.5}
                fill={line.color}
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </>
        ) : null}

        {labels.map((_, i) => (
          <rect
            key={i}
            x={PAD.left + band * i}
            y={PAD.top}
            width={band}
            height={innerH}
            fill="transparent"
            style={{ cursor: onSelect ? "pointer" : "default" }}
            onMouseEnter={() => setHover(i)}
            onClick={() => onSelect?.(i)}
          />
        ))}
      </svg>

      {hover !== null ? (
        <ChartTooltip
          x={hoverX}
          y={PAD.top}
          width={width}
          title={
            <>
              {titles?.[hover] ?? labels[hover]}
            </>
          }
          rows={tooltipRows}
        />
      ) : null}
    </div>
  );
}
