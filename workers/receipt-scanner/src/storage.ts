// Storage backend abstraction so the Worker can run on either Cloudflare KV or
// D1, selected at runtime by env.STORAGE_BACKEND ("kv" default, or "d1"). Both
// concerns — the per-user usage counter and the RevenueCat entitlement cache —
// go through this interface so ratelimit.ts / revenuecat.ts stay backend-blind.
//
// Expiry differs by backend: KV expires rows natively via `expirationTtl`
// (seconds), so it ignores the absolute `expiresAtMs`. D1 has no native TTL, so
// it stores `expiresAtMs` (epoch-ms) and a cron prunes stale rows; it ignores
// `ttlSeconds`. Callers pass both and each impl uses what it needs.

import type { Env } from './index';

export interface Storage {
  /** Current value of a usage counter (0 when absent). */
  getCount(key: string): Promise<number>;
  /** Increment a usage counter by one and return the new value. */
  increment(key: string, ttlSeconds: number, expiresAtMs: number): Promise<number>;
  /** Cached Pro/free entitlement, or null when absent/expired. */
  getCachedPro(appUserId: string, nowMs: number): Promise<boolean | null>;
  /** Cache a Pro/free entitlement decision. */
  setCachedPro(
    appUserId: string,
    isPro: boolean,
    ttlSeconds: number,
    expiresAtMs: number,
  ): Promise<void>;
}

class KvStorage implements Storage {
  constructor(private readonly kv: KVNamespace) {}

  async getCount(key: string): Promise<number> {
    const raw = await this.kv.get(key);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  // KV is eventually consistent and this is read-then-write, so racing parallel
  // requests could slip a couple past the limit — acceptable for a scan quota.
  async increment(key: string, ttlSeconds: number): Promise<number> {
    const next = (await this.getCount(key)) + 1;
    await this.kv.put(key, String(next), { expirationTtl: ttlSeconds });
    return next;
  }

  async getCachedPro(appUserId: string): Promise<boolean | null> {
    // KV auto-expires the key, so presence alone means "fresh".
    const cached = await this.kv.get(`rc:${appUserId}`);
    if (cached === 'pro') return true;
    if (cached === 'free') return false;
    return null;
  }

  async setCachedPro(appUserId: string, isPro: boolean, ttlSeconds: number): Promise<void> {
    await this.kv.put(`rc:${appUserId}`, isPro ? 'pro' : 'free', { expirationTtl: ttlSeconds });
  }
}

class D1Storage implements Storage {
  constructor(private readonly db: D1Database) {}

  async getCount(key: string): Promise<number> {
    const row = await this.db
      .prepare('SELECT count FROM scan_usage WHERE bucket_key = ?1')
      .bind(key)
      .first<{ count: number }>();
    return row?.count ?? 0;
  }

  // Single atomic upsert — no read-then-write race.
  async increment(key: string, _ttlSeconds: number, expiresAtMs: number): Promise<number> {
    const row = await this.db
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

  async getCachedPro(appUserId: string, nowMs: number): Promise<boolean | null> {
    const row = await this.db
      .prepare('SELECT is_pro FROM entitlement_cache WHERE app_user_id = ?1 AND expires_at > ?2')
      .bind(appUserId, nowMs)
      .first<{ is_pro: number }>();
    return row ? row.is_pro === 1 : null;
  }

  async setCachedPro(
    appUserId: string,
    isPro: boolean,
    _ttlSeconds: number,
    expiresAtMs: number,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO entitlement_cache (app_user_id, is_pro, expires_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(app_user_id) DO UPDATE SET is_pro = ?2, expires_at = ?3`,
      )
      .bind(appUserId, isPro ? 1 : 0, expiresAtMs)
      .run();
  }
}

/** True when the D1 backend is selected and its binding is available. */
export function usingD1(env: Env): boolean {
  return env.STORAGE_BACKEND === 'd1' && !!env.DB;
}

/** Pick the storage backend from env.STORAGE_BACKEND (KV unless "d1"). */
export function getStorage(env: Env): Storage {
  if (env.STORAGE_BACKEND === 'd1') {
    if (!env.DB) {
      throw new Error('STORAGE_BACKEND is "d1" but the DB (D1) binding is not configured');
    }
    return new D1Storage(env.DB);
  }
  if (!env.MONEY2TIME_WORKERS_KV_RECEIPT_SCANNER) {
    throw new Error('KV storage selected but the KV namespace binding is not configured');
  }
  return new KvStorage(env.MONEY2TIME_WORKERS_KV_RECEIPT_SCANNER);
}
