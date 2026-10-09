import type { DbMigration } from './types';

export const migration022SettingsAccountLogoCountry: DbMigration = {
  version: 22,
  name: '022_settings_account_logo_country',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'account_logo_country');

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN account_logo_country TEXT;');
    }
  },
};

export default migration022SettingsAccountLogoCountry;
