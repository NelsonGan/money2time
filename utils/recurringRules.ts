import type { RecurringTransactionRule } from '~/types';
import { countsAsExpenseRow } from '~/utils/spending';

const AVERAGE_DAYS_PER_YEAR = 365.2425;
const AVERAGE_DAYS_PER_MONTH = AVERAGE_DAYS_PER_YEAR / 12;

function recurringMonthlyFactor(
  pattern: RecurringTransactionRule['recurrencePattern'],
  interval: number,
): number {
  const safeInterval = Math.max(1, interval);

  switch (pattern) {
    case 'daily':
      return AVERAGE_DAYS_PER_MONTH / safeInterval;
    case 'weekly':
      return AVERAGE_DAYS_PER_MONTH / (7 * safeInterval);
    case 'yearly':
      return 1 / (12 * safeInterval);
    case 'monthly':
    default:
      return 1 / safeInterval;
  }
}

export function recurringAmountPerMonth(
  amount: number,
  pattern: RecurringTransactionRule['recurrencePattern'],
  interval: number,
): number {
  return amount * recurringMonthlyFactor(pattern, interval);
}

/**
 * Total monthly cost of the active rules that count as spending, in the
 * reporting currency.
 *
 * Every rule carries its own `currency` (a rule can be entered in MYR on an MYR
 * account while the app reports in SGD), so each amount must be converted
 * before it is summed. `convertToReporting` is the caller's live FX conversion
 * (identity when the rule is already in the reporting currency, and a
 * pass-through when no rate is cached).
 *
 * A loan's auto-repayment rule is a transfer, and it belongs in this figure
 * only when the borrower asked for the instalment to count as spending
 * (`countsAsExpense`) — the same test every other spending readout applies to
 * the rows such a rule generates. Without it the one screen that names the
 * commitment would be the only place it is missing from the monthly total.
 */
export function recurringMonthlyExpenseTotal(
  rules: readonly RecurringTransactionRule[],
  convertToReporting: (amount: number, currency: string) => number,
): number {
  return rules.reduce((total, rule) => {
    if (!rule.isActive || !countsAsExpenseRow(rule)) return total;
    return (
      total +
      recurringAmountPerMonth(
        convertToReporting(rule.amount, rule.currency),
        rule.recurrencePattern,
        rule.recurrenceInterval,
      )
    );
  }, 0);
}

function ruleBelongsToWallet(rule: RecurringTransactionRule, walletId: string): boolean {
  return (
    rule.accountId === walletId || rule.fromAccountId === walletId || rule.toAccountId === walletId
  );
}

export function filterRecurringRulesByWallet(
  rules: RecurringTransactionRule[],
  walletId: string | null | undefined,
): RecurringTransactionRule[] {
  if (!walletId) return rules;
  const filteredRules: RecurringTransactionRule[] = [];
  rules.forEach((rule) => {
    if (ruleBelongsToWallet(rule, walletId)) {
      filteredRules.push(rule);
    }
  });
  return filteredRules;
}
