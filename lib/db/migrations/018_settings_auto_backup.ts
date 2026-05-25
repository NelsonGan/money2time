import type { DbMigration } from './types';

export const migration018SettingsAutoBackup: DbMigration = {
  version: 18,
  name: '018_settings_auto_backup',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const existing = new Set(columns.map((c) => c.name));

    if (!existing.has('auto_backup_enabled')) {
      db.execSync(
        'ALTER TABLE settings ADD COLUMN auto_backup_enabled INTEGER NOT NULL DEFAULT 1;',
      );
    }
    if (!existing.has('auto_backup_target')) {
      db.execSync(
        "ALTER TABLE settings ADD COLUMN auto_backup_target TEXT NOT NULL DEFAULT 'local';",
      );
    }
    if (!existing.has('last_auto_backup_at')) {
      db.execSync('ALTER TABLE settings ADD COLUMN last_auto_backup_at TEXT;');
    }
    if (!existing.has('last_auto_backup_error')) {
      db.execSync('ALTER TABLE settings ADD COLUMN last_auto_backup_error TEXT;');
    }
  },
};

export default migration018SettingsAutoBackup;
