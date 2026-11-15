/**
 * The rows a change to a shared album asks the cloud-sync Worker to write,
 * as the app's `features/albums/lib/groupRows.ts` builds them, plus the
 * payments an act records (`settleDebt`, `evenGroupPayments` in the app). The
 * Worker checks every row against the album's rules, works out a bill's total
 * from its shares, and stamps who wrote it (`web:<account>` from here) and
 * when. Pure.
 */

import { cents } from "../backup/album-group.ts";
import { openShares, pairwiseDebts, settleDebt, simplifyDebts, type GroupDebt, type OpenShare } from "./debts.ts";
import type { Group, Payment, Share } from "./group";

export type GroupRowWrite = {
  table: "album_members" | "album_expenses" | "album_settlements" | "album_groups";
  row: Record<string, unknown>;
};

/** A random id of the app's shape (letters, digits, `-`). */
export function newId(): string {
  return crypto.randomUUID();
}

const money = (value: number) => cents(value) / 100;

/** A bill as a change writes it. */
export function billRow(bill: {
  id: string;
  date: string;
  note: string | null;
  currency: string;
  categoryName: string | null;
  categoryIcon: string | null;
  paidBy: string;
  shares: readonly Share[];
}): GroupRowWrite {
  return {
    table: "album_expenses",
    row: {
      id: bill.id,
      date: bill.date.slice(0, 10),
      note: bill.note,
      currency: bill.currency,
      category_name: bill.categoryName,
      category_icon: bill.categoryIcon,
      paid_by: bill.paidBy,
      shares_json: JSON.stringify(bill.shares.map((share) => ({ memberId: share.memberId, amount: money(share.amount) }))),
    },
  };
}

/** A bill deleted for everyone. Its payments stay. */
export function deletedBillRow(id: string): GroupRowWrite {
  return { table: "album_expenses", row: { id, deleted_at: "deleted" } };
}

/** Ids for payments recorded as one act: `<batch>.<n>`, so undoing one undoes them all. */
function batchPaymentIds(count: number): string[] {
  const batch = newId();
  return Array.from({ length: count }, (_, index) => `${batch}.${index}`);
}

/** Payments on bills, as rows, recorded as one act on `date`. */
function paymentRows(payments: readonly { expenseId: string; from: string; to: string; amount: number }[], currency: string, date: string): GroupRowWrite[] {
  const ids = batchPaymentIds(payments.length);
  return payments.map((payment, index) => ({
    table: "album_settlements",
    row: {
      id: ids[index],
      expense_id: payment.expenseId,
      from_member: payment.from,
      to_member: payment.to,
      amount: money(payment.amount),
      currency,
      date,
    },
  }));
}

/**
 * The rows that undo a payment: it, and every other payment recorded in the
 * same act. The batch is matched as an exact prefix, never as a pattern.
 */
export function undonePaymentRows(paymentId: string, payments: readonly Payment[]): GroupRowWrite[] {
  const dot = paymentId.indexOf(".");
  const prefix = dot >= 0 ? paymentId.slice(0, dot + 1) : null;
  return payments
    .filter((item) => !item.deleted && (prefix ? item.id.slice(0, prefix.length) === prefix : item.id === paymentId))
    .map((item) => ({ table: "album_settlements", row: { id: item.id, deleted_at: "undone" } }));
}

/** The user's own name in the album. */
export function renameRow(memberId: string, name: string): GroupRowWrite {
  return { table: "album_members", row: { id: memberId, name } };
}

/** The group's Simplify group debts setting. */
export function simplifyRow(groupId: string, on: boolean): GroupRowWrite {
  return { table: "album_groups", row: { id: groupId, simplify_debts: on ? 1 : 0 } };
}

/** The debts of these open shares, simplified or pair by pair. */
const debtsOf = (open: OpenShare[], simplify: boolean): GroupDebt[] => (simplify ? simplifyDebts(open) : pairwiseDebts(open));

/** Who owes whom in the group now, simplified when the group has that on. */
export function groupDebts(group: Pick<Group, "bills" | "payments" | "simplify">): GroupDebt[] {
  return debtsOf(openShares(group.bills, group.payments), group.simplify);
}

/**
 * Paying `debt` (up to its amount) as payments on the group's bills, checked
 * against the debts as they stand now, so a second tap never pays it twice
 * (the app's `settleGroupDebt`). Empty when nothing of it is still owed.
 */
export function settleRows(group: Pick<Group, "bills" | "payments" | "simplify">, debt: GroupDebt, date: string): GroupRowWrite[] {
  const open = openShares(group.bills, group.payments);
  const current = debtsOf(open, group.simplify).find((item) => item.from === debt.from && item.to === debt.to && item.currency === debt.currency);
  if (!current) return [];
  const payments = settleDebt(open, { ...debt, amount: Math.min(debt.amount, current.amount) }, { simplified: group.simplify });
  return payments.length ? paymentRows(payments, debt.currency, date) : [];
}

/**
 * With Simplify on, a group where nobody owes anything on balance has its
 * open shares closed as one act, after a change made here (the app's
 * `evenGroupPayments`, sent with `reason: 'close_even'`). None otherwise.
 */
export function evenGroupRows(group: Pick<Group, "bills" | "payments" | "simplify">, date: string): GroupRowWrite[] {
  if (!group.simplify) return [];
  const open = openShares(group.bills, group.payments);
  if (open.length === 0 || simplifyDebts(open).length > 0) return [];
  const ids = batchPaymentIds(open.length);
  return open.map((share, index) => ({
    table: "album_settlements",
    row: {
      id: ids[index],
      expense_id: share.expenseId,
      from_member: share.from,
      to_member: share.to,
      amount: money(share.amount),
      currency: share.currency,
      date,
    },
  }));
}
