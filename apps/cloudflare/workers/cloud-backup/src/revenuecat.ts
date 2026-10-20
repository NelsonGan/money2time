// Whether an account is Pro, for gating parts of the web dashboard. The same
// server-side check as the receipt scanner (apps/cloudflare/workers/
// receipt-scanner/src/revenuecat.ts): the entitlement, read with the secret
// key, never trusted from the client. An account is Pro when any of its
// phones' RevenueCat App User IDs is.

import type { Env } from './env';
import { listAppUserIds } from './store';

const RC_BASE = 'https://api.revenuecat.com/v1/subscribers';
const PRO_CACHE_TTL_MS = 60 * 60 * 1000;
const FREE_CACHE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

export async function isAccountPro(env: Env, userId: string): Promise<boolean> {
  if (!env.REVENUECAT_SECRET_KEY) return false;
  for (const appUserId of await listAppUserIds(env, userId)) {
    if (await isPro(env, appUserId)) return true;
  }
  return false;
}

async function isPro(env: Env, appUserId: string): Promise<boolean> {
  const db = env.MONEY2TIME_D1_CLOUD_BACKUP;
  const now = Date.now();
  const cached = await db
    .prepare('select is_pro from entitlement_cache where app_user_id = ?1 and expires_at > ?2')
    .bind(appUserId, now)
    .first<{ is_pro: number }>();
  if (cached) return cached.is_pro === 1;

  const pro = await fetchEntitlement(env, appUserId);
  await db
    .prepare(
      `insert into entitlement_cache (app_user_id, is_pro, expires_at) values (?1, ?2, ?3)
       on conflict (app_user_id) do update set is_pro = ?2, expires_at = ?3`,
    )
    .bind(appUserId, pro ? 1 : 0, now + (pro ? PRO_CACHE_TTL_MS : FREE_CACHE_TTL_MS))
    .run();
  return pro;
}

/** Fails closed: any error reads as not Pro. */
async function fetchEntitlement(env: Env, appUserId: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${RC_BASE}/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${env.REVENUECAT_SECRET_KEY}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as {
      subscriber?: { entitlements?: Record<string, { expires_date?: string | null } | undefined> };
    };
    const entitlement = body?.subscriber?.entitlements?.[env.ENTITLEMENT_ID];
    if (!entitlement) return false;
    // Lifetime entitlements have no expiry.
    if (entitlement.expires_date == null) return true;
    const expires = Date.parse(entitlement.expires_date);
    return Number.isFinite(expires) && expires > Date.now();
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
