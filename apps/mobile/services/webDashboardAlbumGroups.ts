import type { BackupData } from '~/services/dataManagementService';
import type { AlbumActivity, AlbumExpense, AlbumMember } from '~/types';

/**
 * A shared album's group as this phone holds it, read for the Web Dashboard:
 * its live members, every bill (deleted ones too, which the Activity tab can
 * restore) and its activity log, newest first.
 */
export type WebAlbumGroup = {
  /** The group's id, which is its album's. */
  albumId: string;
  /** The user's own member, or null until they are on its list. */
  selfId: string | null;
  members: readonly AlbumMember[];
  bills: readonly AlbumExpense[];
  activity: readonly AlbumActivity[];
};

/**
 * The data as a page that names `shared-albums` is sent it: the backup's
 * tables, plus each shared album's group (README: Web-dashboard Worker > Page
 * features). The group's own tables are left out of backups on purpose, so
 * these are built here, only for the dashboard, and only for albums the data
 * holds (the open ledger's). Each row has a unique `id`, so a patch carries
 * only the rows that changed. Nothing in them names a Cloud Sync account: a
 * member says only whether they are the user (`is_self`) and still in the
 * album (`current`), and an activity entry only which member made it.
 *
 *   web_album_members   { id, album_id, name, is_self, current, sort_order }
 *   web_album_bills     { id, album_id, date, note, amount, currency, paid_by,
 *                         shares: [{ memberId, amount }], deleted, updated_at }
 *   web_album_activity  { id, album_id, kind, actor_member_id, expense_id,
 *                         member_id, bill, rename, payment, simplify,
 *                         sort_order, created_at }  (newest first)
 */
export function withWebDashboardAlbumGroups(
  data: BackupData,
  groups: readonly WebAlbumGroup[],
): BackupData {
  const albums = new Set(
    (data.tables.albums ?? []).filter((row) => !row.deleted_at).map((row) => row.id),
  );
  const shown = groups.filter((group) => albums.has(group.albumId));
  const members: Record<string, unknown>[] = [];
  const bills: Record<string, unknown>[] = [];
  const activity: Record<string, unknown>[] = [];
  for (const group of shown) {
    for (const member of group.members) {
      if (member.deletedAt) continue;
      members.push({
        id: member.id,
        album_id: group.albumId,
        name: member.name,
        is_self: member.id === group.selfId ? 1 : 0,
        // As groupRules' `isCurrentMember`: joined with an account, and not gone.
        current: member.userId ? 1 : 0,
        sort_order: member.sortOrder,
      });
    }
    for (const bill of group.bills) {
      bills.push({
        id: bill.id,
        album_id: group.albumId,
        date: bill.date,
        note: bill.note,
        amount: bill.amount,
        currency: bill.currency,
        paid_by: bill.paidBy,
        shares: bill.shares.map((share) => ({ memberId: share.memberId, amount: share.amount })),
        deleted: bill.deletedAt ? 1 : 0,
        updated_at: bill.updatedAt,
      });
    }
    for (const entry of group.activity) {
      activity.push({
        id: entry.id,
        album_id: group.albumId,
        kind: entry.kind,
        actor_member_id: entry.actorMemberId,
        expense_id: entry.expenseId,
        member_id: entry.memberId,
        bill: entry.bill,
        rename: entry.rename,
        payment: entry.payment,
        simplify: entry.simplify,
        sort_order: entry.sortOrder,
        created_at: entry.createdAt,
      });
    }
  }
  return {
    ...data,
    tables: {
      ...data.tables,
      web_album_members: members,
      web_album_bills: bills,
      web_album_activity: activity,
    },
  };
}
