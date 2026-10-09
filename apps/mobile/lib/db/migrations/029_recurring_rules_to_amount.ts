import type { DbMigration } from './types';

export const migration029RecurringRulesToAmount: DbMigration = {
  version: 29,
  name: '029_recurring_rules_to_amount',
  up(db) {
    const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(recurring_rules);');
    const existing = new Set(columns.map((c) => c.name));

    if (!existing.has('to_amount')) {
      db.execSync('ALTER TABLE recurring_rules ADD COLUMN to_amount REAL;');
    }
  },
};

export default migration029RecurringRulesToAmount;
