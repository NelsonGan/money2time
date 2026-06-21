import type { DbMigration } from './types';

export const migration025SettingsBiometricLockDelay: DbMigration = {
  version: 25,
  name: '025_settings_biometric_lock_delay',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'biometric_lock_delay_seconds');

    if (!hasColumn) {
      db.execSync(
        'ALTER TABLE settings ADD COLUMN biometric_lock_delay_seconds INTEGER NOT NULL DEFAULT 900;',
      );
    }
  },
};

export default migration025SettingsBiometricLockDelay;
