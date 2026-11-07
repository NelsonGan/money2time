// Change capture on the app database: triggers that note every inserted,
// updated or deleted row of a synced table in sync_outbox. They exist only
// while Cloud Sync is on, and stay quiet while pulled rows are being applied
// (sync_state.applying = '1'). SQL builders are pure; the engine runs them.
// Rows that stay on the phone (`syncedRowSql`) are never queued, and neither
// is a settings update that only touched device-local settings.

import { isDeviceLocalColumn, syncedRowSql } from './syncTables';

const QUIET = `(SELECT value FROM sync_state WHERE key = 'applying') IS NOT '1'`;
const NEXT_SEQ = `(SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox)`;

function triggerName(table: string, op: 'ins' | 'upd' | 'del'): string {
  return `m2t_sync_${table}_${op}`;
}

function enqueue(table: string, idExpr: string): string {
  return `INSERT INTO sync_outbox (table_name, row_id, seq) VALUES ('${table}', ${idExpr}, ${NEXT_SEQ})
    ON CONFLICT(table_name, row_id) DO UPDATE SET seq = excluded.seq;`;
}

/**
 * Bumped whenever `captureTriggersSql` changes, so phones replace the
 * triggers they made with an earlier version (`CREATE TRIGGER IF NOT EXISTS`
 * would keep them). 2: rows that stay on the phone are not queued, nor
 * settings updates that only touched device-local settings.
 */
export const CAPTURE_VERSION = '2';

/**
 * What the triggers depend on: their version and the settings columns they
 * compare. A migration that adds a settings column changes it, so the
 * triggers are made again and see the new column.
 */
export function captureSignature(settingsColumns: Iterable<string>): string {
  return `${CAPTURE_VERSION}:${[...settingsColumns].sort().join(',')}`;
}

/**
 * The settings columns whose change must go up: not device-local, and not
 * `updated_at`, which saving any setting stamps.
 */
function syncedSettingsChanged(columns: Iterable<string>): string {
  const compared = [...columns].filter(
    (column) =>
      column !== 'id' && column !== 'updated_at' && !isDeviceLocalColumn('settings', column),
  );
  if (!compared.length) return '';
  return ` AND (${compared.map((c) => `OLD."${c}" IS NOT NEW."${c}"`).join(' OR ')})`;
}

/**
 * CREATE TRIGGER statements for one table. `columns`: the table's columns,
 * which the settings update trigger compares. Saving a device-local setting
 * (the last rate fetch, a backup time, the open ledger) must not queue the
 * row: a queued row overrides the copy pulled from the cloud, so it would
 * send this phone's older values of every other setting back up over
 * another phone's newer edit.
 */
export function captureTriggersSql(table: string, columns: Iterable<string> = []): string {
  const newSyncs = syncedRowSql(table, 'NEW');
  const oldSyncs = syncedRowSql(table, 'OLD');
  const all = newSyncs === '1';
  // An update that turns a synced row into a local one is queued too: the
  // flush then removes it from the cloud copy.
  const inserted = all ? '' : ` AND ${newSyncs}`;
  const updated =
    (all ? '' : ` AND (${newSyncs} OR ${oldSyncs})`) +
    (table === 'settings' ? syncedSettingsChanged(columns) : '');
  const deleted = all ? '' : ` AND ${oldSyncs}`;
  return `
    CREATE TRIGGER IF NOT EXISTS ${triggerName(table, 'ins')} AFTER INSERT ON "${table}"
      WHEN ${QUIET}${inserted} BEGIN ${enqueue(table, 'NEW.id')} END;
    CREATE TRIGGER IF NOT EXISTS ${triggerName(table, 'upd')} AFTER UPDATE ON "${table}"
      WHEN ${QUIET}${updated} BEGIN ${enqueue(table, 'NEW.id')} END;
    CREATE TRIGGER IF NOT EXISTS ${triggerName(table, 'del')} AFTER DELETE ON "${table}"
      WHEN ${QUIET}${deleted} BEGIN ${enqueue(table, 'OLD.id')} END;
  `;
}

export function dropCaptureTriggersSql(table: string): string {
  return (['ins', 'upd', 'del'] as const)
    .map((op) => `DROP TRIGGER IF EXISTS ${triggerName(table, op)};`)
    .join('\n');
}

/** Puts every row of `table` that syncs in the outbox, for a full upload. */
export function enqueueAllSql(table: string): string {
  return `INSERT INTO sync_outbox (table_name, row_id, seq)
    SELECT '${table}', id, ${NEXT_SEQ} FROM "${table}" WHERE ${syncedRowSql(table)}
    ON CONFLICT(table_name, row_id) DO UPDATE SET seq = excluded.seq;`;
}

/** Puts one row in the outbox from code (`?` = table, `?` = id). */
export const ENQUEUE_ROW_SQL = `INSERT INTO sync_outbox (table_name, row_id, seq) VALUES (?, ?, ${NEXT_SEQ})
    ON CONFLICT(table_name, row_id) DO UPDATE SET seq = excluded.seq`;
