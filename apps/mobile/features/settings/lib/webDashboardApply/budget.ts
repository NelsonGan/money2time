import { computeBudgetPagerKeys } from '~/features/budget/lib/budgetMath';
import type { BudgetAllocationInput } from '~/lib/repositories/budgetTemplatesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import { monthCycleOf } from '~/utils/financialMonth';

import type { ApplyModule } from './types';

type TemplateInput = {
  name: string;
  emoji: string | null;
  totalAmount: number;
  countUnbudgeted: boolean;
  allocations: BudgetAllocationInput[];
};
type MonthInput = { totalAmount: number; countUnbudgeted: boolean; lines: BudgetAllocationInput[] };

/**
 * Saves the `module:budget` steps planned in services/webDashboardEditModules/budget.ts,
 * with the calls BudgetTemplateEditorScreen, BudgetTemplatesScreen,
 * PeriodBudgetEditorScreen and BudgetScreen make.
 *
 * The Web Dashboard knows monthly budgets only, so it is shown and may change
 * only monthly templates and month budgets (see `webDashboardBudgetsOnly`).
 */
export const budgetApply: ApplyModule = {
  select: (app) => ({
    templates: app.budgetTemplates.filter((template) => template.period === 'month'),
    budgets: app.periodBudgets.filter((budget) => budget.period === 'month'),
    templateCount: app.budgetTemplates.length,
    // The months the budget pager offers, so a month is only made where the app makes one.
    months: computeBudgetPagerKeys({
      period: 'month',
      budgets: app.periodBudgets,
      transactions: transactionsRepository.listForSummary({ type: 'expense' }),
      clock: { weekStartsOn: app.settings.weekStartsOn, monthCycle: monthCycleOf(app.settings) },
    }),
  }),
  apply: (app, step) => {
    const payload = step.payload;
    switch (step.action) {
      case 'template_create':
        app.createBudgetTemplate({
          ...(payload.input as TemplateInput & { backPopulate: boolean }),
          period: 'month',
        });
        return;
      case 'template_update':
        app.updateBudgetTemplate(payload.id as string, {
          ...(payload.input as TemplateInput),
          period: 'month',
        });
        return;
      case 'template_delete':
        app.deleteBudgetTemplate(payload.id as string);
        return;
      case 'template_default':
        app.setDefaultBudgetTemplate(payload.id as string);
        return;
      case 'month_create':
        app.createPeriodBudget(payload.month as string, payload.templateId as string);
        return;
      case 'month_custom':
        app.createCustomPeriodBudget('month', payload.month as string, payload.input as MonthInput);
        return;
      case 'month_update':
        app.updatePeriodBudget(payload.id as string, payload.input as MonthInput);
        return;
      case 'month_delete':
        app.deletePeriodBudget(payload.id as string);
        return;
      default:
        throw new Error(`unknown budget step ${step.action}`);
    }
  },
};
