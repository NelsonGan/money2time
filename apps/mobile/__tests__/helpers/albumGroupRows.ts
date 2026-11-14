// A shared album's group rows as the Worker writes them (apps/cloudflare/
// workers/cloud-sync/src/albumGroups.ts) and a phone receives them: tests
// put them straight into the app database, since the phone itself never
// writes the group.

import { getSQLite } from '~/lib/db/client';
import type { AlbumShare } from '~/types';
import { newId } from '~/utils/id';

const NOW = '2026-11-12T00:00:00.000Z';

function run(sql: string, params: (string | number | null)[]) {
  getSQLite().runSync(sql, params);
}

export const groupRows = {
  createMember(
    groupId: string,
    input: { id?: string; name: string; userId?: string | null; sortOrder?: number },
  ): string {
    const id = input.id ?? newId();
    const count = getSQLite().getFirstSync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM album_members WHERE ledger_id = ?',
      [groupId],
    );
    run(
      `INSERT INTO album_members (id, ledger_id, name, user_id, sort_order, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      [id, groupId, input.name, input.userId ?? null, input.sortOrder ?? count?.n ?? 0, NOW, NOW],
    );
    return id;
  },

  updateMember(groupId: string, id: string, updates: { name?: string; userId?: string | null }) {
    if (updates.name !== undefined) {
      run('UPDATE album_members SET name = ? WHERE ledger_id = ? AND id = ?', [
        updates.name,
        groupId,
        id,
      ]);
    }
    if (updates.userId !== undefined) {
      run('UPDATE album_members SET user_id = ? WHERE ledger_id = ? AND id = ?', [
        updates.userId,
        groupId,
        id,
      ]);
    }
  },

  /** A bill as the Worker writes it: added, edited or restored; `createdBy` is its last writer. */
  upsertExpense(input: {
    id: string;
    groupId: string;
    date: string;
    note: string | null;
    amount: number;
    currency: string;
    categoryName: string | null;
    categoryIcon: string | null;
    paidBy: string;
    shares: AlbumShare[];
    createdBy: string | null;
  }) {
    run(
      `INSERT INTO album_expenses (id, ledger_id, date, note, amount, currency, category_name,
         category_icon, paid_by, shares_json, created_by, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET date = excluded.date, note = excluded.note,
         amount = excluded.amount, currency = excluded.currency, paid_by = excluded.paid_by,
         shares_json = excluded.shares_json, created_by = excluded.created_by,
         updated_at = excluded.updated_at, deleted_at = NULL`,
      [
        input.id,
        input.groupId,
        input.date,
        input.note,
        input.amount,
        input.currency,
        input.categoryName,
        input.categoryIcon,
        input.paidBy,
        JSON.stringify(input.shares),
        input.createdBy,
        NOW,
        NOW,
      ],
    );
  },

  /** A bill deleted for everyone. Its payments stay. */
  softDeleteExpense(groupId: string, id: string, deletedBy: string | null) {
    run('UPDATE album_expenses SET deleted_at = ?, created_by = ? WHERE ledger_id = ? AND id = ?', [
      NOW,
      deletedBy,
      groupId,
      id,
    ]);
  },

  createSettlement(input: {
    id?: string;
    groupId: string;
    expenseId: string | null;
    fromMember: string;
    toMember: string;
    amount: number;
    currency: string;
    date: string;
    createdBy: string | null;
    createdAt?: string;
  }): string {
    const id = input.id ?? newId();
    run(
      `INSERT INTO album_settlements (id, ledger_id, expense_id, from_member, to_member, amount,
         currency, date, created_by, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        input.groupId,
        input.expenseId,
        input.fromMember,
        input.toMember,
        input.amount,
        input.currency,
        input.date,
        input.createdBy,
        input.createdAt ?? NOW,
        NOW,
      ],
    );
    return id;
  },

  /** Payments recorded as one act, under `<batch>.<n>` ids. */
  createSettlements(
    groupId: string,
    payments: {
      expenseId: string | null;
      fromMember: string;
      toMember: string;
      amount: number;
      currency: string;
    }[],
    stamp: { date: string; createdBy: string | null },
  ): string[] {
    const batch = newId();
    return payments.map((payment, index) =>
      groupRows.createSettlement({ ...payment, ...stamp, groupId, id: `${batch}.${index}` }),
    );
  },

  /** A payment undone, with every payment of its act. */
  softDeleteSettlement(groupId: string, id: string) {
    const prefix = id.includes('.') ? id.slice(0, id.indexOf('.') + 1) : null;
    if (prefix) {
      run(
        `UPDATE album_settlements SET deleted_at = ? WHERE ledger_id = ?
           AND substr(id, 1, ?) = ? AND deleted_at IS NULL`,
        [NOW, groupId, prefix.length, prefix],
      );
    } else {
      run(
        'UPDATE album_settlements SET deleted_at = ? WHERE ledger_id = ? AND id = ? AND deleted_at IS NULL',
        [NOW, groupId, id],
      );
    }
  },

  setSimplifyDebts(groupId: string, simplify: boolean) {
    run(
      `INSERT INTO album_groups (id, ledger_id, simplify_debts, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET simplify_debts = excluded.simplify_debts`,
      [groupId, groupId, simplify ? 1 : 0, NOW, NOW],
    );
  },

  /** The group's cover (`null`: removed). */
  setGroupCover(groupId: string, cover: string | null) {
    run(
      `INSERT INTO album_groups (id, ledger_id, simplify_debts, cover_photo_uri, created_at, updated_at, deleted_at)
       VALUES (?, ?, 0, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET cover_photo_uri = excluded.cover_photo_uri`,
      [groupId, groupId, cover ?? '', NOW, NOW],
    );
  },
};
