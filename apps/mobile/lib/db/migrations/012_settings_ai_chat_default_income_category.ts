import type { DbMigration } from './types';

export const migration012SettingsAiChatDefaultIncomeCategory: DbMigration = {
  version: 12,
  name: '012_settings_ai_chat_default_income_category',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some(
      (column) => column.name === 'ai_chat_default_income_category_id',
    );

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN ai_chat_default_income_category_id TEXT;');
    }
  },
};

export default migration012SettingsAiChatDefaultIncomeCategory;
