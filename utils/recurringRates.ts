import type { RecurringTransactionRule } from '~/types';

/** Average Gregorian month length, used for fractional month arithmetic. */
export const DAYS_PER_MONTH = 365.2425 / 12;

/**
 * Monthly-equivalent inflow rate (in the receiving account's currency) from
 * the active recurring transfer rules that pay into it. Cross-currency rules
 * credit `toAmount` in the receiving account's currency, so it wins over
 * `amount`, which is denominated in the sending account's.
 *
 * Shared by savings goals (auto-save) and loans (auto-repayment): both ask
 * "how much lands in this account per month on autopilot?".
 */
export function monthlyEquivalentInflowRate(
  rules: RecurringTransactionRule[],
  accountId: string,
): number | null {
  let total = 0;
  let found = false;
  for (const rule of rules) {
    if (!rule.isActive || rule.type !== 'transfer' || rule.toAccountId !== accountId) continue;
    const perRun = rule.toAmount ?? rule.amount;
    const interval = Math.max(1, rule.recurrenceInterval);
    let perMonth = 0;
    switch (rule.recurrencePattern) {
      case 'daily':
        perMonth = (perRun * DAYS_PER_MONTH) / interval;
        break;
      case 'weekly':
        perMonth = (perRun * DAYS_PER_MONTH) / (7 * interval);
        break;
      case 'monthly':
        perMonth = perRun / interval;
        break;
      case 'yearly':
        perMonth = perRun / (12 * interval);
        break;
    }
    if (perMonth > 0) {
      total += perMonth;
      found = true;
    }
  }
  return found ? total : null;
}
