import type { DbMigration } from './types';

export const migration015SettingsAiChatDefaultExpenseCategory: DbMigration = {
  version: 15,
  name: '015_settings_ai_chat_default_expense_category',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some(
      (column) => column.name === 'ai_chat_default_expense_category_id',
    );

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN ai_chat_default_expense_category_id TEXT;');
    }
  },
};

export default migration015SettingsAiChatDefaultExpenseCategory;
