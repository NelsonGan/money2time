// How Split Bill turns what the user enters into each person's amount: by
// amount (typed directly, the default), by percentage, by shares, or evenly
// with adjustments. Only amounts are ever saved; the other methods are ways
// of filling them in. Pure, covered by __tests__/features/splitMethods.test.ts.

import { scaleToTarget, type SplitRowLike } from './splitMath';

export type SplitMethod = 'amount' | 'percent' | 'shares' | 'adjust';

export const SPLIT_METHODS: readonly SplitMethod[] = ['amount', 'percent', 'shares', 'adjust'];

const toCents = (value: number): number => (Number.isFinite(value) ? Math.round(value * 100) : 0);

/** The number a method value reads as; blank or invalid is 0. */
export function methodNumber(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A number as a value field shows it: at most two decimals, no trailing zeros. */
export function trimNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

/** What a person newly on the bill starts with: no percentage, one share, no adjustment. */
export function defaultMethodValue(method: SplitMethod): string {
  return method === 'shares' ? '1' : '0';
}

/** Indices of the rows a method divides the bill over: the ones still owed. */
function unpaidIndices(rows: readonly SplitRowLike[]): number[] {
  return rows.flatMap((row, index) => (row.paid ? [] : [index]));
}

/** The position among `indices` that takes odd cents first: the user's row, else the first. */
function preferPosition(rows: readonly SplitRowLike[], indices: number[]): number {
  const position = indices.findIndex((index) => rows[index]?.isSelf);
  return position >= 0 ? position : 0;
}

/**
 * `cents` spread over `count` people as evenly as cents allow, the odd cents
 * starting at `prefer`. Works for a negative amount too (each portion then
 * goes down by the odd cent instead).
 */
function evenCents(cents: number, count: number, prefer: number): number[] {
  if (count <= 0) return [];
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  const base = Math.floor(abs / count);
  let leftover = abs - base * count;
  const result = Array.from({ length: count }, () => base);
  const order = result
    .map((_, i) => i)
    .sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : a - b));
  for (const index of order) {
    if (leftover <= 0) break;
    result[index]! += 1;
    leftover -= 1;
  }
  return result.map((value) => value * sign);
}

/** Each unpaid row's amount from the method's values, in cents, by unpaid position. */
function methodCents(
  method: Exclude<SplitMethod, 'amount'>,
  values: number[],
  total: number,
  prefer: number,
): number[] {
  const totalCents = toCents(total);
  if (method === 'percent') {
    const percentSum = values.reduce((sum, value) => sum + toCents(value), 0);
    if (percentSum === 10000) return scaleToTarget(values, total, prefer).map(toCents);
    return values.map((value) => Math.round((totalCents * value) / 100));
  }
  if (method === 'shares') {
    const shareSum = values.reduce((sum, value) => sum + toCents(Math.max(0, value)), 0);
    if (shareSum <= 0) return values.map(() => 0);
    return scaleToTarget(
      values.map((value) => Math.max(0, value)),
      total,
      prefer,
    ).map(toCents);
  }
  const adjustments = values.map(toCents);
  const rest = totalCents - adjustments.reduce((sum, value) => sum + value, 0);
  const even = evenCents(rest, values.length, prefer);
  return adjustments.map((value, index) => value + (even[index] ?? 0));
}

/**
 * The rows with each unpaid row's amount worked out from `values` (aligned
 * with `rows`) over `total`, what is still owed on the bill. Paid rows keep
 * their amount. Amount mode returns the rows as they are.
 */
export function applyMethodValues<T extends SplitRowLike>(
  method: SplitMethod,
  rows: T[],
  values: readonly string[],
  total: number,
): T[] {
  if (method === 'amount') return rows;
  const indices = unpaidIndices(rows);
  if (indices.length === 0) return rows;
  const cents = methodCents(
    method,
    indices.map((index) => methodNumber(values[index])),
    total,
    preferPosition(rows, indices),
  );
  const next = [...rows];
  indices.forEach((rowIndex, position) => {
    const amount = ((cents[position] ?? 0) / 100).toFixed(2);
    if (next[rowIndex]!.amount !== amount) next[rowIndex] = { ...next[rowIndex]!, amount };
  });
  return next;
}

/**
 * Values that keep the rows' amounts when the user switches to `method`, as
 * far as the method can: percentages of the bill (adding up to exactly 100),
 * one share each (shares cannot express any split, so they start even), or
 * each person's difference from an even split. Paid rows get ''.
 */
export function initialMethodValues(
  method: SplitMethod,
  rows: readonly SplitRowLike[],
  total: number,
): string[] {
  const indices = unpaidIndices(rows);
  const values = rows.map((row) => (row.paid ? '' : row.amount));
  if (method === 'amount' || indices.length === 0) return values;
  const prefer = preferPosition(rows, indices);
  const amounts = indices.map((index) => Math.max(0, methodNumber(rows[index]!.amount)));
  let derived: string[];
  if (method === 'percent') {
    const usable = total > 0 && amounts.some((amount) => amount > 0);
    derived = scaleToTarget(usable ? amounts : amounts.map(() => 0), 100, prefer).map(trimNumber);
  } else if (method === 'shares') {
    derived = indices.map(() => '1');
  } else {
    const even = evenCents(toCents(total), indices.length, prefer);
    derived = amounts.map((amount, position) =>
      trimNumber((toCents(amount) - even[position]!) / 100),
    );
  }
  indices.forEach((rowIndex, position) => {
    values[rowIndex] = derived[position] ?? defaultMethodValue(method);
  });
  return values;
}

/** Sum of the unpaid rows' values: the percentage given out, or the shares. */
export function methodValueSum(rows: readonly SplitRowLike[], values: readonly string[]): number {
  const cents = unpaidIndices(rows).reduce(
    (sum, index) => sum + toCents(methodNumber(values[index])),
    0,
  );
  return cents / 100;
}

/**
 * Percentages after the user typed one for a friend: the user's own row takes
 * whatever is left of 100 (never below 0), the way it takes what is left of
 * the bill when amounts are typed. Editing the user's own row changes nothing
 * else.
 */
export function balanceSelfPercent(
  rows: readonly SplitRowLike[],
  values: readonly string[],
  changedIndex: number,
): string[] {
  const selfIndex = rows.findIndex((row) => row.isSelf && !row.paid);
  if (selfIndex < 0 || selfIndex === changedIndex) return [...values];
  let others = 0;
  rows.forEach((row, index) => {
    if (row.paid || index === selfIndex) return;
    others += toCents(methodNumber(values[index]));
  });
  const next = [...values];
  next[selfIndex] = trimNumber(Math.max(0, 10000 - others) / 100);
  return next;
}

/** Why the split cannot be saved as entered, for the sum bar; null when it can. */
export type SplitMethodProblem =
  | { kind: 'percent'; given: number; diff: number }
  | { kind: 'no_shares' }
  | { kind: 'adjust_over' };

export function splitMethodProblem(
  method: SplitMethod,
  rows: readonly SplitRowLike[],
  values: readonly string[],
): SplitMethodProblem | null {
  if (method === 'amount') return null;
  const indices = unpaidIndices(rows);
  if (indices.length === 0) return null;
  if (method === 'percent') {
    const given = methodValueSum(rows, values);
    const diff = Math.round((100 - given) * 100) / 100;
    return Math.abs(diff) < 0.005 ? null : { kind: 'percent', given, diff };
  }
  if (method === 'shares') {
    return methodValueSum(rows, values) > 0 ? null : { kind: 'no_shares' };
  }
  return indices.some((index) => methodNumber(rows[index]!.amount) < -0.004)
    ? { kind: 'adjust_over' }
    : null;
}

/** Adjustments scaled with the bill when tax or service is applied on top. */
export function scaleAdjustments(values: readonly string[], percent: number): string[] {
  return values.map((value) =>
    value === '' ? value : trimNumber(methodNumber(value) * (1 + percent / 100)),
  );
}
