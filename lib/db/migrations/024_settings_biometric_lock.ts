import type { DbMigration } from './types';

export const migration024SettingsBiometricLock: DbMigration = {
  version: 24,
  name: '024_settings_biometric_lock',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'biometric_lock_enabled');

    if (!hasColumn) {
      db.execSync(
        'ALTER TABLE settings ADD COLUMN biometric_lock_enabled INTEGER NOT NULL DEFAULT 0;',
      );
    }
  },
};

export default migration024SettingsBiometricLock;
