import { exchangeRatesRepository } from '~/lib/repositories/exchangeRatesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import { isRateStale, refreshRatesNow, runRateRefreshIfDue } from '~/services/exchangeRates';

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
      json: async () => ({ amount: 1, base: 'USD', date: '2026-06-20', rates: { EUR: 0.9 } }),
    });

    const result = await refreshRatesNow();

    expect(result).toEqual({ ok: true, asOfDate: '2026-06-20', error: null });
    expect(mockedRates.upsertApiRates).toHaveBeenCalledWith('USD', '2026-06-20', { EUR: 0.9 });
    expect(mockedSettings.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ lastRateFetchError: null }),
    );
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
    mockedSettings.get.mockReturnValue(settings({ currencyCode: 'TWD' }));

    const result = await refreshRatesNow();

    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
