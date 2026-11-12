// A shared album's group: its members, bills and settlements (migration 090).
// These rows sync with the group's own cloud database, not the user's: their
// `ledger_id` is the group's id (features/cloudSync/lib/ledgerRows.ts).

import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { albumExpensesTable, albumMembersTable, albumSettlementsTable } from '~/lib/db/schema';
import type { AlbumExpense, AlbumMember, AlbumSettlement, AlbumShare } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';

import { toAlbumExpense, toAlbumMember, toAlbumSettlement } from './mappers';

interface AlbumExpenseInput {
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
}

interface AlbumSettlementInput {
  id?: string;
  groupId: string;
  expenseId: string | null;
  fromMember: string;
  toMember: string;
  amount: number;
  currency: string;
  date: string;
  createdBy: string | null;
  /** When the payment was made, for one that predates the group (an album just shared). */
  createdAt?: string;
}

function sharesJson(shares: readonly AlbumShare[]): string {
  return JSON.stringify(
    shares.map((share) => ({
      memberId: share.memberId,
      amount: normalizeMoneyAmount(share.amount),
    })),
  );
}

class AlbumGroupsRepository {
  // -------------------------------------------------------------------------
  // Members

  /** The group's people, in the order they were added. */
  listMembers(groupId: string): AlbumMember[] {
    return getDb()
      .select()
      .from(albumMembersTable)
      .where(and(eq(albumMembersTable.ledgerId, groupId), isNull(albumMembersTable.deletedAt)))
      .orderBy(albumMembersTable.sortOrder, albumMembersTable.createdAt, albumMembersTable.id)
      .all()
      .map(toAlbumMember);
  }

  /** Every member row, removed ones too: a bill keeps the name of someone who left. */
  listAllMembers(groupId: string): AlbumMember[] {
    return getDb()
      .select()
      .from(albumMembersTable)
      .where(eq(albumMembersTable.ledgerId, groupId))
      .orderBy(albumMembersTable.sortOrder, albumMembersTable.createdAt, albumMembersTable.id)
      .all()
      .map(toAlbumMember);
  }

  createMember(
    groupId: string,
    input: { id?: string; name: string; userId?: string | null; sortOrder?: number },
  ): AlbumMember {
    const now = nowIso();
    const row = {
      id: input.id ?? newId(),
      ledgerId: groupId,
      name: input.name,
      userId: input.userId ?? null,
      sortOrder: input.sortOrder ?? this.listAllMembers(groupId).length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    getDb().insert(albumMembersTable).values(row).run();
    return toAlbumMember(row);
  }

  updateMember(id: string, updates: { name?: string; userId?: string | null }): void {
    getDb()
      .update(albumMembersTable)
      .set({ ...updates, updatedAt: nowIso() })
      .where(eq(albumMembersTable.id, id))
      .run();
  }

  softDeleteMember(id: string): void {
    const now = nowIso();
    getDb()
      .update(albumMembersTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(albumMembersTable.id, id), isNull(albumMembersTable.deletedAt)))
      .run();
  }

  // -------------------------------------------------------------------------
  // Bills

  /** Every bill of the group, deleted ones too (a phone removes its own side of those). */
  listExpenses(groupId: string): AlbumExpense[] {
    return getDb()
      .select()
      .from(albumExpensesTable)
      .where(eq(albumExpensesTable.ledgerId, groupId))
      .all()
      .map(toAlbumExpense);
  }

  /** Writes a bill as it now is; one deleted before comes back. */
  upsertExpense(input: AlbumExpenseInput): void {
    const now = nowIso();
    const values = {
      ledgerId: input.groupId,
      date: input.date,
      note: input.note,
      amount: normalizeMoneyAmount(input.amount),
      currency: input.currency,
      categoryName: input.categoryName,
      categoryIcon: input.categoryIcon,
      paidBy: input.paidBy,
      sharesJson: sharesJson(input.shares),
      createdBy: input.createdBy,
      updatedAt: now,
      deletedAt: null,
    };
    getDb()
      .insert(albumExpensesTable)
      .values({ id: input.id, ...values, createdAt: now })
      .onConflictDoUpdate({ target: albumExpensesTable.id, set: values })
      .run();
  }

  /** Deletes a bill for the group, and the payments made on it with it. */
  softDeleteExpense(id: string): void {
    const now = nowIso();
    getDb()
      .update(albumExpensesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(albumExpensesTable.id, id), isNull(albumExpensesTable.deletedAt)))
      .run();
    getDb()
      .update(albumSettlementsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(albumSettlementsTable.expenseId, id), isNull(albumSettlementsTable.deletedAt)))
      .run();
  }

  // -------------------------------------------------------------------------
  // Settlements

  /** Every settlement of the group, undone ones too (a phone undoes its own side of those). */
  listSettlements(groupId: string): AlbumSettlement[] {
    return getDb()
      .select()
      .from(albumSettlementsTable)
      .where(eq(albumSettlementsTable.ledgerId, groupId))
      .orderBy(albumSettlementsTable.createdAt, albumSettlementsTable.id)
      .all()
      .map(toAlbumSettlement);
  }

  createSettlement(input: AlbumSettlementInput): string {
    const id = input.id ?? newId();
    const now = nowIso();
    getDb()
      .insert(albumSettlementsTable)
      .values({
        id,
        ledgerId: input.groupId,
        expenseId: input.expenseId,
        fromMember: input.fromMember,
        toMember: input.toMember,
        amount: normalizeMoneyAmount(input.amount),
        currency: input.currency,
        date: input.date,
        createdBy: input.createdBy,
        createdAt: input.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
      })
      .onConflictDoNothing()
      .run();
    return id;
  }

  softDeleteSettlement(id: string): void {
    const now = nowIso();
    getDb()
      .update(albumSettlementsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(albumSettlementsTable.id, id), isNull(albumSettlementsTable.deletedAt)))
      .run();
  }
}

export const albumGroupsRepository = new AlbumGroupsRepository();
