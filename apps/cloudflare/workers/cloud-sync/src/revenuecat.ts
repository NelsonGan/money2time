// Account-level Pro check. Each install has its own RevenueCat App User ID
// (README: Purchase identity and restore), so the account is Pro while any
// install that signed in to it has the entitlement, however long ago that
// phone was opened (a lifetime or still-renewing purchase on a phone the user
// switched away from keeps counting). Results are cached on the link row: Pro
// for an hour, free for a minute so an upgrade shows up quickly. An install
// never checked successfully counts as not Pro (fail closed); a RevenueCat
// outage keeps the last answer.
//
// Every phone signed in to the account is recorded in account_phones, with
// when it joined and when it last checked in (a status or credentials call,
// written at most daily). The account's Pro reaches at most MAX_PRO_PHONES
// phones besides those with their own purchase: the first ones to join, so a
// sixth phone waits for a place instead of taking turns with the others. A
// place frees when a phone signs out, or after it goes SLOT_IDLE_MS without
// checking in (it rejoins at the back when it returns). That idle limit is
// only for phones getting Pro: a purchase lends it however long its own
// phone goes unopened.

import { csv, type Env } from './env';

const RC_BASE = 'https://api.revenuecat.com/v1/subscribers';
const PRO_CACHE_MS = 60 * 60 * 1000;
const FREE_CACHE_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The account's Pro reaches this many phones besides those with their own purchase. */
export const MAX_PRO_PHONES = 5;
/** A phone getting Pro from the account gives up its place after this long unused. */
export const SLOT_IDLE_MS = 30 * DAY_MS;

export interface AccountPhone {
  app_user_id: string;
  first_seen_at: number;
  last_seen_at: number;
}

/**
 * The phones that get the account's Pro: of those in use within SLOT_IDLE_MS,
 * the first `max` to join (ties by id, so the answer is stable).
 */
export function phonesWithAccountPro(
  phones: readonly AccountPhone[],
  now: number,
  max = MAX_PRO_PHONES,
): Set<string> {
  return new Set(
    phones
      .filter((phone) => now - phone.last_seen_at < SLOT_IDLE_MS)
      .sort(
        (a, b) => a.first_seen_at - b.first_seen_at || a.app_user_id.localeCompare(b.app_user_id),
      )
      .slice(0, max)
      .map((phone) => phone.app_user_id),
  );
}

/**
 * Records that one of the account's phones is in use. Written at most once a
 * day per phone (the WHERE on the update), so a sync every few minutes costs
 * no writes. A phone back after SLOT_IDLE_MS rejoins at the back of the queue.
 * An App User ID claimed by another account is not recorded.
 */
export async function markPhoneSeen(env: Env, userId: string, appUserId: string): Promise<void> {
  const now = Date.now();
  await env.AUTH_DB.prepare(
    `INSERT INTO account_phones (user_id, app_user_id, first_seen_at, last_seen_at)
     SELECT ?1, ?2, ?3, ?3
     WHERE NOT EXISTS (SELECT 1 FROM pro_links WHERE app_user_id = ?2 AND user_id <> ?1)
     ON CONFLICT(user_id, app_user_id) DO UPDATE SET
       first_seen_at = CASE WHEN account_phones.last_seen_at <= ?3 - ?5
                            THEN excluded.first_seen_at ELSE account_phones.first_seen_at END,
       last_seen_at = excluded.last_seen_at
     WHERE account_phones.last_seen_at < ?3 - ?4`,
  )
    .bind(userId, appUserId, now, DAY_MS, SLOT_IDLE_MS)
    .run();
}

/** Matches the app's `newAppUserId()`: `m2t_` and a UUID. */
const APP_USER_ID = /^m2t_[0-9a-f-]{36}$/i;

export function isValidAppUserId(value: unknown): value is string {
  return typeof value === 'string' && APP_USER_ID.test(value);
}

/**
 * Records that this install signed in to the account, if the install is Pro
 * (a free install adds nothing, and is linked on a later call once it is).
 * An App User ID belongs to the first account that claims it (UNIQUE in the
 * schema), so one purchase cannot unlock Cloud Sync for any number of
 * accounts. The ID is random but not proof of ownership: README > Cloud-sync
 * Worker > Pro has the limits.
 */
export async function linkAppUserId(env: Env, userId: string, appUserId: string): Promise<void> {
  const owner = await env.AUTH_DB.prepare('SELECT user_id FROM pro_links WHERE app_user_id = ?1')
    .bind(appUserId)
    .first<{ user_id: string }>();
  if (owner) {
    if (owner.user_id !== userId) {
      console.warn('[cloud-sync] app user id already linked to another account');
    }
    return;
  }
  if ((await fetchEntitlement(env, appUserId)) !== true) return;
  await env.AUTH_DB.prepare(
    `INSERT OR IGNORE INTO pro_links (user_id, app_user_id, is_pro, checked_at)
     VALUES (?1, ?2, 1, ?3)`,
  )
    .bind(userId, appUserId, Date.now())
    .run();
}

/** Sign-out: the phone no longer lends the account its Pro, nor gets it. */
export async function unlinkAppUserId(env: Env, userId: string, appUserId: string): Promise<void> {
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare('DELETE FROM pro_links WHERE user_id = ?1 AND app_user_id = ?2').bind(
      userId,
      appUserId,
    ),
    env.AUTH_DB.prepare('DELETE FROM account_phones WHERE user_id = ?1 AND app_user_id = ?2').bind(
      userId,
      appUserId,
    ),
  ]);
}

export async function isAccountPro(env: Env, userId: string): Promise<boolean> {
  if (env.LOCAL_SYNC_URL && env.DEV_ASSUME_PRO === 'true') return true;
  if (env.LOCAL_SYNC_URL && env.DEV_ASSUME_PRO === 'cached') {
    // As stored, without RevenueCat.
    const row = await env.AUTH_DB.prepare(
      'SELECT 1 FROM pro_links WHERE user_id = ?1 AND is_pro = 1 LIMIT 1',
    )
      .bind(userId)
      .first();
    return row !== null;
  }
  const { results } = await env.AUTH_DB.prepare(
    'SELECT app_user_id, is_pro, checked_at FROM pro_links WHERE user_id = ?1 LIMIT 50',
  )
    .bind(userId)
    .all<{ app_user_id: string; is_pro: number; checked_at: number }>();
  const now = Date.now();
  // A fresh cached Pro answers at once.
  if (results.some((row) => row.is_pro === 1 && now - row.checked_at < PRO_CACHE_MS)) return true;
  const stale = results.filter(
    (row) => now - row.checked_at >= (row.is_pro === 1 ? PRO_CACHE_MS : FREE_CACHE_MS),
  );
  // Checked together, so many installs cannot add up past the app's timeout.
  const answers = await Promise.all(stale.map((row) => fetchEntitlement(env, row.app_user_id)));
  // No answer (RevenueCat down): keep the cached value rather than
  // downgrading a paying user.
  const pro = answers.some((answer, index) => answer ?? stale[index].is_pro === 1);
  const updates = answers.flatMap((answer, index) =>
    answer === null
      ? []
      : [
          env.AUTH_DB.prepare(
            'UPDATE pro_links SET is_pro = ?1, checked_at = ?2 WHERE user_id = ?3 AND app_user_id = ?4',
          ).bind(answer ? 1 : 0, now, userId, stale[index].app_user_id),
        ],
  );
  if (updates.length) await env.AUTH_DB.batch(updates);
  return pro;
}

/**
 * Whether this phone gets Pro from the account: the account is Pro, and the
 * phone holds one of its purchases or has one of the MAX_PRO_PHONES places
 * (phonesWithAccountPro; phones with their own purchase take none).
 * `limited`: the account is Pro, but every place is taken. Without an App
 * User ID (an older app) the account decides.
 */
export async function phoneProStatus(
  env: Env,
  userId: string,
  appUserId: string | null,
): Promise<{ isPro: boolean; limited: boolean }> {
  if (!(await isAccountPro(env, userId))) return { isPro: false, limited: false };
  if (!appUserId) return { isPro: true, limited: false };
  const own = await env.AUTH_DB.prepare(
    'SELECT is_pro FROM pro_links WHERE user_id = ?1 AND app_user_id = ?2',
  )
    .bind(userId, appUserId)
    .first<{ is_pro: number }>();
  if (own?.is_pro === 1) return { isPro: true, limited: false };
  const { results: phones } = await env.AUTH_DB.prepare(
    `SELECT a.app_user_id, a.first_seen_at, a.last_seen_at, COALESCE(p.is_pro, 0) AS own_pro
     FROM account_phones a LEFT JOIN pro_links p
       ON p.user_id = a.user_id AND p.app_user_id = a.app_user_id
     WHERE a.user_id = ?1 LIMIT 500`,
  )
    .bind(userId)
    .all<AccountPhone & { own_pro: number }>();
  const places = phonesWithAccountPro(
    phones.filter((phone) => phone.own_pro !== 1),
    Date.now(),
  );
  return places.has(appUserId) ? { isPro: true, limited: false } : { isPro: false, limited: true };
}

/** true / false from RevenueCat, or null when it could not be asked. */
async function fetchEntitlement(env: Env, appUserId: string): Promise<boolean | null> {
  // A secret key reads any subscriber. Without one, the public SDK keys do the
  // same read the app's SDK does; each key only sees its own store's app, so
  // any one saying Pro is enough.
  const keys = env.REVENUECAT_SECRET_KEY
    ? [env.REVENUECAT_SECRET_KEY]
    : csv(env.REVENUECAT_PUBLIC_KEYS);
  // Asked together, so two store keys cannot double the wait.
  const results = await Promise.all(keys.map((key) => fetchWithKey(env, appUserId, key)));
  if (results.includes(true)) return true;
  return results.includes(false) ? false : null;
}

async function fetchWithKey(env: Env, appUserId: string, key: string): Promise<boolean | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${RC_BASE}/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const body = (await res.json()) as RevenueCatSubscriberResponse;
    return hasActiveEntitlement(body, env.REVENUECAT_ENTITLEMENT_ID, Date.now());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function hasActiveEntitlement(
  body: RevenueCatSubscriberResponse,
  entitlementId: string,
  now: number,
): boolean {
  const entitlement = body?.subscriber?.entitlements?.[entitlementId];
  if (!entitlement) return false;
  // Lifetime purchases have no expiry.
  if (entitlement.expires_date == null) return true;
  const expiresMs = Date.parse(entitlement.expires_date);
  return Number.isNaN(expiresMs) ? false : expiresMs > now;
}

export interface RevenueCatSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string | null } | undefined>;
  };
}
