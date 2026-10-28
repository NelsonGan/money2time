// Account-level Pro check. Each install has its own RevenueCat App User ID
// (README: Purchase identity and restore), so the account is Pro while any
// install that signed in to it has the entitlement. Results are cached on the
// link row: Pro for an hour, free for a minute so an upgrade shows up quickly.
// An install never checked successfully counts as not Pro (fail closed);
// a RevenueCat outage keeps the last answer.

import { csv, type Env } from './env';

const RC_BASE = 'https://api.revenuecat.com/v1/subscribers';
const PRO_CACHE_MS = 60 * 60 * 1000;
const FREE_CACHE_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

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

export async function isAccountPro(env: Env, userId: string): Promise<boolean> {
  if (env.LOCAL_SYNC_URL && env.DEV_ASSUME_PRO === 'true') return true;
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
