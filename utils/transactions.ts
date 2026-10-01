import type { MonthCycleInput, TransactionSplit, TransactionWithRelations } from '~/types';
import { financialMonthKeyForIso } from '~/utils/financialMonth';

export interface MonthSummary {
  count: number;
  income: number;
  expense: number;
}

export interface MonthTransactionBuckets {
  transactionsMap: Map<string, TransactionWithRelations[]>;
  summaries: Map<string, MonthSummary>;
}

function emptyMonthSummary(): MonthSummary {
  return { count: 0, income: 0, expense: 0 };
}

function accumulateSummary(
  summary: MonthSummary,
  transaction: TransactionWithRelations,
  resolveValue: (transaction: TransactionWithRelations) => number,
): void {
  summary.count += 1;
  if (transaction.type !== 'income' && transaction.type !== 'expense') return;
  const value = resolveValue(transaction);
  if (transaction.type === 'income') summary.income += value;
  if (transaction.type === 'expense') summary.expense += value;
}

export function bucketTransactionsByMonth(
  transactions: TransactionWithRelations[],
  resolveValue: (transaction: TransactionWithRelations) => number,
  monthCycle: MonthCycleInput = 1,
): MonthTransactionBuckets {
  const transactionsMap = new Map<string, TransactionWithRelations[]>();
  const summaries = new Map<string, MonthSummary>();

  transactions.forEach((transaction) => {
    const key = financialMonthKeyForIso(transaction.date, monthCycle);
    const list = transactionsMap.get(key);
    if (list) {
      list.push(transaction);
    } else {
      transactionsMap.set(key, [transaction]);
    }

    let summary = summaries.get(key);
    if (!summary) {
      summary = emptyMonthSummary();
      summaries.set(key, summary);
    }
    accumulateSummary(summary, transaction, resolveValue);
  });

  return { transactionsMap, summaries };
}

/**
 * Swaps each group in `next` for its counterpart in `previous` when the two
 * hold the same rows in the same order. Regrouping after one transaction
 * changed then hands every untouched group back by its old reference, so
 * memoized consumers (a month page, a month grid) skip re-rendering for the
 * months the change did not touch. Mutates and returns `next`.
 */
export function reuseUnchangedGroups<K, T>(
  previous: ReadonlyMap<K, readonly T[]> | null | undefined,
  next: Map<K, T[]>,
): Map<K, T[]> {
  if (!previous) return next;
  next.forEach((rows, key) => {
    const old = previous.get(key);
    if (!old || old === rows || old.length !== rows.length) return;
    for (let index = 0; index < rows.length; index += 1) {
      if (old[index] !== rows[index]) return;
    }
    next.set(key, old as T[]);
  });
  return next;
}

function sameShallow<T extends object>(a: T, b: T): boolean {
  const aKeys = Object.keys(a) as (keyof T)[];
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

function sameSplits(a: TransactionSplit[] | undefined, b: TransactionSplit[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((split, index) => sameShallow(split, b[index] as TransactionSplit));
}

/** Field-for-field equality; a re-read row carries new split arrays, so those compare by content. */
function sameTransactionFields(a: TransactionWithRelations, b: TransactionWithRelations): boolean {
  const aKeys = Object.keys(a) as (keyof TransactionWithRelations)[];
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => {
    if (key === 'splits') return sameSplits(a.splits, b.splits);
    if (key === 'splitsSummary') {
      return a.splitsSummary && b.splitsSummary
        ? sameShallow(a.splitsSummary, b.splitsSummary)
        : a.splitsSummary === b.splitsSummary;
    }
    return a[key] === b[key];
  });
}

/**
 * Keeps the previous object for every re-read row that did not change, and
 * the previous array when nothing changed at all. A reload hands back a fresh
 * object for all of them otherwise, and every memoized consumer (month pages,
 * rows, grids) re-renders for rows that are exactly as they were.
 */
export function reuseUnchangedTransactions(
  prev: TransactionWithRelations[],
  next: TransactionWithRelations[],
): TransactionWithRelations[] {
  if (prev.length === 0) return next;
  const prevById = new Map(prev.map((tx) => [tx.id, tx]));
  let changed = prev.length !== next.length;
  const merged = next.map((tx, index) => {
    const old = prevById.get(tx.id);
    if (old && sameTransactionFields(old, tx)) {
      if (prev[index] !== old) changed = true;
      return old;
    }
    changed = true;
    return tx;
  });
  return changed ? merged : prev;
}

/**
 * Puts the stored copy of a just-written row in place of its optimistic one,
 * or drops the row if the write did not land. When the two already match field
 * for field, which is the norm because the optimistic row is built from the
 * same input and timestamp, `prev` itself is returned: React then skips the
 * render, instead of re-rendering every transaction consumer a second time for
 * a list that has not changed.
 */
export function reconcileTransactionRow(
  prev: TransactionWithRelations[],
  id: string,
  persisted: TransactionWithRelations | null,
): TransactionWithRelations[] {
  const index = prev.findIndex((tx) => tx.id === id);
  if (index < 0) return prev;
  if (!persisted) return prev.filter((tx) => tx.id !== id);
  const current = prev[index];
  if (current && sameTransactionFields(current, persisted)) return prev;
  const next = prev.slice();
  next[index] = persisted;
  return next;
}
