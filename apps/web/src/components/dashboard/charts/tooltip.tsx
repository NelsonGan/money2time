"use client";

import type { ReactNode } from "react";

type TooltipRow = {
  color?: string;
  label: ReactNode;
  value: ReactNode;
  dashed?: boolean;
};

/**
 * The hover card every chart shares. It is positioned in the chart's own
 * coordinate box and flips to the left of the pointer past the midline, so it
 * never runs off the card.
 */
export function ChartTooltip({
  x,
  y,
  width,
  title,
  rows,
}: {
  x: number;
  y: number;
  width: number;
  title: ReactNode;
  rows: TooltipRow[];
}) {
  const flip = x > width / 2;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-20 min-w-[160px] max-w-[260px] rounded-2xl border border-border bg-card/95 px-3.5 py-2.5 text-[12.5px] shadow-[var(--shadow-soft-lg)] backdrop-blur"
      style={{
        left: flip ? undefined : x + 14,
        right: flip ? width - x + 14 : undefined,
        top: Math.max(0, y - 12),
      }}
    >
      <p className="mb-1.5 font-bold text-foreground">{title}</p>
      <ul className="space-y-1">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2">
            {row.color ? (
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={
                  row.dashed
                    ? { border: `2px dashed ${row.color}` }
                    : { background: row.color }
                }
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate text-foreground-soft">
              {row.label}
            </span>
            <span className="tabular font-bold text-foreground">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Legend({
  items,
  className = "",
}: {
  items: { label: ReactNode; color: string; dashed?: boolean; line?: boolean }[];
  className?: string;
}) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] font-semibold text-foreground-soft ${className}`}>
      {items.map((item, index) => (
        <li key={index} className="flex items-center gap-1.5">
          {item.line || item.dashed ? (
            <span
              aria-hidden="true"
              className="inline-block w-4"
              style={{ borderTop: `2px ${item.dashed ? "dashed" : "solid"} ${item.color}` }}
            />
          ) : (
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: item.color }}
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}
