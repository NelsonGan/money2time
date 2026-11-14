// The rows a change to a shared album's group asks the Worker to write
// (features/albums/services/albumGroupWrites.ts sends them). Pure: the Worker
// checks each row, works out a bill's total and stamps who made it and when.
// See README.md > Album members and shared albums.

import type { AlbumExpense, AlbumSettlement, AlbumShare } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';
import { newId } from '~/utils/id';

/** One row of a change: the table and the row as the app stores it. */
export interface GroupRowWrite {
  table: 'album_members' | 'album_expenses' | 'album_settlements' | 'album_groups';
  row: Record<string, unknown>;
}

/** A bill as a change writes it: the Worker works out its total and stamps the rest. */
export function billRow(bill: {
  id: string;
  date: string;
  note: string | null;
  currency: string;
  categoryName: string | null;
  categoryIcon: string | null;
  paidBy: string;
  shares: readonly AlbumShare[];
}): GroupRowWrite {
  return {
    table: 'album_expenses',
    row: {
      id: bill.id,
      date: bill.date.slice(0, 10),
      note: bill.note,
      currency: bill.currency,
      category_name: bill.categoryName,
      category_icon: bill.categoryIcon,
      paid_by: bill.paidBy,
      shares_json: JSON.stringify(
        bill.shares.map((share) => ({
          memberId: share.memberId,
          amount: normalizeMoneyAmount(share.amount),
        })),
      ),
    },
  };
}

/** A bill deleted for everyone. Its payments stay (README: Anyone can change a bill). */
export function deletedBillRow(id: string): GroupRowWrite {
  return { table: 'album_expenses', row: { id, deleted_at: 'deleted' } };
}

/** A deleted bill brought back as it was, with its shares. */
export function restoredBillRow(bill: AlbumExpense): GroupRowWrite {
  return billRow(bill);
}

/** A payment from one member to another on a bill. */
export function paymentRow(payment: {
  id: string;
  expenseId: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  date: string;
}): GroupRowWrite {
  return {
    table: 'album_settlements',
    row: {
      id: payment.id,
      expense_id: payment.expenseId,
      from_member: payment.from,
      to_member: payment.to,
      amount: normalizeMoneyAmount(payment.amount),
      currency: payment.currency,
      date: payment.date.slice(0, 10),
    },
  };
}

/**
 * Ids for payments recorded as one act (a debt paid along a chain of bills):
 * `<batch>.<n>`, so undoing one undoes them all.
 */
export function batchPaymentIds(count: number): string[] {
  const batch = newId();
  return Array.from({ length: count }, (_, index) => `${batch}.${index}`);
}

/**
 * The rows that undo a payment: it, and every other payment recorded in the
 * same act. The batch is matched as an exact prefix, never as a pattern.
 */
export function undonePaymentRows(
  settlementId: string,
  settlements: readonly AlbumSettlement[],
): GroupRowWrite[] {
  const dot = settlementId.indexOf('.');
  const prefix = dot >= 0 ? settlementId.slice(0, dot + 1) : null;
  return settlements
    .filter(
      (item) =>
        !item.deletedAt &&
        (prefix ? item.id.slice(0, prefix.length) === prefix : item.id === settlementId),
    )
    .map((item) => ({ table: 'album_settlements', row: { id: item.id, deleted_at: 'undone' } }));
}

/** The user's own name in the album. */
export function renameRow(memberId: string, name: string): GroupRowWrite {
  return { table: 'album_members', row: { id: memberId, name } };
}

/** The group's settings: Simplify, the cover (null: removed). */
export function settingsRow(
  groupId: string,
  settings: { simplifyDebts?: boolean; coverPhotoUri?: string | null },
): GroupRowWrite {
  const row: Record<string, unknown> = { id: groupId };
  if (settings.simplifyDebts !== undefined) row.simplify_debts = settings.simplifyDebts ? 1 : 0;
  if (settings.coverPhotoUri !== undefined) row.cover_photo_uri = settings.coverPhotoUri ?? '';
  return { table: 'album_groups', row };
}
