/**
 * Paybacks in the activity list. Mark paid (or a part payment) into another
 * account than the bill's writes a transfer, and the split row points at it
 * (`paidTransactionId`). A payback into the bill's own account (or on a bill
 * with no account) writes nothing but the paid split, so the list shows a
 * payback row built from that split (`buildPaybackRows`). The list tints both,
 * and folds two or more paybacks for the same bill on the same day into one
 * row that opens to show them. Pure, so the list and the tests share it.
 */

import { buildPaybackTransferNote } from '~/features/transactions/lib/settleUp';
import type { TransactionSplit, TransactionWithRelations } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';
import { compareTransactionsByDateDesc } from '~/utils/transactionSorting';

/** The bill a payback transfer paid back, and who paid it. */
export interface PaybackLink {
  billId: string;
  /** The bill's note, else its category name. */
  billTitle: string | null;
  personName: string | null;
}

const PAYBACK_ROW_ID_PREFIX = 'payback-row:';

/** The id of the payback row shown for a split paid back without a transfer. */
export function paybackRowId(splitId: string): string {
  return `${PAYBACK_ROW_ID_PREFIX}${splitId}`;
}

/**
 * Whether a list row is a payback row (`buildPaybackRows`): built from a split
 * for display, not a stored transaction, so it cannot be edited, selected,
 * reordered or deleted as one.
 */
export function isPaybackRow(transaction: Pick<TransactionWithRelations, 'id'>): boolean {
  return transaction.id.startsWith(PAYBACK_ROW_ID_PREFIX);
}

/**
 * A friend's payback that wrote no transfer: Mark paid or a part payment into
 * the bill's own account, or on a bill with no account. The expense dropped by
 * it and nothing else was written.
 */
function paidWithoutTransfer(split: TransactionSplit): boolean {
  return !split.isSelf && !!split.paidAt && !split.paidTransactionId && split.amount > 0;
}

function billTitleOf(bill: Pick<TransactionWithRelations, 'note' | 'categoryName'>) {
  return bill.note?.trim() || bill.categoryName || null;
}

/** Every live payback by its row's id: transfers, and payback rows. */
export function indexPaybacks(
  transactions: readonly TransactionWithRelations[],
): Map<string, PaybackLink> {
  const index = new Map<string, PaybackLink>();
  for (const tx of transactions) {
    if (!tx.splits?.length) continue;
    for (const split of tx.splits) {
      const rowId = !split.paidAt
        ? null
        : split.paidTransactionId
          ? split.paidTransactionId
          : paidWithoutTransfer(split)
            ? paybackRowId(split.id)
            : null;
      if (!rowId) continue;
      index.set(rowId, {
        billId: tx.id,
        billTitle: billTitleOf(tx),
        personName: split.personName?.trim() || null,
      });
    }
  }
  return index;
}

/** An account's currency by id. */
export type AccountCurrencyLookup = (accountId: string) => string | undefined;

/**
 * The amount a payback row shows, in the bill account's currency as its
 * balance counts the bill: the share itself when the bill has no account
 * snapshot, else at the bill's own frozen account rate. A bill paid back to 0
 * has no rate left to read, so it shows the share in the bill's currency.
 */
function paybackRowAmount(
  bill: TransactionWithRelations,
  share: number,
  currencyOf: AccountCurrencyLookup,
): { amount: number; currency: string } {
  const accountCurrency = bill.accountId ? currencyOf(bill.accountId) : undefined;
  if (
    bill.accountAmount == null ||
    !accountCurrency ||
    accountCurrency === bill.currency ||
    !(bill.amount > 0)
  ) {
    return { amount: normalizeMoneyAmount(share), currency: bill.currency };
  }
  return {
    amount: normalizeMoneyAmount((share * bill.accountAmount) / bill.amount),
    currency: accountCurrency,
  };
}

/**
 * A row for each payback that wrote no transfer, so it shows in the activity
 * list like a payback transfer does: on the day it was paid (`paidAt`), shaped
 * as a transfer that stays in the bill's account, which no total counts.
 * Newest first. Nothing is stored: older app versions, the Web Dashboard and
 * Cloud Sync see the same paid split they always did, and paybacks recorded
 * before these rows existed show too.
 */
export function buildPaybackRows(
  transactions: readonly TransactionWithRelations[],
  currencyOf: AccountCurrencyLookup,
): TransactionWithRelations[] {
  const rows: TransactionWithRelations[] = [];
  for (const bill of transactions) {
    if (!bill.splits?.length) continue;
    for (const split of bill.splits) {
      if (!paidWithoutTransfer(split)) continue;
      const paidAt = split.paidAt!;
      rows.push({
        id: paybackRowId(split.id),
        instalmentRuleId: null,
        instalmentNumber: null,
        dayOrder: null,
        type: 'transfer',
        ...paybackRowAmount(bill, split.amount, currencyOf),
        reportingCurrency: null,
        reportingAmount: null,
        fxRate: null,
        toAmount: null,
        accountAmount: null,
        date: paidAt,
        accountId: null,
        fromAccountId: bill.accountId,
        toAccountId: bill.accountId,
        fromAccountName: bill.accountName ?? null,
        toAccountName: bill.accountName ?? null,
        categoryId: null,
        // As a payback transfer's note, so a bill's paybacks read alike.
        note: buildPaybackTransferNote(split.personName, bill.note),
        details: null,
        receiptUri: null,
        sentiment: 'neutral',
        reimbursable: false,
        reimbursedAt: null,
        reimbursementAccountId: null,
        reimbursementTransactionId: null,
        reimbursementOfId: null,
        countsAsExpense: false,
        createdBy: bill.createdBy,
        memberId: bill.memberId,
        recurrencePattern: 'none',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        createdAt: paidAt,
        // The row shows the bill's note and account too, and list rows redraw
        // when `updatedAt` moves, so it moves with either.
        updatedAt: split.updatedAt > bill.updatedAt ? split.updatedAt : bill.updatedAt,
        deletedAt: null,
      });
    }
  }
  return rows.sort((a, b) => compareTransactionsByDateDesc(a, b));
}

/** What a payback row shows, to tell whether a rebuilt row changed. */
function paybackRowSignature(row: TransactionWithRelations): string {
  return [
    row.amount,
    row.currency,
    row.date,
    row.note,
    row.fromAccountId,
    row.fromAccountName,
    row.memberId,
    row.updatedAt,
  ].join('\u0000');
}

/**
 * `next`, keeping `previous` (and each unchanged row object) where nothing
 * changed, so lists given the rows do not redraw on every unrelated write.
 */
export function reusePaybackRows(
  previous: readonly TransactionWithRelations[],
  next: TransactionWithRelations[],
): readonly TransactionWithRelations[] {
  const previousById = new Map(previous.map((row) => [row.id, row]));
  let changed = previous.length !== next.length;
  const merged = next.map((row, index) => {
    const old = previousById.get(row.id);
    if (old && paybackRowSignature(old) === paybackRowSignature(row)) {
      if (previous[index] !== old) changed = true;
      return old;
    }
    changed = true;
    return row;
  });
  return changed ? merged : previous;
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
