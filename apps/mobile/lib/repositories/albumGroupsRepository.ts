// A shared album's group: its members, bills, settlements, settings and
// activity log and categories (migrations 090-093, 097). These rows sync with the group's own
// cloud database; on the phone they are only read here, and written by
// features/albums/services/albumGroupWrites.ts alone.
// Their `ledger_id` is the group's id (features/cloudSync/lib/ledgerRows.ts).

import { and, desc, eq, isNull } from 'drizzle-orm';

import {
  ALBUM_CATEGORIES,
  ALBUM_CATEGORY_OTHER,
  type AlbumCategoryDef,
  albumCategoryList,
  categoryRowId,
  GROUP_COVER_PATH,
  MAX_ALBUM_CATEGORIES,
  MAX_MEMBER_ROWS,
} from '~/features/albums/lib/groupPlan';
import { getDb } from '~/lib/db/client';
import {
  albumActivityTable,
  albumCategoriesTable,
  albumExpensesTable,
  albumGroupsTable,
  albumMembersTable,
  albumSettlementsTable,
} from '~/lib/db/schema';
import type { AlbumActivity, AlbumExpense, AlbumMember, AlbumSettlement } from '~/types';

import { toAlbumActivity, toAlbumExpense, toAlbumMember, toAlbumSettlement } from './mappers';

/** The newest this many entries of an album's log are read; older ones stay in its database. */
const MAX_ACTIVITY_ROWS = 1000;

const present = <T>(value: T | null): value is T => value !== null;

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

  // -------------------------------------------------------------------------
  // Bills

  /**
   * Every bill of the group, deleted ones too (a phone removes its own side
   * of those). A bill counts only between the group's own members: one paid
   * by nobody in it is left out, and so is a share of nobody's.
   */
  listExpenses(groupId: string, members = this.memberIds(groupId)): AlbumExpense[] {
    // A bill of a category the album no longer has is filed under Other.
    const keys = new Set(this.listCategories(groupId).map((category) => category.key));
    return getDb()
      .select()
      .from(albumExpensesTable)
      .where(eq(albumExpensesTable.ledgerId, groupId))
      .all()
      .map(toAlbumExpense)
      .filter(present)
      .filter((bill) => members.has(bill.paidBy))
      .map((bill) => (keys.has(bill.category) ? bill : { ...bill, category: ALBUM_CATEGORY_OTHER }))
      .map((bill) =>
        bill.shares.every((share) => members.has(share.memberId))
          ? bill
          : { ...bill, shares: bill.shares.filter((share) => members.has(share.memberId)) },
      );
  }

  // -------------------------------------------------------------------------
  // Categories

  /**
   * The album's categories, in order: the defaults as it changed them and
   * the ones it added (`albumCategoryList`). A row counts only under the id
   * its album and key make, so one key has one row.
   */
  listCategories(groupId: string): AlbumCategoryDef[] {
    const rows = getDb()
      .select()
      .from(albumCategoriesTable)
      .where(eq(albumCategoriesTable.ledgerId, groupId))
      .limit(MAX_ALBUM_CATEGORIES * 4 + ALBUM_CATEGORIES.length)
      .all()
      .filter((row) => row.id === categoryRowId(groupId, row.key))
      .map((row) => ({
        key: row.key,
        name: row.name,
        icon: row.icon,
        sort_order: row.sortOrder,
        deleted_at: row.deletedAt,
      }));
    return albumCategoryList(rows);
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

  /**
   * The group's cover photo: a path of the album-cover store, null once
   * someone removed it, or undefined while nobody has set one. Anyone in the
   * group writes this row, so a value that is not a cover path the app makes
   * reads as unset.
   */
  groupCover(groupId: string): string | null | undefined {
    const row = getDb()
      .select({ cover: albumGroupsTable.coverPhotoUri })
      .from(albumGroupsTable)
      .where(
        and(
          eq(albumGroupsTable.id, groupId),
          eq(albumGroupsTable.ledgerId, groupId),
          isNull(albumGroupsTable.deletedAt),
        ),
      )
      .get();
    if (row?.cover == null) return undefined;
    if (row.cover === '') return null;
    return GROUP_COVER_PATH.test(row.cover) ? row.cover : undefined;
  }

  // -------------------------------------------------------------------------
  // Activity

  /**
   * The group's activity log, newest first: one entry per change, the
   * entries of one change in the order it wrote them.
   */
  listActivity(groupId: string): AlbumActivity[] {
    return getDb()
      .select()
      .from(albumActivityTable)
      .where(eq(albumActivityTable.ledgerId, groupId))
      .orderBy(desc(albumActivityTable.createdAt), desc(albumActivityTable.sortOrder))
      .limit(MAX_ACTIVITY_ROWS)
      .all()
      .map(toAlbumActivity)
      .filter(present);
  }
}

export const albumGroupsRepository = new AlbumGroupsRepository();
