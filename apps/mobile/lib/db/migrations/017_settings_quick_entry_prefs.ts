import type { DbMigration } from './types';

export const migration017SettingsQuickEntryPrefs: DbMigration = {
  version: 17,
  name: '017_settings_quick_entry_prefs',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'quick_entry_prefs_json');

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN quick_entry_prefs_json TEXT;');
    }
  },
};

export default migration017SettingsQuickEntryPrefs;
