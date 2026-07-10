// Pure math for the itemized ("split before amount") Split Bill mode.
// No React Native imports — covered by __tests__/features/splitMath.test.ts.

/**
 * Structural view of a split row: enough to rescale amounts without
 * depending on the editor's SplitDraft type. `paid` truthy = settled row,
 * frozen by every operation here.
 */
export interface SplitRowLike {
  amount: string;
  isSelf: boolean;
  paid?: unknown;
}

const toCents = (value: number): number => (Number.isFinite(value) ? Math.round(value * 100) : 0);

const parseAmountCents = (amount: string): number => toCents(Number(amount));

/** Cents-rounded sum of unpaid rows; blank/invalid amounts count as 0. */
export function sumUnpaidRows(rows: SplitRowLike[]): number {
  let cents = 0;
  for (const row of rows) {
    if (row.paid) continue;
    cents += parseAmountCents(row.amount);
  }
  return cents / 100;
}

const sumPaidRows = (rows: SplitRowLike[]): number => {
  let cents = 0;
  for (const row of rows) {
    if (row.paid) cents += parseAmountCents(row.amount);
  }
  return cents / 100;
};

/**
 * Rescale `amounts` proportionally so they sum to exactly `targetTotal`
 * (in cents). Largest-remainder rounding; ties are broken in favor of
 * `preferIndex`, then lower index. When every input is 0 the target is
 * split evenly, with leftover cents starting at `preferIndex`. A negative
 * target returns the input unchanged. Never produces negative values and
 * never mutates the input.
 */
export function scaleToTarget(amounts: number[], targetTotal: number, preferIndex = 0): number[] {
  const target = toCents(targetTotal);
  if (target < 0 || amounts.length === 0) return [...amounts];

  const cents = amounts.map(toCents);
  const inputSum = cents.reduce((acc, c) => acc + c, 0);

  // Tie-break order: preferIndex first, then ascending index.
  const priority = (index: number) => (index === preferIndex ? -1 : index);

  if (inputSum === 0) {
    const base = Math.floor(target / cents.length);
    let leftover = target - base * cents.length;
    const result = cents.map(() => base);
    const order = cents.map((_, i) => i).sort((a, b) => priority(a) - priority(b));
    for (const index of order) {
      if (leftover <= 0) break;
      result[index] += 1;
      leftover -= 1;
    }
    return result.map((c) => c / 100);
  }

  const exact = cents.map((c) => (c * target) / inputSum);
  const floors = exact.map(Math.floor);
  let leftover = target - floors.reduce((acc, c) => acc + c, 0);
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || priority(a.index) - priority(b.index));
  for (const { index } of order) {
    if (leftover <= 0) break;
    floors[index] += 1;
    leftover -= 1;
  }
  return floors.map((c) => c / 100);
}

/**
 * Rescale the unpaid rows of `rows` so they sum to exactly `unpaidTarget`,
 * preferring the unpaid Me row for remainder cents. Paid rows pass through
 * untouched. Amounts are written back as 2-decimal strings on fresh row
 * objects. Returns null when there is nothing to distribute over.
 */
const rescaleUnpaidRows = <T extends SplitRowLike>(rows: T[], unpaidTarget: number): T[] | null => {
  const unpaidIndices = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.paid)
    .map(({ index }) => index);
  if (unpaidIndices.length === 0) return null;

  const mePosition = unpaidIndices.findIndex((index) => rows[index]?.isSelf);
  const scaled = scaleToTarget(
    unpaidIndices.map((index) => Number(rows[index]!.amount) || 0),
    unpaidTarget,
    mePosition >= 0 ? mePosition : 0,
  );

  const next = [...rows];
  unpaidIndices.forEach((rowIndex, position) => {
    next[rowIndex] = { ...next[rowIndex]!, amount: (scaled[position] ?? 0).toFixed(2) };
  });
  return next;
};

/**
 * Itemized "Receipt total": rescale unpaid rows proportionally so that
 * unpaid + paid sums to the receipt's grand total. Works in both
 * directions (tax/service up, discount down). Returns null when the input
 * is unusable: non-finite/negative receipt, receipt below the frozen paid
 * sum, no unpaid rows, or an unpaid subtotal of 0 (no proportions).
 */
export function applyReceiptTotal<T extends SplitRowLike>(
  rows: T[],
  receiptTotal: number,
): T[] | null {
  if (!Number.isFinite(receiptTotal) || receiptTotal < 0) return null;
  if (sumUnpaidRows(rows) <= 0) return null;
  const unpaidTarget = Math.round((receiptTotal - sumPaidRows(rows)) * 100) / 100;
  if (unpaidTarget < 0) return null;
  return rescaleUnpaidRows(rows, unpaidTarget);
}

/**
 * Itemized "+X%": scale unpaid rows to `unpaidSubtotal * (1 + percent/100)`
 * (cents-rounded). Paid rows are frozen and excluded from the base.
 * Returns null for a non-finite percent, percent <= -100, or an unusable
 * base (no unpaid rows / unpaid subtotal of 0).
 */
export function applyPercent<T extends SplitRowLike>(rows: T[], percent: number): T[] | null {
  if (!Number.isFinite(percent) || percent <= -100) return null;
  const subtotal = sumUnpaidRows(rows);
  if (subtotal <= 0) return null;
  const unpaidTarget = Math.round(subtotal * (1 + percent / 100) * 100) / 100;
  return rescaleUnpaidRows(rows, unpaidTarget);
}
