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

import type { RateTable, TransactionSplit } from '~/types';
import { convert } from '~/utils/currency';
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
}

/** Each share's totals, keyed by {@link splitShareKey}. Self rows are skipped. */
export function summarizeSplitShares(
  splits: readonly TransactionSplit[],
): Map<string, SplitShareProgress> {
  const shares = new Map<string, SplitShareProgress>();
  for (const split of splits) {
    if (split.isSelf) continue;
    const key = splitShareKey(split);
    const share = shares.get(key) ?? {
      total: 0,
      paid: 0,
      owed: 0,
      paymentCount: 0,
    };
    share.total = normalizeMoneyAmount(share.total + split.amount);
    if (split.paidAt) {
      share.paid = normalizeMoneyAmount(share.paid + split.amount);
      share.paymentCount += 1;
    } else {
      share.owed = normalizeMoneyAmount(share.owed + split.amount);
    }
    shares.set(key, share);
  }
  return shares;
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

export interface ShareHandover {
  /** The part payment that becomes the share's first row. */
  newRootId: string;
  /** The other part payments, now pointing at the new first row. */
  repointIds: string[];
}

/**
 * When a share's first row goes (Remove on what is still owed, or an edit that
 * drops it), its part payments would point at a deleted row: still grouped by
 * that id here, but a ledger copy drops a reference to a row it does not copy
 * and would split them into separate shares. The oldest part takes over as the
 * first row instead. Null when the row is not a share's first row or has no
 * parts.
 */
export function planShareHandover(
  splits: readonly TransactionSplit[],
  removedId: string,
): ShareHandover | null {
  const removed = splits.find((split) => split.id === removedId);
  if (!removed || removed.partOfSplitId) return null;
  const parts = splits
    .filter((split) => split.id !== removedId && split.partOfSplitId === removedId)
    .sort((a, b) =>
      a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt < b.createdAt ? -1 : 1,
    );
  const [first, ...rest] = parts;
  if (!first) return null;
  return { newRootId: first.id, repointIds: rest.map((split) => split.id) };
}

/** Splits with `handover` applied. */
export function applyShareHandover(
  splits: readonly TransactionSplit[],
  handover: ShareHandover,
): TransactionSplit[] {
  return splits.map((split) =>
    split.id === handover.newRootId
      ? { ...split, partOfSplitId: null }
      : handover.repointIds.includes(split.id)
        ? { ...split, partOfSplitId: handover.newRootId }
        : split,
  );
}

/**
 * A share should owe on one row. An older app version undoing a part payment
 * (or deleting its transfer) does not fold it back, and leaves the share owing
 * on two rows. Saving the bill folds every such share back into one row
 * (`planUnpaidMerge`, keeping the share's first row when it is owed). Returns
 * the splits and the merges to write.
 */
export function consolidateOwedRows(
  splits: readonly TransactionSplit[],
  updatedAt: string,
  keepSeparateIds: readonly string[] = [],
): { splits: TransactionSplit[]; merges: UnpaidMerge[] } {
  // Rows the same save is about to mark paid stay as they are: merging one away
  // (or growing it to the whole share) before Mark paid runs would pay the
  // wrong amount, or nothing at all.
  const keepSeparate = new Set(keepSeparateIds);
  let next = [...splits];
  const merges: UnpaidMerge[] = [];
  for (const split of splits) {
    if (split.isSelf || split.paidAt) continue;
    if (!next.some((row) => row.id === split.id)) continue;
    const merge = planUnpaidMerge(next, split.id);
    if (!merge) continue;
    if (keepSeparate.has(merge.keepId) || keepSeparate.has(merge.dropId)) continue;
    merges.push(merge);
    next = applyUnpaidMerge(next, merge, updatedAt);
  }
  return { splits: next, merges };
}

/** The amounts of the transfer a payback into another account writes. */
export interface PaybackTransferAmounts {
  /** What leaves the bill's account, in that account's currency. */
  amount: number;
  /** The bill account's currency, which `amount` is in. */
  currency: string;
  /** What reaches the payback account in its own currency; null when it is the same currency. */
  toAmount: number | null;
}

/**
 * The transfer for a friend's payback of `share` (in the bill's currency).
 *
 * A transfer's `amount` is in the account it leaves and `toAmount` in the one
 * it reaches, the way every cross-currency transfer is stored. The bill's
 * account gives back exactly what the expense stopped costing it: the share
 * at the bill's own frozen account rate (`billAccountAmount / billAmount`), so
 * that account nets to zero for the payback. The payback account receives the
 * share itself when it holds the bill's currency, else the amount converted at
 * today's rate.
 */
export function paybackTransferAmounts(input: {
  share: number;
  billCurrency: string;
  billAmount: number;
  billAccountAmount: number | null;
  fromCurrency: string;
  toCurrency: string;
  rateTable: RateTable;
}): PaybackTransferAmounts {
  const { share, billCurrency, fromCurrency, toCurrency, rateTable } = input;
  let amount: number;
  if (billCurrency === fromCurrency) {
    amount = normalizeMoneyAmount(share);
  } else if (input.billAccountAmount != null && input.billAmount > 0) {
    amount = normalizeMoneyAmount((share * input.billAccountAmount) / input.billAmount);
  } else {
    amount = convert(share, billCurrency, fromCurrency, rateTable).value;
  }
  let toAmount: number | null = null;
  if (toCurrency !== fromCurrency) {
    toAmount =
      toCurrency === billCurrency
        ? normalizeMoneyAmount(share)
        : convert(amount, fromCurrency, toCurrency, rateTable).value;
  }
  return { amount, currency: fromCurrency, toAmount };
}
