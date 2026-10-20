import { useRef } from 'react';

import { CATEGORY_ICON_SOURCES } from '~/constants/categoryIcons';
import { afterDeferredWrites, useApp, useTransactions } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { I18n } from '~/lib/i18n';
import type { CreateRecurringRuleInput } from '~/lib/repositories/recurringRulesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import type { WebDashboardEditor } from '~/services/webDashboard';
import type { EditPlan, EditStep } from '~/services/webDashboardEdits';
import type { Account, Category } from '~/types';
import { suggestCategoryIcon } from '~/utils/categoryIconMatcher';
import { convert } from '~/utils/currency';

import { APPLY_MODULES } from './webDashboardApply';

type AccountInput = Omit<Account, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
type CategoryInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

/**
 * How the Web Dashboard screen saves a linked browser's changes: checked
 * against the app's state as it is now, then saved through the same AppContext
 * calls the app's own editors make. One stable object for the screen's life;
 * it reads the latest state through refs.
 */
export function useWebDashboardEditor(onApplied: (count: number) => void): WebDashboardEditor {
  const app = useApp();
  const transactionsState = useTransactions();
  const { accountBalances } = transactionsState;
  const isPro = useIsPro();
  const latest = useRef({ app, accountBalances, transactionsState, isPro, onApplied });
  latest.current = { app, accountBalances, transactionsState, isPro, onApplied };

  const editor = useRef<WebDashboardEditor | null>(null);
  editor.current ??= {
    lookup: () => {
      const { app: current, accountBalances: balances, isPro: pro } = latest.current;
      const main = current.settings.currencyCode;
      return {
        accounts: current.accounts,
        accountGroups: current.accountGroups,
        categories: current.categories,
        recurringRules: current.recurringRules,
        balances: new Map(balances.map((item) => [item.accountId, item.balance])),
        reportingCurrency: main,
        currencies: [
          ...new Set([main, ...current.fxCurrencies, ...current.accounts.map((a) => a.currency)]),
        ],
        isPro: pro,
        convert: (amount, from, to) => {
          const result = convert(amount, from, to, current.rateTable);
          return result.rateUsed === null ? null : result.value;
        },
        isCategoryIcon: (id) => Object.prototype.hasOwnProperty.call(CATEGORY_ICON_SOURCES, id),
        suggestIcon: suggestCategoryIcon,
        now: new Date(),
        extras: Object.fromEntries(
          Object.entries(APPLY_MODULES).map(([entity, module]) => [
            entity,
            module.select?.(current, latest.current.transactionsState),
          ]),
        ),
      };
    },
    apply: async (plan: EditPlan) => {
      const created: string[] = [];
      const deleted: string[] = [];
      for (const step of plan.steps) {
        applyStep(latest.current.app, step, created, deleted);
      }
      // The browser's fresh copy is built from the database.
      await afterDeferredWrites();
      // The app's deferred writes report nothing back; check the rows did land.
      if (created.some((id) => !transactionsRepository.getById(id))) throw new Error('not saved');
      if (deleted.length && transactionsRepository.listByIds(deleted).length) {
        throw new Error('not deleted');
      }
    },
    onApplied: (count) => latest.current.onApplied(count),
  };
  return editor.current;
}

function applyStep(
  app: ReturnType<typeof useApp>,
  step: EditStep,
  created: string[],
  deleted: string[],
) {
  switch (step.kind) {
    case 'tx.create':
      created.push(
        app.createTransaction(
          step.input as unknown as Parameters<typeof app.createTransaction>[0],
          {
            source: 'web_dashboard',
          },
        ),
      );
      if (step.input.reimbursable === true) {
        void trackEvent(AnalyticsEvents.REIMBURSEMENT_FLAGGED, { reimbursable: true });
      }
      return;
    case 'tx.update':
      app.updateTransactionsBulk(step.updates);
      // The app's editor reports each change of the tick (and its adoption) itself.
      for (const update of step.updates) {
        if (typeof update.input.reimbursable === 'boolean') {
          void trackEvent(AnalyticsEvents.REIMBURSEMENT_FLAGGED, {
            reimbursable: update.input.reimbursable,
          });
        }
      }
      return;
    case 'tx.delete':
      app.deleteTransactionsBulk(step.ids);
      deleted.push(...step.ids);
      return;
    case 'account.create':
      app.createAccount(step.input as AccountInput);
      return;
    case 'account.update': {
      const input = step.input as Partial<AccountInput>;
      if (step.currency) app.changeAccountCurrency(step.id, step.currency, input);
      else if (Object.keys(input).length) app.updateAccount(step.id, input);
      if (step.adjustment) {
        // As the app's account editor records a changed balance.
        created.push(
          app.createTransaction(
            {
              type: step.adjustment.type,
              amount: step.adjustment.amount,
              currency: step.adjustment.currency,
              date: new Date().toISOString(),
              accountId: step.id,
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
    case 'account.delete':
      app.deleteAccount(step.id);
      return;
    case 'group.create':
      app.createAccountGroup(step.name);
      return;
    case 'group.rename':
      app.renameAccountGroup(step.id, step.name);
      return;
    case 'group.delete':
      app.deleteAccountGroup(step.id);
      return;
    case 'category.create':
      app.createCategory(step.input as CategoryInput);
      return;
    case 'category.update':
      app.updateCategory(step.id, step.input as Partial<CategoryInput>);
      return;
    case 'category.delete':
      app.deleteCategory(
        step.id,
        step.reassignTo ? { reassignToCategoryId: step.reassignTo } : undefined,
      );
      return;
    case 'recurring.create':
      app.createRecurringRule(step.input as unknown as CreateRecurringRuleInput);
      return;
    case 'recurring.update':
      app.updateRecurringRule(step.id, step.input as Partial<CreateRecurringRuleInput>);
      return;
    case 'recurring.delete':
      app.deleteRecurringRule(step.id);
      return;
    case 'module': {
      const module = APPLY_MODULES[step.entity];
      if (!module) throw new Error(`no saver for ${step.entity}`);
      module.apply(app, step, created, deleted);
      return;
    }
  }
}
