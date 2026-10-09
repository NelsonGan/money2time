import type { DbMigration } from './types';

export const migration013SettingsAiChatEnabled: DbMigration = {
  version: 13,
  name: '013_settings_ai_chat_enabled',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'ai_chat_enabled');

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN ai_chat_enabled INTEGER NOT NULL DEFAULT 0;');
    }

    db.execSync('UPDATE settings SET ai_chat_enabled = COALESCE(ai_chat_enabled, 0);');
  },
};

export default migration013SettingsAiChatEnabled;
