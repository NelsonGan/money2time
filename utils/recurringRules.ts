import type { RecurringTransactionRule } from '~/types';

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
