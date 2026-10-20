import { I18n } from '~/lib/i18n';
import type { CreateRecurringRuleInput } from '~/lib/repositories/recurringRulesRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import type {
  GoalCreatePayload,
  GoalExtra,
  GoalRuleOp,
  GoalUpdatePayload,
} from '~/services/webDashboardEditModules/goal';

import type { AppApi, ApplyModule } from './types';

type AccountInput = Parameters<AppApi['createAccount']>[0];

function applyRules(app: AppApi, ops: GoalRuleOp[]) {
  for (const rule of ops) {
    if (rule.op === 'create')
      app.createRecurringRule(rule.input as unknown as CreateRecurringRuleInput);
    else if (rule.op === 'update') {
      app.updateRecurringRule(rule.id, rule.input as Partial<CreateRecurringRuleInput>);
    } else app.deleteRecurringRule(rule.id);
  }
}

/**
 * Saves the `module:goal` steps planned in services/webDashboardEditModules/goal.ts,
 * in the order GoalEditorScreen and GoalDetailScreen make the same calls.
 */
export const goalApply: ApplyModule = {
  select: (): GoalExtra => ({
    ruleName: (name) => String(I18n.t('goals.auto_save_rule_name', { name })),
  }),
  apply: (app, step, created) => {
    if (step.action === 'create') {
      const payload = step.payload as unknown as GoalCreatePayload;
      const id = app.createAccount(payload.input as unknown as AccountInput);
      if (payload.autoSave) {
        app.createRecurringRule({
          ...payload.autoSave,
          toAccountId: id,
        } as unknown as CreateRecurringRuleInput);
      }
      void trackEvent(AnalyticsEvents.GOAL_CREATED, payload.analytics);
      return;
    }
    if (step.action === 'update') {
      const payload = step.payload as unknown as GoalUpdatePayload;
      const updates = payload.updates as Partial<AccountInput>;
      if (payload.currency) {
        app.changeAccountCurrency(payload.id, payload.currency, updates);
        applyRules(app, payload.rules);
        void trackEvent(AnalyticsEvents.GOAL_UPDATED);
        return;
      }
      app.updateAccount(payload.id, updates);
      applyRules(app, payload.rules);
      void trackEvent(AnalyticsEvents.GOAL_UPDATED);
      if (payload.adjustment) {
        created.push(
          app.createTransaction(
            {
              type: payload.adjustment.type,
              amount: payload.adjustment.amount,
              currency: payload.adjustment.currency,
              date: new Date().toISOString(),
              accountId: payload.id,
              fromAccountId: null,
              toAccountId: null,
              categoryId: null,
              note: String(I18n.t('accounts.balance_adjustment_transaction_note')),
            },
            { source: 'web_dashboard' },
          ),
        );
      }
      return;
    }
    const id = step.payload.id as string;
    if (step.action === 'archive') {
      app.setGoalArchived(id, step.payload.archived as boolean);
      return;
    }
    if (step.action === 'delete') {
      app.deleteAccount(id);
      return;
    }
    throw new Error(`unknown goal action ${step.action}`);
  },
};
