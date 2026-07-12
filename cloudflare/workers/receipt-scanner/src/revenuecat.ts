// Server-side RevenueCat entitlement check. The app owns its App User ID
// (`m2t_<uuid>`, stored in settings.appUserId and pushed to RevenueCat via
// Purchases.configure({ appUserID })), so we verify the *entitlement* here —
// not existence. The GET /subscribers endpoint is get-or-create, so it cannot
// prove a user is real; free-tier trust comes from the rate-limit caps instead.

import type { Env } from './index';

const RC_BASE = 'https://api.revenuecat.com/v1/subscribers';
// Pro entitlements change rarely, so cache them long — otherwise nearly every
// scan pays a blocking RevenueCat round trip before inference (users scan
// minutes apart, far beyond a short TTL). Free results stay short so a user
// who just upgraded is recognized as Pro within a minute.
const PRO_CACHE_TTL_MS = 60 * 60 * 1000;
const FREE_CACHE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export interface EntitlementResult {
  isPro: boolean;
}

/**
 * Returns whether the given App User ID has an active Pro entitlement.
 * Result is cached in D1 (entitlement_cache table) — 1h for Pro, 60s for free
 * — to avoid hammering RevenueCat and paying its latency on every scan. Fails
 * closed to `isPro: false` on any error.
 */
export async function getEntitlement(
  appUserId: string,
  env: Env,
): Promise<EntitlementResult> {
  const db = env.MONEY2TIME_D1_RECEIPT_SCANNER;
  const now = Date.now();
  const cached = await db
    .prepare('SELECT is_pro FROM entitlement_cache WHERE app_user_id = ?1 AND expires_at > ?2')
    .bind(appUserId, now)
    .first<{ is_pro: number }>();
  if (cached) return { isPro: cached.is_pro === 1 };

  const isPro = await fetchEntitlement(appUserId, env);
  await db
    .prepare(
      `INSERT INTO entitlement_cache (app_user_id, is_pro, expires_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(app_user_id) DO UPDATE SET is_pro = ?2, expires_at = ?3`,
    )
    .bind(appUserId, isPro ? 1 : 0, now + (isPro ? PRO_CACHE_TTL_MS : FREE_CACHE_TTL_MS))
    .run();
  return { isPro };
}

async function fetchEntitlement(appUserId: string, env: Env): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${RC_BASE}/${encodeURIComponent(appUserId)}`, {
      headers: {
        Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as RevenueCatSubscriberResponse;
    const entitlement = body?.subscriber?.entitlements?.[env.ENTITLEMENT_ID];
    if (!entitlement) return false;
    // Lifetime / non-consumable entitlements have a null expires_date and never
    // expire — treat those as active. Otherwise the entitlement is active only
    // while its expiry is in the future.
    if (entitlement.expires_date == null) return true;
    const expiresMs = Date.parse(entitlement.expires_date);
    return Number.isNaN(expiresMs) ? false : expiresMs > Date.now();
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

interface RevenueCatSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string | null } | undefined>;
  };
}
