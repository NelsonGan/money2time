// Server-side RevenueCat entitlement check. The app owns its App User ID
// (`m2t_<uuid>`, stored in settings.appUserId and pushed to RevenueCat via
// Purchases.configure({ appUserID })), so we verify the *entitlement* here —
// not existence. The GET /subscribers endpoint is get-or-create, so it cannot
// prove a user is real; free-tier trust comes from the rate-limit caps instead.

import type { Env } from './index';

const RC_BASE = 'https://api.revenuecat.com/v1/subscribers';
const CACHE_TTL_SECONDS = 60;
const FETCH_TIMEOUT_MS = 8000;

export interface EntitlementResult {
  isPro: boolean;
}

/**
 * Returns whether the given App User ID has an active Pro entitlement.
 * Result is cached in KV for 60s to avoid hammering RevenueCat (and to keep
 * bursty re-scans cheap). Fails closed to `isPro: false` on any error.
 */
export async function getEntitlement(
  appUserId: string,
  env: Env,
): Promise<EntitlementResult> {
  const kv = env.MONEY2TIME_WORKERS_KV_RECEIPT_SCANNER;
  const cacheKey = `rc:${appUserId}`;
  const cached = await kv.get(cacheKey);
  if (cached === 'pro') return { isPro: true };
  if (cached === 'free') return { isPro: false };

  const isPro = await fetchEntitlement(appUserId, env);
  await kv.put(cacheKey, isPro ? 'pro' : 'free', { expirationTtl: CACHE_TTL_SECONDS });
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
