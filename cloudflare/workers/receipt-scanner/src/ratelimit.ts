// Per-user scan metering, stored in D1 (scan_usage table — one row per
// (app_user_id, interval_unit, window_start)). Each tier declares its own limit
// and interval via env (FREE_LIMIT / FREE_INTERVAL, PRO_LIMIT / PRO_INTERVAL),
// so the cadence is fully configurable — daily, weekly, monthly, yearly —
// without a code or schema change. See interval.ts for the window math.
//
// The counter is shared across a tier change within the same window (a free
// user who upgrades keeps their count and gets the higher Pro ceiling). D1 has
// no native TTL, so each row carries an `expires_at` (epoch-ms) and the daily
// cron prunes stale rows.

import type { Env } from './index';
import { type IntervalUnit, toIntervalUnit, windowEnd, windowStart } from './interval';

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
  interval: IntervalUnit;
}

interface TierConfig {
  limit: number;
  interval: IntervalUnit;
}

/** This user's scan cap and metering interval for their tier. */
function tierConfig(isPro: boolean, env: Env): TierConfig {
  if (isPro) {
    return { limit: Number(env.PRO_LIMIT) || 200, interval: toIntervalUnit(env.PRO_INTERVAL) };
  }
  return { limit: Number(env.FREE_LIMIT) || 10, interval: toIntervalUnit(env.FREE_INTERVAL) };
}

/**
 * Checks (without consuming) whether a scan is allowed for this user right now.
 */
export async function checkQuota(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): Promise<QuotaDecision> {
  const { limit, interval } = tierConfig(isPro, env);
  const row = await env.MONEY2TIME_D1_RECEIPT_SCANNER
    .prepare(
      'SELECT count FROM scan_usage WHERE app_user_id = ?1 AND interval_unit = ?2 AND window_start = ?3',
    )
    .bind(appUserId, interval, windowStart(interval, now))
    .first<{ count: number }>();
  const used = row?.count ?? 0;
  return { allowed: used < limit, used, limit, interval };
}

/**
 * Consumes one scan for this user's current-window counter and returns the new
 * total. Single atomic upsert — no read-then-write race. Call only after a
 * successful upstream inference so failed scans don't burn quota.
 */
export async function consumeQuota(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): Promise<number> {
  const { interval } = tierConfig(isPro, env);
  const row = await env.MONEY2TIME_D1_RECEIPT_SCANNER
    .prepare(
      `INSERT INTO scan_usage (app_user_id, interval_unit, window_start, count, expires_at)
       VALUES (?1, ?2, ?3, 1, ?4)
       ON CONFLICT(app_user_id, interval_unit, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(appUserId, interval, windowStart(interval, now), windowEnd(interval, now))
    .first<{ count: number }>();
  return row?.count ?? 1;
}
