/**
 * Budgets in another currency than the main one, as the app keeps them
 * (features/budget/lib/budgetCurrency.ts in apps/mobile):
 *
 * - `currency` is null for the main currency (every budget from before
 *   currencies, and every one an older app writes), else a code.
 * - `fx_rate` is how much one unit of that currency was worth in the main one
 *   when the budget was made. Spending in the budget's own currency counts at
 *   the amount entered; other spending is its main-currency amount divided by
 *   that rate, so a past budget never moves with the exchange rate.
 * - A budget made with no rate falls back to the latest one; with none at all,
 *   that spending is left out and counted as not converted.
 */

/** A budget's currency and frozen rate, as the model carries them. */
export type BudgetCurrency = { currency: string | null; fxRate: number | null };

/** One unit of `code` in the main currency at the latest rate, or null without one. */
export type LatestRate = (code: string) => number | null;

/**
 * The rate a budget values other currencies' spending through: 1 for a
 * main-currency budget, its frozen rate, else the latest one, else null.
 */
export function budgetRate(budget: BudgetCurrency, mainCurrency: string, latest: LatestRate): number | null {
  if (!budget.currency || budget.currency === mainCurrency) return 1;
  if (budget.fxRate !== null && budget.fxRate > 0) return budget.fxRate;
  const rate = latest(budget.currency);
  return rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * What one expense counts for against a budget, in the budget's currency, or
 * null when it cannot be converted. `amount` is the expense's main-currency
 * amount (signed as the dashboard sums it), `original` and `currency` what was
 * entered. A main-currency budget reads `amount`, exactly as before.
 */
export function budgetSpendValue(
  tx: { amount: number; original: number; currency: string },
  budgetCurrency: string | null,
  rate: number | null,
): number | null {
  if (!budgetCurrency) return tx.amount;
  if (tx.currency === budgetCurrency) return tx.original;
  if (rate === null || !(rate > 0)) return null;
  return tx.amount / rate;
}

/** A stored budget currency, read back: null when missing, blank, or the main currency. */
export function storedBudgetCurrency(value: unknown, mainCurrency: string): string | null {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) && value !== mainCurrency ? value : null;
}

/** A stored frozen rate, read back: null unless a positive number. */
export function storedBudgetRate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * An exchange rate for display, in the locale's digits, with the app's
 * precision: 2 decimals from 100, 4 from 1, else 4 significant digits.
 */
export function formatFxRate(rate: number, locale?: string): string {
  const options: Intl.NumberFormatOptions =
    rate >= 100
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : rate >= 1
        ? { minimumFractionDigits: 4, maximumFractionDigits: 4 }
        : { minimumSignificantDigits: 4, maximumSignificantDigits: 4 };
  return new Intl.NumberFormat(locale, { ...options, useGrouping: true }).format(rate);
}

/**
 * The latest rate for a budget currency from a model's rate table (`toBase`),
 * or null without one. A backup with no rates table has no rate at all
 * (`toBase` would hand the amount back unchanged, a false 1:1).
 */
export function latestBudgetRate(model: {
  raw: { exchange_rates?: unknown };
  toBase: (amount: number, currency: string | null | undefined) => number | null;
}): LatestRate {
  return (code) => {
    if (!Array.isArray(model.raw.exchange_rates)) return null;
    const rate = model.toBase(1, code);
    return rate !== null && Number.isFinite(rate) && rate > 0 ? rate : null;
  };
}
