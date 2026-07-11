// KV-backed per-user metering for the flat-rate Featherless plan:
//   - Pro users:  daily quota   (scans:day:{YYYY-MM-DD}:{appUserId})
//   - Free users: monthly quota (scans:{YYYY-MM}:{appUserId})
//
// KV is eventually consistent and increments are read-then-write, so a user
// racing parallel requests could slip a couple past the limit — acceptable for
// a scan quota. Durable Objects are the exact-counting upgrade path if needed.

import type { Env } from './index';

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

async function readCount(kv: KVNamespace, key: string): Promise<number> {
  const raw = await kv.get(key);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

/** The counter key, limit, and TTL for this user's tier (Pro daily, free monthly). */
function quotaWindow(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): { key: string; limit: number; ttl: number } {
  if (isPro) {
    return {
      key: `scans:day:${dayKey(now)}:${appUserId}`,
      limit: Number(env.PRO_DAILY_LIMIT) || 50,
      ttl: DAY_TTL_SECONDS,
    };
  }
  return {
    key: `scans:${monthKey(now)}:${appUserId}`,
    limit: Number(env.FREE_MONTHLY_LIMIT) || 10,
    ttl: MONTH_TTL_SECONDS,
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
  const kv = env.MONEY2TIME_WORKERS_KV_RECEIPT_SCANNER;
  const { key, limit } = quotaWindow(appUserId, isPro, env, now);
  const used = await readCount(kv, key);
  return { allowed: used < limit, used, limit };
}

/**
 * Consumes one scan for this user's tier counter. Call only after a successful
 * upstream inference so failed scans don't burn quota.
 */
export async function consumeQuota(
  appUserId: string,
  isPro: boolean,
  env: Env,
  now: Date,
): Promise<number> {
  const kv = env.MONEY2TIME_WORKERS_KV_RECEIPT_SCANNER;
  const { key, ttl } = quotaWindow(appUserId, isPro, env, now);
  const used = await readCount(kv, key);
  await kv.put(key, String(used + 1), { expirationTtl: ttl });
  return used + 1;
}
