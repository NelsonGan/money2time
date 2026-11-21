// Each user's daily allowance of place searches, counted in D1 (search_usage,
// one row per app_user_id and UTC day). Searching is free for everyone; the
// cap only stops one user, or a script inventing user ids, eating Apple's
// shared 25,000 calls a day. Rows carry expires_at so the daily cron can prune
// them.

export interface QuotaEnv {
  MONEY2TIME_D1_PLACES: D1Database;
  /** Searches per user per UTC day (default 200). */
  PLACES_DAILY_LIMIT?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 200;

export interface QuotaDecision {
  allowed: boolean;
  used: number;
  limit: number;
}

export function dailyLimit(env: QuotaEnv): number {
  const limit = Number(env.PLACES_DAILY_LIMIT);
  return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_DAILY_LIMIT;
}

/** Epoch-ms at the start of `now`'s UTC day. */
export function dayStart(now: Date): number {
  return Math.floor(now.getTime() / DAY_MS) * DAY_MS;
}

/** Whether this user may search again today, without counting a use. */
export async function checkQuota(appUserId: string, env: QuotaEnv, now: Date): Promise<QuotaDecision> {
  const limit = dailyLimit(env);
  const row = await env.MONEY2TIME_D1_PLACES.prepare(
    'SELECT count FROM search_usage WHERE app_user_id = ?1 AND day_start = ?2',
  )
    .bind(appUserId, dayStart(now))
    .first<{ count: number }>();
  const used = row?.count ?? 0;
  return { allowed: used < limit, used, limit };
}

/** Counts one use today (only after Apple answered); returns today's total. */
export async function consumeQuota(appUserId: string, env: QuotaEnv, now: Date): Promise<number> {
  const start = dayStart(now);
  const row = await env.MONEY2TIME_D1_PLACES.prepare(
    `INSERT INTO search_usage (app_user_id, day_start, count, expires_at)
     VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(app_user_id, day_start) DO UPDATE SET count = count + 1
     RETURNING count`,
  )
    .bind(appUserId, start, start + DAY_MS)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

/** Drops the counters of days that are over (the daily cron). */
export async function pruneExpired(env: QuotaEnv, now: Date): Promise<void> {
  await env.MONEY2TIME_D1_PLACES.prepare('DELETE FROM search_usage WHERE expires_at <= ?1')
    .bind(now.getTime())
    .run();
}
