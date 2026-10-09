import type { DbMigration } from './types';

export const migration007SettingsRemoveHourRounding: DbMigration = {
  version: 7,
  name: '007_settings_remove_hour_rounding',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'hour_rounding');
    if (hasColumn) {
      db.execSync('ALTER TABLE settings DROP COLUMN hour_rounding;');
    }
  },
};

export default migration007SettingsRemoveHourRounding;
