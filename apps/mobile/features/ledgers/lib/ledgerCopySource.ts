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
import type { MonthCycle } from '~/types';
import { monthCycleOf } from '~/utils/financialMonth';
import { nowIso } from '~/utils/id';

/** What a new ledger would get from copying `ledgerId`, for the editor's captions. */
export interface LedgerCopySource {
  /**
   * What each part would copy. Recurring is the most it can be: a rule comes
   * along only with the accounts it names (`recurringCount`).
   */
  counts: Record<LedgerCopyPart, number>;
  /** The parts each copyable recurring rule needs (accounts, goals, loans). */
  recurringNeeds: readonly (readonly LedgerCopyPart[])[];
  /** The source's month cycle: its start day and customized months. */
  monthCycle: MonthCycle;
  /** The source's currency: an "Everything" copy keeps it. */
  currency: { code: string; symbol: string };
}

/** How many recurring rules come along with `parts`. */
export function recurringCount(
  source: LedgerCopySource,
  parts: ReadonlySet<LedgerCopyPart>,
): number {
  if (!parts.has('recurring')) return 0;
  return source.recurringNeeds.filter((needs) => needs.every((part) => parts.has(part))).length;
}

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
