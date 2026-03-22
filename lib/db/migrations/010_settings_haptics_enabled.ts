import type { DbMigration } from './types';

export const migration010SettingsHapticsEnabled: DbMigration = {
  version: 10,
  name: '010_settings_haptics_enabled',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'haptics_enabled');

    if (!hasColumn) {
      db.execSync(
        'ALTER TABLE settings ADD COLUMN haptics_enabled INTEGER NOT NULL DEFAULT 1;',
      );
    }
  },
};

export default migration010SettingsHapticsEnabled;
