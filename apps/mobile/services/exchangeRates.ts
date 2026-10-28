/**
 * Exchange-rate sync via the Frankfurter API (https://frankfurter.dev) — free,
 * no API key. Uses the global `fetch`, so the same module works on iOS, Android,
 * web, and in tests (where `fetch` is mocked).
 *
 * We call the **v2** endpoint, which blends reference rates from 50+
 * institutional sources (central banks, the IMF, the Fed) through a USD pivot.
 * The older v1 endpoint is frozen and ECB-only, so it omits currencies our
 * picker offers — TWD and VND among them. See {@link FRANKFURTER_SUPPORTED}.
 *
 * Rates are always fetched against {@link PIVOT_CURRENCY} and divided down to
 * the user's reporting currency locally, never fetched with the reporting
 * currency as the base. See {@link deriveRatesForBase} for why.
 *
 * Rates are cached locally in the `exchange_rates` table; the network call only
 * refreshes the cache, so the app is fully functional offline with last-known
 * rates. Currencies the feed doesn't cover fall back to manual entry.
 */

import { exchangeRatesRepository } from '~/lib/repositories/exchangeRatesRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';
import type { RateRefreshResult } from '~/types';
import { FRANKFURTER_SUPPORTED, isAutoRateSupported } from '~/utils/currency';
import { getErrorMessage } from '~/utils/errorHandling';
import { nowIso } from '~/utils/id';

const FRANKFURTER_BASE_URL = 'https://api.frankfurter.dev/v2';
/**
 * The base every refresh is fetched against. This is the feed's own pivot, so
 * asking for it returns the blended quotes undivided, at full precision.
 */
const PIVOT_CURRENCY = 'USD';
/** Refresh at most about once per day. */
const RATE_STALE_HOURS = 20;
const FETCH_TIMEOUT_MS = 15000;

/** One blended pair as returned by `GET /v2/rates`: `1 base = rate quote`. */
export interface FrankfurterRate {
  date: string;
  base: string;
  quote: string;
  rate: number;
}

export interface FoldedRates {
  /** quote code -> rate and the date that pair was observed. */
  rates: Record<string, { rate: number; asOfDate: string }>;
  /** Most recent observation date across all kept pairs. */
  asOfDate: string | null;
}

/**
 * Fold v2's flat record array into the per-quote shape the cache stores.
 *
 * Unlike v1's single top-level `date`, v2 dates each pair individually —
 * providers publish on their own schedules, so a response can mix observation
 * dates. Each pair keeps its own date rather than being stamped with one
 * response-wide value.
 *
 * Drops the identity record (`base === quote`, rate 1), records for a different
 * base, and anything unusable, so a malformed row can't poison the cache.
 */
export function foldRateRecords(base: string, records: FrankfurterRate[]): FoldedRates {
  const rates: Record<string, { rate: number; asOfDate: string }> = {};
  let asOfDate: string | null = null;

  for (const record of records) {
    if (!record || record.base !== base || record.quote === base) continue;
    if (!record.quote || !record.date) continue;
    if (!Number.isFinite(record.rate) || record.rate <= 0) continue;

    const existing = rates[record.quote];
    // A pair should appear once; if it repeats, keep the freshest observation.
    if (existing && existing.asOfDate >= record.date) continue;
    rates[record.quote] = { rate: record.rate, asOfDate: record.date };
    if (!asOfDate || record.date > asOfDate) asOfDate = record.date;
  }

  return { rates, asOfDate };
}

export function isRateStale(lastFetchAt: string | null, now: Date = new Date()): boolean {
  if (!lastFetchAt) return true;
  const last = new Date(lastFetchAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= RATE_STALE_HOURS * 60 * 60 * 1000;
}

async function fetchJson(url: string): Promise<FrankfurterRate[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Frankfurter request failed (${response.status})`);
    }
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) {
      throw new Error('Frankfurter returned an unexpected response');
    }
    return body as FrankfurterRate[];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Ask for exactly the currencies we support. v2 covers far more than we carry
 * name/symbol metadata for, and `quotes` is a pure row filter (it does not
 * change blended values), so this trims the payload without shifting any rate.
 */
function quotesParam(): string {
  return [...FRANKFURTER_SUPPORTED].filter((code) => code !== PIVOT_CURRENCY).join(',');
}

/**
 * Re-express pivot-based rates (`1 pivot = rate quote`) against `base`.
 *
 * The feed will happily quote any currency as the base, but it rounds every
 * rate to a fixed number of decimals, and against a weak base every rate is a
 * very small number that the rounding flattens. Asked for `base=IRR` it returns
 * exactly `1.0e-06` for USD, EUR and GBP alike: the dollar rate is 37% out and
 * the three currencies become indistinguishable. Dividing two pivot rates
 * instead keeps both operands in the range the feed reports precisely, so the
 * derived rate is as good as the pivot quotes are.
 *
 * A derived pair is only as fresh as its stalest leg, so it takes the earlier
 * of the two observation dates rather than claiming the later one.
 */
export function deriveRatesForBase(base: string, pivot: FoldedRates): FoldedRates {
  if (base === PIVOT_CURRENCY) return pivot;

  const baseLeg = pivot.rates[base];
  if (!baseLeg || !Number.isFinite(baseLeg.rate) || baseLeg.rate <= 0) {
    return { rates: {}, asOfDate: null };
  }

  const rates: FoldedRates['rates'] = {
    // `1 pivot = baseLeg.rate base`, so `1 base = 1/baseLeg.rate pivot`.
    [PIVOT_CURRENCY]: { rate: 1 / baseLeg.rate, asOfDate: baseLeg.asOfDate },
  };

  for (const [quote, leg] of Object.entries(pivot.rates)) {
    if (quote === base) continue;
    const pairDate = leg.asOfDate < baseLeg.asOfDate ? leg.asOfDate : baseLeg.asOfDate;
    rates[quote] = { rate: leg.rate / baseLeg.rate, asOfDate: pairDate };
  }

  // Every pair went through the base leg, so none can be fresher than it is.
  return { rates, asOfDate: baseLeg.asOfDate };
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
      // Reporting currency itself isn't on the feed — can't auto-fetch a useful
      // table. Reachable via a legacy settings row or a restored backup, since
      // every currency the pickers offer is covered. Leave manual rates in place.
      const error = `${base} is not supported by automatic rates`;
      settingsRepository.updateSettings({ lastRateFetchError: error });
      return { ok: false, asOfDate: null, error };
    }

    try {
      const records = await fetchJson(
        `${FRANKFURTER_BASE_URL}/rates?base=${encodeURIComponent(PIVOT_CURRENCY)}` +
          `&quotes=${encodeURIComponent(quotesParam())}`,
      );
      const pivot = foldRateRecords(PIVOT_CURRENCY, records);
      if (!pivot.asOfDate) {
        throw new Error(`Frankfurter returned no usable rates for ${PIVOT_CURRENCY}`);
      }
      const { rates, asOfDate } = deriveRatesForBase(base, pivot);
      if (!asOfDate) {
        throw new Error(`Frankfurter returned no ${PIVOT_CURRENCY} rate for ${base}`);
      }
      exchangeRatesRepository.upsertApiRates(base, rates);
      settingsRepository.updateSettings({ lastRateFetchAt: nowIso(), lastRateFetchError: null });
      return { ok: true, asOfDate, error: null };
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
