/**
 * Paybacks in the activity list. Mark paid (or a part payment) into another
 * account than the bill's writes a transfer, and the split row points at it
 * (`paidTransactionId`). The list tints those transfers, and folds two or more
 * paybacks for the same bill on the same day into one row that opens to show
 * them. Pure, so the list and the tests share it.
 */

import type { TransactionWithRelations } from '~/types';

/** The bill a payback transfer paid back, and who paid it. */
export interface PaybackLink {
  billId: string;
  /** The bill's note, else its category name. */
  billTitle: string | null;
  personName: string | null;
}

/** Every live payback transfer by its id. */
export function indexPaybacks(
  transactions: readonly TransactionWithRelations[],
): Map<string, PaybackLink> {
  const index = new Map<string, PaybackLink>();
  for (const tx of transactions) {
    if (!tx.splits?.length) continue;
    for (const split of tx.splits) {
      if (!split.paidAt || !split.paidTransactionId) continue;
      index.set(split.paidTransactionId, {
        billId: tx.id,
        billTitle: tx.note?.trim() || tx.categoryName || null,
        personName: split.personName?.trim() || null,
      });
    }
  }
  return index;
}

/** Whether two indexes say the same thing (keeps the list's input stable). */
export function samePaybackIndex(
  a: ReadonlyMap<string, PaybackLink>,
  b: ReadonlyMap<string, PaybackLink>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [id, link] of a) {
    const other = b.get(id);
    if (
      !other ||
      other.billId !== link.billId ||
      other.billTitle !== link.billTitle ||
      other.personName !== link.personName
    ) {
      return false;
    }
  }
  return true;
}

export type PaybackDayEntry<T> =
  | { kind: 'row'; transaction: T }
  | {
      kind: 'paybacks';
      /** Stable within a day: the bill's id. */
      billId: string;
      billTitle: string | null;
      /** The day's paybacks for the bill, in the day's order. */
      transactions: T[];
      /** Their names, first appearance first, without repeats. */
      personNames: string[];
    };

/**
 * One day's rows with each bill's paybacks folded: a bill with two or more
 * paybacks that day becomes one entry where its first payback was; a lone
 * payback stays a row. Everything else keeps its place.
 */
export function foldPaybackRows<T extends { id: string }>(
  transactions: readonly T[],
  index: ReadonlyMap<string, PaybackLink>,
): PaybackDayEntry<T>[] {
  const countByBill = new Map<string, number>();
  for (const tx of transactions) {
    const link = index.get(tx.id);
    if (link) countByBill.set(link.billId, (countByBill.get(link.billId) ?? 0) + 1);
  }
  const groups = new Map<string, Extract<PaybackDayEntry<T>, { kind: 'paybacks' }>>();
  const entries: PaybackDayEntry<T>[] = [];
  for (const tx of transactions) {
    const link = index.get(tx.id);
    if (!link || (countByBill.get(link.billId) ?? 0) < 2) {
      entries.push({ kind: 'row', transaction: tx });
      continue;
    }
    let group = groups.get(link.billId);
    if (!group) {
      group = {
        kind: 'paybacks',
        billId: link.billId,
        billTitle: link.billTitle,
        transactions: [],
        personNames: [],
      };
      groups.set(link.billId, group);
      entries.push(group);
    }
    group.transactions.push(tx);
    if (link.personName && !group.personNames.includes(link.personName)) {
      group.personNames.push(link.personName);
    }
  }
  return entries;
}
