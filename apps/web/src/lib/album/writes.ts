/**
 * The rows a change to a shared album asks the cloud-sync Worker to write,
 * as the app's `features/albums/lib/groupRows.ts` builds them, plus the
 * payments an act records (`settleDebt`, `evenGroupPayments` in the app). The
 * Worker checks every row against the album's rules, works out a bill's total
 * from its shares, and stamps who wrote it (`web:<account>` from here) and
 * when. Pure.
 *
 * The page plans from its last read, which may be minutes old, so a change
 * names what it was planned from: each bill or settings row the revision it
 * had then (`base`, null for a new one), and payments the money stamp
 * (`moneyBase`, the read's `moneyRev`). The Worker refuses a change as
 * `stale` once those moved, rather than write over a phone's edit, bring back
 * a bill a phone deleted, or pay a share twice.
 */

import { cents } from "../backup/album-group.ts";
import { openShares, pairwiseDebts, settleDebt, simplifyDebts, type GroupDebt, type OpenShare } from "./debts.ts";
import { albumCategoryColumns, type AlbumCategoryDef, type AlbumCategoryKey } from "./categories.ts";
import type { Bill, Group, Payment, Share } from "./group";

export type GroupRowWrite = {
  table: "album_members" | "album_expenses" | "album_settlements" | "album_groups";
  row: Record<string, unknown>;
  /** The row's revision as the page read it, null for a row it did not have; absent: not checked. */
  base?: string | null;
};

/** A row's `base`, when it is known (an older Worker sends no revisions). */
const withBase = (write: GroupRowWrite, base: string | null | undefined): GroupRowWrite => (base === undefined ? write : { ...write, base });

/** A bill's `base`: null for a new one, its revision as read for one there. */
export const billBase = (bill: Pick<Bill, "rev"> | null): string | null | undefined => (bill ? (bill.rev ?? undefined) : null);

/** A random id of the app's shape (letters, digits, `-`). */
export function newId(): string {
  return crypto.randomUUID();
}

const money = (value: number) => cents(value) / 100;

/** A bill as a change writes it; `base`: what the bill was as read (`billBase`). */
export function billRow(
  bill: {
    id: string;
    date: string;
    note: string | null;
    currency: string;
    category: AlbumCategoryKey;
    paidBy: string;
    shares: readonly Share[];
  },
  base: string | null | undefined,
  /** The album's categories: an added one's name and icon go with the bill. */
  categories?: readonly AlbumCategoryDef[],
): GroupRowWrite {
  return withBase({
    table: "album_expenses",
    row: {
      id: bill.id,
      date: bill.date.slice(0, 10),
      note: bill.note,
      currency: bill.currency,
      // The key, and its English name and icon (an added one's own), which older apps match.
      ...albumCategoryColumns(bill.category, categories),
      paid_by: bill.paidBy,
      shares_json: JSON.stringify(bill.shares.map((share) => ({ memberId: share.memberId, amount: money(share.amount) }))),
    },
  }, base);
}

/** A bill deleted for everyone, as read. Its payments stay. */
export function deletedBillRow(bill: Pick<Bill, "id" | "rev">): GroupRowWrite {
  return withBase({ table: "album_expenses", row: { id: bill.id, deleted_at: "deleted" } }, billBase(bill));
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

/** The group's Simplify group debts setting, changed from the settings as read. */
export function simplifyRow(group: Pick<Group, "album" | "settingsRev">, on: boolean): GroupRowWrite {
  return withBase({ table: "album_groups", row: { id: group.album.ledgerId, simplify_debts: on ? 1 : 0 } }, group.settingsRev);
}

/** Whether a change records a payment: it is then sent with the read's `moneyRev` (`moneyBase`). */
export function recordsPayment(rows: readonly GroupRowWrite[]): boolean {
  return rows.some((write) => write.table === "album_settlements" && write.row.deleted_at == null);
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

/** A short id-safe hash (FNV-1a, two seeds) of a group's state: the app's `stateHash`, exactly. */
function stateHash(groupId: string, parts: readonly string[]): string {
  const text = [groupId, ...parts].join("\n");
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x5bd1e995) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

/**
 * With Simplify on, a group where nobody owes anything on balance has its
 * open shares closed as one act, after a change made here (the app's
 * `evenGroupPayments`, sent with `reason: 'close_even'`). None otherwise.
 * Named after what they close, as on a phone: two writers closing the same
 * even group write the same rows, so the group is never paid twice.
 */
export function evenGroupRows(group: Pick<Group, "bills" | "payments" | "simplify"> & { album: { ledgerId: string } }, date: string): GroupRowWrite[] {
  if (!group.simplify) return [];
  const open = openShares(group.bills, group.payments);
  if (open.length === 0 || simplifyDebts(open).length > 0) return [];
  const batch = `even-${stateHash(
    group.album.ledgerId,
    open.map((share) => `${share.expenseId}|${share.from}|${share.to}|${share.currency}|${share.amount}`),
  )}`;
  return open.map((share, index) => ({
    table: "album_settlements",
    row: {
      id: `${batch}.${index}`,
      expense_id: share.expenseId,
      from_member: share.from,
      to_member: share.to,
      amount: money(share.amount),
      currency: share.currency,
      date,
    },
  }));
}
