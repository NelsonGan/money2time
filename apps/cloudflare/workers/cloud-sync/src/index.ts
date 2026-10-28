// Cloud Sync Worker. See README.md > Cloudflare > Cloud-sync Worker.
//
//   /api/auth/*                 Better Auth (Apple, Google, email code)
//   GET    /v1/account          who is signed in and whether the account is Pro
//   POST   /v1/sync/credentials {appUserId} → the user's Turso database URL and a token for it
//   POST   /v1/media/exists     {paths} → which images are already stored
//   PUT    /v1/media/<path>     store one image
//   GET    /v1/media/<path>     read one image
//   POST   /v1/apple/authorization {code} → keep an Apple refresh token to revoke later
//   DELETE /v1/account          delete the cloud copy, images and sign-in for good (revokes Apple tokens)
//
// Everything under /v1 needs a session token (`Authorization: Bearer …`).
// A daily cron clears expired sign-in codes and old rate-limit rows.

import { isAppleRevocationConfigured, revokeAppleTokens, storeAppleRefreshToken } from './apple';
import { getAuth } from './auth';
import type { Env } from './env';
import { json, readJson } from './http';
import { deleteAllMedia, existingMedia, getMedia, putMedia } from './media';
import { isAccountPro, isValidAppUserId, linkAppUserId } from './revenuecat';
import { deleteSyncDatabase, getSyncDatabase } from './turso';

interface SessionUser {
  id: string;
  email: string;
  name: string;
}

const SEND_CODE_PATH = '/api/auth/email-otp/send-verification-otp';

/**
 * The only Better Auth routes the app uses. Everything else Better Auth
 * mounts (OAuth callbacks, password reset by email code, account and session
 * management, update-user, …) is unreachable, so it cannot be used to send
 * emails, change an account or probe it.
 */
const AUTH_ROUTES: Readonly<Record<string, 'GET' | 'POST'>> = {
  '/api/auth/sign-in/social': 'POST',
  [SEND_CODE_PATH]: 'POST',
  '/api/auth/sign-in/email-otp': 'POST',
  '/api/auth/sign-out': 'POST',
  '/api/auth/ok': 'GET',
};
const RATE_LIMIT_ROW_TTL_MS = 24 * 60 * 60 * 1000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/auth/')) {
        if (AUTH_ROUTES[url.pathname] !== request.method) return json({ error: 'not_found' }, 404);
        const refused = await authGate(request, url, env);
        return refused ?? (await getAuth(env).handler(request));
      }
      if (!url.pathname.startsWith('/v1/')) return json({ error: 'not_found' }, 404);

      const session = await getAuth(env).api.getSession({ headers: request.headers });
      if (!session) return json({ error: 'unauthorized' }, 401);
      const { id, email, name } = session.user;
      return await route(request, url, env, { id, email, name });
    } catch (error) {
      // Internal text (D1, Turso, RevenueCat) stays in the logs.
      console.error(
        '[cloud-sync]',
        url.pathname,
        error instanceof Error ? error.message : 'unknown',
      );
      return json({ error: 'server_error' }, 500);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await env.AUTH_DB.batch([
      env.AUTH_DB.prepare('DELETE FROM "verification" WHERE "expiresAt" < ?1').bind(
        new Date().toISOString(),
      ),
      env.AUTH_DB.prepare('DELETE FROM "rateLimit" WHERE "lastRequest" < ?1').bind(
        Date.now() - RATE_LIMIT_ROW_TTL_MS,
      ),
    ]);
  },
} satisfies ExportedHandler<Env>;

/**
 * In front of Better Auth: rate limits (every POST per client IP, code
 * requests also per recipient, so many IPs cannot flood one inbox), and code
 * requests only for signing in.
 */
async function authGate(request: Request, url: URL, env: Env): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (env.AUTH_LIMITER && !(await env.AUTH_LIMITER.limit({ key: ip })).success) {
    return json({ error: 'rate_limited' }, 429);
  }
  if (url.pathname !== SEND_CODE_PATH) return null;
  const body = await readJson<{ email: unknown; type: unknown }>(request.clone());
  if (body?.type !== 'sign-in') return json({ error: 'bad_request' }, 400);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email && env.OTP_LIMITER && !(await env.OTP_LIMITER.limit({ key: email })).success) {
    return json({ error: 'rate_limited' }, 429);
  }
  return null;
}

async function route(request: Request, url: URL, env: Env, user: SessionUser): Promise<Response> {
  const { pathname } = url;
  const method = request.method;

  if (pathname === '/v1/account' && method === 'GET') {
    return json({ user, isPro: await isAccountPro(env, user.id) });
  }

  if (pathname === '/v1/account' && method === 'DELETE') {
    // Apple asks for the user's Apple tokens to be revoked with the account.
    // Revocation reads apple_tokens, so it finishes before the rows go.
    await Promise.all([
      revokeAppleTokens(env, user.id),
      deleteSyncDatabase(env, user.id),
      deleteAllMedia(env, user.id),
    ]);
    // Every other table of the user cascades from "user" (schema.sql). The
    // email code, if one is pending, is keyed by address.
    await env.AUTH_DB.batch([
      // Exact match: only sign-in codes exist (see authGate).
      env.AUTH_DB.prepare('DELETE FROM "verification" WHERE "identifier" = ?1').bind(
        `sign-in-otp-${user.email}`,
      ),
      env.AUTH_DB.prepare('DELETE FROM "user" WHERE "id" = ?1').bind(user.id),
    ]);
    return json({ ok: true });
  }

  if (pathname === '/v1/apple/authorization' && method === 'POST') {
    if (!isAppleRevocationConfigured(env)) return json({ ok: false, reason: 'not_configured' });
    const body = await readJson<{ code: unknown }>(request);
    if (typeof body?.code !== 'string' || !body.code) return json({ error: 'bad_code' }, 400);
    const result = await storeAppleRefreshToken(env, user.id, body.code);
    return json({ ok: result === 'stored', reason: result });
  }

  if (pathname === '/v1/sync/credentials' && method === 'POST') {
    const body = await readJson<{ appUserId: unknown }>(request);
    if (isValidAppUserId(body?.appUserId)) await linkAppUserId(env, user.id, body.appUserId);
    if (!(await isAccountPro(env, user.id))) return json({ error: 'not_pro' }, 403);
    // A concurrent DELETE /v1/account makes the database insert fail on the
    // user's foreign key, and getSyncDatabase removes what it made.
    const db = await getSyncDatabase(env, user.id);
    return json({ url: db.url, authToken: db.token, expiresAt: db.expiresAt });
  }

  if (pathname === '/v1/media/exists' && method === 'POST') {
    if (!(await isAccountPro(env, user.id))) return json({ error: 'not_pro' }, 403);
    const body = await readJson<{ paths: unknown }>(request);
    return existingMedia(env, user.id, body?.paths);
  }

  if (pathname.startsWith('/v1/media/')) {
    let path: string;
    try {
      path = decodeURIComponent(pathname.slice('/v1/media/'.length));
    } catch {
      return json({ error: 'bad_path' }, 400);
    }
    if (method === 'GET') return getMedia(env, user.id, path);
    if (method === 'PUT') {
      if (!(await isAccountPro(env, user.id))) return json({ error: 'not_pro' }, 403);
      return putMedia(env, user.id, path, request);
    }
  }

  return json({ error: 'not_found' }, 404);
}
