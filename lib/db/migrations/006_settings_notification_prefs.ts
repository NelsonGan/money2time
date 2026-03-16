import type { DbMigration } from './types';

export const migration006SettingsNotificationPrefs: DbMigration = {
  version: 6,
  name: '006_settings_notification_prefs',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'notification_prefs_json');

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN notification_prefs_json TEXT;');
    }
  },
};

export default migration006SettingsNotificationPrefs;
