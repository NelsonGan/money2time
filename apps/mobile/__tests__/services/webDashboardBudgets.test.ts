import type { BackupData } from '~/services/dataManagementService';
import { webDashboardBudgetsOnly } from '~/services/webDashboardBudgets';

function backup(tables: BackupData['tables']): BackupData {
  return { version: 1, exportedAt: '2026-10-26T00:00:00.000Z', tables };
}

const base = {
  accounts: [],
  account_groups: [],
  categories: [],
  transactions: [],
  recurring_rules: [],
  settings: [],
  monthly_wage_settings: [],
} as unknown as BackupData['tables'];

describe('webDashboardBudgetsOnly', () => {
  it('passes data with only monthly budgets through untouched', () => {
    const data = backup({
      ...base,
      budget_templates: [{ id: 't1' }, { id: 't2', period: 'month' }],
      monthly_budgets: [{ id: 'b1', month: '2026-10' }],
    });
    expect(webDashboardBudgetsOnly(data)).toBe(data);
  });

  it('drops weekly and yearly templates and budgets with their lines', () => {
    const data = backup({
      ...base,
      budget_templates: [
        { id: 'tm', period: 'month' },
        { id: 'tw', period: 'week' },
      ],
      budget_template_categories: [
        { id: 'a', template_id: 'tm' },
        { id: 'b', template_id: 'tw' },
      ],
      monthly_budgets: [
        { id: 'bm', period: 'month', month: '2026-10' },
        { id: 'bw', period: 'week', month: '2026-10-26' },
        { id: 'by', period: 'year', month: '2026' },
      ],
      monthly_budget_categories: [
        { id: 'c', budget_id: 'bm' },
        { id: 'd', budget_id: 'bw' },
        { id: 'e', budget_id: 'by' },
      ],
    });
    const { tables } = webDashboardBudgetsOnly(data);
    expect(tables.budget_templates?.map((row) => row.id)).toEqual(['tm']);
    expect(tables.budget_template_categories?.map((row) => row.id)).toEqual(['a']);
    expect(tables.monthly_budgets?.map((row) => row.id)).toEqual(['bm']);
    expect(tables.monthly_budget_categories?.map((row) => row.id)).toEqual(['c']);
    // The source data (also the backup) is not changed.
    expect(data.tables.monthly_budgets).toHaveLength(3);
  });
});
