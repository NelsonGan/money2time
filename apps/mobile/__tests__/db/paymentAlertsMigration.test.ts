import type { SQLiteDatabase } from 'expo-sqlite';

import migration067 from '~/lib/db/migrations/067_payment_alerts';

function makeDb(columnsByTable: Record<string, string[]>) {
  const executed: string[] = [];
  const db = {
    getAllSync: (sql: string) => {
      const table = /PRAGMA table_info\((\w+)\)/.exec(sql)?.[1] ?? '';
      return (columnsByTable[table] ?? []).map((name) => ({ name }));
    },
    execSync: (sql: string) => {
      executed.push(sql.trim());
      const match = /ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(sql);
      if (match?.[1] && match[2]) (columnsByTable[match[1]] ??= []).push(match[2]);
    },
  } as unknown as SQLiteDatabase;
  return { db, executed, columnsByTable };
}

describe('payment alerts migration', () => {
  it('creates both tables idempotently and adds the two columns', () => {
    const { db, executed, columnsByTable } = makeDb({ accounts: ['id'], settings: ['id'] });
    migration067.up(db);
    expect(executed[0]).toContain('CREATE TABLE IF NOT EXISTS auto_log_captures');
    expect(executed[0]).toContain('CREATE TABLE IF NOT EXISTS merchant_categories');
    expect(executed[0]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_categories_key');
    expect(columnsByTable.accounts).toContain('auto_log_identifiers_json');
    expect(columnsByTable.settings).toContain('auto_log_prefs_json');
  });

  it('replays on a database that already has everything without throwing', () => {
    const { db, executed } = makeDb({
      accounts: ['id', 'auto_log_identifiers_json'],
      settings: ['id', 'auto_log_prefs_json'],
    });
    migration067.up(db);
    // Only the IF NOT EXISTS block runs; no ALTER that would hit "duplicate column".
    expect(executed.filter((sql) => sql.startsWith('ALTER'))).toHaveLength(0);
  });

  it('follows the previous migration in the sequence', () => {
    expect(migration067.version).toBe(67);
    expect(migration067.name).toBe('067_payment_alerts');
  });
});
