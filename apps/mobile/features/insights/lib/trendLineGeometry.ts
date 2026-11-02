/**
 * Pure geometry for the Insights trend line chart (`TrendLineChart`): the value
 * scale, where each point sits, which axis labels fit, and which bucket a finger
 * is over. Kept free of React and Skia so it can be unit tested.
 */

export type TrendLineBucket = {
  key: string;
  /** Text under the point on the x axis. */
  label: string;
};

export type TrendLineSeriesValues = readonly (number | null)[];

export type TrendLineScale = {
  min: number;
  max: number;
  ticks: number[];
};

export type TrendLinePlotPoint = {
  index: number;
  x: number;
  y: number;
  value: number;
};

/**
 * Round tick values covering `low`..`high`: steps of 1, 2, 2.5 or 5 times a
 * power of ten, about `targetCount` of them, the way a hand-drawn axis is
 * labelled.
 */
export function niceTicks(low: number, high: number, targetCount = 4): number[] {
  if (!Number.isFinite(low) || !Number.isFinite(high)) return [];
  if (high < low) return niceTicks(high, low, targetCount);
  const segments = Math.max(1, targetCount - 1);
  const rough = (high - low) / segments;
  if (rough <= 0) return [low];
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].find((nice) => nice * power >= rough) ?? 10) * power;
  const ticks: number[] = [];
  const first = Math.floor(low / step) * step;
  for (let tick = first; tick <= high + step * 1e-9; tick += step) {
    ticks.push(Math.round(tick * 1e6) / 1e6);
  }
  if ((ticks[ticks.length - 1] ?? low) < high) {
    ticks.push(Math.round(((ticks[ticks.length - 1] ?? first) + step) * 1e6) / 1e6);
  }
  return ticks;
}

/**
 * The value range the chart draws over. Amounts that are never negative start
 * at zero (`zeroBased`), so a line's height reads as an amount; a balance that
 * can dip below zero or barely moves keeps its own range, with headroom, so its
 * direction is visible. The range is snapped to round ticks.
 */
export function buildTrendLineScale(
  series: readonly TrendLineSeriesValues[],
  { zeroBased }: { zeroBased: boolean },
): TrendLineScale {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  series.forEach((values) =>
    values.forEach((value) => {
      if (value === null || !Number.isFinite(value)) return;
      if (value < low) low = value;
      if (value > high) high = value;
    }),
  );
  if (low === Number.POSITIVE_INFINITY) {
    return { min: 0, max: 1, ticks: [0, 1] };
  }
  if (zeroBased) {
    low = Math.min(0, low);
    high = Math.max(0, high);
  }
  if (high === low) {
    // A flat line sits in the middle rather than hard against an edge.
    const pad = Math.max(1, Math.abs(high) * 0.1);
    low = zeroBased && low >= 0 ? 0 : low - pad;
    high += pad;
  } else if (!zeroBased) {
    const pad = (high - low) * 0.12;
    low -= pad;
    high += pad;
  }
  const ticks = niceTicks(low, high);
  return {
    min: Math.min(low, ticks[0] ?? low),
    max: Math.max(high, ticks[ticks.length - 1] ?? high),
    ticks,
  };
}

/** The x centre of bucket `index` of `count` across `plotWidth`. */
export function bucketCenterX(index: number, count: number, plotWidth: number): number {
  if (count <= 0) return 0;
  return (plotWidth * (index + 0.5)) / count;
}

export function valueToY(
  value: number,
  scale: Pick<TrendLineScale, 'min' | 'max'>,
  top: number,
  plotHeight: number,
): number {
  const span = scale.max - scale.min || 1;
  return top + (1 - (value - scale.min) / span) * plotHeight;
}

/** Every bucket that has a value, placed in the plot. Null buckets are skipped. */
export function buildPlotPoints(
  values: TrendLineSeriesValues,
  scale: Pick<TrendLineScale, 'min' | 'max'>,
  plotWidth: number,
  top: number,
  plotHeight: number,
): TrendLinePlotPoint[] {
  const points: TrendLinePlotPoint[] = [];
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) return;
    points.push({
      index,
      x: bucketCenterX(index, values.length, plotWidth),
      y: valueToY(value, scale, top, plotHeight),
      value,
    });
  });
  return points;
}

/**
 * An SVG path through the points. A null bucket breaks the line, so a month
 * with no data is a gap rather than a straight line claiming to know it.
 */
export function buildLinePath(points: readonly TrendLinePlotPoint[]): string {
  let path = '';
  let previousIndex = -2;
  points.forEach((point) => {
    const command = point.index === previousIndex + 1 ? 'L' : 'M';
    path += `${path ? ' ' : ''}${command} ${round(point.x)} ${round(point.y)}`;
    previousIndex = point.index;
  });
  return path;
}

/** The area under each unbroken run of the line, down to `baseY`. */
export function buildAreaPath(points: readonly TrendLinePlotPoint[], baseY: number): string {
  const runs: TrendLinePlotPoint[][] = [];
  points.forEach((point) => {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && point.index === last.index + 1) run.push(point);
    else runs.push([point]);
  });
  return runs
    .filter((run) => run.length > 1)
    .map((run) => {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      const line = run
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(point.x)} ${round(point.y)}`)
        .join(' ');
      return `${line} L ${round(last.x)} ${round(baseY)} L ${round(first.x)} ${round(baseY)} Z`;
    })
    .join(' ');
}

/**
 * How many buckets apart the x-axis labels sit so they never overlap: every
 * label when they fit, otherwise every second, third... Counted back from the
 * newest bucket, so the right-most (latest) label is always shown.
 */
export function axisLabelStep(
  labels: readonly string[],
  plotWidth: number,
  charWidth = 6,
  gap = 6,
): number {
  if (labels.length === 0 || plotWidth <= 0) return 1;
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 1);
  const needed = longest * charWidth + gap;
  const slot = plotWidth / labels.length;
  return Math.max(1, Math.ceil(needed / slot));
}

export function isAxisLabelShown(index: number, count: number, step: number): boolean {
  return (count - 1 - index) % step === 0;
}

/** The bucket under a finger at `x`, clamped to the chart. */
export function bucketIndexAtX(x: number, count: number, plotWidth: number): number {
  if (count <= 0 || plotWidth <= 0) return -1;
  const index = Math.floor((x / plotWidth) * count);
  return Math.max(0, Math.min(count - 1, index));
}

/**
 * The bucket nearest `index` that has a value in any series, so scrubbing over
 * a future month (null) lands on the last real one.
 */
export function nearestValuedIndex(
  index: number,
  series: readonly TrendLineSeriesValues[],
): number {
  const hasValue = (candidate: number) =>
    series.some((values) => {
      const value = values[candidate];
      return value !== null && value !== undefined && Number.isFinite(value);
    });
  const count = series.reduce((max, values) => Math.max(max, values.length), 0);
  if (count === 0) return -1;
  for (let offset = 0; offset < count; offset += 1) {
    if (index - offset >= 0 && hasValue(index - offset)) return index - offset;
    if (index + offset < count && hasValue(index + offset)) return index + offset;
  }
  return -1;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
