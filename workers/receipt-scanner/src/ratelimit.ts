// Per-user metering for the flat-rate Featherless plan, backend-agnostic
// (KV or D1, chosen by env.STORAGE_BACKEND — see storage.ts):
//   - Pro users:  daily quota   (scans:day:{YYYY-MM-DD}:{appUserId})
//   - Free users: monthly quota (scans:{YYYY-MM}:{appUserId})
//
// Each time window is its own counter keyed by the date/month, so a new window
// starts a fresh count. On KV the key expires natively; on D1 `expiresAtMs`
// lets a cron prune stale rows.

import type { Env } from './index';
import { getStorage } from './storage';

const MONTH_TTL_SECONDS = 60 * 60 * 24 * 40; // ~40 days, covers a full month + slack
const DAY_TTL_SECONDS = 60 * 60 * 24 * 2; // 2 days

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
 * The counter key, limit, TTL (KV), and expiry (D1) for this user's tier —
 * Pro is metered daily, free monthly.
 */
function quotaWindow(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): { key: string; limit: number; ttlSeconds: number; expiresAtMs: number } {
  if (isPro) {
    return {
      key: `scans:day:${dayKey(now)}:${appUserId}`,
      limit: Number(env.PRO_DAILY_LIMIT) || 50,
      ttlSeconds: DAY_TTL_SECONDS,
      expiresAtMs: startOfNextUtcDay(now),
    };
  }
  return {
    key: `scans:${monthKey(now)}:${appUserId}`,
    limit: Number(env.FREE_MONTHLY_LIMIT) || 10,
    ttlSeconds: MONTH_TTL_SECONDS,
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
  const used = await getStorage(env).getCount(key);
  return { allowed: used < limit, used, limit };
}

/**
 * Consumes one scan for this user's tier counter and returns the new total.
 * Call only after a successful upstream inference so failed scans don't burn
 * quota.
 */
export async function consumeQuota(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): Promise<number> {
  const { key, ttlSeconds, expiresAtMs } = quotaWindow(appUserId, isPro, env, now);
  return getStorage(env).increment(key, ttlSeconds, expiresAtMs);
}
