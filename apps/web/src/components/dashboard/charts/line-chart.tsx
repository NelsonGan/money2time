"use client";

import { useState } from "react";

import { ChartTooltip } from "./tooltip";
import { AXIS, GRID, INK_MUTED, niceTicks, useElementWidth } from "./scale";

type LineSeries = {
  key: string;
  label: string;
  color: string;
  /** `null` leaves a gap, e.g. days of this month that have not happened. */
  values: (number | null)[];
  dashed?: boolean;
  area?: boolean;
};

type Props = {
  labels: string[];
  titles?: string[];
  series: LineSeries[];
  height?: number;
  format: (value: number) => string;
  formatAxis: (value: number) => string;
  /** Start the y axis at zero even when every value is far above it. */
  zeroBased?: boolean;
  /** Show only every nth x label; computed from the width when omitted. */
};

const PAD = { top: 14, right: 12, bottom: 26, left: 56 };

export function LineChart({
  labels,
  titles,
  series,
  height = 240,
  format,
  formatAxis,
  zeroBased = true,
}: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const count = labels.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const lo = all.length ? Math.min(...all) : 0;
  const hi = all.length ? Math.max(...all) : 1;
  const ticks = niceTicks(zeroBased ? Math.min(0, lo) : lo, hi, 4);
  const min = ticks[0];
  const max = ticks[ticks.length - 1];

  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (count <= 1 ? innerW / 2 : (innerW * i) / (count - 1));
  const y = (v: number) => PAD.top + ((max - v) / (max - min || 1)) * innerH;
  const every = Math.max(1, Math.ceil(count / Math.max(1, Math.floor(innerW / 56))));

  const segments = (values: (number | null)[]) => {
    const runs: [number, number][][] = [];
    let run: [number, number][] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push([x(i), y(v)]);
    });
    if (run.length) runs.push(run);
    return runs;
  };

  const onMove = (event: React.MouseEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rel = event.clientX - rect.left;
    const index = count <= 1 ? 0 : Math.round((rel / rect.width) * (count - 1));
    setHover(Math.max(0, Math.min(count - 1, index)));
  };

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(", ")} className="block overflow-visible">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? AXIS : GRID} />
            <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill={INK_MUTED} className="tabular">
              {formatAxis(tick)}
            </text>
          </g>
        ))}
        {labels.map((label, i) =>
          i % every === 0 || i === count - 1 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === count - 1 ? "end" : "middle"} fontSize={11} fill={INK_MUTED}>
              {i === count - 1 && i % every !== 0 ? "" : label}
            </text>
          ) : null,
        )}

        {series.map((s) =>
          segments(s.values).map((run, ri) => (
            <g key={`${s.key}-${ri}`}>
              {s.area && run.length > 1 ? (
                <path
                  d={`M${run[0][0]},${y(Math.max(min, 0))}L${run.map((p) => p.join(",")).join("L")}L${run[run.length - 1][0]},${y(Math.max(min, 0))}Z`}
                  fill={s.color}
                  opacity={0.1}
                />
              ) : null}
              <polyline
                points={run.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 5" : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          )),
        )}

        {/* End dot on each solid series, so the latest value is easy to find. */}
        {series.map((s) => {
          if (s.dashed) return null;
          let last = -1;
          s.values.forEach((v, i) => {
            if (v !== null) last = i;
          });
          if (last < 0) return null;
          return <circle key={s.key} cx={x(last)} cy={y(s.values[last] as number)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />;
        })}

        {hover !== null ? (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke={AXIS} />
            {series.map((s) => {
              const v = s.values[hover];
              return v === null || v === undefined ? null : (
                <circle key={s.key} cx={x(hover)} cy={y(v)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />
              );
            })}
          </>
        ) : null}

        <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} />
      </svg>

      {hover !== null ? (
        <ChartTooltip
          x={x(hover)}
          y={PAD.top}
          width={width}
          title={titles?.[hover] ?? labels[hover]}
          rows={series
            .filter((s) => s.values[hover] !== null && s.values[hover] !== undefined)
            .map((s) => ({ color: s.color, dashed: s.dashed, label: s.label, value: format(s.values[hover] as number) }))}
        />
      ) : null}
    </div>
  );
}
