// Change capture on the app database: triggers that note every inserted,
// updated or deleted row of a synced table in sync_outbox. They exist only
// while Cloud Sync is on, and stay quiet while pulled rows are being applied
// (sync_state.applying = '1'). SQL builders are pure; the engine runs them.

const QUIET = `(SELECT value FROM sync_state WHERE key = 'applying') IS NOT '1'`;
const NEXT_SEQ = `(SELECT COALESCE(MAX(seq), 0) + 1 FROM sync_outbox)`;

function triggerName(table: string, op: 'ins' | 'upd' | 'del'): string {
  return `m2t_sync_${table}_${op}`;
}

function enqueue(table: string, idExpr: string): string {
  return `INSERT INTO sync_outbox (table_name, row_id, seq) VALUES ('${table}', ${idExpr}, ${NEXT_SEQ})
    ON CONFLICT(table_name, row_id) DO UPDATE SET seq = excluded.seq;`;
}

/** CREATE TRIGGER statements for one table. */
export function captureTriggersSql(table: string): string {
  return `
    CREATE TRIGGER IF NOT EXISTS ${triggerName(table, 'ins')} AFTER INSERT ON "${table}"
      WHEN ${QUIET} BEGIN ${enqueue(table, 'NEW.id')} END;
    CREATE TRIGGER IF NOT EXISTS ${triggerName(table, 'upd')} AFTER UPDATE ON "${table}"
      WHEN ${QUIET} BEGIN ${enqueue(table, 'NEW.id')} END;
    CREATE TRIGGER IF NOT EXISTS ${triggerName(table, 'del')} AFTER DELETE ON "${table}"
      WHEN ${QUIET} BEGIN ${enqueue(table, 'OLD.id')} END;
  `;
}

export function dropCaptureTriggersSql(table: string): string {
  return (['ins', 'upd', 'del'] as const)
    .map((op) => `DROP TRIGGER IF EXISTS ${triggerName(table, op)};`)
    .join('\n');
}

/** Puts every row of `table` in the outbox, for a full upload. */
export function enqueueAllSql(table: string): string {
  return `INSERT INTO sync_outbox (table_name, row_id, seq)
    SELECT '${table}', id, ${NEXT_SEQ} FROM "${table}" WHERE true
    ON CONFLICT(table_name, row_id) DO UPDATE SET seq = excluded.seq;`;
}

/** Puts one row in the outbox from code (`?` = table, `?` = id). */
export const ENQUEUE_ROW_SQL = `INSERT INTO sync_outbox (table_name, row_id, seq) VALUES (?, ?, ${NEXT_SEQ})
    ON CONFLICT(table_name, row_id) DO UPDATE SET seq = excluded.seq`;
