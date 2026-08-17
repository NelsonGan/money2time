import { exchangeRatesRepository } from '~/lib/repositories/exchangeRatesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import {
  foldRateRecords,
  isRateStale,
  refreshRatesNow,
  runRateRefreshIfDue,
} from '~/services/exchangeRates';

jest.mock('~/lib/repositories/exchangeRatesRepository', () => ({
  exchangeRatesRepository: { upsertApiRates: jest.fn() },
}));
jest.mock('~/lib/repositories/settingsRepository', () => ({
  settingsRepository: { get: jest.fn(), updateSettings: jest.fn() },
}));

const mockedRates = exchangeRatesRepository as jest.Mocked<typeof exchangeRatesRepository>;
const mockedSettings = settingsRepository as jest.Mocked<typeof settingsRepository>;

function settings(overrides: Record<string, unknown> = {}) {
  return {
    currencyCode: 'USD',
    autoFxRefreshEnabled: true,
    lastRateFetchAt: null,
    ...overrides,
  } as never;
}

describe('isRateStale', () => {
  const now = new Date('2026-06-20T12:00:00.000Z');
  it('is stale when never fetched', () => {
    expect(isRateStale(null, now)).toBe(true);
  });
  it('is fresh within the day window', () => {
    expect(isRateStale('2026-06-20T06:00:00.000Z', now)).toBe(false);
  });
  it('is stale after the window', () => {
    expect(isRateStale('2026-06-18T06:00:00.000Z', now)).toBe(true);
  });
});

describe('runRateRefreshIfDue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('fetches, upserts, and records success on a forced refresh', async () => {
    mockedSettings.get.mockReturnValue(settings());
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        { date: '2026-06-20', base: 'USD', quote: 'USD', rate: 1 },
        { date: '2026-06-20', base: 'USD', quote: 'EUR', rate: 0.9 },
        { date: '2026-06-19', base: 'USD', quote: 'VND', rate: 25400 },
      ],
    });

    const result = await refreshRatesNow();

    expect(result).toEqual({ ok: true, asOfDate: '2026-06-20', error: null });
    expect(mockedRates.upsertApiRates).toHaveBeenCalledWith('USD', {
      EUR: { rate: 0.9, asOfDate: '2026-06-20' },
      VND: { rate: 25400, asOfDate: '2026-06-19' },
    });
    expect(mockedSettings.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastRateFetchError: null }),
    );
  });

  it('calls v2 and asks only for the currencies it supports', async () => {
    mockedSettings.get.mockReturnValue(settings());
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ date: '2026-06-20', base: 'USD', quote: 'EUR', rate: 0.9 }],
    });

    await refreshRatesNow();

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    expect(url).toContain('https://api.frankfurter.dev/v2/rates?base=USD');
    const quotes = decodeURIComponent(new URL(url).searchParams.get('quotes') ?? '').split(',');
    expect(quotes).toEqual(expect.arrayContaining(['TWD', 'VND', 'EUR']));
    // The base currency is never requested as its own quote.
    expect(quotes).not.toContain('USD');
  });

  it('records an error and does not upsert when the response holds no usable rates', async () => {
    mockedSettings.get.mockReturnValue(settings());
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ date: '2026-06-20', base: 'USD', quote: 'USD', rate: 1 }],
    });

    const result = await refreshRatesNow();

    expect(result.ok).toBe(false);
    expect(mockedRates.upsertApiRates).not.toHaveBeenCalled();
  });

  it('records an error and does not upsert when the response is not an array', async () => {
    mockedSettings.get.mockReturnValue(settings());
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ amount: 1, base: 'USD', date: '2026-06-20', rates: { EUR: 0.9 } }),
    });

    const result = await refreshRatesNow();

    expect(result.ok).toBe(false);
    expect(mockedRates.upsertApiRates).not.toHaveBeenCalled();
  });

  it('skips the network when rates are fresh and not forced', async () => {
    mockedSettings.get.mockReturnValue(settings({ lastRateFetchAt: new Date().toISOString() }));

    const result = await runRateRefreshIfDue();

    expect(result.ok).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockedRates.upsertApiRates).not.toHaveBeenCalled();
  });

  it('records an error and does not upsert on a failed request', async () => {
    mockedSettings.get.mockReturnValue(settings());
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 });

    const result = await refreshRatesNow();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/503/);
    expect(mockedRates.upsertApiRates).not.toHaveBeenCalled();
    expect(mockedSettings.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastRateFetchError: expect.any(String) }),
    );
  });

  it('refuses to auto-fetch when the reporting currency is uncovered', async () => {
    // XAF is a real ISO code the app carries no metadata for, so it can only
    // reach settings via a legacy row or a restored backup.
    mockedSettings.get.mockReturnValue(settings({ currencyCode: 'XAF' }));

    const result = await refreshRatesNow();

    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('auto-fetches for currencies v2 added over the ECB-only feed', async () => {
    mockedSettings.get.mockReturnValue(settings({ currencyCode: 'TWD' }));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ date: '2026-06-20', base: 'TWD', quote: 'VND', rate: 810 }],
    });

    const result = await refreshRatesNow();

    expect(result.ok).toBe(true);
    expect(mockedRates.upsertApiRates).toHaveBeenCalledWith('TWD', {
      VND: { rate: 810, asOfDate: '2026-06-20' },
    });
  });
});

describe('foldRateRecords', () => {
  it('drops the identity record, foreign bases, and unusable rates', () => {
    const { rates, asOfDate } = foldRateRecords('USD', [
      { date: '2026-06-20', base: 'USD', quote: 'USD', rate: 1 },
      { date: '2026-06-20', base: 'EUR', quote: 'GBP', rate: 0.86 },
      { date: '2026-06-20', base: 'USD', quote: 'AAA', rate: 0 },
      { date: '2026-06-20', base: 'USD', quote: 'BBB', rate: Number.NaN },
      { date: '', base: 'USD', quote: 'CCC', rate: 2 },
      { date: '2026-06-18', base: 'USD', quote: 'TWD', rate: 31.5 },
    ]);

    expect(rates).toEqual({ TWD: { rate: 31.5, asOfDate: '2026-06-18' } });
    expect(asOfDate).toBe('2026-06-18');
  });

  it('keeps each pair on its own observation date and reports the freshest', () => {
    const { rates, asOfDate } = foldRateRecords('USD', [
      { date: '2026-06-18', base: 'USD', quote: 'VND', rate: 25400 },
      { date: '2026-06-20', base: 'USD', quote: 'EUR', rate: 0.9 },
    ]);

    expect(rates.VND.asOfDate).toBe('2026-06-18');
    expect(rates.EUR.asOfDate).toBe('2026-06-20');
    expect(asOfDate).toBe('2026-06-20');
  });

  it('keeps the freshest observation when a pair repeats', () => {
    const { rates } = foldRateRecords('USD', [
      { date: '2026-06-18', base: 'USD', quote: 'TWD', rate: 31.5 },
      { date: '2026-06-20', base: 'USD', quote: 'TWD', rate: 31.9 },
      { date: '2026-06-19', base: 'USD', quote: 'TWD', rate: 31.7 },
    ]);

    expect(rates.TWD).toEqual({ rate: 31.9, asOfDate: '2026-06-20' });
  });

  it('reports no date when nothing usable came back', () => {
    expect(foldRateRecords('USD', [])).toEqual({ rates: {}, asOfDate: null });
  });
});
