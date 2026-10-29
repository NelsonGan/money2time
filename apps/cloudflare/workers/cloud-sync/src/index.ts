// Cloud Sync Worker. See README.md > Cloudflare > Cloud-sync Worker.
//
//   /api/auth/*                 Better Auth (Apple, Google, email code; sending a code needs Turnstile)
//   GET    /v1/account          who is signed in and whether the account is Pro
//   POST   /v1/account/status {appUserId} → {isPro, limited} for this phone (Pro reaches 5 phones)
//   DELETE /v1/account/install {appUserId} → sign-out: the install no longer counts for the account's Pro
//   POST   /v1/sync/credentials {appUserId} → the user's Turso database URL and a token for it
//   POST   /v1/media/exists     {paths} → which images are already stored
//   PUT    /v1/media/<path>     store one image
//   GET    /v1/media/<path>     read one image
//   GET    /v1/live?device=…    WebSocket: told when a channel changed (src/live.ts)
//   POST   /v1/sync/notify {channel, device} → tell the user's (or ledger's) other phones
//   POST   /v1/apple/authorization {code} → keep an Apple refresh token to revoke later
//   DELETE /v1/account          delete the cloud copy, images and sign-in for good (revokes Apple tokens)
//
// Shared ledgers (src/ledgers.ts):
//   GET    /v1/ledgers                       the user's shared ledgers, owned and joined
//   POST   /v1/ledgers {ledgerId,name,emoji} share one of the user's ledgers (Pro, at most 2)
//   DELETE /v1/ledgers/<id>                  stop sharing (owner): members out, cloud copy gone
//   POST   /v1/ledgers/<id>/leave            leave (member)
//   POST   /v1/ledgers/<id>/credentials      its Turso database URL and a token for it
//   GET    /v1/ledgers/<id>/members          owner and members (addresses for the owner only)
//   DELETE /v1/ledgers/<id>/members/<user>   remove a member (owner); the invite link rotates
//   POST   /v1/ledgers/<id>/invites          the ledger's invite link, reused for a day (owner)
//   POST|PUT|GET /v1/ledgers/<id>/media/…    its images, like /v1/media
//   GET    /v1/invites/<code>                what an invite opens (no sign-in needed)
//   POST   /v1/invites/<code>/accept         join (any signed-in user, no Pro needed; at most 5)
//   GET    /join/<code>                      the page an invite link opens; hands it to the app
//
// Everything else under /v1 needs a session token (`Authorization: Bearer …`).
// A daily cron clears expired sign-in codes, invite links and old rate-limit rows.

import { isAppleRevocationConfigured, revokeAppleTokens, storeAppleRefreshToken } from './apple';
import { getAuth } from './auth';
import { csv, type Env } from './env';
import { json, readJson } from './http';
import {
  audienceIfAllowed,
  deleteLedgerAccess,
  expiredInvitesStatement,
  invitePage,
  isLedgerActive,
  ledgerForMedia,
  previewInvite,
  routeLedgers,
  type SessionUser,
} from './ledgers';
import {
  decodeMediaPath,
  deleteAllMedia,
  existingMedia,
  getMedia,
  ledgerSpace,
  type MediaSpace,
  putMedia,
  userSpace,
} from './media';
import { connectLive, isValidChannel, isValidDeviceId, notifyUsers } from './live';
import {
  isAccountPro,
  isValidAppUserId,
  linkAppUserId,
  markPhoneSeen,
  phoneProStatus,
  unlinkAppUserId,
} from './revenuecat';
import { databaseNameFor, deleteDatabase, deleteSyncDatabase, getSyncDatabase } from './turso';
import { checkTurnstile, TURNSTILE_HEADER } from './turnstile';

export { SyncHub } from './live';

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
      const join = /^\/join\/([^/]+)$/.exec(url.pathname);
      if (join && request.method === 'GET') return invitePage(join[1]);
      if (!url.pathname.startsWith('/v1/')) return json({ error: 'not_found' }, 404);

      const preview = /^\/v1\/invites\/([^/]+)$/.exec(url.pathname);
      if (preview && request.method === 'GET') {
        // Open to anyone holding a link, so rate limited like sign-in.
        const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
        if (env.AUTH_LIMITER && !(await env.AUTH_LIMITER.limit({ key: ip })).success) {
          return json({ error: 'rate_limited' }, 429);
        }
        return await previewInvite(env, preview[1]);
      }

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
      expiredInvitesStatement(env),
    ]);
  },
} satisfies ExportedHandler<Env>;

/**
 * In front of Better Auth: rate limits (every POST per client IP, code
 * requests also per recipient, so many IPs cannot flood one inbox), code
 * requests only for signing in, and only with a Turnstile token that verifies
 * (src/turnstile.ts, which also covers the rollout).
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
  // Before the per-recipient limit, so requests without a valid token cannot
  // use up someone's three codes a minute.
  const captcha = await checkTurnstile({
    token: request.headers.get(TURNSTILE_HEADER),
    secret: env.TURNSTILE_SECRET_KEY,
    enforce: env.TURNSTILE_ENFORCE === 'true',
    remoteIp: request.headers.get('cf-connecting-ip'),
    hostnames: csv(env.TURNSTILE_HOSTNAMES).map((host) => host.toLowerCase()),
  });
  if (!captcha.ok) {
    console.warn('[cloud-sync] turnstile refused', captcha.reason, captcha.codes?.join(',') ?? '');
    return json({ error: 'captcha_failed' }, 403);
  }
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

  if (pathname === '/v1/account/status' && method === 'POST') {
    // Asked by every signed-in phone, Pro or not: a phone that is Pro is
    // linked here, so the account's Pro reaches the user's other phones (at
    // most 5, the most recently active; `limited` says this one is past it).
    const body = await readJson<{ appUserId: unknown }>(request);
    const appUserId = isValidAppUserId(body?.appUserId) ? body.appUserId : null;
    if (appUserId) {
      await linkAppUserId(env, user.id, appUserId);
      await markPhoneSeen(env, user.id, appUserId);
    }
    return json(await phoneProStatus(env, user.id, appUserId));
  }

  if (pathname === '/v1/account/install' && method === 'DELETE') {
    // Signing out: this install no longer makes the account Pro, and its App
    // User ID is free for another account. So Pro reaches only the phones
    // that stay signed in.
    const body = await readJson<{ appUserId: unknown }>(request);
    if (isValidAppUserId(body?.appUserId)) await unlinkAppUserId(env, user.id, body.appUserId);
    return json({ ok: true });
  }

  if (pathname === '/v1/live' && method === 'GET') {
    return connectLive(request, env, user.id, url);
  }

  if (pathname === '/v1/sync/notify' && method === 'POST') {
    if (env.NOTIFY_LIMITER && !(await env.NOTIFY_LIMITER.limit({ key: user.id })).success) {
      return json({ error: 'rate_limited' }, 429);
    }
    const body = await readJson<{ channel: unknown; device: unknown }>(request);
    const channel = body?.channel;
    if (!isValidChannel(channel)) return json({ error: 'bad_request' }, 400);
    const device = isValidDeviceId(body?.device) ? body.device : null;
    const audience =
      channel === 'personal' ? [user.id] : await audienceIfAllowed(env, channel, user.id);
    if (!audience) return json({ error: 'not_found' }, 404);
    await notifyUsers(env, audience, channel, device);
    return json({ ok: true });
  }

  if (pathname === '/v1/account' && method === 'DELETE') {
    // Apple asks for the user's Apple tokens to be revoked with the account.
    // Revocation reads apple_tokens, so it finishes before the rows go.
    await Promise.all([
      revokeAppleTokens(env, user.id),
      deleteSyncDatabase(env, user.id),
      deleteAllMedia(env, userSpace(user.id)),
      deleteLedgerAccess(env, user.id),
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
    // A first sync that made the user's database while this ran wrote a row
    // the cascade has just removed: its database (named from the user id) is
    // deleted again, so none is left behind. 404 when there is none.
    if (!env.LOCAL_SYNC_URL) {
      await deleteDatabase(env, await databaseNameFor(user.id)).catch(() => undefined);
    }
    // The user's other phones try to sync, find the session gone and sign out.
    await notifyUsers(env, [user.id], 'personal', null, 'access');
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
    const appUserId = isValidAppUserId(body?.appUserId) ? body.appUserId : null;
    if (appUserId) {
      await linkAppUserId(env, user.id, appUserId);
      await markPhoneSeen(env, user.id, appUserId);
    }
    const pro = await phoneProStatus(env, user.id, appUserId);
    if (!pro.isPro) return json({ error: pro.limited ? 'phone_limit' : 'not_pro' }, 403);
    // A concurrent DELETE /v1/account makes the database insert fail on the
    // user's foreign key, and getSyncDatabase removes what it made.
    const db = await getSyncDatabase(env, user.id);
    return json({ url: db.url, authToken: db.token, expiresAt: db.expiresAt });
  }

  if (pathname.startsWith('/v1/media/')) {
    // Personal images: writing needs the account's Pro.
    const canWrite = () => isAccountPro(env, user.id);
    return mediaRoute(
      request,
      env,
      userSpace(user.id),
      pathname.slice('/v1/media/'.length),
      canWrite,
    );
  }

  const ledgerMedia = /^\/v1\/ledgers\/([^/]+)\/media\/(.+)$/.exec(pathname);
  if (ledgerMedia) {
    const ledger = await ledgerForMedia(env, ledgerMedia[1], user.id);
    if (!ledger) return json({ error: 'not_found' }, 404);
    // A shared ledger's images: writing needs the ledger active (anyone in it Pro).
    const canWrite = () => isLedgerActive(env, ledger);
    return mediaRoute(request, env, ledgerSpace(ledger.id), ledgerMedia[2], canWrite);
  }

  return (await routeLedgers(request, url, env, user)) ?? json({ error: 'not_found' }, 404);
}

/** `exists`, PUT and GET of one image space. */
async function mediaRoute(
  request: Request,
  env: Env,
  space: MediaSpace,
  rest: string,
  canWrite: () => Promise<boolean>,
): Promise<Response> {
  if (rest === 'exists' && request.method === 'POST') {
    if (!(await canWrite())) return json({ error: 'not_pro' }, 403);
    const body = await readJson<{ paths: unknown }>(request);
    return existingMedia(env, space, body?.paths);
  }
  const path = decodeMediaPath(rest);
  if (path === null) return json({ error: 'bad_path' }, 400);
  if (request.method === 'GET') return getMedia(env, space, path);
  if (request.method === 'PUT') {
    if (!(await canWrite())) return json({ error: 'not_pro' }, 403);
    return putMedia(env, space, path, request);
  }
  return json({ error: 'not_found' }, 404);
}
