import type { DbMigration } from './types';

export const migration004SettingsAdsEnabled: DbMigration = {
  version: 4,
  name: '004_settings_ads_enabled',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasAdsEnabled = columns.some((column) => column.name === 'ads_enabled');

    if (!hasAdsEnabled) {
      db.execSync('ALTER TABLE settings ADD COLUMN ads_enabled INTEGER NOT NULL DEFAULT 1;');
    }

    db.execSync('UPDATE settings SET ads_enabled = 1 WHERE ads_enabled IS NULL;');
  },
};

export default migration004SettingsAdsEnabled;
