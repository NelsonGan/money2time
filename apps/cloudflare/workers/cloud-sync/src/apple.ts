// Sign in with Apple token revocation. Apple asks apps that offer Sign in with
// Apple to revoke the user's Apple tokens when they delete their account.
//
// Sign-in itself only checks Apple's ID token (auth.ts). Right after an Apple
// sign-in the app also posts the one-time authorization code; it is exchanged
// here for a refresh token, stored encrypted, and revoked on account deletion.
// Both calls authenticate with a client secret: a 5-minute ES256 JWT signed
// with the Sign in with Apple key (README: Cloud-sync Worker > Sign in with Apple).

import { decodeJwt, importPKCS8, SignJWT } from 'jose';

import type { Env } from './env';
import { open, seal } from './secretBox';

const APPLE = 'https://appleid.apple.com';

export function isAppleRevocationConfigured(env: Env): boolean {
  return Boolean(env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
}

async function clientSecret(env: Env): Promise<string> {
  const key = await importPKCS8(env.APPLE_PRIVATE_KEY ?? '', 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID ?? '')
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setAudience(APPLE)
    .setSubject(env.APPLE_APP_BUNDLE_IDENTIFIER)
    .sign(key);
}

async function form(env: Env, path: string, fields: Record<string, string>): Promise<Response> {
  return fetch(`${APPLE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.APPLE_APP_BUNDLE_IDENTIFIER,
      client_secret: await clientSecret(env),
      ...fields,
    }),
  });
}

type AppleLinkResult = 'stored' | 'not_apple_user' | 'mismatch' | 'rejected';

/**
 * Exchanges the app's one-time authorization code for a refresh token and
 * stores it, if the code belongs to the Apple account this user signed in with.
 */
export async function storeAppleRefreshToken(
  env: Env,
  userId: string,
  code: string,
): Promise<AppleLinkResult> {
  const account = await env.AUTH_DB.prepare(
    `SELECT "accountId" AS sub FROM "account" WHERE "userId" = ?1 AND "providerId" = 'apple'`,
  )
    .bind(userId)
    .first<{ sub: string }>();
  if (!account) return 'not_apple_user';
  const res = await form(env, '/auth/token', { code, grant_type: 'authorization_code' });
  if (!res.ok) return 'rejected';
  const body = (await res.json()) as { refresh_token?: string; id_token?: string };
  if (!body.refresh_token || !body.id_token) return 'rejected';
  // The token came straight from Apple over TLS; its subject must be this user's.
  if (decodeJwt(body.id_token).sub !== account.sub) return 'mismatch';
  await env.AUTH_DB.prepare(
    `INSERT INTO apple_tokens (user_id, refresh_token) VALUES (?1, ?2)
     ON CONFLICT(user_id) DO UPDATE SET refresh_token = ?2`,
  )
    .bind(userId, await seal(env, 'apple-refresh-token', body.refresh_token))
    .run();
  return 'stored';
}

/** Revokes the user's Apple refresh token, if one was stored. Never throws. */
export async function revokeAppleTokens(env: Env, userId: string): Promise<void> {
  if (!isAppleRevocationConfigured(env)) return;
  try {
    const row = await env.AUTH_DB.prepare(
      'SELECT refresh_token FROM apple_tokens WHERE user_id = ?1',
    )
      .bind(userId)
      .first<{ refresh_token: string }>();
    if (!row) return;
    const token = await open(env, 'apple-refresh-token', row.refresh_token);
    if (!token) {
      console.error('[cloud-sync] apple token unreadable (BETTER_AUTH_SECRET rotated?)');
      return;
    }
    const res = await form(env, '/auth/revoke', { token, token_type_hint: 'refresh_token' });
    if (!res.ok) console.error('[cloud-sync] apple revoke failed', res.status);
  } catch (error) {
    console.error(
      '[cloud-sync] apple revoke error',
      error instanceof Error ? error.message : error,
    );
  }
}
