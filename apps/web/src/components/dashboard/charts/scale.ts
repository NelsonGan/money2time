"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { OTHER_COLOR, SERIES_COLORS } from "@/lib/backup/model";

export { OTHER_COLOR };

export const INCOME_COLOR = "#1E9468";
export const EXPENSE_COLOR = "#B1525F";
export const NET_COLOR = "#E39A1E";

export const GRID = "#EEEAE0";
export const AXIS = "#D8D2C3";
export const INK_MUTED = "#94A39F";

/** Categorical series colours, the same ones the model gives top-level categories. */
export function seriesColor(index: number): string {
  return index < SERIES_COLORS.length ? SERIES_COLORS[index] : OTHER_COLOR;
}

/** Round tick values that cover [min, max] in about `count` steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    if (max === 0) return [0, 1];
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  const span = max - min;
  const rough = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step =
    (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Math.abs(value) < step / 1e6 ? 0 : value);
  }
  return ticks;
}

/** Width of an element, tracked so SVG text stays at its real pixel size. */
export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setWidth(Math.max(120, Math.round(node.clientWidth)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

/** A path for a bar with 4px rounded data-end and a square baseline. */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  negative = false,
): string {
  const r = Math.min(4, width / 2, Math.abs(height));
  if (height <= 0) return "";
  if (!negative) {
    // Rounded top, square bottom.
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
  }
  // Rounded bottom, square top.
  return `M${x},${y}V${y + height - r}Q${x},${y + height} ${x + r},${y + height}H${x + width - r}Q${x + width},${y + height} ${x + width},${y + height - r}V${y}Z`;
}
