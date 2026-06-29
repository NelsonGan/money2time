import type { Item, ItemStats } from '~/types';
import { amountToHoursByRate } from '~/utils/formatters';

/**
 * Whole-day count between two `YYYY-MM-DD` day keys (end − start). Uses UTC so
 * daylight-saving transitions never shift the count. Returns 0 for invalid or
 * inverted ranges.
 */
export function daysBetweenDayKeys(startKey: string, endKey: string): number {
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const end = Date.parse(`${endKey}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const diff = Math.round((end - start) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/**
 * Derives an item's cost-per-day metrics.
 *
 * - Active items count days from purchase up to `todayKey`.
 * - Inactive/sold items freeze the count at their `endDate`.
 * - `daysOwned` is clamped to ≥ 1 so a same-day purchase shows the full price
 *   as its daily cost rather than dividing by zero.
 * - `netCost` / `dailyCost` stay in the item's own currency (cards render them
 *   with that currency's symbol).
 * - `dailyWorkHours` is null when no wage is configured (`hourlyRate <= 0`).
 *   `hourlyRate` is in the reporting currency, so `dailyCost` is converted with
 *   `fxRateToReporting` (item currency → reporting; defaults to 1 for same-currency
 *   items) before applying the rate, otherwise foreign-currency items would report
 *   nonsensical work-time.
 */
export function computeItemStats(
  item: Item,
  todayKey: string,
  hourlyRate: number,
  fxRateToReporting = 1,
): ItemStats {
  const isActive = item.endDate == null;
  const endKey = isActive ? todayKey : item.endDate!;
  const daysOwned = Math.max(1, daysBetweenDayKeys(item.purchaseDate, endKey));
  const netCost = item.purchasePrice - (item.salePrice ?? 0);
  const dailyCost = netCost / daysOwned;
  const dailyWorkHours =
    hourlyRate > 0 ? amountToHoursByRate(dailyCost * fxRateToReporting, hourlyRate) : null;

  return { isActive, daysOwned, netCost, dailyCost, dailyWorkHours };
}
