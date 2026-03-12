import type { DbMigration } from './types';

function newId(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

function newAppUserId() {
  return `m2t_${newId()}`;
}

export const migration005SettingsAppUserId: DbMigration = {
  version: 5,
  name: '005_settings_app_user_id',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasAppUserId = columns.some((column) => column.name === 'app_user_id');

    if (!hasAppUserId) {
      db.execSync('ALTER TABLE settings ADD COLUMN app_user_id TEXT;');
    }

    const rows = db.getAllSync<{ id: string; app_user_id: string | null }>(
      'SELECT id, app_user_id FROM settings;',
    );

    rows.forEach((row) => {
      const currentValue = row.app_user_id?.trim();
      if (currentValue) {
        return;
      }

      const escapedId = row.id.replace(/'/g, "''");
      const nextAppUserId = newAppUserId();
      db.execSync(
        `UPDATE settings SET app_user_id = '${nextAppUserId}' WHERE id = '${escapedId}';`,
      );
    });
  },
};

export default migration005SettingsAppUserId;
