import type { DbMigration } from './types';

export const migration019SettingsCalendarPrefs: DbMigration = {
  version: 19,
  name: '019_settings_calendar_prefs',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'calendar_prefs_json');

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN calendar_prefs_json TEXT;');
    }
  },
};

export default migration019SettingsCalendarPrefs;
