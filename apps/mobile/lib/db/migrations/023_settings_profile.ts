import type { DbMigration } from './types';

export const migration023SettingsProfile: DbMigration = {
  version: 23,
  name: '023_settings_profile',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const has = (name: string) => columns.some((column) => column.name === name);

    if (!has('profile_name')) {
      db.execSync('ALTER TABLE settings ADD COLUMN profile_name TEXT;');
    }
    if (!has('profile_avatar_uri')) {
      db.execSync('ALTER TABLE settings ADD COLUMN profile_avatar_uri TEXT;');
    }
  },
};

export default migration023SettingsProfile;
