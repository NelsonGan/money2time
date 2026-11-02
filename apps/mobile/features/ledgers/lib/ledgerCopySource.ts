import { isInstalmentPlan } from '~/features/instalments/lib/instalmentPlan';
import {
  copiedRuleNextRun,
  copyPartOfAccountType,
  isCopiedAccount,
  LEDGER_COPY_PARTS,
  type LedgerCopyPart,
} from '~/lib/db/ledgerCopy';
import { withLedgerScope } from '~/lib/db/ledgerScope';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { albumsRepository } from '~/lib/repositories/albumsRepository';
import { budgetTemplatesRepository } from '~/lib/repositories/budgetTemplatesRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { itemsRepository } from '~/lib/repositories/itemsRepository';
import { ledgersRepository } from '~/lib/repositories/ledgersRepository';
import { recurringRulesRepository } from '~/lib/repositories/recurringRulesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import { monthCycleOf } from '~/utils/financialMonth';
import { nowIso } from '~/utils/id';

import type { LedgerCopySource } from './ledgerCopyChoice';

/** Read any ledger's copyable counts, month cycle and currency, whichever ledger is open. */
export function readLedgerCopySource(ledgerId: string): LedgerCopySource {
  return withLedgerScope(ledgerId, () => {
    const now = nowIso();
    const allParts = new Set<LedgerCopyPart>(LEDGER_COPY_PARTS);
    const accounts = accountsRepository.list();
    const hasLoans = accounts.some((account) => account.type === 'loan');
    const loanBalances = new Map(
      hasLoans
        ? accountsRepository.getBalances().map((row) => [row.accountId, row.balance] as const)
        : [],
    );
    // The part each copyable account comes with, by id.
    const partOfAccount = new Map<string, LedgerCopyPart>();
    for (const account of accounts) {
      const part = copyPartOfAccountType(account.type);
      if (part && isCopiedAccount(account, allParts, loanBalances)) {
        partOfAccount.set(account.id, part);
      }
    }
    const count = (part: LedgerCopyPart) =>
      [...partOfAccount.values()].filter((value) => value === part).length;
    const categories = categoriesRepository.list();
    const categoryIds = new Set(categories.map((category) => category.id));

    const recurringNeeds: LedgerCopyPart[][] = [];
    for (const rule of recurringRulesRepository.list()) {
      // Instalment plans are not copied (see `ledgerPartsCopySpecs`).
      if (isInstalmentPlan(rule)) continue;
      if (copiedRuleNextRun(rule, now) === null) continue;
      if (rule.categoryId && !categoryIds.has(rule.categoryId)) continue;
      const needs = new Set<LedgerCopyPart>(['accounts', 'categories']);
      let copyable = true;
      for (const id of [rule.accountId, rule.fromAccountId, rule.toAccountId]) {
        if (!id) continue;
        const part = partOfAccount.get(id);
        if (part) needs.add(part);
        else copyable = false;
      }
      if (copyable) recurringNeeds.push([...needs]);
    }

    return {
      counts: {
        accounts: count('accounts'),
        categories: categories.length,
        goals: count('goals'),
        loans: count('loans'),
        recurring: recurringNeeds.length,
        budgets: budgetTemplatesRepository.list().length,
        items: itemsRepository.list().length,
        albums: albumsRepository.list().length,
      },
      recurringNeeds,
      monthCycle: monthCycleOf(settingsRepository.get()),
      currency: ledgersRepository.activeReportingCurrency(),
    };
  });
}
