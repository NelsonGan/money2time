import type { DbMigration } from './types';

export const migration045SettingsShowAddOptionsDefault: DbMigration = {
  version: 45,
  name: '045_settings_show_add_options_default',
  up(db) {
    // "Show options when adding" (addUseActionSheet) now defaults ON for every
    // user. New users already get it via DEFAULT_QUICK_ENTRY_PREFS; this flips
    // it on once for existing users' stored prefs. Only touch valid JSON blobs
    // (a null/absent prefs blob already falls back to the true default on load).
    db.execSync(
      `UPDATE settings
         SET quick_entry_prefs_json =
           json_set(quick_entry_prefs_json, '$.addUseActionSheet', json('true'))
       WHERE quick_entry_prefs_json IS NOT NULL
         AND json_valid(quick_entry_prefs_json);`,
    );
  },
};

export default migration045SettingsShowAddOptionsDefault;
