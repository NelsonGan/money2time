import type { DbMigration } from './types';

export const migration031SettingsFxCurrencies: DbMigration = {
  version: 31,
  name: '031_settings_fx_currencies',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const existing = new Set(columns.map((c) => c.name));

    if (!existing.has('fx_currencies_json')) {
      db.execSync('ALTER TABLE settings ADD COLUMN fx_currencies_json TEXT;');
    }
  },
};

export default migration031SettingsFxCurrencies;
