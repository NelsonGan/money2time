// Per-user monthly metering for the OpenRouter spend, stored in D1
// (scan_usage table). One counter per user per month
// (scans:{YYYY-MM}:{appUserId}); the limit depends on the tier:
//   - Pro users:  PRO_MONTHLY_LIMIT  scans/month
//   - Free users: FREE_MONTHLY_LIMIT scans/month
//
// The month is baked into the key, so a new month starts a fresh count. The
// counter is shared across a tier change within a month (e.g. a free user who
// upgrades keeps their existing count and gets the higher Pro ceiling). D1 has
// no native TTL, so every row carries an `expires_at` (epoch-ms) and the daily
// cron prunes stale rows.

import type { Env } from './index';

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
}

function monthKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Epoch-ms at the start of the next UTC month (when the window resets). */
function startOfNextUtcMonth(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

/** The counter key, monthly limit, and expiry for this user's tier. */
function quotaWindow(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): { key: string; limit: number; expiresAtMs: number } {
  const limit = isPro
    ? Number(env.PRO_MONTHLY_LIMIT) || 200
    : Number(env.FREE_MONTHLY_LIMIT) || 10;
  return {
    key: `scans:${monthKey(now)}:${appUserId}`,
    limit,
    expiresAtMs: startOfNextUtcMonth(now),
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
  const row = await env.MONEY2TIME_D1_RECEIPT_SCANNER
    .prepare('SELECT count FROM scan_usage WHERE bucket_key = ?1')
    .bind(key)
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
  const { key, expiresAtMs } = quotaWindow(appUserId, isPro, env, now);
  const row = await env.MONEY2TIME_D1_RECEIPT_SCANNER
    .prepare(
      `INSERT INTO scan_usage (bucket_key, count, expires_at)
       VALUES (?1, 1, ?2)
       ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, expiresAtMs)
    .first<{ count: number }>();
  return row?.count ?? 1;
}
