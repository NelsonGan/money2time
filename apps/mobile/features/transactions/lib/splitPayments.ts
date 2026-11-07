/**
 * Part payments on a split share. Pure, so Settle Up, the split editor and
 * AppContext share one set of rules.
 *
 * A friend's share starts as one split row. Paying part of it cuts a paid row
 * out of the share's unpaid row: RM300 of RM1,000 leaves a paid RM300 row and
 * an unpaid RM700 row, the paid one pointing back with `partOfSplitId`. Every
 * row stays a complete split on its own (a paid row reduced the expense by its
 * amount and may own a payback transfer), so older app versions, the Web
 * Dashboard and the other members of a shared ledger keep reading it right.
 * The rows of one share are grouped by {@link splitShareKey}.
 */

import type { TransactionSplit } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';

/** Half a cent: amounts closer than this are the same amount. */
const CENT_EPSILON = 0.005;

type ShareRow = Pick<TransactionSplit, 'id' | 'partOfSplitId'>;

/** The share a split row belongs to: the id of the share's first row. */
export function splitShareKey(split: ShareRow): string {
  return split.partOfSplitId ?? split.id;
}

export interface SplitShareProgress {
  /** The whole share: every row's amount, paid or not. */
  total: number;
  /** What has been paid back so far. */
  paid: number;
  /** What is still owed. */
  owed: number;
  /** Paid rows of the share. */
  paymentCount: number;
  /** The share was paid in parts (it has more than one row). */
  inParts: boolean;
}

/** Each share's totals, keyed by {@link splitShareKey}. Self rows are skipped. */
export function summarizeSplitShares(
  splits: readonly TransactionSplit[],
): Map<string, SplitShareProgress> {
  const shares = new Map<string, SplitShareProgress & { rows: number }>();
  for (const split of splits) {
    if (split.isSelf) continue;
    const key = splitShareKey(split);
    const share = shares.get(key) ?? {
      total: 0,
      paid: 0,
      owed: 0,
      paymentCount: 0,
      inParts: false,
      rows: 0,
    };
    share.rows += 1;
    share.total = normalizeMoneyAmount(share.total + split.amount);
    if (split.paidAt) {
      share.paid = normalizeMoneyAmount(share.paid + split.amount);
      share.paymentCount += 1;
    } else {
      share.owed = normalizeMoneyAmount(share.owed + split.amount);
    }
    share.inParts = share.rows > 1;
    shares.set(key, share);
  }
  const result = new Map<string, SplitShareProgress>();
  for (const [key, { rows: _rows, ...share }] of shares) result.set(key, share);
  return result;
}

export type SplitPaymentPlan =
  /** The payment covers everything owed: settle the row as Mark paid does. */
  | { kind: 'full'; amount: number }
  /** Part of it: cut a paid row of `amount` out, `remaining` stays owed. */
  | { kind: 'partial'; amount: number; remaining: number };

/**
 * What paying `amount` against an unpaid row that owes `owed` does, or null
 * when it cannot be paid: nothing (zero or less, or not a number) or more than
 * is owed. Amounts are rounded to the cent first.
 */
export function planSplitPayment(owed: number, amount: number): SplitPaymentPlan | null {
  if (!Number.isFinite(amount) || !Number.isFinite(owed)) return null;
  const paid = normalizeMoneyAmount(amount);
  const due = normalizeMoneyAmount(owed);
  if (!(paid > 0) || !(due > 0)) return null;
  if (paid > due + CENT_EPSILON) return null;
  if (Math.abs(due - paid) < CENT_EPSILON) return { kind: 'full', amount: due };
  return { kind: 'partial', amount: paid, remaining: normalizeMoneyAmount(due - paid) };
}

/**
 * Splits after a part payment: the unpaid row `splitId` owes `part.amount`
 * less, and `part` (the new paid row) sits right after it.
 */
export function cutPartPayment(
  splits: readonly TransactionSplit[],
  splitId: string,
  part: TransactionSplit,
): TransactionSplit[] {
  const next: TransactionSplit[] = [];
  for (const split of splits) {
    if (split.id !== splitId) {
      next.push(split);
      continue;
    }
    next.push({
      ...split,
      amount: normalizeMoneyAmount(split.amount - part.amount),
      updatedAt: part.updatedAt,
    });
    next.push(part);
  }
  return next;
}

export interface UnpaidMerge {
  /** The row that stays, owing both amounts. */
  keepId: string;
  /** The row folded into it and deleted. */
  dropId: string;
  /** What the kept row owes after the merge. */
  amount: number;
}

/**
 * After the row `reopenedId` turns unpaid again (its payment was undone), the
 * share can owe on two rows. Fold them into one so the share keeps a single
 * amount owed: the share's first row stays when it is one of the two (its id
 * is what the part payments point at), otherwise the row that was already
 * owed. Null when the share has no other unpaid row.
 */
export function planUnpaidMerge(
  splits: readonly TransactionSplit[],
  reopenedId: string,
): UnpaidMerge | null {
  const reopened = splits.find((split) => split.id === reopenedId);
  if (!reopened || reopened.isSelf) return null;
  const key = splitShareKey(reopened);
  const other = splits.find(
    (split) =>
      split.id !== reopenedId && !split.isSelf && !split.paidAt && splitShareKey(split) === key,
  );
  if (!other) return null;
  const keep = reopened.id === key ? reopened : other;
  const drop = keep === reopened ? other : reopened;
  return {
    keepId: keep.id,
    dropId: drop.id,
    amount: normalizeMoneyAmount(reopened.amount + other.amount),
  };
}

/** Splits with `merge` applied: the kept row owes the sum, the other is gone. */
export function applyUnpaidMerge(
  splits: readonly TransactionSplit[],
  merge: UnpaidMerge,
  updatedAt: string,
): TransactionSplit[] {
  return splits
    .filter((split) => split.id !== merge.dropId)
    .map((split) =>
      split.id === merge.keepId ? { ...split, amount: merge.amount, updatedAt } : split,
    );
}

/**
 * Split Bill's "split evenly" over rows that can already be part paid: what
 * each row owes so every share comes out the same, `paidBack[i]` being what
 * row i's share has paid so far. `owed` (what the rows owe together) plus
 * everything paid back is shared evenly, and each row owes its portion less
 * what it paid. A row that paid its whole portion or more owes nothing and
 * leaves the rest to share among the others, so the result always adds up to
 * `owed`. Odd cents go to the first rows.
 */
export function evenOwedAmounts(owed: number, paidBack: readonly number[]): number[] {
  const owedCents = Math.max(0, Math.round(owed * 100));
  const paidCents = paidBack.map((value) => Math.max(0, Math.round(value * 100)));
  const result = paidCents.map(() => 0);
  let active = paidCents.map((_, index) => index);
  for (;;) {
    if (active.length === 0) return result.map((cents) => cents / 100);
    const pool = owedCents + active.reduce((sum, index) => sum + paidCents[index]!, 0);
    const base = Math.floor(pool / active.length);
    const remainder = pool - base * active.length;
    const portion = (slot: number) => base + (slot < remainder ? 1 : 0);
    const covered = active.filter((index, slot) => paidCents[index]! >= portion(slot));
    if (covered.length === 0) {
      active.forEach((index, slot) => {
        result[index] = portion(slot) - paidCents[index]!;
      });
      return result.map((cents) => cents / 100);
    }
    active = active.filter((index) => !covered.includes(index));
  }
}
