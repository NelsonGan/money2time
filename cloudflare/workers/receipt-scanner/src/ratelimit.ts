// Per-user monthly metering for the OpenRouter spend, stored in D1
// (scan_usage table — one row per (app_user_id, period)). The monthly limit
// depends on the tier:
//   - Pro users:  PRO_MONTHLY_LIMIT  scans/month
//   - Free users: FREE_MONTHLY_LIMIT scans/month
//
// The period is a 'YYYY-MM' string, so a new month uses a fresh row. The
// counter is shared across a tier change within a month (a free user who
// upgrades keeps their existing count and gets the higher Pro ceiling). D1 has
// no native TTL, so each row carries an `expires_at` (epoch-ms) and the daily
// cron prunes stale rows.

import type { Env } from './index';

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
}

/** The current monthly period, 'YYYY-MM' (UTC). */
function currentPeriod(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Epoch-ms at the start of the next UTC month (when the period resets). */
function periodExpiry(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

/** This user's monthly scan cap for their tier. */
function tierLimit(isPro: boolean, env: Env): number {
  return isPro ? Number(env.PRO_MONTHLY_LIMIT) || 200 : Number(env.FREE_MONTHLY_LIMIT) || 10;
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
  const limit = tierLimit(isPro, env);
  const row = await env.MONEY2TIME_D1_RECEIPT_SCANNER
    .prepare('SELECT count FROM scan_usage WHERE app_user_id = ?1 AND period = ?2')
    .bind(appUserId, currentPeriod(now))
    .first<{ count: number }>();
  const used = row?.count ?? 0;
  return { allowed: used < limit, used, limit };
}

/**
 * Consumes one scan for this user's monthly counter and returns the new total.
 * Single atomic upsert — no read-then-write race. Call only after a successful
 * upstream inference so failed scans don't burn quota.
 */
export async function consumeQuota(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): Promise<number> {
  const row = await env.MONEY2TIME_D1_RECEIPT_SCANNER
    .prepare(
      `INSERT INTO scan_usage (app_user_id, period, count, expires_at)
       VALUES (?1, ?2, 1, ?3)
       ON CONFLICT(app_user_id, period) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(appUserId, currentPeriod(now), periodExpiry(now))
    .first<{ count: number }>();
  return row?.count ?? 1;
}
