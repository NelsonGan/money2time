/**
 * Exchange-rate sync via the Frankfurter API (https://frankfurter.dev) — ECB
 * reference rates, free, no API key. Uses the global `fetch`, so the same module
 * works on iOS, Android, web, and in tests (where `fetch` is mocked).
 *
 * Rates are cached locally in the `exchange_rates` table; the network call only
 * refreshes the cache, so the app is fully functional offline with last-known
 * rates. Currencies the ECB feed doesn't cover fall back to manual entry.
 */

import { exchangeRatesRepository } from '~/lib/repositories/exchangeRatesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import type { RateRefreshResult } from '~/types';
import { isAutoRateSupported } from '~/utils/currency';
import { getErrorMessage } from '~/utils/errorHandling';
import { nowIso } from '~/utils/id';

const FRANKFURTER_BASE_URL = 'https://api.frankfurter.dev/v1';
/** Refresh at most about once per day. */
const RATE_STALE_HOURS = 20;
const FETCH_TIMEOUT_MS = 15000;

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export function isRateStale(lastFetchAt: string | null, now: Date = new Date()): boolean {
  if (!lastFetchAt) return true;
  const last = new Date(lastFetchAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= RATE_STALE_HOURS * 60 * 60 * 1000;
}

async function fetchJson(url: string): Promise<FrankfurterResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Frankfurter request failed (${response.status})`);
    }
    return (await response.json()) as FrankfurterResponse;
  } finally {
    clearTimeout(timeout);
  }
}

// Re-entrancy guard: foreground trigger, manual button, and any background
// trigger can all fire at once. Only one refresh runs at a time; a `force` call
// (manual "Update rates") starts its own run after the in-flight one resolves.
let runningPromise: Promise<RateRefreshResult> | null = null;

export async function runRateRefreshIfDue(opts?: { force?: boolean }): Promise<RateRefreshResult> {
  if (runningPromise) {
    const existing = await runningPromise;
    if (!opts?.force) return existing;
  }

  const promise = (async (): Promise<RateRefreshResult> => {
    const settings = settingsRepository.get();
    if (!opts?.force && !settings.autoFxRefreshEnabled) {
      return { ok: false, asOfDate: null, error: null };
    }
    if (!opts?.force && !isRateStale(settings.lastRateFetchAt)) {
      return { ok: true, asOfDate: null, error: null };
    }

    const base = settings.currencyCode;
    if (!isAutoRateSupported(base)) {
      // Reporting currency itself isn't on the ECB feed — can't auto-fetch a
      // useful table. Leave manual rates in place.
      const error = `${base} is not supported by automatic rates`;
      settingsRepository.updateSettings({ lastRateFetchError: error });
      return { ok: false, asOfDate: null, error };
    }

    try {
      const data = await fetchJson(
        `${FRANKFURTER_BASE_URL}/latest?base=${encodeURIComponent(base)}`,
      );
      exchangeRatesRepository.upsertApiRates(base, data.date, data.rates);
      settingsRepository.updateSettings({ lastRateFetchAt: nowIso(), lastRateFetchError: null });
      return { ok: true, asOfDate: data.date, error: null };
    } catch (e) {
      const error = getErrorMessage(e, 'Failed to fetch exchange rates');
      settingsRepository.updateSettings({ lastRateFetchError: error });
      return { ok: false, asOfDate: null, error };
    }
  })();

  runningPromise = promise;
  try {
    return await promise;
  } finally {
    if (runningPromise === promise) runningPromise = null;
  }
}

export function refreshRatesNow(): Promise<RateRefreshResult> {
  return runRateRefreshIfDue({ force: true });
}

/**
 * Historical rate `from -> to` for a specific date (YYYY-MM-DD). Used when
 * snapshotting back-dated transactions. Returns null when unavailable.
 */
export async function fetchHistoricalRate(
  from: string,
  to: string,
  date: string,
): Promise<number | null> {
  if (from === to) return 1;
  if (!isAutoRateSupported(from) || !isAutoRateSupported(to)) return null;
  try {
    const data = await fetchJson(
      `${FRANKFURTER_BASE_URL}/${date}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
    );
    const rate = data.rates?.[to];
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}
