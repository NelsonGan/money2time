// Server-side RevenueCat entitlement check. We verify the *entitlement*, not
// existence — GET /subscribers is get-or-create and can't prove a user is real;
// free-tier trust comes from the rate-limit caps instead.

import type { Env } from './index';

const RC_BASE = 'https://api.revenuecat.com/v1/subscribers';
// Pro entitlements change rarely, so cache them long (avoids a blocking round
// trip per scan). Free results stay short so an upgrade is seen within a minute.
const PRO_CACHE_TTL_MS = 60 * 60 * 1000;
const FREE_CACHE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export interface EntitlementResult {
  isPro: boolean;
}

// Whether the App User ID has an active Pro entitlement, cached in D1 (1h Pro,
// 60s free). Fails closed to isPro:false on any error.
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
    // Lifetime / non-consumable entitlements have a null expires_date — active.
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
