// QR-code linking, the way WhatsApp links a computer.
//
//   1. A browser (or a new phone) makes a P-256 key pair and calls
//      POST /v1/link/start with its public key. It shows
//      money2time://link?id=…&pk=…&kind=… as a QR code and polls.
//   2. A signed-in phone that holds the account's backup key scans it, wraps
//      that key for the shown public key (ECDH → HKDF → AES-GCM) and posts the
//      wrapped key to /v1/link/:id/approve.
//   3. The next poll hands the wrapped key to the newcomer exactly once. A
//      browser also gets a web token: its only credential, revocable from the
//      phone. A new phone gets just the key; it signs in on its own.
//
// The server relays the wrapped key and cannot open it: it never sees the
// backup key, only the public halves of the two key pairs.

import type { Env } from './env';
import { sha256Hex } from './tokens';

const LINK_TTL_MS = 2 * 60 * 1000;
/** Link requests one address may start in ten minutes; each QR refresh is one. */
const MAX_STARTS_PER_WINDOW = 30;
const START_WINDOW_MS = 10 * 60 * 1000;
const PUBLIC_KEY = /^[A-Za-z0-9_-]{80,100}$/; // 65-byte uncompressed P-256 point, base64url
const B64URL = /^[A-Za-z0-9_-]{8,512}$/;

const db = (env: Env) => env.MONEY2TIME_D1_CLOUD_BACKUP;
const encoder = new TextEncoder();

function randomToken(bytes = 32): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = '';
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const hashToken = (token: string) => sha256Hex(encoder.encode(token).buffer as ArrayBuffer);

export type LinkKind = 'web' | 'phone';

export type LinkRow = {
  id: string;
  kind: LinkKind;
  poll_token_hash: string;
  public_key: string;
  name: string | null;
  user_id: string | null;
  status: 'pending' | 'approved' | 'consumed';
  phone_public_key: string | null;
  wrapped_key: string | null;
  wrapped_iv: string | null;
  approved_by_device: string | null;
  web_token: string | null;
  created_at: number;
  expires_at: number;
};

export class LinkError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export async function startLink(
  env: Env,
  input: { kind: LinkKind; publicKey: string; name: string | null; ip: string | null; userId: string | null },
): Promise<{ linkId: string; pollToken: string; expiresAt: number }> {
  if (!PUBLIC_KEY.test(input.publicKey)) throw new LinkError(400, 'invalid_public_key');
  const now = Date.now();
  const ipHash = input.ip ? (await hashToken(`ip:${input.ip}`)).slice(0, 32) : null;
  if (ipHash) {
    const recent = await db(env)
      .prepare('select count(*) as n from link_request where ip_hash = ?1 and created_at > ?2')
      .bind(ipHash, now - START_WINDOW_MS)
      .first<{ n: number }>();
    if ((recent?.n ?? 0) >= MAX_STARTS_PER_WINDOW) throw new LinkError(429, 'rate_limited');
  }
  const linkId = randomToken(16);
  const pollToken = randomToken(32);
  const expiresAt = now + LINK_TTL_MS;
  await db(env)
    .prepare(
      `insert into link_request (id, kind, poll_token_hash, public_key, name, ip_hash, user_id, status, created_at, expires_at)
       values (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9)`,
    )
    .bind(linkId, input.kind, await hashToken(pollToken), input.publicKey, input.name, ipHash, input.userId, now, expiresAt)
    .run();
  return { linkId, pollToken, expiresAt };
}

async function getLink(env: Env, linkId: string): Promise<LinkRow | null> {
  return db(env).prepare('select * from link_request where id = ?1').bind(linkId).first<LinkRow>();
}

/** The newcomer's poll. An approved link is handed over once, then consumed. */
export async function pollLink(env: Env, linkId: string, pollToken: string) {
  const link = await getLink(env, linkId);
  if (!link || link.poll_token_hash !== (await hashToken(pollToken))) throw new LinkError(404, 'link_not_found');
  if (link.status === 'consumed') throw new LinkError(410, 'link_used');
  if (link.status === 'pending') {
    return link.expires_at < Date.now() ? { status: 'expired' as const } : { status: 'pending' as const };
  }
  // Consume before answering, so a replayed poll gets nothing.
  const consumed = await db(env)
    .prepare("update link_request set status = 'consumed', web_token = null where id = ?1 and status = 'approved'")
    .bind(linkId)
    .run();
  if (!consumed.meta.changes) throw new LinkError(410, 'link_used');
  const user = link.user_id
    ? await db(env).prepare('select email from "user" where id = ?1').bind(link.user_id).first<{ email: string }>()
    : null;
  const device = link.approved_by_device
    ? await db(env)
        .prepare('select name from device where user_id = ?1 and id = ?2')
        .bind(link.user_id, link.approved_by_device)
        .first<{ name: string | null }>()
    : null;
  return {
    status: 'approved' as const,
    phonePublicKey: link.phone_public_key,
    wrappedKey: link.wrapped_key,
    iv: link.wrapped_iv,
    email: user?.email ?? null,
    deviceName: device?.name ?? null,
    webToken: link.kind === 'web' ? link.web_token : null,
  };
}

/** What the scanning phone confirms before it approves. */
export async function describeLink(env: Env, linkId: string) {
  const link = await getLink(env, linkId);
  if (!link || link.status !== 'pending' || link.expires_at < Date.now()) throw new LinkError(404, 'link_not_found');
  return { kind: link.kind, name: link.name, publicKey: link.public_key, expiresAt: link.expires_at };
}

export async function approveLink(
  env: Env,
  input: {
    linkId: string;
    userId: string;
    deviceId: string;
    publicKey: string;
    phonePublicKey: string;
    wrappedKey: string;
    iv: string;
  },
): Promise<{ kind: LinkKind }> {
  if (!PUBLIC_KEY.test(input.phonePublicKey) || !B64URL.test(input.wrappedKey) || !B64URL.test(input.iv)) {
    throw new LinkError(400, 'invalid_wrapped_key');
  }
  const link = await getLink(env, input.linkId);
  if (!link || link.status !== 'pending' || link.expires_at < Date.now()) throw new LinkError(404, 'link_not_found');
  // The phone must have wrapped for the key in the QR it scanned, not some
  // other link's: a mismatch means the QR and the request do not belong together.
  if (link.public_key !== input.publicKey) throw new LinkError(409, 'public_key_mismatch');
  // A new phone hands its key request to its own account only.
  if (link.kind === 'phone' && link.user_id !== input.userId) throw new LinkError(403, 'different_account');

  let webToken: string | null = null;
  if (link.kind === 'web') {
    webToken = randomToken(32);
    const now = Date.now();
    await db(env)
      .prepare(
        `insert into web_session (id, user_id, token_hash, name, created_at, last_seen_at)
         values (?1, ?2, ?3, ?4, ?5, ?5)`,
      )
      .bind(crypto.randomUUID(), input.userId, await hashToken(webToken), link.name, now)
      .run();
  }
  const updated = await db(env)
    .prepare(
      `update link_request set status = 'approved', user_id = ?2, phone_public_key = ?3, wrapped_key = ?4,
         wrapped_iv = ?5, approved_by_device = ?6, web_token = ?7
       where id = ?1 and status = 'pending'`,
    )
    .bind(input.linkId, input.userId, input.phonePublicKey, input.wrappedKey, input.iv, input.deviceId, webToken)
    .run();
  if (!updated.meta.changes) throw new LinkError(409, 'link_not_pending');
  return { kind: link.kind };
}

/** The account a browser's web token belongs to, or null if unknown or revoked. */
export async function webSessionUser(env: Env, token: string): Promise<{ userId: string; sessionId: string } | null> {
  if (!B64URL.test(token)) return null;
  const row = await db(env)
    .prepare('select id, user_id, last_seen_at from web_session where token_hash = ?1 and revoked_at is null')
    .bind(await hashToken(token))
    .first<{ id: string; user_id: string; last_seen_at: number }>();
  if (!row) return null;
  // Touch at most hourly, so a busy tab does not write on every request.
  if (Date.now() - row.last_seen_at > 60 * 60 * 1000) {
    await db(env).prepare('update web_session set last_seen_at = ?2 where id = ?1').bind(row.id, Date.now()).run();
  }
  return { userId: row.user_id, sessionId: row.id };
}

export async function listWebSessions(env: Env, userId: string) {
  const result = await db(env)
    .prepare(
      'select id, name, created_at, last_seen_at from web_session where user_id = ?1 and revoked_at is null order by last_seen_at desc',
    )
    .bind(userId)
    .all<{ id: string; name: string | null; created_at: number; last_seen_at: number }>();
  return result.results.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export async function revokeWebSession(env: Env, userId: string, sessionId: string): Promise<void> {
  await db(env)
    .prepare('update web_session set revoked_at = ?3 where id = ?1 and user_id = ?2 and revoked_at is null')
    .bind(sessionId, userId, Date.now())
    .run();
}

export async function revokeAllWebSessions(env: Env, userId: string): Promise<void> {
  await db(env)
    .prepare('update web_session set revoked_at = ?2 where user_id = ?1 and revoked_at is null')
    .bind(userId, Date.now())
    .run();
}

/** Daily: link requests are only ever two minutes long. */
export async function pruneLinks(env: Env): Promise<void> {
  await db(env).prepare('delete from link_request where expires_at < ?1').bind(Date.now() - 24 * 60 * 60 * 1000).run();
}
