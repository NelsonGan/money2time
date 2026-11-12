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
 *
 * The user can pay the payer back in parts. A part paid from an account is its
 * own expense on that account (the money has left it), cut out of the bill:
 * the bill and the Me row drop by the part, so the bill is always what is
 * still owed, and a paid row under the payer's (`partOfSplitId`) records the
 * part in `shareAmount` and points at that expense with `paidTransactionId`.
 * Spending is unchanged: the bill and its parts add up to the user's share.
 * Paying everything that is left is the full payback above.
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

/**
 * The whole bill a friend paid: what the user still owes, what they have paid
 * in parts (kept in `shareAmount` on the parts' rows), and every friend's share.
 */
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

/**
 * A part of their own share the user has already paid the payer: a paid row
 * under the payer's that holds the part in `shareAmount`.
 */
export function isPayBackPart(
  split: Pick<TransactionSplit, 'isSelf' | 'partOfSplitId' | 'shareAmount' | 'paidAt'>,
): boolean {
  return !split.isSelf && !!split.partOfSplitId && split.shareAmount != null && !!split.paidAt;
}

/** One part payment the user made to the payer. */
export interface PayBackPayment {
  splitId: string;
  amount: number;
  paidAt: string;
  paidFromAccountId: string | null;
  /** The expense the part was paid as, on that account. */
  transactionId: string | null;
}

/** What the user owes on a bill a friend paid. */
export interface OwedToPayer {
  /** The payer's row: the one Mark paid and Undo act on. */
  splitId: string;
  personName: string | null;
  /** The payer's Cloud Sync account, once people can be real users. */
  memberId: string | null;
  /**
   * What is left of the user's share after the parts, in the bill's currency:
   * what is still owed, or once `paidAt` is set, what the last payment was.
   */
  amount: number;
  /** What the user still owes: `amount` until it is paid, then 0. */
  owed: number;
  /** The user's whole share of the bill: what is owed and what is paid. */
  total: number;
  /** What the user has paid back so far. */
  paid: number;
  /** When the user paid the last of it; null while something is still owed. */
  paidAt: string | null;
  /** The account the last of it was paid from. */
  paidFromAccountId: string | null;
  /** The parts paid before that, oldest first. */
  payments: PayBackPayment[];
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
  const payments = splits
    .filter((split) => isPayBackPart(split) && split.partOfSplitId === payer.id)
    .map((split) => ({
      splitId: split.id,
      amount: split.shareAmount ?? 0,
      paidAt: split.paidAt ?? '',
      paidFromAccountId: split.paybackAccountId,
      transactionId: split.paidTransactionId,
    }))
    .sort((a, b) => (a.paidAt < b.paidAt ? -1 : a.paidAt > b.paidAt ? 1 : 0));
  // The bill itself is what is left: every part paid was cut out of it.
  const left = normalizeMoneyAmount(selfShare(splits, expenseAmount));
  const paidParts = normalizeMoneyAmount(payments.reduce((sum, part) => sum + part.amount, 0));
  const total = normalizeMoneyAmount(left + paidParts);
  return {
    splitId: payer.id,
    personName: trimmed.length > 0 ? trimmed : null,
    memberId: payer.memberId ?? null,
    amount: left,
    owed: payer.paidAt ? 0 : left,
    total,
    paid: payer.paidAt ? total : paidParts,
    paidAt: payer.paidAt,
    paidFromAccountId: payer.paidAt ? payer.paybackAccountId : null,
    payments,
  };
}

/** What the user has paid the payer in parts so far (0 on any other bill). */
export function paidBackInParts(splits: readonly TransactionSplit[] | null | undefined): number {
  const payer = billPayer(splits);
  if (!payer || !splits) return 0;
  return normalizeMoneyAmount(
    splits
      .filter((split) => isPayBackPart(split) && split.partOfSplitId === payer.id)
      .reduce((sum, split) => sum + (split.shareAmount ?? 0), 0),
  );
}

/** Whether the user still owes the payer something on this bill. */
export function owesPayer(
  splits: readonly TransactionSplit[] | null | undefined,
  expenseAmount: number,
): boolean {
  const owed = owedToPayer(splits, expenseAmount);
  return !!owed && owed.owed > 0;
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
