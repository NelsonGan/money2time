"use client";

import { useState } from "react";

import { ChartTooltip } from "./tooltip";
import { INK_MUTED, useElementWidth } from "./scale";

/** One hue, light to dark: rosewood, the app's spending colour. */
export const HEAT_RAMP = ["#F3EFE6", "#F4D6DA", "#E6A9B1", "#CF7B87", "#B1525F", "#7E3341"];

export function heatColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return HEAT_RAMP[0];
  // Square-root scale so a few huge days do not wash out the rest.
  const t = Math.sqrt(value / max);
  const index = Math.min(HEAT_RAMP.length - 1, 1 + Math.floor(t * (HEAT_RAMP.length - 1)));
  return HEAT_RAMP[index];
}

/**
 * A contribution-style grid: one column per week, one row per weekday, a cell
 * per day shaded by how much was spent.
 */
export function CalendarHeatmap({
  days,
  weekStartsOn,
  weekdayLabels,
  monthLabel,
  formatDay,
  format,
  selected,
  onSelect,
}: {
  /** Consecutive days, oldest first, as `YYYY-MM-DD` keys with a value. */
  days: { key: string; value: number }[];
  /** 0 = Sunday … 6 = Saturday. */
  weekStartsOn: number;
  /** Seven short labels starting from `weekStartsOn`. */
  weekdayLabels: string[];
  monthLabel: (key: string) => string;
  formatDay: (key: string) => string;
  format: (value: number) => string;
  selected?: string | null;
  onSelect?: (key: string) => void;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>(900);
  const [hover, setHover] = useState<{ key: string; value: number; x: number; y: number } | null>(null);
  if (days.length === 0) return null;

  const first = new Date(`${days[0].key}T00:00:00`);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  const weeks = Math.ceil((days.length + offset) / 7);
  const labelW = 30;
  const cell = Math.max(8, Math.min(18, Math.floor((width - labelW) / weeks) - 2));
  const step = cell + 2;
  const max = Math.max(...days.map((d) => d.value));
  const height = 18 + step * 7;

  // The first column of each month carries its label.
  const showMonth: boolean[] = [];
  let lastMonth = "";
  for (let index = 0; index < days.length; index++) {
    const row = (index + offset) % 7;
    const month = days[index].key.slice(0, 7);
    showMonth.push(month !== lastMonth && row <= 1);
    if (month !== lastMonth && row <= 1) lastMonth = month;
  }

  return (
    <div ref={ref} className="relative w-full overflow-x-auto" onMouseLeave={() => setHover(null)}>
      <svg width={labelW + weeks * step} height={height} role="img" aria-label={`${formatDay(days[0].key)} – ${formatDay(days[days.length - 1].key)}`}>
        {weekdayLabels.map((label, i) =>
          i % 2 === 0 ? (
            <text key={i} x={0} y={18 + i * step + cell / 2} dy="0.32em" fontSize={10} fill={INK_MUTED}>
              {label}
            </text>
          ) : null,
        )}
        {days.map((day, index) => {
          const slot = index + offset;
          const col = Math.floor(slot / 7);
          const row = slot % 7;
          const x = labelW + col * step;
          const y = 18 + row * step;
          return (
            <g key={day.key}>
              {showMonth[index] ? (
                <text x={x} y={10} fontSize={10} fill={INK_MUTED}>
                  {monthLabel(day.key)}
                </text>
              ) : null}
              <rect
                x={x}
                y={y}
                width={cell}
                height={cell}
                rx={3}
                fill={heatColor(day.value, max)}
                stroke={selected === day.key ? "#1A2E2A" : "none"}
                strokeWidth={selected === day.key ? 2 : 0}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                onMouseEnter={() => setHover({ ...day, x: x + cell, y })}
                onClick={() => onSelect?.(day.key)}
              />
            </g>
          );
        })}
      </svg>
      {hover ? (
        <ChartTooltip
          x={hover.x}
          y={hover.y}
          width={width}
          title={formatDay(hover.key)}
          rows={[{ color: heatColor(hover.value, max), label: "", value: format(hover.value) }]}
        />
      ) : null}
    </div>
  );
}

export function Sparkline({
  values,
  color,
  width = 96,
  height = 28,
}: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  return (
    <svg width={width} height={height} aria-hidden="true" className="block">
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill={color} />
    </svg>
  );
}
