// Direct bearer-session verification for /v1/* routes, batched with each
// route's primary D1 read so authenticated requests pay one D1 round trip
// instead of Better Auth's separate session lookup plus the route's own reads.
//
// Better Auth's /api/auth/* endpoints still handle sign-in, sign-out and token
// creation (src/auth.ts). Tokens created by Better Auth's bearer plugin are
// either the raw session.token (32 chars) or `<token>.<base64-hmac>` signed
// with BETTER_AUTH_SECRET. Both are verified here identically to Better Auth's
// bearer plugin, and sliding-window expiry refresh (`updateAge`) runs in
// `ctx.waitUntil` so it never adds latency to a response.

import { getAuth } from './auth';
import type { Env } from './env';
import type { SessionUser } from './ledgers';

/** Shared with `auth.ts` (`session.expiresIn` and `session.updateAge`) so they cannot drift. */
export const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 365;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_EXPIRES_IN_MS = SESSION_EXPIRES_IN_SECONDS * 1000;
export const SESSION_UPDATE_AGE_MS = SESSION_UPDATE_AGE_SECONDS * 1000;

/**
 * SQL subquery yielding the authenticated user's id for a bearer token bound
 * as `?1`. `"session"."token"` is UNIQUE, so SQLite resolves this with one
 * index seek inside the same D1 batch round trip as the session check.
 * Callers MUST discard every other batch result when the session row is
 * missing or expired.
 */
export const SESSION_USER_SUBQUERY = '(SELECT "userId" FROM "session" WHERE "token" = ?1 LIMIT 1)';

const MAX_TOKEN_LENGTH = 256;

interface SessionJoinRow {
  session_id: string;
  expires_at: string | number;
  id: string;
  email: string;
  name: string | null;
}

let cachedHmacKey: { secret: string; key: Promise<CryptoKey> } | null = null;

function hmacKeyFor(secret: string): Promise<CryptoKey> {
  if (cachedHmacKey?.secret !== secret) {
    cachedHmacKey = {
      secret,
      key: crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      ),
    };
  }
  return cachedHmacKey.key;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4;
    const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
    const binary = atob(padded);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function tryDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Extracts and verifies the session token from `Authorization: Bearer …`.
 * Accepts raw tokens (as Better Auth's bearer plugin issues with default
 * `requireSignature: false`) and signed `<token>.<hmac>` tokens (including
 * URL-encoded signatures, verified with constant-time WebCrypto HMAC-SHA256).
 */
export async function extractBearerToken(
  request: Request,
  secret: string,
): Promise<string | null> {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const space = header.indexOf(' ');
  if (space <= 0 || header.slice(0, space).toLowerCase() !== 'bearer') return null;
  const raw = header.slice(space + 1).trim();
  if (!raw || raw.length > MAX_TOKEN_LENGTH) return null;
  const candidate = raw.includes('.') && raw.includes('%') ? tryDecode(raw) : raw;
  const dot = candidate.lastIndexOf('.');
  if (dot === -1) return candidate;
  const token = candidate.slice(0, dot);
  const sig = candidate.slice(dot + 1);
  if (!token || !sig) return null;
  const sigBytes = decodeBase64(sig);
  if (!sigBytes) return null;
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKeyFor(secret),
    sigBytes,
    new TextEncoder().encode(token),
  );
  return ok ? token : null;
}

function parseExpiresAtMs(value: string | number): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sessionStatement(env: Env, token: string): D1PreparedStatement {
  return env.AUTH_DB.prepare(
    `SELECT s."id" AS session_id, s."expiresAt" AS expires_at,
            u."id" AS id, u."email" AS email, u."name" AS name
     FROM "session" s
     JOIN "user" u ON u."id" = s."userId"
     WHERE s."token" = ?1
     LIMIT 1`,
  ).bind(token);
}

function finalizeSession(
  row: SessionJoinRow | null | undefined,
  env: Env,
  ctx?: ExecutionContext,
): SessionUser | null {
  if (!row) return null;
  const now = Date.now();
  const expiresMs = parseExpiresAtMs(row.expires_at);
  if (expiresMs <= now) return null;
  // Sliding window: extend expiry once a week, off the critical path.
  if (expiresMs - now < SESSION_EXPIRES_IN_MS - SESSION_UPDATE_AGE_MS) {
    const nextExpires = new Date(now + SESSION_EXPIRES_IN_MS).toISOString();
    const updatedAt = new Date(now).toISOString();
    const refresh = env.AUTH_DB.prepare(
      'UPDATE "session" SET "expiresAt" = ?1, "updatedAt" = ?2 WHERE "id" = ?3',
    )
      .bind(nextExpires, updatedAt, row.session_id)
      .run()
      .catch(() => undefined);
    if (ctx) ctx.waitUntil(refresh);
  }
  return { id: row.id, email: row.email, name: row.name ?? '' };
}

/**
 * Verifies the request's session and, for Bearer requests, runs `extra`
 * read-only D1 statements in the same single `AUTH_DB.batch` round trip.
 * Returns null when unauthenticated or expired (discarding `extra`).
 */
export async function authenticateBatch(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
  extra?: (token: string) => D1PreparedStatement[],
): Promise<{ user: SessionUser; extra: D1Result[] | null } | null> {
  const token = await extractBearerToken(request, env.BETTER_AUTH_SECRET);
  if (!token) {
    // Only fall back to Better Auth when a non-Bearer Cookie header is sent.
    if (request.headers.get('authorization') || !request.headers.get('cookie')) return null;
    const session = await getAuth(env).api.getSession({ headers: request.headers });
    if (!session) return null;
    const { id, email, name } = session.user;
    return { user: { id, email, name }, extra: null };
  }
  const statements = extra ? extra(token) : [];
  if (!statements.length) {
    const row = await sessionStatement(env, token).first<SessionJoinRow>();
    const user = finalizeSession(row, env, ctx);
    return user ? { user, extra: [] } : null;
  }
  const results = await env.AUTH_DB.batch([sessionStatement(env, token), ...statements]);
  const sessionRow = (results[0]?.results as SessionJoinRow[] | undefined)?.[0];
  const user = finalizeSession(sessionRow, env, ctx);
  if (!user) return null;
  return { user, extra: results.slice(1) };
}
