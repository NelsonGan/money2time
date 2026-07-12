// Per-user metering for the OpenRouter spend, stored in D1 (scan_usage table):
//   - Pro users:  daily quota   (scans:day:{YYYY-MM-DD}:{appUserId})
//   - Free users: monthly quota (scans:{YYYY-MM}:{appUserId})
//   - Everyone:   global daily hard cap (scans:global:{YYYY-MM-DD}) — appUserId
//     is client-supplied and unauthenticated, so per-user quotas alone cannot
//     bound total spend; the global cap is the cost backstop.
//
// Each time window is its own counter keyed by the date/month, so a new window
// starts a fresh count. D1 has no native TTL, so every row carries an
// `expires_at` (epoch-ms) and the daily cron prunes stale rows.

import type { Env } from './index';

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
  /** 'capacity' = the global daily cap tripped (retryable), 'user' = this
   *  user's own quota is exhausted (paywall / wait for the next window). */
  reason?: 'user' | 'capacity';
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
 * The counter key, limit, and expiry for this user's tier — Pro is metered
 * daily, free monthly.
 */
function quotaWindow(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): { key: string; limit: number; expiresAtMs: number } {
  if (isPro) {
    return {
      key: `scans:day:${dayKey(now)}:${appUserId}`,
      limit: Number(env.PRO_DAILY_LIMIT) || 50,
      expiresAtMs: startOfNextUtcDay(now),
    };
  }
  return {
    key: `scans:${monthKey(now)}:${appUserId}`,
    limit: Number(env.FREE_MONTHLY_LIMIT) || 10,
    expiresAtMs: startOfNextUtcMonth(now),
  };
}

function globalKey(now: Date): string {
  return `scans:global:${dayKey(now)}`;
}

async function readCount(env: Env, key: string): Promise<number> {
  const row = await env.MONEY2TIME_D1_RECEIPT_SCANNER
    .prepare('SELECT count FROM scan_usage WHERE bucket_key = ?1')
    .bind(key)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Checks (without consuming) whether a scan is allowed right now: the global
 * daily cap first, then the user's own window.
 */
export async function checkQuota(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): Promise<QuotaDecision> {
  const globalCap = Number(env.GLOBAL_DAILY_CAP) || 0;
  if (globalCap > 0) {
    const globalUsed = await readCount(env, globalKey(now));
    if (globalUsed >= globalCap) {
      return { allowed: false, reason: 'capacity', used: globalUsed, limit: globalCap };
    }
  }
  const { key, limit } = quotaWindow(appUserId, isPro, env, now);
  const used = await readCount(env, key);
  return { allowed: used < limit, reason: 'user', used, limit };
}

/**
 * Consumes one scan for this user's tier counter plus the global daily counter
 * (one atomic batch — no read-then-write race) and returns the user's new
 * total. Call only after a successful upstream inference so failed scans don't
 * burn quota.
 */
export async function consumeQuota(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): Promise<number> {
  const { key, expiresAtMs } = quotaWindow(appUserId, isPro, env, now);
  const db = env.MONEY2TIME_D1_RECEIPT_SCANNER;
  const upsert = `INSERT INTO scan_usage (bucket_key, count, expires_at)
     VALUES (?1, 1, ?2)
     ON CONFLICT(bucket_key) DO UPDATE SET count = count + 1
     RETURNING count`;
  const [user] = await db.batch<{ count: number }>([
    db.prepare(upsert).bind(key, expiresAtMs),
    db.prepare(upsert).bind(globalKey(now), startOfNextUtcDay(now)),
  ]);
  return user.results?.[0]?.count ?? 1;
}
