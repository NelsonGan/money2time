// A shared album's group on this phone: its members as the screens read
// them, and the local work when an album starts or stops being shared. No
// React here: Cloud Sync calls it between syncs.
// See README.md > Album members and shared albums.

import { deleteGroupRowsLocally } from '~/features/cloudSync/services/ledgerChannels';
import { sharedLedgerFor } from '~/features/cloudSync/services/sharedLedgerStore';
import { getSQLite } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { I18n } from '~/lib/i18n';
import { albumGroupsRepository } from '~/lib/repositories/albumGroupsRepository';
import { getAlbumCoverUri } from '~/services/userAssets';
import type { AlbumActivity, AlbumExpense, AlbumMember, AlbumSettlement } from '~/types';
import { nowIso } from '~/utils/id';

import { cleanPersonName } from '../lib/albumPeople';
import { GROUP_COVER_PATH } from '../lib/groupPlan';

const cache = new Map<string, AlbumMember[]>();
const expenseCache = new Map<string, AlbumExpense[]>();
const allBillsCache = new Map<string, AlbumExpense[]>();
const settlementCache = new Map<string, AlbumSettlement[]>();
const simplifyCache = new Map<string, boolean>();
const activityCache = new Map<string, AlbumActivity[]>();
const listeners = new Set<() => void>();
const NO_MEMBERS: AlbumMember[] = [];
const NO_EXPENSES: AlbumExpense[] = [];
const NO_SETTLEMENTS: AlbumSettlement[] = [];
const NO_ACTIVITY: AlbumActivity[] = [];
/** What each reader last handed out, kept across `notifyAlbumGroups`. */
const handedOut = new Map<string, { rows: unknown[]; json: string }>();

/**
 * The array a reader handed out last time when the rows read now are the
 * same: every sync asks readers to look again, and a screen re-renders only
 * when its group's rows really changed (`useSyncExternalStore` compares by
 * identity).
 */
function unchanged<T>(key: string, rows: T[]): T[] {
  const json = JSON.stringify(rows);
  const last = handedOut.get(key);
  if (last && last.json === json) return last.rows as T[];
  handedOut.set(key, { rows, json });
  return rows;
}

/** A group's rows may have changed (a sync, an edit, a share or its end): readers look again. */
export function notifyAlbumGroups(): void {
  cache.clear();
  expenseCache.clear();
  allBillsCache.clear();
  settlementCache.clear();
  simplifyCache.clear();
  activityCache.clear();
  for (const listener of listeners) listener();
}

export function subscribeAlbumGroups(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A group's live members. The same array until something changes, so a hook can hold it. */
export function listGroupMembers(groupId: string | null): AlbumMember[] {
  if (!groupId) return NO_MEMBERS;
  const known = cache.get(groupId);
  if (known) return known;
  const members = unchanged(`members:${groupId}`, albumGroupsRepository.listMembers(groupId));
  cache.set(groupId, members);
  return members;
}

/**
 * Every bill of a group, deleted ones too: a deleted bill's payments still
 * count in Balances (owed back). The same array until something changes.
 */
export function listGroupBills(groupId: string | null): AlbumExpense[] {
  if (!groupId) return NO_EXPENSES;
  const known = allBillsCache.get(groupId);
  if (known) return known;
  const bills = unchanged(`bills:${groupId}`, albumGroupsRepository.listExpenses(groupId));
  allBillsCache.set(groupId, bills);
  return bills;
}

/** A group's bills that still stand. The same array until something changes. */
export function listGroupExpenses(groupId: string | null): AlbumExpense[] {
  if (!groupId) return NO_EXPENSES;
  const known = expenseCache.get(groupId);
  if (known) return known;
  const expenses = unchanged(
    `expenses:${groupId}`,
    listGroupBills(groupId).filter((item) => !item.deletedAt),
  );
  expenseCache.set(groupId, expenses);
  return expenses;
}

/** A group's payments that still stand. The same array until something changes. */
export function listGroupSettlements(groupId: string | null): AlbumSettlement[] {
  if (!groupId) return NO_SETTLEMENTS;
  const known = settlementCache.get(groupId);
  if (known) return known;
  const settlements = unchanged(
    `settlements:${groupId}`,
    albumGroupsRepository.listSettlements(groupId).filter((item) => !item.deletedAt),
  );
  settlementCache.set(groupId, settlements);
  return settlements;
}

/** A group's activity log, newest first. The same array until something changes. */
export function listGroupActivity(groupId: string | null): AlbumActivity[] {
  if (!groupId) return NO_ACTIVITY;
  const known = activityCache.get(groupId);
  if (known) return known;
  const activity = unchanged(`activity:${groupId}`, albumGroupsRepository.listActivity(groupId));
  activityCache.set(groupId, activity);
  return activity;
}

/** Whether the group has "Simplify group debts" on. */
export function groupSimplifiesDebts(groupId: string): boolean {
  const known = simplifyCache.get(groupId);
  if (known !== undefined) return known;
  const simplifies = albumGroupsRepository.simplifiesDebts(groupId);
  simplifyCache.set(groupId, simplifies);
  return simplifies;
}

interface AlbumRow {
  id: string;
  ledger_id: string;
  name: string;
  cover_photo_uri: string | null;
  deleted_at: string | null;
  share_ended_at: string | null;
}

function albumRow(albumId: string): AlbumRow | null {
  return getSQLite().getFirstSync<AlbumRow>(
    'SELECT id, ledger_id, name, cover_photo_uri, deleted_at, share_ended_at FROM albums WHERE id = ?',
    [albumId],
  );
}

/** Whether the album was deleted on this phone (in any ledger). */
export function isAlbumDeleted(albumId: string): boolean {
  return !!albumRow(albumId)?.deleted_at;
}

/** The ledger an album is in, whichever one is open. */
export function albumLedgerId(albumId: string): string | null {
  return albumRow(albumId)?.ledger_id ?? null;
}

/**
 * Whether this phone can hold a shared album. Shared albums live in one
 * place, the user's main ledger, and only while that ledger is not itself
 * shared: a group's bills then never land among entries that belong to other
 * people, and nothing has to follow an album between ledgers.
 */
export function mainLedgerTakesSharedAlbums(): boolean {
  return sharedLedgerFor(DEFAULT_LEDGER_ID) === null;
}

/**
 * The album a group this phone joined shows as: made here, with the group's
 * id, in the user's main ledger (`mainLedgerTakesSharedAlbums`). Left alone
 * when it is already here, so two phones of one person agree on it once their
 * own data syncs; one deleted here and then joined again comes back, with the
 * entries it held.
 */
export function ensureLocalAlbum(share: { ledgerId: string; name: string | null }): void {
  const now = nowIso();
  const db = getSQLite();
  const existing = albumRow(share.ledgerId);
  if (existing) {
    // Back in it (signed in again, joined again): no longer frozen, and out
    // of Archived unless the user had archived it themselves.
    if (existing.share_ended_at) {
      db.runSync(
        `UPDATE albums SET share_ended_at = NULL,
           archived_at = CASE WHEN archived_at = share_ended_at THEN NULL ELSE archived_at END,
           updated_at = ?
         WHERE id = ?`,
        [now, share.ledgerId],
      );
    }
    if (existing.deleted_at) {
      db.withTransactionSync(() => {
        db.runSync('UPDATE albums SET deleted_at = NULL, updated_at = ? WHERE id = ?', [
          now,
          share.ledgerId,
        ]);
        // Its entries come back with it (deleting the album stamped their
        // links with the same time), so the group's bills find the user's
        // own entries again rather than leaving them outside the album. One
        // put in another album since stays there (an entry is in one album);
        // a bill of the group comes back as the group is projected.
        // One link per entry, the lowest id where an older version left two.
        db.runSync(
          `UPDATE album_transactions SET deleted_at = NULL, updated_at = ?
           WHERE album_id = ? AND deleted_at = ?
             AND transaction_id NOT IN (
               SELECT transaction_id FROM album_transactions WHERE deleted_at IS NULL
             )
             AND id = (
               SELECT MIN(o.id) FROM album_transactions o
               WHERE o.transaction_id = album_transactions.transaction_id
                 AND o.album_id = album_transactions.album_id
                 AND o.deleted_at = album_transactions.deleted_at
             )`,
          [now, share.ledgerId, existing.deleted_at],
        );
      });
    }
    return;
  }
  const top = db.getFirstSync<{ top: number | null }>(
    'SELECT MIN(sort_order) AS top FROM albums WHERE ledger_id = ? AND deleted_at IS NULL',
    [DEFAULT_LEDGER_ID],
  );
  db.runSync(
    `INSERT INTO albums (id, ledger_id, name, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)`,
    [
      share.ledgerId,
      DEFAULT_LEDGER_ID,
      cleanPersonName(share.name ?? '') || I18n.t('albums.untitled'),
      (top?.top ?? 0) - 1,
      now,
      now,
    ],
  );
}

/**
 * The album's cover as the group can take it (an image of the album-cover
 * store), or null: published to the group as the album is shared.
 */
export function albumCoverPath(albumId: string): string | null {
  const cover = albumRow(albumId)?.cover_photo_uri ?? null;
  return cover && GROUP_COVER_PATH.test(cover) ? cover : null;
}

/**
 * A shared album's cover is the group's, the same on every phone: whoever
 * changes it changes it for everyone (`updateAlbum` writes the group's), and
 * each phone takes the group's cover onto its own album here, once its image
 * has come down with the group's rows: until then the album keeps the cover
 * it shows, and a later sync takes it. Returns whether the album changed.
 */
export function syncAlbumCover(groupId: string): boolean {
  const album = albumRow(groupId);
  if (!album || album.deleted_at) return false;
  const cover = albumGroupsRepository.groupCover(groupId);
  if (cover === undefined) return false;
  if (cover === (album.cover_photo_uri ?? null)) return false;
  if (cover !== null && !getAlbumCoverUri(cover)) return false;
  getSQLite().runSync('UPDATE albums SET cover_photo_uri = ?, updated_at = ? WHERE id = ?', [
    cover,
    nowIso(),
    groupId,
  ]);
  return true;
}

/**
 * An album that is no longer shared on this phone (sharing stopped, the user
 * left or was removed, or signed out): it is kept as it was, archived and
 * read-only. The group's rows leave the phone without recording deletions,
 * since the group is not this phone's to delete, and the group keeps
 * everything the user wrote, so nobody else's bills or balances change; the
 * user's own entries for its bills stay, as ordinary split bills (settled on
 * the Balances page), with their album categories.
 */
export function releaseAlbumGroup(groupId: string): void {
  const db = getSQLite();
  const now = nowIso();
  db.runSync(
    'UPDATE transactions SET album_group_id = NULL, updated_at = ? WHERE album_group_id = ?',
    [now, groupId],
  );
  // Kept as it was, archived and read-only, never deleted: its entries keep
  // their album categories (README: Album members and shared albums >
  // Leaving and stopping). Being back in it undoes this (`ensureLocalAlbum`),
  // which tells an archive made here (`archived_at` = `share_ended_at`) from
  // the user's own; one the user made this same millisecond ends a
  // millisecond later, so it is never taken for this one.
  const archivedAt = db.getFirstSync<{ archived_at: string | null }>(
    'SELECT archived_at FROM albums WHERE id = ?',
    [groupId],
  )?.archived_at;
  const endedAt = archivedAt === now ? new Date(Date.parse(now) + 1).toISOString() : now;
  db.runSync(
    `UPDATE albums SET share_ended_at = ?, archived_at = COALESCE(archived_at, ?),
       is_active = 0, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL AND share_ended_at IS NULL`,
    [endedAt, endedAt, now, groupId],
  );
  deleteGroupRowsLocally(groupId);
  notifyAlbumGroups();
}
