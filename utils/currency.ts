import { ALL_CURRENCIES } from '~/constants/appDefaults';
import type { ExchangeRate, RateTable } from '~/types';

import { normalizeMoneyAmount } from './formatters';

const EMPTY_RATE_TABLE: RateTable = { base: 'USD', rates: { USD: 1 }, asOfDate: null };

/**
 * Build an in-memory {@link RateTable} relative to `base` from cached rows.
 * Rows already keyed to `base` are used directly (`1 base = rate quote`); rows
 * keyed the other way (`quote === base`) are inverted. Rows for other bases are
 * ignored.
 */
export function buildRateTable(base: string, rows: ExchangeRate[]): RateTable {
  const rates: Record<string, number> = { [base]: 1 };
  let asOfDate: string | null = null;

  for (const row of rows) {
    if (row.asOfDate && (!asOfDate || row.asOfDate > asOfDate)) {
      asOfDate = row.asOfDate;
    }
    if (row.baseCurrency === base) {
      rates[row.quoteCurrency] = row.rate;
    } else if (row.quoteCurrency === base && row.rate !== 0) {
      // Row stores `1 row.base = rate base`, so `1 base = 1/rate row.base`.
      rates[row.baseCurrency] = 1 / row.rate;
    }
  }

  return { base, rates, asOfDate };
}

export const emptyRateTable = (base = 'USD'): RateTable => ({
  ...EMPTY_RATE_TABLE,
  base,
  rates: { [base]: 1 },
});

export interface ConvertResult {
  /** Converted value, or the original amount when no rate was available. */
  value: number;
  /** The rate applied (`from -> to`), or null when conversion was not possible. */
  rateUsed: number | null;
}

/** Keep editable FX values precise without filling the field with trailing zeros. */
export function formatEditableFxValue(value: number, maximumDecimals = 8): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const scale = 10 ** maximumDecimals;
  return String(Math.round(value * scale) / scale);
}

/** Parse a positive decimal from a localized numeric input. */
export function parseEditableFxValue(value: string): number | null {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Reporting-currency amount implied by an entered amount and custom FX rate. */
export function reportingAmountFromRate(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) return null;
  return normalizeMoneyAmount(amount * rate);
}

/** FX rate implied by an entered amount and an edited reporting-currency amount. */
export function rateFromReportingAmount(amount: number, reportingAmount: number): number | null {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isFinite(reportingAmount) ||
    reportingAmount <= 0
  ) {
    return null;
  }
  return reportingAmount / amount;
}

/**
 * Resolve the rate `from -> to` (i.e. `1 from = rate to`) using a rate table
 * whose entries are all relative to `table.base`. Returns null when either leg
 * is missing.
 */
export function resolveRate(from: string, to: string, table: RateTable): number | null {
  if (from === to) return 1;
  const fromRate = from === table.base ? 1 : table.rates[from];
  const toRate = to === table.base ? 1 : table.rates[to];
  if (fromRate === undefined || toRate === undefined || fromRate === 0) return null;
  // `1 from = (1/fromRate) base` and `1 base = toRate to`.
  return (1 / fromRate) * toRate;
}

/**
 * Convert `amount` from one currency to another using the cached rate table.
 * Identity when `from === to`. When no rate is available the input amount is
 * returned unchanged with `rateUsed: null` so callers can badge/omit it rather
 * than silently showing a wrong number.
 */
export function convert(amount: number, from: string, to: string, table: RateTable): ConvertResult {
  if (from === to) return { value: normalizeMoneyAmount(amount), rateUsed: 1 };
  const rate = resolveRate(from, to, table);
  if (rate === null) return { value: amount, rateUsed: null };
  return { value: normalizeMoneyAmount(amount * rate), rateUsed: rate };
}

const currencyByCode = new Map(ALL_CURRENCIES.map((c) => [c.code, c]));

/**
 * Currencies the Frankfurter v2 feed cannot quote, even though we carry
 * metadata for them. `BGN` retired when Bulgaria adopted the euro, and the feed
 * dropped it from both current and historical responses, so asking for it
 * returned nothing and left the FX screen claiming an auto rate that could
 * never arrive. Metadata stays in {@link ALL_CURRENCIES} so stored rows and old
 * backups still render; only the auto-rate claim goes away, which puts it on
 * manual entry like any other unquoted currency.
 */
const FEED_UNSUPPORTED = new Set<string>(['BGN']);

/**
 * Currency codes we ask the Frankfurter v2 feed for, and the set the FX picker
 * offers. v2 blends 50+ institutional providers and quotes every currency in
 * {@link ALL_CURRENCIES} bar the exceptions above (the ECB-only v1 feed we used
 * previously covered 31 of them and left TWD, VND, PKR, BDT, AED, RUB and UAH
 * on manual entry).
 *
 * Derived from {@link ALL_CURRENCIES} rather than repeated as a literal: the
 * two have to agree entry for entry, and a second 150-line list is a place for
 * them to silently drift apart. It is still fully static, so it gates the
 * picker and the reporting-currency guard before any network call, exactly as
 * it must on a first launch and offline.
 */
export const FRANKFURTER_SUPPORTED: ReadonlySet<string> = new Set<string>(
  ALL_CURRENCIES.map((c) => c.code).filter((code) => !FEED_UNSUPPORTED.has(code)),
);

/** Whether the Frankfurter feed can fetch rates for a currency automatically. */
export function isAutoRateSupported(code: string): boolean {
  return FRANKFURTER_SUPPORTED.has(code);
}

/**
 * Currencies the entry flows can record amounts in: the reporting currency,
 * the user's sub-currencies, and any currency an account already uses.
 * Quick add, receipt scan, and the Quick Entry settings screen must all agree
 * on this set — it is what a stored default currency is validated against.
 */
export function enabledEntryCurrencies(
  reportingCurrency: string,
  fxCurrencies: readonly string[],
  accounts: ReadonlyArray<{ currency?: string | null }>,
): string[] {
  const set = new Set<string>([reportingCurrency, ...fxCurrencies]);
  for (const account of accounts) {
    if (account.currency) set.add(account.currency);
  }
  return Array.from(set);
}

/**
 * Resolve the stored Quick Entry default currency against the currencies
 * currently available. Quick add persists the last-used entry currency, so a
 * stale code can linger (e.g. JPY from a trip after the JPY sub-currency was
 * removed); it resolves to null — "match the account currency" — so no entry
 * flow ever records in a currency the settings UI no longer shows.
 */
export function resolvePinnedCurrency(
  pinned: string | null | undefined,
  enabledCurrencies: readonly string[],
): string | null {
  return pinned && enabledCurrencies.includes(pinned) ? pinned : null;
}

export function currencySymbolForCode(code: string): string {
  return currencyByCode.get(code)?.symbol ?? code;
}

export function currencyNameForCode(code: string): string {
  return currencyByCode.get(code)?.name ?? code;
}
