import type { DbMigration } from './types';

export const migration014SettingsCenterAddButtonAiChat: DbMigration = {
  version: 14,
  name: '014_settings_center_add_button_ai_chat',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'center_add_button_opens_ai_chat');

    if (!hasColumn) {
      db.execSync(
        'ALTER TABLE settings ADD COLUMN center_add_button_opens_ai_chat INTEGER NOT NULL DEFAULT 0;',
      );
    }

    db.execSync(
      'UPDATE settings SET center_add_button_opens_ai_chat = COALESCE(center_add_button_opens_ai_chat, 0);',
    );
  },
};

export default migration014SettingsCenterAddButtonAiChat;
