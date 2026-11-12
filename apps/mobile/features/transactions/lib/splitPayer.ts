/**
 * Who paid a split bill. Pure, so Balances, the split editor, the activity
 * list and AppContext share one set of rules.
 *
 * A bill the user paid is the one the app always had: the expense is the whole
 * bill, and each friend's row holds what they owe the user in `amount`.
 *
 * A bill a friend paid turns that round. The expense is the user's own share
 * (the Me row), which the user owes to the payer, whose row carries `isPayer`.
 * Nobody on it owes the user, so every friend row keeps `amount` at 0 and holds
 * its share of the bill in `shareAmount`. An app version from before this
 * reads only `amount`: it sees a plain expense for the user's share and never
 * counts these friends as owing. The payer row's `paidAt` is when the user
 * paid them back, and its `paybackAccountId` the account it was paid from,
 * which is then the expense's account too; until then the expense has none,
 * because the money has not left the user yet.
 *
 * The other friends on such a bill owe the payer, not the user. Their shares
 * are kept so the bill reads whole, and so a group's balances can use them.
 */

import type { TransactionSplit } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';

type PayerRow = Pick<TransactionSplit, 'isSelf' | 'isPayer' | 'partOfSplitId'>;

/** The friend who paid the bill, or null when the user did. */
export function billPayer<T extends PayerRow>(splits: readonly T[] | null | undefined): T | null {
  if (!splits) return null;
  return splits.find((split) => split.isPayer && !split.isSelf && !split.partOfSplitId) ?? null;
}

/** Whether a friend paid this bill, so the user owes their own share. */
export function isFriendPaidBill(splits: readonly PayerRow[] | null | undefined): boolean {
  return billPayer(splits) !== null;
}

/**
 * A friend's share of the bill, whoever paid: `shareAmount` on a bill a friend
 * paid, else `amount` (what they owe the user is their share).
 */
export function friendShare(split: Pick<TransactionSplit, 'amount' | 'shareAmount'>): number {
  return split.shareAmount ?? split.amount;
}

/** The user's own share: the Me row, else `fallback` (the expense itself). */
export function selfShare(
  splits: readonly Pick<TransactionSplit, 'isSelf' | 'amount'>[],
  fallback = 0,
): number {
  const self = splits.find((split) => split.isSelf);
  return self ? self.amount : fallback;
}

/** The whole bill a friend paid: the user's share and every friend's. */
export function friendPaidBillTotal(
  splits: readonly Pick<TransactionSplit, 'isSelf' | 'amount' | 'shareAmount'>[],
  expenseAmount: number,
): number {
  let total = selfShare(splits, expenseAmount);
  for (const split of splits) {
    if (!split.isSelf) total += split.shareAmount ?? 0;
  }
  return normalizeMoneyAmount(total);
}

/** What the user owes on a bill a friend paid. */
export interface OwedToPayer {
  /** The payer's row: the one Mark paid and Undo act on. */
  splitId: string;
  personName: string | null;
  /** The user's share of the bill, in the bill's currency. */
  amount: number;
  /** When the user paid it back; null while it is still owed. */
  paidAt: string | null;
  /** The account it was paid from. */
  paidFromAccountId: string | null;
}

/**
 * The user's debt on a bill a friend paid, or null on a bill the user paid.
 * `expenseAmount` is the expense's own amount, used when the bill has no Me
 * row (an older app version can remove it).
 */
export function owedToPayer(
  splits: readonly TransactionSplit[] | null | undefined,
  expenseAmount: number,
): OwedToPayer | null {
  const payer = billPayer(splits);
  if (!payer || !splits) return null;
  const trimmed = payer.personName?.trim() ?? '';
  return {
    splitId: payer.id,
    personName: trimmed.length > 0 ? trimmed : null,
    amount: normalizeMoneyAmount(selfShare(splits, expenseAmount)),
    paidAt: payer.paidAt,
    paidFromAccountId: payer.paidAt ? payer.paybackAccountId : null,
  };
}

/** Whether the user still owes the payer something on this bill. */
export function owesPayer(
  splits: readonly TransactionSplit[] | null | undefined,
  expenseAmount: number,
): boolean {
  const owed = owedToPayer(splits, expenseAmount);
  return !!owed && !owed.paidAt && owed.amount > 0;
}

/** A row of the split editor, as far as who paid goes. */
export interface PayerDraftRow {
  amount: string;
  isSelf: boolean;
  isPayer?: boolean;
}

/** The editor row of the friend who paid, or null when the user did. */
export function draftPayer<T extends PayerDraftRow>(rows: readonly T[]): T | null {
  return rows.find((row) => row.isPayer && !row.isSelf) ?? null;
}

/**
 * How a bill a friend paid is stored. The editor works on the whole bill
 * (every row its share, the amount their total); the expense written is the
 * user's share alone, and each friend row moves its share to `shareAmount`.
 */
export function storedFriendPaidRow<T extends { amount: number; isSelf: boolean }>(
  row: T,
): T & { shareAmount: number | null } {
  return row.isSelf
    ? { ...row, shareAmount: null }
    : { ...row, amount: 0, shareAmount: normalizeMoneyAmount(row.amount) };
}

/** The fields of an expense that follow its amount. */
interface ExpenseAmounts {
  amount: number;
  accountId?: string | null;
  accountAmount?: number | null;
  reportingAmount?: number | null;
}

/**
 * The expense to save for a bill a friend paid. The editor hands over the
 * whole bill; what the user spent is their own `share` of it, so the amount
 * and the frozen currency snapshots that came with it shrink by the same
 * ratio (the frozen rate is kept). It sits on no account until the user has
 * paid the friend back (`settled`), when it keeps the account it was paid from.
 */
export function friendPaidExpense<T extends ExpenseAmounts>(
  input: T,
  share: number,
  settled: boolean,
): T {
  const amount = normalizeMoneyAmount(Math.max(0, share));
  const ratio = input.amount > 0 ? amount / input.amount : 0;
  const scaled = (value: number | null | undefined) =>
    value == null ? value : normalizeMoneyAmount(value * ratio);
  return {
    ...input,
    amount,
    ...('reportingAmount' in input ? { reportingAmount: scaled(input.reportingAmount) } : {}),
    accountId: settled ? (input.accountId ?? null) : null,
    accountAmount: settled ? (scaled(input.accountAmount) ?? null) : null,
  };
}
