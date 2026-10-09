import { addColumnsIfMissing } from './helpers';
import type { DbMigration } from './types';

// Adds template personalization + accounting options:
// - budget_templates.emoji: optional emoji shown next to the template name.
// - budget_templates.count_unbudgeted: whether spending in categories without
//   a budget line counts toward the month's total (1 = yes, the original
//   behavior).
// Both are frozen onto monthly_budgets at creation time (template_emoji /
// count_unbudgeted) like the rest of the month snapshot.
export const migration042BudgetTemplateOptions: DbMigration = {
  version: 42,
  name: '042_budget_template_options',
  up(db) {
    addColumnsIfMissing(db, 'budget_templates', [
      ['emoji', 'TEXT'],
      ['count_unbudgeted', 'INTEGER NOT NULL DEFAULT 1'],
    ]);
    addColumnsIfMissing(db, 'monthly_budgets', [
      ['template_emoji', 'TEXT'],
      ['count_unbudgeted', 'INTEGER NOT NULL DEFAULT 1'],
    ]);
  },
};

export default migration042BudgetTemplateOptions;
