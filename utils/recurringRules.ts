import type { RecurringTransactionRule } from '~/types';

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
