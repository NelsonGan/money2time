/**
 * Summary figures shown with the Insights trend charts: the total and average,
 * how the selected bucket compares, and how two categories compare. Pure so
 * the rules can be tested.
 */

export type TrendSummary = {
  /** Sum of every bucket with a value. */
  total: number;
  /** Mean over the counted buckets, or null when none count. */
  average: number | null;
  /** How many buckets the average was taken over. */
  counted: number;
};

/**
 * `activeOnly` averages only buckets above zero. Spending and income use it: a
 * month before the user started tracking is not a cheap month. Balances count
 * every bucket they have.
 */
export function summarizeTrend(
  /** One value per bucket; null for a bucket that has not happened yet. */
  values: readonly (number | null)[],
  { activeOnly }: { activeOnly: boolean },
): TrendSummary {
  let total = 0;
  let sum = 0;
  let counted = 0;
  values.forEach((value) => {
    if (value === null || !Number.isFinite(value)) return;
    total += value;
    if (activeOnly && value <= 0) return;
    sum += value;
    counted += 1;
  });
  return {
    total,
    average: counted > 0 ? sum / counted : null,
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
