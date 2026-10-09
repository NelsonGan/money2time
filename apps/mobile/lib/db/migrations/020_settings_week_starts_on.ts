import type { DbMigration } from './types';

export const migration020SettingsWeekStartsOn: DbMigration = {
  version: 20,
  name: '020_settings_week_starts_on',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'week_starts_on');

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN week_starts_on INTEGER NOT NULL DEFAULT 1;');
    }
  },
};

export default migration020SettingsWeekStartsOn;
