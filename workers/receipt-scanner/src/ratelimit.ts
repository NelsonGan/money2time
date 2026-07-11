// D1-backed per-user metering for the flat-rate Featherless plan:
//   - Pro users:  daily quota   (bucket_key `day:{YYYY-MM-DD}:{appUserId}`)
//   - Free users: monthly quota (bucket_key `month:{YYYY-MM}:{appUserId}`)
//
// Each time window is its own row keyed by the date/month, so a new window
// simply starts a fresh counter and old rows become stale (`expires_at` lets a
// cleanup job prune them). Unlike the previous KV counter, the increment is a
// single atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so parallel
// scans from one user can't race past the limit.

import type { Env } from './index';

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
}

function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dayKey(now: Date): string {
  return `${monthKey(now)}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

/** Epoch-ms at the start of the next UTC day (when a daily window resets). */
function startOfNextUtcDay(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/** Epoch-ms at the start of the next UTC month (when a monthly window resets). */
function startOfNextUtcMonth(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

/**
 * The counter row key, limit, and expiry (epoch-ms) for this user's tier —
 * Pro is metered daily, free monthly.
 */
function quotaWindow(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): { key: string; limit: number; expiresAt: number } {
  if (isPro) {
    return {
      key: `day:${dayKey(now)}:${appUserId}`,
      limit: Number(env.PRO_DAILY_LIMIT) || 50,
      expiresAt: startOfNextUtcDay(now),
    };
  }
  return {
    key: `month:${monthKey(now)}:${appUserId}`,
    limit: Number(env.FREE_MONTHLY_LIMIT) || 10,
    expiresAt: startOfNextUtcMonth(now),
  };
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
  const { key, limit } = quotaWindow(appUserId, isPro, env, now);
  const row = await env.DB.prepare('SELECT count FROM scan_usage WHERE bucket_key = ?1')
    .bind(key)
    .first<{ count: number }>();
  const used = row?.count ?? 0;
  return { allowed: used < limit, used, limit };
}

/**
 * Atomically consumes one scan for this user's tier counter and returns the new
 * total. Call only after a successful upstream inference so failed scans don't
 * burn quota.
 */
export async function consumeQuota(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): Promise<number> {
  const { key, expiresAt } = quotaWindow(appUserId, isPro, env, now);
  const row = await env.DB.prepare(
    `INSERT INTO scan_usage (bucket_key, count, expires_at)
     VALUES (?1, 1, ?2)
     ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(key, expiresAt)
    .first<{ count: number }>();
  return row?.count ?? 1;
}
