// Routing synced rows between the user's own cloud copy and shared ledgers'
// databases, and the local work when a ledger starts or stops being shared.
// See README.md > Cloud Sync > Shared ledgers.

import { getSQLite } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';

import { ENQUEUE_ROW_SQL } from '../lib/capture';
import {
  inLedgersSql,
  isLedgerScoped,
  LEDGER_CHILD_SYNC_TABLES,
  LEDGER_ROOT_SYNC_TABLES,
  NO_CHANNEL,
  PERSONAL_CHANNEL,
} from '../lib/ledgerRows';
import type { Row } from '../lib/rowCodec';
import { GROUP_SYNC_TABLES, isGroupTable, SYNC_TABLES, type SyncTable } from '../lib/syncTables';
import {
  getDeferredLedgerDeletes,
  listLedgerShares,
  listSharedLedgers,
  sharedAlbumFor,
} from './sharedLedgerStore';

/** The ledger a row belongs to, or null for the user's own tables. */
function ledgerOfRow(table: string, row: Row): string | null {
  if (table === 'ledgers') return typeof row.id === 'string' ? row.id : null;
  if (LEDGER_ROOT_SYNC_TABLES.has(table as SyncTable)) {
    return typeof row.ledger_id === 'string' ? row.ledger_id : DEFAULT_LEDGER_ID;
  }
  const child = LEDGER_CHILD_SYNC_TABLES[table as SyncTable];
  if (!child) return null;
  const [column, parent] = child;
  const parentId = row[column];
  if (typeof parentId !== 'string') return null;
  const parentRow = getSQLite().getFirstSync<Row>(`SELECT * FROM "${parent}" WHERE id = ?`, [
    parentId,
  ]);
  return parentRow ? ledgerOfRow(parent, parentRow) : null;
}

/**
 * The sync channel of a ledger: its share id while shared, none while a
 * joined ledger waits to be deleted, else the user's own.
 */
function channelOfLedger(ledgerId: string | null): string {
  if (!ledgerId) return PERSONAL_CHANNEL;
  if (getDeferredLedgerDeletes().includes(ledgerId)) return NO_CHANNEL;
  // A shared ledger only: a shared album's id never names a ledger's rows.
  return (
    listLedgerShares().find((share) => share.ledgerId === ledgerId)?.shareId ?? PERSONAL_CHANNEL
  );
}

/**
 * The channel a row syncs on. The two kinds of share never cross: a shared
 * album's database carries its group's four tables and nothing else, and a
 * shared ledger's carries none of them. So whoever can write to an album's
 * database (anyone in it) cannot send a ledger, an entry or an account into
 * this phone, whatever `ledger_id` the row claims.
 */
export function channelOfRow(table: string, row: Row): string {
  if (!isLedgerScoped(table)) return PERSONAL_CHANNEL;
  if (isGroupTable(table)) {
    // A group's rows are never the user's own data: with no share to go to
    // (it ended), they go nowhere.
    const groupId = typeof row.ledger_id === 'string' ? row.ledger_id : null;
    // A group's settings are one row, named after the group itself.
    if (table === 'album_groups' && row.id !== groupId) return NO_CHANNEL;
    return (groupId ? sharedAlbumFor(groupId)?.shareId : null) ?? NO_CHANNEL;
  }
  // Most users share no ledger: no lookups then.
  if (!listLedgerShares().length && !getDeferredLedgerDeletes().length) return PERSONAL_CHANNEL;
  return channelOfLedger(ledgerOfRow(table, row));
}

/** The channel a row was last synced on, or null if it never was. */
export function recordedChannel(table: string, id: string): string | null {
  return (
    getSQLite().getFirstSync<{ channel: string }>(
      'SELECT channel FROM sync_row_meta WHERE table_name = ? AND row_id = ?',
      [table, id],
    )?.channel ?? null
  );
}

/** Ids of the ledgers that sync on their own channel. */
export function sharedLedgerIds(): string[] {
  return listSharedLedgers().map((ledger) => ledger.ledgerId);
}

/**
 * SQL condition for "this row is the user's own, not in a shared ledger".
 * Never true of a shared album's group: its rows are not the user's data.
 */
export function personalRowsSql(table: string): string {
  if (isGroupTable(table)) return '0';
  return `NOT (${inLedgersSql(table, sharedLedgerIds())})`;
}

/** Queues every row of a ledger, so the next sync sends it where it now belongs. */
export function enqueueLedgerRows(ledgerId: string, onlyUnsyncedOn?: string): void {
  const db = getSQLite();
  db.withTransactionSync(() => {
    for (const table of SYNC_TABLES) {
      if (!isLedgerScoped(table)) continue;
      const unsynced = onlyUnsyncedOn
        ? ` AND id NOT IN (SELECT row_id FROM sync_row_meta WHERE table_name = '${table}' AND channel = ?)`
        : '';
      const ids = db.getAllSync<{ id: string }>(
        `SELECT id FROM "${table}" WHERE ${inLedgersSql(table, [ledgerId])}${unsynced}`,
        onlyUnsyncedOn ? [onlyUnsyncedOn] : [],
      );
      for (const { id } of ids) db.runSync(ENQUEUE_ROW_SQL, [table, id]);
    }
  });
}

/** Forgets what a channel knew: its revisions and its image queues. */
export function forgetChannel(channel: string): void {
  getSQLite().runSync('DELETE FROM sync_row_meta WHERE channel = ?', [channel]);
  getSQLite().runSync('DELETE FROM sync_media_pending WHERE channel = ?', [channel]);
  getSQLite().runSync('DELETE FROM sync_media_missing WHERE channel = ?', [channel]);
  getSQLite().runSync('DELETE FROM sync_state WHERE key IN (?, ?, ?, ?, ?)', [
    attachedKey(channel),
    detachedKey(channel),
    unpushedKey(channel),
    `apply_pending:${channel}`,
    `restore:${channel}`,
  ]);
}

/** sync_state key: the ledger's channel has taken the cloud copy and sent this phone's rows. */
export function attachedKey(channel: string): string {
  return `attached:${channel}`;
}

/** sync_state key: rows were flushed into the channel's replica and not pushed yet. */
export function unpushedKey(channel: string): string {
  return `unpushed:${channel}`;
}

/** sync_state key: the ledger's rows have left the user's own cloud copy. */
export function detachedKey(channel: string): string {
  return `detached:${channel}`;
}

/**
 * Deletes every ledger row that is the user's own (a reset): every ledger but
 * the default one, which stays unnamed, and every row in them. Shared ledgers
 * stay: they are other people's books too, and the deletions sync. Leaving or
 * no longer sharing a ledger is what removes it. Children go first, while
 * their parents still say which ledger they are in.
 */
export function deletePersonalLedgerRows(): void {
  const db = getSQLite();
  for (const table of [...SYNC_TABLES].filter(isLedgerScoped).reverse()) {
    const where = personalRowsSql(table);
    db.runSync(
      table === 'ledgers'
        ? `DELETE FROM ledgers WHERE id <> '${DEFAULT_LEDGER_ID}' AND ${where}`
        : `DELETE FROM "${table}" WHERE ${where}`,
    );
  }
  db.runSync('UPDATE ledgers SET name = NULL, emoji = NULL, prefs_json = NULL WHERE id = ?', [
    DEFAULT_LEDGER_ID,
  ]);
}

/**
 * Deletes a ledger and everything in it from this phone without recording the
 * deletion for sync: a member's copy of a ledger they no longer have access
 * to. Children go first, while their parents still say which ledger they are in.
 */
export function deleteLedgerLocally(ledgerId: string): void {
  const db = getSQLite();
  const order = [...SYNC_TABLES].filter(isLedgerScoped).reverse();
  withoutCapture(() => {
    for (const table of order) deleteUnrecorded(table, inLedgersSql(table, [ledgerId]));
    db.runSync('DELETE FROM auto_log_captures WHERE ledger_id = ?', [ledgerId]);
    db.runSync('UPDATE settings SET active_ledger_id = NULL WHERE active_ledger_id = ?', [
      ledgerId,
    ]);
  });
}

/**
 * Deletes a shared album's group from this phone without recording the
 * deletion: the group is not this phone's to delete. Only the group's own
 * tables, by the group's id: nothing else on the phone is ever a group's,
 * whatever id the group was given.
 */
export function deleteGroupRowsLocally(groupId: string): void {
  withoutCapture(() => {
    for (const table of GROUP_SYNC_TABLES) deleteUnrecorded(table, inLedgersSql(table, [groupId]));
  });
}

/** Deletes the rows of `table` matching `where`, and whatever they had queued to sync. */
function deleteUnrecorded(table: string, where: string): void {
  const db = getSQLite();
  db.runSync(
    `DELETE FROM sync_outbox WHERE table_name = ? AND row_id IN (SELECT id FROM "${table}" WHERE ${where})`,
    [table],
  );
  db.runSync(`DELETE FROM "${table}" WHERE ${where}`);
}

/** Runs `work` in one transaction whose writes are not captured for sync. */
function withoutCapture(work: () => void): void {
  const db = getSQLite();
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO sync_state (key, value) VALUES ('applying', '1')
       ON CONFLICT(key) DO UPDATE SET value = '1'`,
    );
    try {
      work();
    } finally {
      db.runSync(`UPDATE sync_state SET value = '0' WHERE key = 'applying'`);
    }
  });
}
