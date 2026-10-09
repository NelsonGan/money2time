// Per-user scan metering in D1 (scan_usage, one row per
// app_user_id/interval_unit/window_start). Each tier sets its own limit +
// interval via env; see interval.ts for the window math. A window's counter is
// shared across a tier change (an upgrading user keeps their count, gains the
// Pro ceiling). Rows carry expires_at so the daily cron can prune them.

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

// Free is a lifetime allowance (100-year window reuses the 'year' unit).
const FREE_FALLBACK: Interval = { count: 100, unit: 'year' };
// Pro monthly cap is a fair-use ceiling — the paywall advertises unlimited.
const PRO_FALLBACK: Interval = { count: 1, unit: 'month' };

function tierConfig(isPro: boolean, env: Env): TierConfig {
  if (isPro) {
    return { limit: Number(env.PRO_LIMIT) || 500, interval: toInterval(env.PRO_INTERVAL, PRO_FALLBACK) };
  }
  return { limit: Number(env.FREE_LIMIT) || 20, interval: toInterval(env.FREE_INTERVAL, FREE_FALLBACK) };
}

// Whether a scan is allowed for this user right now, without consuming quota.
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

// Atomic upsert of one scan into the current window; returns the new total.
// Call only after a successful inference so failed scans don't burn quota.
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
