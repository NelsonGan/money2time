import type { RateTable, TransactionWithRelations, UserSettings } from '~/types';
import { currencySymbolForCode, resolveRate } from '~/utils/currency';

/**
 * A budget's currency. Templates and budgets store null for the ledger's main
 * currency (so a budget made before budgets had currencies reads as it always
 * did), and a code for any other.
 */
export function budgetCurrencyOf(
  budget: { currency: string | null } | null | undefined,
  mainCurrency: string,
): string {
  return budget?.currency ?? mainCurrency;
}

/** The stored form of a picked currency: null when it is the main currency. */
export function storedBudgetCurrency(
  code: string | null | undefined,
  mainCurrency: string,
): string | null {
  return code && code !== mainCurrency ? code : null;
}

/**
 * The rate to freeze on a budget in `currency`: 1 unit of it in the main
 * currency (`table.base`). Null for a main-currency budget, or when the table
 * has no rate for it yet.
 */
export function budgetRateToFreeze(currency: string | null, table: RateTable): number | null {
  if (!currency || currency === table.base) return null;
  const rate = resolveRate(currency, table.base, table);
  return rate != null && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * The rate a budget values other currencies' spending through: its frozen one,
 * else the latest (a budget made while no rate was known), else null. 1 for a
 * main-currency budget.
 */
export function budgetRate(
  budget: { currency: string | null; fxRate: number | null },
  table: RateTable | null | undefined,
): number | null {
  // A row naming the main currency's code (not the stored null) is still in it.
  if (!budget.currency || budget.currency === table?.base) return 1;
  if (budget.fxRate != null && budget.fxRate > 0) return budget.fxRate;
  return table ? budgetRateToFreeze(budget.currency, table) : null;
}

/**
 * What one expense counts for against a budget in `currency`, or null when it
 * cannot be converted (no rate). A main-currency budget (`currency` null)
 * reads the frozen reporting amount, as Insights does. A budget in another
 * currency takes spending in its own currency at face value, and converts the
 * rest from its frozen reporting amount through `rate` (1 unit of the budget's
 * currency in the main currency), so its figures never move with the rate.
 */
export function budgetSpendValue(
  transaction: Pick<TransactionWithRelations, 'amount' | 'currency' | 'reportingAmount'>,
  currency: string | null,
  rate: number | null,
): number | null {
  const reporting = transaction.reportingAmount ?? transaction.amount;
  if (!currency) return reporting;
  if (transaction.currency === currency) return transaction.amount;
  if (rate == null || !(rate > 0)) return null;
  return reporting / rate;
}

/** A budget total in the main currency (Review's pace card), or null without a rate. */
export function budgetTotalInMainCurrency(
  budget: { currency: string | null; fxRate: number | null; totalAmount: number },
  table: RateTable | null | undefined,
): number | null {
  const rate = budgetRate(budget, table);
  return rate == null ? null : budget.totalAmount * rate;
}

/**
 * `settings` with the budget's currency, for the budget formatters (`money`),
 * so every figure of a budget reads in its own currency.
 */
export function withBudgetCurrency<T extends Pick<UserSettings, 'currencyCode' | 'currencySymbol'>>(
  settings: T,
  currency: string | null | undefined,
): T {
  if (!currency || currency === settings.currencyCode) return settings;
  return { ...settings, currencyCode: currency, currencySymbol: currencySymbolForCode(currency) };
}
