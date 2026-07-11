// KV-backed metering. Two counters guard the flat-rate Featherless plan:
//   1. per-user monthly quota  (scans:{YYYY-MM}:{appUserId})
//   2. global daily hard cap   (scans:global:{YYYY-MM-DD})
//
// KV is eventually consistent and increments are read-then-write, so a user
// racing parallel requests could slip a couple past the limit — acceptable for
// a scan quota. Durable Objects are the exact-counting upgrade path if needed.

import type { Env } from './index';

const MONTH_TTL_SECONDS = 60 * 60 * 24 * 40; // ~40 days, covers a full month + slack
const DAY_TTL_SECONDS = 60 * 60 * 24 * 2; // 2 days

export interface QuotaDecision {
  allowed: boolean;
  reason?: 'limit_reached' | 'capacity';
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

/**
 * Checks (without consuming) whether a scan is allowed for this user right now.
 * Enforces the global daily cap first, then the per-user monthly quota.
 */
export async function checkQuota(
  appUserId: string,
  limit: number,
  env: Env,
  now: Date,
): Promise<QuotaDecision> {
  const kv = env.MONEY2TIME_WORKERS_KV;
  const globalCap = Number(env.GLOBAL_DAILY_CAP) || 0;
  if (globalCap > 0) {
    const globalUsed = await readCount(kv, `scans:global:${dayKey(now)}`);
    if (globalUsed >= globalCap) {
      return { allowed: false, reason: 'capacity', used: globalUsed, limit: globalCap };
    }
  }

  const userKey = `scans:${monthKey(now)}:${appUserId}`;
  const used = await readCount(kv, userKey);
  if (used >= limit) {
    return { allowed: false, reason: 'limit_reached', used, limit };
  }
  return { allowed: true, used, limit };
}

/**
 * Consumes one scan for this user + the global daily counter. Call only after a
 * successful upstream inference so failed scans don't burn quota.
 */
export async function consumeQuota(
  appUserId: string,
  env: Env,
  now: Date,
): Promise<number> {
  const kv = env.MONEY2TIME_WORKERS_KV;
  const userKey = `scans:${monthKey(now)}:${appUserId}`;
  const globalKey = `scans:global:${dayKey(now)}`;

  const [userUsed, globalUsed] = await Promise.all([
    readCount(kv, userKey),
    readCount(kv, globalKey),
  ]);

  await Promise.all([
    kv.put(userKey, String(userUsed + 1), { expirationTtl: MONTH_TTL_SECONDS }),
    kv.put(globalKey, String(globalUsed + 1), { expirationTtl: DAY_TTL_SECONDS }),
  ]);

  return userUsed + 1;
}
