import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Idempotency helpers for migrations.
 *
 * Every migration must be safe to re-run. The runner commits each migration in
 * its own transaction and bumps `PRAGMA user_version` inside it, so a clean
 * failure can no longer replay an applied migration. But installs that upgraded
 * under the *old* all-or-nothing runner can already be sitting half-applied —
 * their `user_version` trails migrations whose DDL landed — and those replay on
 * the next launch. A bare `ALTER TABLE ... ADD COLUMN` throws "duplicate column
 * name" on that replay, which used to brick the app permanently. Guarding the
 * DDL lets those installs walk forward on their own.
 */

export function tableColumns(db: SQLiteDatabase, table: string): Set<string> {
  // Table names come from migration source, never user input, so the inline
  // interpolation here is safe (PRAGMA does not accept bound parameters).
  const rows = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table});`);
  return new Set(rows.map((row) => row.name));
}

export function hasColumn(db: SQLiteDatabase, table: string, column: string): boolean {
  return tableColumns(db, table).has(column);
}

/**
 * Add a column only when it is missing. `definition` is everything after the
 * column name, e.g. `"TEXT"` or `"INTEGER NOT NULL DEFAULT 1"`.
 */
export function addColumnIfMissing(
  db: SQLiteDatabase,
  table: string,
  column: string,
  definition: string,
): void {
  if (hasColumn(db, table, column)) return;
  db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

/** Add several columns to one table, skipping any that already exist. */
export function addColumnsIfMissing(
  db: SQLiteDatabase,
  table: string,
  columns: readonly (readonly [column: string, definition: string])[],
): void {
  const existing = tableColumns(db, table);
  columns.forEach(([column, definition]) => {
    if (existing.has(column)) return;
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  });
}
