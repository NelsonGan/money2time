// Per-user scan metering, stored in D1 (scan_usage table — one row per
// (app_user_id, interval_unit, window_start)). Each tier declares its own limit
// and interval via env (FREE_LIMIT / FREE_INTERVAL, PRO_LIMIT / PRO_INTERVAL),
// so the cadence is fully configurable — daily, weekly, monthly, yearly, or a
// multi-count window like '100year' (effectively lifetime) — without a code or
// schema change. See interval.ts for the window math.
//
// The counter is shared across a tier change within the same window (a free
// user who upgrades keeps their count and gets the higher Pro ceiling). D1 has
// no native TTL, so each row carries an `expires_at` (epoch-ms) and the daily
// cron prunes stale rows.

import type { Env } from './index';
import { formatInterval, type Interval, toInterval, windowEnd, windowStart } from './interval';

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
  /** Formatted interval for logs/responses, e.g. 'month' or '100year'. */
  interval: string;
}

interface TierConfig {
  limit: number;
  interval: Interval;
}

// Free scans are a lifetime allowance: a 100-year window reuses the existing
// 'year' unit in D1 instead of adding a 'lifetime' cadence (see interval.ts).
const FREE_FALLBACK: Interval = { count: 100, unit: 'year' };
// The Pro monthly cap is a fair-use ceiling — the paywall advertises unlimited.
const PRO_FALLBACK: Interval = { count: 1, unit: 'month' };

/** This user's scan cap and metering interval for their tier. */
function tierConfig(isPro: boolean, env: Env): TierConfig {
  if (isPro) {
    return { limit: Number(env.PRO_LIMIT) || 500, interval: toInterval(env.PRO_INTERVAL, PRO_FALLBACK) };
  }
  return { limit: Number(env.FREE_LIMIT) || 20, interval: toInterval(env.FREE_INTERVAL, FREE_FALLBACK) };
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
    .bind(appUserId, interval.unit, windowStart(interval, now))
    .first<{ count: number }>();
  const used = row?.count ?? 0;
  return { allowed: used < limit, used, limit, interval: formatInterval(interval) };
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
    .bind(appUserId, interval.unit, windowStart(interval, now), windowEnd(interval, now))
    .first<{ count: number }>();
  return row?.count ?? 1;
}
