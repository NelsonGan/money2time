/**
 * Summary figures shown beside the Insights trend charts: the average, the
 * highest and lowest bucket, how the selected bucket compares, and how two
 * categories compare. Pure so the rules can be tested.
 */

export type TrendStatBucket = {
  key: string;
  /** Null for a bucket that has not happened yet. */
  value: number | null;
};

export type TrendExtreme = { key: string; value: number };

export type TrendSummary = {
  /** Sum of every bucket with a value. */
  total: number;
  /** Mean over the counted buckets, or null when none count. */
  average: number | null;
  highest: TrendExtreme | null;
  lowest: TrendExtreme | null;
  /** How many buckets the average and extremes were taken over. */
  counted: number;
};

/**
 * `activeOnly` counts only buckets above zero. Spending and income use it: a
 * month before the user started tracking is not a cheap month, and "lowest:
 * January, RM0" says nothing. Balances count every bucket they have.
 */
export function summarizeTrend(
  buckets: readonly TrendStatBucket[],
  { activeOnly }: { activeOnly: boolean },
): TrendSummary {
  let total = 0;
  let sum = 0;
  let counted = 0;
  let highest: TrendExtreme | null = null;
  let lowest: TrendExtreme | null = null;
  buckets.forEach((bucket) => {
    const value = bucket.value;
    if (value === null || !Number.isFinite(value)) return;
    total += value;
    if (activeOnly && value <= 0) return;
    sum += value;
    counted += 1;
    if (!highest || value > highest.value) highest = { key: bucket.key, value };
    if (!lowest || value < lowest.value) lowest = { key: bucket.key, value };
  });
  return {
    total,
    average: counted > 0 ? sum / counted : null,
    highest,
    lowest,
    counted,
  };
}

/**
 * Percent change from `reference` to `value`, or null when there is nothing
 * meaningful to compare against (no reference, or a reference at or below
 * zero, where a percentage stops reading as a size).
 */
export function percentChange(value: number, reference: number | null | undefined): number | null {
  if (reference === null || reference === undefined) return null;
  if (!Number.isFinite(value) || !Number.isFinite(reference) || reference <= 0) return null;
  return ((value - reference) / reference) * 100;
}

export type CategoryComparison =
  | { kind: 'more'; percent: number }
  | { kind: 'less'; percent: number }
  | { kind: 'same' }
  | { kind: 'only_first' }
  | { kind: 'only_second' }
  | { kind: 'none' };

/** How the first category's total compares with the second's. */
export function compareCategoryTotals(first: number, second: number): CategoryComparison {
  const a = Number.isFinite(first) ? Math.max(0, first) : 0;
  const b = Number.isFinite(second) ? Math.max(0, second) : 0;
  if (a === 0 && b === 0) return { kind: 'none' };
  if (b === 0) return { kind: 'only_first' };
  if (a === 0) return { kind: 'only_second' };
  const percent = Math.round(((a - b) / b) * 100);
  if (percent === 0) return { kind: 'same' };
  if (percent > 0) return { kind: 'more', percent };
  return { kind: 'less', percent: Math.round(((b - a) / a) * 100) };
}
