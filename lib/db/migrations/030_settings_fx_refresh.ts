import type { DbMigration } from './types';

export const migration030SettingsFxRefresh: DbMigration = {
  version: 30,
  name: '030_settings_fx_refresh',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const existing = new Set(columns.map((c) => c.name));

    if (!existing.has('auto_fx_refresh_enabled')) {
      db.execSync(
        'ALTER TABLE settings ADD COLUMN auto_fx_refresh_enabled INTEGER NOT NULL DEFAULT 1;',
      );
    }
    if (!existing.has('last_rate_fetch_at')) {
      db.execSync('ALTER TABLE settings ADD COLUMN last_rate_fetch_at TEXT;');
    }
    if (!existing.has('last_rate_fetch_error')) {
      db.execSync('ALTER TABLE settings ADD COLUMN last_rate_fetch_error TEXT;');
    }
  },
};

export default migration030SettingsFxRefresh;
