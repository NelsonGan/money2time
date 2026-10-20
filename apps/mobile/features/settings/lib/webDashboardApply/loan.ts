import { I18n } from '~/lib/i18n';
import type { CreateRecurringRuleInput } from '~/lib/repositories/recurringRulesRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import type {
  LoanCreatePayload,
  LoanExtra,
  LoanUpdatePayload,
} from '~/services/webDashboardEditModules/loan';

import type { AppApi, ApplyModule } from './types';

type AccountInput = Parameters<AppApi['createAccount']>[0];
/** Balance corrections made from the browser are reported as such. */
const WEB = { source: 'web_dashboard' } as const;

/**
 * Saves the `module:loan` steps planned in services/webDashboardEditModules/loan.ts,
 * in the order AccountEditorScreen makes the same calls on Save, delete and archive.
 */
export const loanApply: ApplyModule = {
  select: (): LoanExtra => ({
    ruleName: (name) => String(I18n.t('accounts.loan.autopay_rule_name', { name })),
  }),
  apply: (app, step, created) => {
    if (step.action === 'create') {
      const payload = step.payload as unknown as LoanCreatePayload;
      const id = app.createAccount(payload.input as unknown as AccountInput);
      if (payload.rule) {
        app.createRecurringRule({
          ...payload.rule,
          toAccountId: id,
        } as unknown as CreateRecurringRuleInput);
      }
      // createAccount reports ACCOUNT_CREATED; the screen adds the loan's own event.
      void trackEvent(AnalyticsEvents.LOAN_CREATED, payload.analytics);
      return;
    }
    if (step.action === 'update') {
      const payload = step.payload as unknown as LoanUpdatePayload;
      const updates = payload.updates as Partial<AccountInput>;
      if (payload.currency) {
        app.changeAccountCurrency(payload.id, payload.currency, updates);
        return;
      }
      app.updateAccount(payload.id, updates);
      for (const rule of payload.rules) {
        if (rule.op === 'create') {
          app.createRecurringRule(rule.input as unknown as CreateRecurringRuleInput);
        } else if (rule.op === 'update') {
          app.updateRecurringRule(rule.id, rule.input as Partial<CreateRecurringRuleInput>);
        } else {
          app.deleteRecurringRule(rule.id);
        }
      }
      const adjustment = payload.adjustment;
      if (adjustment) {
        const note = String(I18n.t('accounts.balance_adjustment_transaction_note'));
        created.push(
          adjustment.type === 'balance_adjustment'
            ? app.createTransaction(
                {
                  type: 'balance_adjustment',
                  amount: adjustment.amount,
                  currency: adjustment.currency,
                  date: new Date().toISOString(),
                  accountId: payload.id,
                  fromAccountId: null,
                  toAccountId: null,
                  categoryId: null,
                  note,
                },
                WEB,
              )
            : app.createTransaction(
                {
                  type: adjustment.type,
                  amount: adjustment.amount,
                  currency: adjustment.currency,
                  date: new Date().toISOString(),
                  accountId: payload.id,
                  note,
                },
                WEB,
              ),
        );
      }
      return;
    }
    const id = step.payload.id as string;
    if (step.action === 'archive') {
      app.setLoanArchived(id, step.payload.archived as boolean);
      return;
    }
    if (step.action === 'delete') {
      app.deleteAccount(id);
      return;
    }
    throw new Error(`unknown loan action ${step.action}`);
  },
};
