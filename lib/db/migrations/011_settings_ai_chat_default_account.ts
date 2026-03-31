import type { DbMigration } from './types';

export const migration011SettingsAiChatDefaultAccount: DbMigration = {
  version: 11,
  name: '011_settings_ai_chat_default_account',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'ai_chat_default_account_id');

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN ai_chat_default_account_id TEXT;');
    }
  },
};

export default migration011SettingsAiChatDefaultAccount;
