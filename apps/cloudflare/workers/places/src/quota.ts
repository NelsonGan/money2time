// Daily allowances of place searches that reach Apple, counted in D1
// (search_usage, one row per subject and UTC day). Searching is free for
// everyone; the caps only protect Apple's shared 25,000 calls a day. A user id
// is whatever the caller sends, so each address has its own cap too: one
// script inventing user ids cannot use up the day for everyone. Rows carry
// expires_at so the daily cron can prune them.

export interface QuotaEnv {
  MONEY2TIME_D1_PLACES: D1Database;
  /** Searches per user per UTC day (default 200). */
  PLACES_DAILY_LIMIT?: string;
  /** Searches per address per UTC day (default 1000; a shared network is many people). */
  PLACES_ADDRESS_DAILY_LIMIT?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_USER_LIMIT = 200;
const DEFAULT_ADDRESS_LIMIT = 1000;

/** Who a search counts against: the user, and the address it came from. */
export interface QuotaSubjects {
  user: string;
  address: string;
}

export interface QuotaDecision {
  allowed: boolean;
  /** Which cap stopped it, when one did. */
  reachedBy: 'user' | 'address' | null;
}

function limitOf(value: string | undefined, fallback: number): number {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? limit : fallback;
}

export function dailyLimits(env: QuotaEnv): { user: number; address: number } {
  return {
    user: limitOf(env.PLACES_DAILY_LIMIT, DEFAULT_USER_LIMIT),
    address: limitOf(env.PLACES_ADDRESS_DAILY_LIMIT, DEFAULT_ADDRESS_LIMIT),
  };
}

/** Epoch-ms at the start of `now`'s UTC day. */
export function dayStart(now: Date): number {
  return Math.floor(now.getTime() / DAY_MS) * DAY_MS;
}

/**
 * The address as a subject: hashed, so no IP is stored (the row is gone after
 * a day anyway), and salted with the day so a hash says nothing tomorrow.
 */
export async function addressSubject(ip: string, now: Date): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${dayStart(now)}:${ip}`),
  );
  const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `ip:${hex.slice(0, 32)}`;
}

/** Whether both the user and the address may search again today (one read). */
export async function checkQuota(
  subjects: QuotaSubjects,
  env: QuotaEnv,
  now: Date,
): Promise<QuotaDecision> {
  const limits = dailyLimits(env);
  const { results } = await env.MONEY2TIME_D1_PLACES.prepare(
    'SELECT subject, count FROM search_usage WHERE day_start = ?1 AND subject IN (?2, ?3)',
  )
    .bind(dayStart(now), subjects.user, subjects.address)
    .all<{ subject: string; count: number }>();
  const used = (subject: string) => results.find((row) => row.subject === subject)?.count ?? 0;
  if (used(subjects.user) >= limits.user) return { allowed: false, reachedBy: 'user' };
  if (used(subjects.address) >= limits.address) return { allowed: false, reachedBy: 'address' };
  return { allowed: true, reachedBy: null };
}

/**
 * Counts today's uses for both (only after Apple answered): one per Apple
 * call, so a nearby list built from two searches counts two.
 */
export async function consumeQuota(
  subjects: QuotaSubjects,
  env: QuotaEnv,
  now: Date,
  uses = 1,
): Promise<void> {
  const start = dayStart(now);
  const db = env.MONEY2TIME_D1_PLACES;
  const upsert = (subject: string) =>
    db
      .prepare(
        `INSERT INTO search_usage (subject, day_start, count, expires_at)
         VALUES (?1, ?2, ?4, ?3)
         ON CONFLICT(subject, day_start) DO UPDATE SET count = count + ?4`,
      )
      .bind(subject, start, start + DAY_MS, uses);
  await db.batch([upsert(subjects.user), upsert(subjects.address)]);
}

/** Drops the counters of days that are over (the daily cron). */
export async function pruneExpired(env: QuotaEnv, now: Date): Promise<void> {
  await env.MONEY2TIME_D1_PLACES.prepare('DELETE FROM search_usage WHERE expires_at <= ?1')
    .bind(now.getTime())
    .run();
}
