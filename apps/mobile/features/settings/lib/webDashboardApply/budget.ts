import { computeBudgetPagerMonths } from '~/features/budget/lib/budgetMath';
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
 * MonthlyBudgetEditorScreen and BudgetScreen make.
 */
export const budgetApply: ApplyModule = {
  select: (app) => ({
    templates: app.budgetTemplates,
    budgets: app.monthlyBudgets,
    // The months the budget pager offers, so a month is only made where the app makes one.
    months: computeBudgetPagerMonths({
      budgets: app.monthlyBudgets,
      transactions: transactionsRepository.listForSummary({ type: 'expense' }),
      monthCycle: monthCycleOf(app.settings),
    }),
  }),
  apply: (app, step) => {
    const payload = step.payload;
    switch (step.action) {
      case 'template_create':
        app.createBudgetTemplate(payload.input as TemplateInput & { backPopulate: boolean });
        return;
      case 'template_update':
        app.updateBudgetTemplate(payload.id as string, payload.input as TemplateInput);
        return;
      case 'template_delete':
        app.deleteBudgetTemplate(payload.id as string);
        return;
      case 'template_default':
        app.setDefaultBudgetTemplate(payload.id as string);
        return;
      case 'month_create':
        app.createMonthlyBudget(payload.month as string, payload.templateId as string);
        return;
      case 'month_custom':
        app.createCustomMonthlyBudget(payload.month as string, payload.input as MonthInput);
        return;
      case 'month_update':
        app.updateMonthlyBudget(payload.id as string, payload.input as MonthInput);
        return;
      case 'month_delete':
        app.deleteMonthlyBudget(payload.id as string);
        return;
      default:
        throw new Error(`unknown budget step ${step.action}`);
    }
  },
};
