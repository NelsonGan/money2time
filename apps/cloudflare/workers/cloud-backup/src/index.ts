// Cloud Backup & Web Dashboard. Serves Better Auth at /api/auth/* and a small
// API at /v1/*:
//
//   POST   /v1/devices                register this phone; the first one becomes primary
//   GET    /v1/status?deviceId=…      account, primary device, latest backup, Pro
//   POST   /v1/devices/primary        Transfer Primary Device to this phone
//   POST   /v1/backups/upload-url     short-lived PUT URL (primary device only)
//   PUT    /v1/backups/upload?token=  the gzipped backup itself
//   GET    /v1/backups/latest         latest backup metadata + short-lived GET URL
//   GET    /v1/backups/download?token=
//   DELETE /v1/backups                delete the cloud backup
//   POST   /v1/account/key            set the backup key's fingerprint (first phone)
//   POST   /v1/account/key/reset      start over with a new key (old backup deleted)
//   POST   /v1/link/start             QR link: a browser or new phone shows its public key
//   GET    /v1/link/:id/poll?token=   …and polls for the wrapped backup key
//   GET    /v1/link/:id               the scanning phone reads what it is linking
//   POST   /v1/link/:id/approve       …and posts the backup key wrapped for it
//   GET    /v1/web/sessions           linked browsers;  DELETE /v1/web/sessions/:id
//   GET    /v1/web/latest             the browser's view of the latest backup (web token)
//   DELETE /v1/web/session            the browser unlinks itself (web token)
//
// The phone is the source of truth. Backups are end-to-end encrypted on the
// phone; this Worker stores and relays ciphertext and wrapped keys only. The
// web dashboard only reads, and nothing syncs between phones: one primary
// device writes, everyone else reads.

import { allowedOrigins, createAuth } from './auth';
import type { Env } from './env';
import {
  approveLink,
  describeLink,
  LinkError,
  listWebSessions,
  pollLink,
  pruneLinks,
  revokeAllWebSessions,
  revokeWebSession,
  startLink,
  webSessionUser,
} from './link';
import { isAccountPro } from './revenuecat';
import {
  claimPrimaryIfUnset,
  deleteBackup,
  getBackup,
  getDevice,
  getKeyCheck,
  getPrimaryDeviceId,
  listDevices,
  putBackup,
  replaceKeyCheck,
  setKeyCheckIfUnset,
  setPrimary,
  upsertDevice,
  type BackupRow,
  type DeviceRow,
} from './store';
import { sha256Hex, signToken, verifyToken, type DownloadClaims, type UploadClaims } from './tokens';

const URL_TTL_MS = 10 * 60 * 1000;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const APP_USER_ID = /^[A-Za-z0-9$:_.-]{1,100}$/;
const KEY_CHECK = /^[A-Za-z0-9_-]{43}$/;
const SHA256 = /^[a-f0-9]{64}$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Credentialed CORS for the web dashboard's origin only. */
function withCors(request: Request, response: Response, env: Env): Response {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Expose-Headers', 'X-Backup-Sha256, Content-Length');
  headers.append('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function preflight(request: Request, env: Env): Response {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') ?? 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

function devicePublic(device: DeviceRow | null) {
  return device
    ? {
        id: device.id,
        platform: device.platform,
        name: device.name,
        appVersion: device.app_version,
        lastSeenAt: device.last_seen_at,
      }
    : null;
}

function backupPublic(backup: BackupRow | null) {
  return backup
    ? {
        id: backup.id,
        deviceId: backup.device_id,
        createdAt: backup.created_at,
        size: backup.size,
        sha256: backup.sha256,
        schemaVersion: backup.schema_version,
        appVersion: backup.app_version,
        exportedAt: backup.exported_at,
      }
    : null;
}

async function status(env: Env, userId: string, deviceId: string | null) {
  const [primaryId, backup, devices, pro, keyCheck, webSessions] = await Promise.all([
    getPrimaryDeviceId(env, userId),
    getBackup(env, userId),
    listDevices(env, userId),
    isAccountPro(env, userId),
    getKeyCheck(env, userId),
    listWebSessions(env, userId),
  ]);
  const primary = primaryId ? (devices.find((d) => d.id === primaryId) ?? null) : null;
  return {
    isPrimary: deviceId !== null && primaryId === deviceId,
    pro,
    keyCheck,
    webSessions,
    primaryDevice: devicePublic(primary),
    devices: devices.map(devicePublic),
    backup: backupPublic(backup),
  };
}

async function latestFor(env: Env, userId: string) {
  const [backup, pro] = await Promise.all([getBackup(env, userId), isAccountPro(env, userId)]);
  if (!backup) return { backup: null, pro };
  const exp = Date.now() + URL_TTL_MS;
  const token = await signToken<DownloadClaims>(env.BETTER_AUTH_SECRET, 'download', {
    uid: userId,
    key: backup.r2_key,
    sha256: backup.sha256,
    exp,
  });
  const device = await getDevice(env, userId, backup.device_id);
  return {
    backup: backupPublic(backup),
    pro,
    device: devicePublic(device),
    downloadUrl: `${env.BETTER_AUTH_URL}/v1/backups/download?token=${encodeURIComponent(token)}`,
    expiresAt: exp,
  };
}

function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  // Token-authenticated transfers: no session needed, the token is the grant.
  if (path === '/v1/backups/upload' && request.method === 'PUT') {
    const claims = await verifyToken<UploadClaims>(env.BETTER_AUTH_SECRET, 'upload', url.searchParams.get('token') ?? '');
    if (!claims) throw new HttpError(401, 'invalid_upload_url');
    // Re-checked at upload time: a Transfer Primary Device after the URL was
    // issued must stop the old phone overwriting the new one's backup.
    if ((await getPrimaryDeviceId(env, claims.uid)) !== claims.did) throw new HttpError(409, 'not_primary');
    const body = await request.arrayBuffer();
    if (body.byteLength !== claims.size) throw new HttpError(400, 'size_mismatch');
    if ((await sha256Hex(body)) !== claims.sha256) throw new HttpError(400, 'checksum_mismatch');

    const key = `users/${claims.uid}/${claims.bid}.json.gz`;
    await env.MONEY2TIME_R2_CLOUD_BACKUP.put(key, body, {
      httpMetadata: { contentType: 'application/gzip' },
      customMetadata: { sha256: claims.sha256, deviceId: claims.did, schemaVersion: String(claims.schemaVersion) },
    });
    const previous = await getBackup(env, claims.uid);
    const row: BackupRow = {
      id: claims.bid,
      device_id: claims.did,
      r2_key: key,
      created_at: Date.now(),
      size: claims.size,
      sha256: claims.sha256,
      schema_version: claims.schemaVersion,
      app_version: claims.appVersion,
      exported_at: claims.exportedAt,
    };
    await putBackup(env, claims.uid, row);
    // Only the latest backup is kept.
    if (previous && previous.r2_key !== key) await env.MONEY2TIME_R2_CLOUD_BACKUP.delete(previous.r2_key);
    return json({ backup: backupPublic(row) });
  }

  if (path === '/v1/backups/download' && request.method === 'GET') {
    const claims = await verifyToken<DownloadClaims>(env.BETTER_AUTH_SECRET, 'download', url.searchParams.get('token') ?? '');
    if (!claims) throw new HttpError(401, 'invalid_download_url');
    const object = await env.MONEY2TIME_R2_CLOUD_BACKUP.get(claims.key);
    if (!object) throw new HttpError(404, 'backup_not_found');
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(object.size),
        'Cache-Control': 'private, no-store',
        'X-Backup-Sha256': claims.sha256,
      },
    });
  }

  // QR link: the newcomer's side needs no account (a browser never signs in).
  const linkPoll = path.match(/^\/v1\/link\/([A-Za-z0-9_-]+)\/poll$/);
  if (linkPoll && request.method === 'GET') {
    return json(await pollLink(env, linkPoll[1], url.searchParams.get('token') ?? ''));
  }
  if (path === '/v1/link/start' && request.method === 'POST') {
    const body = await readJson<{ kind?: string; publicKey?: string; name?: string }>(request);
    const kind = body.kind === 'phone' ? 'phone' : 'web';
    // A new phone asks its own account's phones for the key, so it signs in first.
    const session = kind === 'phone' ? await createAuth(env).api.getSession({ headers: request.headers }) : null;
    if (kind === 'phone' && !session) throw new HttpError(401, 'unauthenticated');
    return json(
      await startLink(env, {
        kind,
        publicKey: body.publicKey ?? '',
        name: body.name ? body.name.slice(0, 80) : (request.headers.get('User-Agent') ?? '').slice(0, 80) || null,
        ip: request.headers.get('cf-connecting-ip'),
        userId: session?.user.id ?? null,
      }),
    );
  }

  // A linked browser: its web token is its only credential.
  if (path.startsWith('/v1/web/') && (path === '/v1/web/latest' || path === '/v1/web/session')) {
    const web = await webSessionUser(env, bearer(request) ?? '');
    if (!web) throw new HttpError(401, 'unlinked');
    if (path === '/v1/web/latest' && request.method === 'GET') {
      const user = await env.MONEY2TIME_D1_CLOUD_BACKUP.prepare('select email from "user" where id = ?1')
        .bind(web.userId)
        .first<{ email: string }>();
      return json({ ...(await latestFor(env, web.userId)), email: user?.email ?? null, keyCheck: await getKeyCheck(env, web.userId) });
    }
    if (path === '/v1/web/session' && request.method === 'DELETE') {
      await revokeWebSession(env, web.userId, web.sessionId);
      return json({ unlinked: true });
    }
  }

  const session = await createAuth(env).api.getSession({ headers: request.headers });
  if (!session) throw new HttpError(401, 'unauthenticated');
  const userId = session.user.id;

  if (path === '/v1/devices' && request.method === 'POST') {
    const body = await readJson<{
      deviceId?: string;
      platform?: string;
      name?: string;
      appVersion?: string;
      appUserId?: string;
    }>(request);
    if (!body.deviceId || !DEVICE_ID.test(body.deviceId)) throw new HttpError(400, 'invalid_device');
    await upsertDevice(env, userId, {
      id: body.deviceId,
      platform: (body.platform ?? 'unknown').slice(0, 16),
      name: body.name ? body.name.slice(0, 80) : null,
      appVersion: body.appVersion ? body.appVersion.slice(0, 32) : null,
      // The RevenueCat App User ID links the account to the phone's
      // purchases. It is only ever looked up server side with the secret key.
      appUserId: body.appUserId && APP_USER_ID.test(body.appUserId) ? body.appUserId : null,
    });
    // The first phone on an account becomes its primary; later ones must ask.
    await claimPrimaryIfUnset(env, userId, body.deviceId);
    return json({ user: { id: userId, email: session.user.email }, ...(await status(env, userId, body.deviceId)) });
  }

  if (path === '/v1/status' && request.method === 'GET') {
    const deviceId = url.searchParams.get('deviceId');
    return json({ user: { id: userId, email: session.user.email, name: session.user.name }, ...(await status(env, userId, deviceId)) });
  }

  if (path === '/v1/devices/primary' && request.method === 'POST') {
    const body = await readJson<{ deviceId?: string }>(request);
    if (!body.deviceId || !(await getDevice(env, userId, body.deviceId))) throw new HttpError(404, 'device_not_registered');
    await setPrimary(env, userId, body.deviceId);
    return json(await status(env, userId, body.deviceId));
  }

  if (path === '/v1/backups/upload-url' && request.method === 'POST') {
    const body = await readJson<{
      deviceId?: string;
      keyCheck?: string;
      size?: number;
      sha256?: string;
      schemaVersion?: number;
      appVersion?: string;
      exportedAt?: string;
    }>(request);
    if (!body.deviceId) throw new HttpError(400, 'invalid_device');
    // Encrypted with the account's current key, or the other devices could
    // not open it.
    const keyCheck = await getKeyCheck(env, userId);
    if (!keyCheck || body.keyCheck !== keyCheck) throw new HttpError(409, 'key_mismatch');
    const primaryId = await getPrimaryDeviceId(env, userId);
    if (primaryId !== body.deviceId) {
      const primary = primaryId ? await getDevice(env, userId, primaryId) : null;
      throw new HttpError(409, 'not_primary', { primaryDevice: devicePublic(primary) });
    }
    const max = Number(env.MAX_BACKUP_BYTES) || 64 * 1024 * 1024;
    if (!Number.isInteger(body.size) || (body.size as number) <= 0 || (body.size as number) > max) {
      throw new HttpError(413, 'invalid_size', { maxBytes: max });
    }
    if (!body.sha256 || !SHA256.test(body.sha256)) throw new HttpError(400, 'invalid_checksum');
    const exp = Date.now() + URL_TTL_MS;
    const claims: UploadClaims = {
      bid: crypto.randomUUID(),
      uid: userId,
      did: body.deviceId,
      size: body.size as number,
      sha256: body.sha256,
      schemaVersion: Number.isInteger(body.schemaVersion) ? (body.schemaVersion as number) : 3,
      appVersion: body.appVersion ? body.appVersion.slice(0, 32) : null,
      exportedAt: body.exportedAt ? body.exportedAt.slice(0, 40) : null,
      exp,
    };
    const token = await signToken(env.BETTER_AUTH_SECRET, 'upload', claims);
    return json({
      backupId: claims.bid,
      method: 'PUT',
      uploadUrl: `${env.BETTER_AUTH_URL}/v1/backups/upload?token=${encodeURIComponent(token)}`,
      headers: { 'Content-Type': 'application/gzip' },
      expiresAt: exp,
    });
  }

  if (path === '/v1/backups/latest' && request.method === 'GET') {
    return json(await latestFor(env, userId));
  }

  if (path === '/v1/backups' && request.method === 'DELETE') {
    await deleteBackup(env, userId);
    return json({ backup: null });
  }

  if (path === '/v1/account/key' && request.method === 'POST') {
    const body = await readJson<{ keyCheck?: string }>(request);
    if (!body.keyCheck || !KEY_CHECK.test(body.keyCheck)) throw new HttpError(400, 'invalid_key_check');
    return json({ keyCheck: await setKeyCheckIfUnset(env, userId, body.keyCheck) });
  }

  if (path === '/v1/account/key/reset' && request.method === 'POST') {
    // Every copy of the old key is lost: the old backup can never be opened
    // again, so it goes, and so does every browser that held that key.
    const body = await readJson<{ keyCheck?: string }>(request);
    if (!body.keyCheck || !KEY_CHECK.test(body.keyCheck)) throw new HttpError(400, 'invalid_key_check');
    await deleteBackup(env, userId);
    await revokeAllWebSessions(env, userId);
    await replaceKeyCheck(env, userId, body.keyCheck);
    return json({ keyCheck: body.keyCheck });
  }

  const linkMatch = path.match(/^\/v1\/link\/([A-Za-z0-9_-]+)$/);
  if (linkMatch && request.method === 'GET') {
    return json(await describeLink(env, linkMatch[1]));
  }

  const approveMatch = path.match(/^\/v1\/link\/([A-Za-z0-9_-]+)\/approve$/);
  if (approveMatch && request.method === 'POST') {
    const body = await readJson<{
      deviceId?: string;
      publicKey?: string;
      phonePublicKey?: string;
      wrappedKey?: string;
      iv?: string;
    }>(request);
    if (!body.deviceId || !(await getDevice(env, userId, body.deviceId))) throw new HttpError(404, 'device_not_registered');
    if (!(await getKeyCheck(env, userId))) throw new HttpError(409, 'no_backup_key');
    return json(
      await approveLink(env, {
        linkId: approveMatch[1],
        userId,
        deviceId: body.deviceId,
        publicKey: body.publicKey ?? '',
        phonePublicKey: body.phonePublicKey ?? '',
        wrappedKey: body.wrappedKey ?? '',
        iv: body.iv ?? '',
      }),
    );
  }

  if (path === '/v1/web/sessions' && request.method === 'GET') {
    return json({ webSessions: await listWebSessions(env, userId) });
  }

  const webSessionMatch = path.match(/^\/v1\/web\/sessions\/([A-Za-z0-9-]+)$/);
  if (webSessionMatch && request.method === 'DELETE') {
    await revokeWebSession(env, userId, webSessionMatch[1]);
    return json({ webSessions: await listWebSessions(env, userId) });
  }

  throw new HttpError(404, 'not_found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return preflight(request, env);
    try {
      if (url.pathname.startsWith('/api/auth/')) {
        return withCors(request, await createAuth(env).handler(request), env);
      }
      if (url.pathname.startsWith('/v1/')) {
        return withCors(request, await api(request, env, url), env);
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      if (error instanceof LinkError) {
        return withCors(request, json({ error: error.code }, error.status), env);
      }
      if (error instanceof HttpError) {
        return withCors(request, json({ error: error.code, ...error.extra }, error.status), env);
      }
      console.error(error);
      return withCors(request, json({ error: 'internal_error' }, 500), env);
    }
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await pruneLinks(env);
  },
} satisfies ExportedHandler<Env>;
