import { ALL_CURRENCIES, MAJOR_CURRENCIES } from '~/constants/appDefaults';
import type { ExchangeRate } from '~/types';
import {
  buildRateTable,
  convert,
  currencySymbolForCode,
  enabledEntryCurrencies,
  FRANKFURTER_SUPPORTED,
  isAutoRateSupported,
  resolvePinnedCurrency,
  resolveRate,
} from '~/utils/currency';

function rate(overrides: Partial<ExchangeRate>): ExchangeRate {
  return {
    id: overrides.id ?? 'r',
    baseCurrency: overrides.baseCurrency ?? 'USD',
    quoteCurrency: overrides.quoteCurrency ?? 'EUR',
    rate: overrides.rate ?? 0.9,
    asOfDate: overrides.asOfDate ?? '2026-06-20',
    source: overrides.source ?? 'api',
    updatedAt: overrides.updatedAt ?? '2026-06-20T00:00:00.000Z',
  };
}

describe('buildRateTable', () => {
  it('includes the base at 1 and tracks the latest asOfDate', () => {
    const table = buildRateTable('USD', [
      rate({ quoteCurrency: 'EUR', rate: 0.9, asOfDate: '2026-06-19' }),
      rate({ quoteCurrency: 'JPY', rate: 158, asOfDate: '2026-06-20' }),
    ]);
    expect(table.base).toBe('USD');
    expect(table.rates.USD).toBe(1);
    expect(table.rates.EUR).toBe(0.9);
    expect(table.rates.JPY).toBe(158);
    expect(table.asOfDate).toBe('2026-06-20');
  });

  it('inverts rows stored against a different base', () => {
    // Row says 1 EUR = 1.1 USD; with base USD that means 1 USD = 1/1.1 EUR.
    const table = buildRateTable('USD', [
      rate({ baseCurrency: 'EUR', quoteCurrency: 'USD', rate: 1.1 }),
    ]);
    expect(table.rates.EUR).toBeCloseTo(1 / 1.1, 8);
  });
});

describe('resolveRate', () => {
  const table = buildRateTable('USD', [
    rate({ quoteCurrency: 'EUR', rate: 0.9 }),
    rate({ quoteCurrency: 'GBP', rate: 0.8 }),
  ]);

  it('returns 1 for identity', () => {
    expect(resolveRate('EUR', 'EUR', table)).toBe(1);
  });

  it('derives a cross rate via the base', () => {
    // 1 EUR -> ? GBP. 1 USD = 0.9 EUR = 0.8 GBP, so 1 EUR = 0.8/0.9 GBP.
    expect(resolveRate('EUR', 'GBP', table)).toBeCloseTo(0.8 / 0.9, 8);
  });

  it('returns null when a leg is missing', () => {
    expect(resolveRate('EUR', 'JPY', table)).toBeNull();
  });
});

describe('convert', () => {
  const table = buildRateTable('USD', [rate({ quoteCurrency: 'EUR', rate: 0.9 })]);

  it('is identity for same currency', () => {
    expect(convert(100, 'USD', 'USD', table)).toEqual({ value: 100, rateUsed: 1 });
  });

  it('converts via the rate table', () => {
    const result = convert(100, 'USD', 'EUR', table);
    expect(result.value).toBe(90);
    expect(result.rateUsed).toBeCloseTo(0.9, 8);
  });

  it('returns the input unchanged with null rate when unavailable', () => {
    const result = convert(100, 'USD', 'JPY', table);
    expect(result).toEqual({ value: 100, rateUsed: null });
  });
});

describe('multi-currency model invariant (entry -> account -> reporting)', () => {
  // Reporting currency = MYR. A transaction's frozen account-currency value
  // (account_amount) and reporting value (reporting_amount) must stay consistent
  // so per-account balances converted to reporting match the reporting snapshot
  // (no drift / double counting in group sums).
  const table = buildRateTable('MYR', [
    rate({ baseCurrency: 'MYR', quoteCurrency: 'USD', rate: 0.21 }),
    rate({ baseCurrency: 'MYR', quoteCurrency: 'EUR', rate: 0.2 }),
  ]);
  const reporting = 'MYR';

  const check = (amount: number, entry: string, account: string) => {
    const accountAmount = convert(amount, entry, account, table).value;
    const reportingAmount = convert(amount, entry, reporting, table).value;
    // Converting the frozen account-currency value to reporting (what group
    // sums do) must equal the direct reporting snapshot.
    const viaAccount = convert(accountAmount, account, reporting, table).value;
    expect(viaAccount).toBeCloseTo(reportingAmount, 6);
  };

  it('MYR (primary) entry in a USD (sub) account', () => check(100, 'MYR', 'USD'));
  it('USD (sub) entry in a MYR (primary) account', () => check(100, 'USD', 'MYR'));
  it('EUR (sub) entry in a USD (sub) account (triple-currency)', () => check(100, 'EUR', 'USD'));
  it('USD (sub) entry in a USD (sub) account', () => check(100, 'USD', 'USD'));
});

describe('isAutoRateSupported', () => {
  it('recognizes currencies the v2 feed covers', () => {
    expect(isAutoRateSupported('USD')).toBe(true);
    expect(isAutoRateSupported('SGD')).toBe(true);
  });

  it('covers the currencies the ECB-only v1 feed left on manual entry', () => {
    for (const code of ['TWD', 'VND', 'PKR', 'BDT', 'AED', 'RUB', 'UAH']) {
      expect(isAutoRateSupported(code)).toBe(true);
    }
  });

  it('rejects codes the app carries no metadata for', () => {
    expect(isAutoRateSupported('ZZZ')).toBe(false);
    expect(isAutoRateSupported('')).toBe(false);
  });

  it('only claims currencies the pickers can render', () => {
    const known = new Set(ALL_CURRENCIES.map((c) => c.code));
    for (const code of FRANKFURTER_SUPPORTED) {
      expect(known.has(code)).toBe(true);
    }
  });

  it('covers every currency onboarding offers as the reporting currency', () => {
    // Onboarding picks the reporting currency from MAJOR_CURRENCIES, but the FX
    // screen only refreshes a reporting currency the feed covers. When the two
    // disagreed, onboarding could strand a user (TWD, VND) on a currency whose
    // rates would never update.
    const stranded = MAJOR_CURRENCIES.map((c) => c.code).filter((c) => !isAutoRateSupported(c));
    expect(stranded).toEqual([]);
  });
});

describe('currencySymbolForCode', () => {
  it('maps known codes and falls back to the code itself', () => {
    expect(currencySymbolForCode('USD')).toBe('$');
    expect(currencySymbolForCode('EUR')).toBe('€');
    expect(currencySymbolForCode('ZZZ')).toBe('ZZZ');
  });
});

describe('enabledEntryCurrencies', () => {
  it('unions the reporting currency, sub-currencies, and account currencies', () => {
    expect(
      enabledEntryCurrencies('MYR', ['EUR'], [{ currency: 'USD' }, { currency: null }]),
    ).toEqual(['MYR', 'EUR', 'USD']);
  });

  it('deduplicates and always contains the reporting currency', () => {
    expect(enabledEntryCurrencies('MYR', ['MYR'], [{ currency: 'MYR' }])).toEqual(['MYR']);
    expect(enabledEntryCurrencies('MYR', [], [])).toEqual(['MYR']);
  });
});

describe('resolvePinnedCurrency', () => {
  it('returns the pinned currency only while it is enabled', () => {
    expect(resolvePinnedCurrency('EUR', ['MYR', 'EUR'])).toBe('EUR');
    // A stale pin (e.g. a removed sub-currency) resolves to null so entry
    // flows fall back to the account/reporting currency.
    expect(resolvePinnedCurrency('JPY', ['MYR', 'EUR'])).toBeNull();
    expect(resolvePinnedCurrency(null, ['MYR'])).toBeNull();
    expect(resolvePinnedCurrency(undefined, ['MYR'])).toBeNull();
    expect(resolvePinnedCurrency('', ['MYR', ''])).toBeNull();
  });
});
