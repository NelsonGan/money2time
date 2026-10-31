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
import { SYNC_TABLES, type SyncTable } from '../lib/syncTables';
import { getDeferredLedgerDeletes, listSharedLedgers, sharedLedgerFor } from './sharedLedgerStore';

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
  return sharedLedgerFor(ledgerId)?.shareId ?? PERSONAL_CHANNEL;
}

export function channelOfRow(table: string, row: Row): string {
  if (!isLedgerScoped(table)) return PERSONAL_CHANNEL;
  // Most users share nothing: no lookups then.
  if (!listSharedLedgers().length && !getDeferredLedgerDeletes().length) return PERSONAL_CHANNEL;
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

/** SQL condition for "this row is the user's own, not in a shared ledger". */
export function personalRowsSql(table: string): string {
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
  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO sync_state (key, value) VALUES ('applying', '1')
       ON CONFLICT(key) DO UPDATE SET value = '1'`,
    );
    try {
      for (const table of order) {
        const where = inLedgersSql(table, [ledgerId]);
        db.runSync(
          `DELETE FROM sync_outbox WHERE table_name = ? AND row_id IN (SELECT id FROM "${table}" WHERE ${where})`,
          [table],
        );
        db.runSync(`DELETE FROM "${table}" WHERE ${where}`);
      }
      db.runSync('DELETE FROM auto_log_captures WHERE ledger_id = ?', [ledgerId]);
      db.runSync('UPDATE settings SET active_ledger_id = NULL WHERE active_ledger_id = ?', [
        ledgerId,
      ]);
    } finally {
      db.runSync(`UPDATE sync_state SET value = '0' WHERE key = 'applying'`);
    }
  });
}
