// Cloud Backup & Web Dashboard. There are no accounts: a backup lives in a
// vault that only the holders of its end-to-end encryption key can reach.
// The phone derives the vault id and a vault secret from the key and sends
// them as `Authorization: Vault <id>.<secret>`; this Worker keeps a hash of
// the secret, never the key. A linked browser holds a web token instead.
//
//   POST   /v1/devices                register this phone (creates the vault on first use;
//                                     the first phone becomes primary)
//   GET    /v1/status?deviceId=…      primary device, phones, linked browsers, latest backup, Pro
//   POST   /v1/devices/primary        Transfer Primary Device to this phone
//   DELETE /v1/devices/:id            a phone stops using Cloud Backup
//   POST   /v1/backups/upload-url     short-lived PUT URL (primary device only)
//   PUT    /v1/backups/upload?token=  the encrypted backup itself
//   GET    /v1/backups/latest         latest backup metadata + short-lived GET URL
//   GET    /v1/backups/download?token=
//   DELETE /v1/backups                delete the cloud backup
//   DELETE /v1/vault                  delete the vault: backup, phones, linked browsers
//   POST   /v1/link/start             QR link: a browser or new phone shows its public key
//   GET    /v1/link/:id/poll?token=   …and polls for the wrapped backup key
//   GET    /v1/link/:id               the scanning phone reads what it is linking
//   POST   /v1/link/:id/approve       …and posts the backup key wrapped for it
//   GET    /v1/web/sessions           linked browsers;  DELETE /v1/web/sessions/:id
//   GET    /v1/web/latest             the browser's view of the latest backup (web token)
//   DELETE /v1/web/session            the browser unlinks itself (web token)
//
// The phone is the source of truth. Backups are encrypted on the phone; this
// Worker stores and relays ciphertext and wrapped keys only. The web dashboard
// only reads, and nothing syncs between phones: one primary device writes,
// everyone else reads.

import type { Env } from './env';
import {
  approveLink,
  describeLink,
  LinkError,
  listWebSessions,
  pollLink,
  pruneLinks,
  revokeWebSession,
  startLink,
  webSessionVault,
} from './link';
import { isVaultPro } from './revenuecat';
import {
  claimPrimaryIfUnset,
  createVault,
  deleteBackup,
  deleteVault,
  getBackup,
  getDevice,
  getVault,
  listDevices,
  openVault,
  pruneAbandonedVaults,
  pruneRateLimits,
  putBackup,
  removeDevice,
  setPrimary,
  upsertDevice,
  withinRateLimit,
  type BackupRow,
  type DeviceRow,
} from './store';
import { sha256Hex, signToken, verifyToken, type DownloadClaims, type UploadClaims } from './tokens';

const URL_TTL_MS = 10 * 60 * 1000;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const APP_USER_ID = /^[A-Za-z0-9$:_.-]{1,100}$/;
const SHA256 = /^[a-f0-9]{64}$/;
// 16 and 32 bytes of HMAC output, base64url (see the app's cloudBackupCrypto.ts).
const VAULT_ID = /^[A-Za-z0-9_-]{22}$/;
const VAULT_SECRET = /^[A-Za-z0-9_-]{43}$/;
/** New vaults one address may create per hour; a reinstall or a new key is one. */
const MAX_VAULTS_PER_HOUR = 10;

const allowedOrigins = (env: Env) =>
  env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

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

/** CORS for the web dashboard's origin only. It sends a bearer token, never cookies. */
function withCors(request: Request, response: Response, env: Env): Response {
  const origin = request.headers.get('Origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
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
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
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

async function status(env: Env, vaultId: string, deviceId: string | null) {
  const [vault, backup, devices, pro, webSessions] = await Promise.all([
    getVault(env, vaultId),
    getBackup(env, vaultId),
    listDevices(env, vaultId),
    isVaultPro(env, vaultId),
    listWebSessions(env, vaultId),
  ]);
  const primaryId = vault?.primary_device_id ?? null;
  const primary = primaryId ? (devices.find((d) => d.id === primaryId) ?? null) : null;
  return {
    vault: { id: vaultId, createdAt: vault?.created_at ?? null },
    isPrimary: deviceId !== null && primaryId === deviceId,
    pro,
    webSessions,
    primaryDevice: devicePublic(primary),
    devices: devices.map(devicePublic),
    backup: backupPublic(backup),
  };
}

async function latestFor(env: Env, vaultId: string) {
  const [backup, pro] = await Promise.all([getBackup(env, vaultId), isVaultPro(env, vaultId)]);
  if (!backup) return { backup: null, pro };
  const exp = Date.now() + URL_TTL_MS;
  const token = await signToken<DownloadClaims>(env.URL_SIGNING_SECRET, 'download', {
    vid: vaultId,
    key: backup.r2_key,
    sha256: backup.sha256,
    exp,
  });
  const device = await getDevice(env, vaultId, backup.device_id);
  return {
    backup: backupPublic(backup),
    pro,
    device: devicePublic(device),
    downloadUrl: `${env.PUBLIC_URL}/v1/backups/download?token=${encodeURIComponent(token)}`,
    expiresAt: exp,
  };
}

function authorization(request: Request, scheme: 'Bearer' | 'Vault'): string | null {
  const header = request.headers.get('Authorization') ?? '';
  return header.startsWith(`${scheme} `) ? header.slice(scheme.length + 1).trim() : null;
}

function vaultCredentials(request: Request): { vaultId: string; secret: string } {
  const [vaultId, secret] = (authorization(request, 'Vault') ?? '').split('.');
  if (!vaultId || !secret || !VAULT_ID.test(vaultId) || !VAULT_SECRET.test(secret)) {
    throw new HttpError(401, 'unauthenticated');
  }
  return { vaultId, secret };
}

async function ipKey(request: Request, purpose: string): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const digest = await sha256Hex(new TextEncoder().encode(`${purpose}:${ip}`).buffer as ArrayBuffer);
  return `${purpose}:${digest.slice(0, 32)}`;
}

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  // Token-authenticated transfers: no vault credentials, the token is the grant.
  if (path === '/v1/backups/upload' && request.method === 'PUT') {
    const claims = await verifyToken<UploadClaims>(env.URL_SIGNING_SECRET, 'upload', url.searchParams.get('token') ?? '');
    if (!claims) throw new HttpError(401, 'invalid_upload_url');
    // Re-checked at upload time: a Transfer Primary Device after the URL was
    // issued must stop the old phone overwriting the new one's backup.
    if ((await getVault(env, claims.vid))?.primary_device_id !== claims.did) throw new HttpError(409, 'not_primary');
    const body = await request.arrayBuffer();
    if (body.byteLength !== claims.size) throw new HttpError(400, 'size_mismatch');
    if ((await sha256Hex(body)) !== claims.sha256) throw new HttpError(400, 'checksum_mismatch');

    const key = `vaults/${claims.vid}/${claims.bid}.m2tb`;
    await env.MONEY2TIME_R2_CLOUD_BACKUP.put(key, body, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { sha256: claims.sha256, deviceId: claims.did, schemaVersion: String(claims.schemaVersion) },
    });
    const previous = await getBackup(env, claims.vid);
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
    await putBackup(env, claims.vid, row);
    // Only the latest backup is kept.
    if (previous && previous.r2_key !== key) await env.MONEY2TIME_R2_CLOUD_BACKUP.delete(previous.r2_key);
    return json({ backup: backupPublic(row) });
  }

  if (path === '/v1/backups/download' && request.method === 'GET') {
    const claims = await verifyToken<DownloadClaims>(env.URL_SIGNING_SECRET, 'download', url.searchParams.get('token') ?? '');
    if (!claims) throw new HttpError(401, 'invalid_download_url');
    const object = await env.MONEY2TIME_R2_CLOUD_BACKUP.get(claims.key);
    if (!object) throw new HttpError(404, 'backup_not_found');
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(object.size),
        'Cache-Control': 'private, no-store',
        'X-Backup-Sha256': claims.sha256,
      },
    });
  }

  // QR link: the newcomer has no key yet, so starting and polling need none.
  const linkPoll = path.match(/^\/v1\/link\/([A-Za-z0-9_-]+)\/poll$/);
  if (linkPoll && request.method === 'GET') {
    return json(await pollLink(env, linkPoll[1], url.searchParams.get('token') ?? ''));
  }
  if (path === '/v1/link/start' && request.method === 'POST') {
    const body = await readJson<{ kind?: string; publicKey?: string; name?: string }>(request);
    return json(
      await startLink(env, {
        kind: body.kind === 'phone' ? 'phone' : 'web',
        publicKey: body.publicKey ?? '',
        name: body.name ? body.name.slice(0, 80) : (request.headers.get('User-Agent') ?? '').slice(0, 80) || null,
        ip: request.headers.get('cf-connecting-ip'),
      }),
    );
  }

  // A linked browser: its web token is its only credential.
  if (path === '/v1/web/latest' || path === '/v1/web/session') {
    const web = await webSessionVault(env, authorization(request, 'Bearer') ?? '');
    if (!web) throw new HttpError(401, 'unlinked');
    if (path === '/v1/web/latest' && request.method === 'GET') {
      return json(await latestFor(env, web.vaultId));
    }
    if (path === '/v1/web/session' && request.method === 'DELETE') {
      await revokeWebSession(env, web.vaultId, web.sessionId);
      return json({ unlinked: true });
    }
    throw new HttpError(404, 'not_found');
  }

  // Everything else is a phone holding the key.
  const credentials = vaultCredentials(request);

  if (path === '/v1/devices' && request.method === 'POST') {
    const body = await readJson<{
      deviceId?: string;
      platform?: string;
      name?: string;
      appVersion?: string;
      appUserId?: string;
    }>(request);
    if (!body.deviceId || !DEVICE_ID.test(body.deviceId)) throw new HttpError(400, 'invalid_device');
    let vault = await openVault(env, credentials.vaultId, credentials.secret);
    if (!vault) {
      // Unknown id: a phone with a new key. A known id with the wrong secret
      // cannot happen with a real key, since both come from it.
      if (await getVault(env, credentials.vaultId)) throw new HttpError(401, 'unauthenticated');
      if (!(await withinRateLimit(env, await ipKey(request, 'vault'), MAX_VAULTS_PER_HOUR, 60 * 60 * 1000))) {
        throw new HttpError(429, 'rate_limited');
      }
      vault = await createVault(env, credentials.vaultId, credentials.secret);
    }
    await upsertDevice(env, vault.id, {
      id: body.deviceId,
      platform: (body.platform ?? 'unknown').slice(0, 16),
      name: body.name ? body.name.slice(0, 80) : null,
      appVersion: body.appVersion ? body.appVersion.slice(0, 32) : null,
      // The RevenueCat App User ID ties the vault to the phone's purchases.
      // It is only ever looked up server side with the secret key.
      appUserId: body.appUserId && APP_USER_ID.test(body.appUserId) ? body.appUserId : null,
    });
    // The first phone in a vault becomes its primary; later ones must ask.
    await claimPrimaryIfUnset(env, vault.id, body.deviceId);
    return json(await status(env, vault.id, body.deviceId));
  }

  const vault = await openVault(env, credentials.vaultId, credentials.secret);
  if (!vault) throw new HttpError(401, 'unauthenticated');
  const vaultId = vault.id;

  if (path === '/v1/status' && request.method === 'GET') {
    return json(await status(env, vaultId, url.searchParams.get('deviceId')));
  }

  if (path === '/v1/devices/primary' && request.method === 'POST') {
    const body = await readJson<{ deviceId?: string }>(request);
    if (!body.deviceId || !(await getDevice(env, vaultId, body.deviceId))) throw new HttpError(404, 'device_not_registered');
    await setPrimary(env, vaultId, body.deviceId);
    return json(await status(env, vaultId, body.deviceId));
  }

  const deviceMatch = path.match(/^\/v1\/devices\/([A-Za-z0-9_-]{8,64})$/);
  if (deviceMatch && request.method === 'DELETE') {
    await removeDevice(env, vaultId, deviceMatch[1]);
    return json({ removed: true });
  }

  if (path === '/v1/backups/upload-url' && request.method === 'POST') {
    const body = await readJson<{
      deviceId?: string;
      size?: number;
      sha256?: string;
      schemaVersion?: number;
      appVersion?: string;
      exportedAt?: string;
    }>(request);
    if (!body.deviceId) throw new HttpError(400, 'invalid_device');
    if (vault.primary_device_id !== body.deviceId) {
      const primary = vault.primary_device_id ? await getDevice(env, vaultId, vault.primary_device_id) : null;
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
      vid: vaultId,
      did: body.deviceId,
      size: body.size as number,
      sha256: body.sha256,
      schemaVersion: Number.isInteger(body.schemaVersion) ? (body.schemaVersion as number) : 3,
      appVersion: body.appVersion ? body.appVersion.slice(0, 32) : null,
      exportedAt: body.exportedAt ? body.exportedAt.slice(0, 40) : null,
      exp,
    };
    const token = await signToken(env.URL_SIGNING_SECRET, 'upload', claims);
    return json({
      backupId: claims.bid,
      method: 'PUT',
      uploadUrl: `${env.PUBLIC_URL}/v1/backups/upload?token=${encodeURIComponent(token)}`,
      headers: { 'Content-Type': 'application/octet-stream' },
      expiresAt: exp,
    });
  }

  if (path === '/v1/backups/latest' && request.method === 'GET') {
    return json(await latestFor(env, vaultId));
  }

  if (path === '/v1/backups' && request.method === 'DELETE') {
    await deleteBackup(env, vaultId);
    return json({ backup: null });
  }

  if (path === '/v1/vault' && request.method === 'DELETE') {
    await deleteVault(env, vaultId);
    return json({ deleted: true });
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
    if (!body.deviceId || !(await getDevice(env, vaultId, body.deviceId))) throw new HttpError(404, 'device_not_registered');
    return json(
      await approveLink(env, {
        linkId: approveMatch[1],
        vaultId,
        deviceId: body.deviceId,
        publicKey: body.publicKey ?? '',
        phonePublicKey: body.phonePublicKey ?? '',
        wrappedKey: body.wrappedKey ?? '',
        iv: body.iv ?? '',
      }),
    );
  }

  if (path === '/v1/web/sessions' && request.method === 'GET') {
    return json({ webSessions: await listWebSessions(env, vaultId) });
  }

  const webSessionMatch = path.match(/^\/v1\/web\/sessions\/([A-Za-z0-9-]+)$/);
  if (webSessionMatch && request.method === 'DELETE') {
    await revokeWebSession(env, vaultId, webSessionMatch[1]);
    return json({ webSessions: await listWebSessions(env, vaultId) });
  }

  throw new HttpError(404, 'not_found');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return preflight(request, env);
    try {
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
    await pruneRateLimits(env);
    await pruneAbandonedVaults(env);
  },
} satisfies ExportedHandler<Env>;
