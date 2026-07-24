import type { DbMigration } from './types';

export const migration046SettingsFirstDayOfMonth: DbMigration = {
  version: 46,
  name: '046_settings_first_day_of_month',
  up(db) {
    // Day of the month (1..28) that a financial "month" begins on. Defaults to
    // 1, which keeps every month a plain calendar month. When set higher (e.g.
    // 25 for a payday cycle) Insights, Budgets, the Calendar tab and monthly
    // wages all group by the shifted period instead.
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(settings);');
    const hasColumn = columns.some((column) => column.name === 'first_day_of_month');

    if (!hasColumn) {
      db.execSync('ALTER TABLE settings ADD COLUMN first_day_of_month INTEGER NOT NULL DEFAULT 1;');
    }
  },
};

export default migration046SettingsFirstDayOfMonth;
