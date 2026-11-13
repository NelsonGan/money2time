// A shared album's group: its members, bills and settlements (migration 090).
// These rows sync with the group's own cloud database, not the user's: their
// `ledger_id` is the group's id (features/cloudSync/lib/ledgerRows.ts).

import { and, eq, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import {
  albumExpensesTable,
  albumGroupsTable,
  albumMembersTable,
  albumSettlementsTable,
} from '~/lib/db/schema';
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

/**
 * Far more member rows than a group ever has (20 people and the user, and
 * the ones since removed). A group is read no further than this, so nobody
 * in it can make every phone work through thousands of made-up people.
 */
const MAX_MEMBER_ROWS = 200;

const present = <T>(value: T | null): value is T => value !== null;

function sharesJson(shares: readonly AlbumShare[]): string {
  return JSON.stringify(
    shares.map((share) => ({
      memberId: share.memberId,
      amount: normalizeMoneyAmount(share.amount),
    })),
  );
}

/** The key of the user's own split row of a group's bill on their phone (`<bill>:self`). */
const SELF_ROW_KEY = 'self';

class AlbumGroupsRepository {
  // -------------------------------------------------------------------------
  // Members

  /** The group's people, in the order they were added. */
  listMembers(groupId: string): AlbumMember[] {
    return this.listAllMembers(groupId).filter((member) => !member.deletedAt);
  }

  /** Every member row, removed ones too: a bill keeps the name of someone who left. */
  listAllMembers(groupId: string): AlbumMember[] {
    return getDb()
      .select()
      .from(albumMembersTable)
      .where(eq(albumMembersTable.ledgerId, groupId))
      .orderBy(albumMembersTable.sortOrder, albumMembersTable.createdAt, albumMembersTable.id)
      .limit(MAX_MEMBER_ROWS)
      .all()
      .map(toAlbumMember)
      .filter(present);
  }

  /**
   * The ids a bill or a payment of the group may name: its members, removed
   * ones too. A caller reading bills and payments together passes it to both.
   */
  memberIds(groupId: string): Set<string> {
    return new Set(this.listAllMembers(groupId).map((member) => member.id));
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
    return {
      id: row.id,
      groupId,
      name: row.name,
      userId: row.userId,
      sortOrder: row.sortOrder,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  // Every change names its group as well as the row: ids are the group's to
  // choose, and one group's row must never be reached through another's.

  updateMember(
    groupId: string,
    id: string,
    updates: { name?: string; userId?: string | null },
  ): void {
    getDb()
      .update(albumMembersTable)
      .set({ ...updates, updatedAt: nowIso() })
      .where(and(eq(albumMembersTable.ledgerId, groupId), eq(albumMembersTable.id, id)))
      .run();
  }

  softDeleteMember(groupId: string, id: string): void {
    const now = nowIso();
    getDb()
      .update(albumMembersTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(albumMembersTable.ledgerId, groupId),
          eq(albumMembersTable.id, id),
          isNull(albumMembersTable.deletedAt),
        ),
      )
      .run();
  }

  // -------------------------------------------------------------------------
  // Bills

  /**
   * Every bill of the group, deleted ones too (a phone removes its own side
   * of those). A bill counts only between the group's own members: one paid
   * by nobody in it is left out, and so is a share of nobody's.
   */
  listExpenses(groupId: string, members = this.memberIds(groupId)): AlbumExpense[] {
    return getDb()
      .select()
      .from(albumExpensesTable)
      .where(eq(albumExpensesTable.ledgerId, groupId))
      .all()
      .map(toAlbumExpense)
      .filter(present)
      .filter((bill) => members.has(bill.paidBy))
      .map((bill) =>
        bill.shares.every((share) => members.has(share.memberId))
          ? bill
          : { ...bill, shares: bill.shares.filter((share) => members.has(share.memberId)) },
      );
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
  softDeleteExpense(groupId: string, id: string): void {
    const now = nowIso();
    getDb()
      .update(albumExpensesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(albumExpensesTable.ledgerId, groupId),
          eq(albumExpensesTable.id, id),
          isNull(albumExpensesTable.deletedAt),
        ),
      )
      .run();
    getDb()
      .update(albumSettlementsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(albumSettlementsTable.ledgerId, groupId),
          eq(albumSettlementsTable.expenseId, id),
          isNull(albumSettlementsTable.deletedAt),
        ),
      )
      .run();
  }

  // -------------------------------------------------------------------------
  // Settlements

  /**
   * Every settlement of the group, undone ones too (a phone undoes its own
   * side of those), between its own members only.
   */
  listSettlements(groupId: string, members = this.memberIds(groupId)): AlbumSettlement[] {
    return getDb()
      .select()
      .from(albumSettlementsTable)
      .where(eq(albumSettlementsTable.ledgerId, groupId))
      .orderBy(albumSettlementsTable.createdAt, albumSettlementsTable.id)
      .all()
      .map(toAlbumSettlement)
      .filter(present)
      .filter(
        (payment) =>
          members.has(payment.fromMember) &&
          members.has(payment.toMember) &&
          // A payment's row on a phone is `<bill>:<payment id>`, beside
          // `<bill>:<member id>` and `<bill>:self`: an id that is one of those
          // would take another row's place.
          !members.has(payment.id) &&
          payment.id !== SELF_ROW_KEY,
      );
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

  /**
   * Records several payments as one act (a debt paid along a chain of bills):
   * all of them or none, under ids that say they belong together
   * (`<batch>.<n>`), so undoing one undoes them all. Returns their ids, in
   * the order given.
   */
  createSettlements(
    groupId: string,
    payments: readonly Pick<
      AlbumSettlementInput,
      'expenseId' | 'fromMember' | 'toMember' | 'amount' | 'currency'
    >[],
    stamp: Pick<AlbumSettlementInput, 'date' | 'createdBy'>,
  ): string[] {
    const batch = newId();
    const ids = payments.map((_, index) => `${batch}.${index}`);
    getSQLite().withTransactionSync(() => {
      payments.forEach((payment, index) => {
        this.createSettlement({ ...payment, ...stamp, groupId, id: ids[index] });
      });
    });
    return ids;
  }

  /**
   * Undoes a payment of the group, and with it every other payment recorded
   * in the same act. The batch is matched as an exact prefix, in this group
   * alone: an id is the group's to choose, so it is never used as a pattern.
   */
  softDeleteSettlement(groupId: string, id: string): void {
    const now = nowIso();
    const prefix = id.includes('.') ? id.slice(0, id.indexOf('.') + 1) : null;
    getDb()
      .update(albumSettlementsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(albumSettlementsTable.ledgerId, groupId),
          prefix
            ? sql`substr(${albumSettlementsTable.id}, 1, ${prefix.length}) = ${prefix}`
            : eq(albumSettlementsTable.id, id),
          isNull(albumSettlementsTable.deletedAt),
        ),
      )
      .run();
  }

  // -------------------------------------------------------------------------
  // Settings

  /** Whether the group shows its debts simplified; off until someone turns it on. */
  simplifiesDebts(groupId: string): boolean {
    const row = getDb()
      .select({ simplifyDebts: albumGroupsTable.simplifyDebts })
      .from(albumGroupsTable)
      .where(
        and(
          eq(albumGroupsTable.id, groupId),
          eq(albumGroupsTable.ledgerId, groupId),
          isNull(albumGroupsTable.deletedAt),
        ),
      )
      .get();
    return row?.simplifyDebts ?? false;
  }

  setSimplifyDebts(groupId: string, simplifyDebts: boolean): void {
    const now = nowIso();
    getDb()
      .insert(albumGroupsTable)
      .values({
        id: groupId,
        ledgerId: groupId,
        simplifyDebts,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .onConflictDoUpdate({
        target: albumGroupsTable.id,
        set: { simplifyDebts, updatedAt: now, deletedAt: null },
      })
      .run();
  }
}

export const albumGroupsRepository = new AlbumGroupsRepository();
