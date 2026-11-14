// A shared album's group: its members, bills, settlements, settings and
// activity log (migrations 090-093). These rows come from the group's own
// cloud database, which only the Worker writes (features/albums/services/
// albumGroupWrites.ts sends it the changes): on the phone they are only read.
// Their `ledger_id` is the group's id (features/cloudSync/lib/ledgerRows.ts).

import { and, desc, eq, isNull } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import {
  albumActivityTable,
  albumExpensesTable,
  albumGroupsTable,
  albumMembersTable,
  albumSettlementsTable,
} from '~/lib/db/schema';
import type { AlbumActivity, AlbumExpense, AlbumMember, AlbumSettlement } from '~/types';

import { toAlbumActivity, toAlbumExpense, toAlbumMember, toAlbumSettlement } from './mappers';

/**
 * Far more member rows than a group ever has (20 people and the user, and
 * the ones since removed). A group is read no further than this, so nobody
 * in it can make every phone work through thousands of made-up people.
 */
const MAX_MEMBER_ROWS = 200;

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
   * The group's activity log, newest first: one entry per change the Worker
   * wrote, the entries of one change in the order it wrote them.
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

/** The paths `saveAlbumCover` makes: `album-covers/<id>.<ext>`. */
export const GROUP_COVER_PATH = /^album-covers\/[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9]{1,5}$/;

export const albumGroupsRepository = new AlbumGroupsRepository();
