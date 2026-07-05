import type { DbMigration } from './types';

// Adds template personalization + accounting options:
// - budget_templates.emoji: optional emoji shown next to the template name.
// - budget_templates.count_unbudgeted: whether spending in categories without
//   a budget line counts toward the month's total (1 = yes, the original
//   behavior).
// Both are frozen onto monthly_budgets at creation time (template_emoji /
// count_unbudgeted) like the rest of the month snapshot.
const SQL = `
  ALTER TABLE budget_templates ADD COLUMN emoji TEXT;
  ALTER TABLE budget_templates ADD COLUMN count_unbudgeted INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE monthly_budgets ADD COLUMN template_emoji TEXT;
  ALTER TABLE monthly_budgets ADD COLUMN count_unbudgeted INTEGER NOT NULL DEFAULT 1;
`;

export const migration042BudgetTemplateOptions: DbMigration = {
  version: 42,
  name: '042_budget_template_options',
  up(db) {
    db.execSync(SQL);
  },
};

export default migration042BudgetTemplateOptions;
