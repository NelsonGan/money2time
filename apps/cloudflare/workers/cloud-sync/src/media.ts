// Images (receipts, album and goal covers, custom icons, avatar, payment QR)
// in R2. Each set of synced data has its own space: a user's personal cloud
// copy under `u/<userId>/`, a shared ledger under `l/<sharedLedgerId>/`. The
// asset path after the prefix is the same relative path the app stores in its
// rows (`receipts/<uuid>.jpg`), so a synced row finds its image under the
// same name on every phone.

import type { Env } from './env';
import { json } from './http';

/** One folder and one file name, as `services/userAssets.ts` writes them. */
const ASSET_PATH = /^[a-z][a-z-]{1,40}\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_EXISTS_BATCH = 100;
const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
};

/** Where a space's images live, and the D1 row that counts them for the quota. */
export interface MediaSpace {
  prefix: string;
  usageTable: 'media_usage' | 'ledger_media_usage';
  usageColumn: 'user_id' | 'ledger_id';
  usageId: string;
}

export function userSpace(userId: string): MediaSpace {
  return {
    prefix: `u/${userId}/`,
    usageTable: 'media_usage',
    usageColumn: 'user_id',
    usageId: userId,
  };
}

export function ledgerSpace(sharedLedgerId: string): MediaSpace {
  return {
    prefix: `l/${sharedLedgerId}/`,
    usageTable: 'ledger_media_usage',
    usageColumn: 'ledger_id',
    usageId: sharedLedgerId,
  };
}

export function isValidAssetPath(path: string): boolean {
  return ASSET_PATH.test(path);
}

export function contentTypeFor(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? null;
}

/**
 * R2 sometimes fails a call with "We encountered an internal error. Please try
 * again. (10001)" and succeeds when asked again. On 2026-11-06 a burst of these
 * failed image uploads and checks for several phones within seconds, each one
 * a 500 the app reported as a sync error. R2 ends every error message with its
 * code; these are the ones its docs say to retry (internal error, service
 * unavailable, too many requests). Anything else (a missing object, a bad
 * request) would fail the same way again. The last wait is about a second
 * because R2 allows about one write per second to the same object, the usual
 * cause of a too-many-requests answer.
 */
const RETRYABLE_R2_CODES = new Set(['10001', '10043', '10058']);
const R2_RETRY_DELAYS_MS = [200, 1000];

function isRetryableR2Error(error: unknown): boolean {
  const code = error instanceof Error ? /\((\d+)\)\s*$/.exec(error.message)?.[1] : undefined;
  return code !== undefined && RETRYABLE_R2_CODES.has(code);
}

/**
 * Runs one R2 call, again after a short wait while R2 says to try again. The
 * wait is jittered so the parallel calls of one request (and of other phones
 * hit by the same blip) do not all come back at the same moment.
 */
export async function withR2Retry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      const delay = R2_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isRetryableR2Error(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay * (0.5 + Math.random())));
    }
  }
}

/**
 * Images up to this size are read whole before the write, so the write can be
 * sent again when R2 asks; the app's compressed photos are well under it.
 * Larger ones stream once, as before, so a few big uploads cannot fill the
 * Worker's memory.
 */
const RETRYABLE_UPLOAD_BYTES = 4 * 1024 * 1024;

export function mediaKey(space: MediaSpace, path: string): string {
  return `${space.prefix}${path}`;
}

/** The asset path of a `/v1/…/media/<path>` URL, or null when it does not decode. */
export function decodeMediaPath(encoded: string): string | null {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export async function putMedia(
  env: Env,
  space: MediaSpace,
  path: string,
  request: Request,
): Promise<Response> {
  const contentType = contentTypeFor(path);
  if (!isValidAssetPath(path) || !contentType) return json({ error: 'bad_path' }, 400);
  // A declared length is required, so an oversized upload or a full quota is
  // refused before the body is read.
  const length = Number(request.headers.get('content-length') ?? '');
  if (!Number.isFinite(length) || length <= 0 || !request.body) {
    return json({ error: 'length_required' }, 411);
  }
  if (length > MAX_BYTES) return json({ error: 'too_large' }, 413);
  const key = mediaKey(space, path);
  const counted = await countNewImage(env, space, key);
  if (counted === 'full') return json({ error: 'quota' }, 507);
  const uncount = () => (counted === 'counted' ? adjustCount(env, space, -1) : undefined);
  let body: ArrayBuffer | ReadableStream = request.body;
  if (length <= RETRYABLE_UPLOAD_BYTES) {
    // A phone that drops mid-upload fails this read: its client error, not ours.
    const read = await request.arrayBuffer().catch(() => null);
    if (!read || read.byteLength !== length) {
      await uncount();
      return json({ error: 'incomplete_body' }, 400);
    }
    body = read;
  }
  const write = () => env.MEDIA.put(key, body, { httpMetadata: { contentType } });
  try {
    await (body instanceof ArrayBuffer ? withR2Retry(write) : write());
  } catch (error) {
    await uncount();
    throw error;
  }
  return json({ ok: true });
}

/** At most this many images per space, a backstop against runaway uploads. */
const MAX_OBJECTS = 20_000;

/**
 * Counts a new image against the space's quota. Replacing an image adds
 * nothing. The counter can drift (parallel uploads of one new path, images
 * the app no longer uses are not deleted), so when it says full the real
 * count is read from R2 before refusing.
 */
async function countNewImage(
  env: Env,
  space: MediaSpace,
  key: string,
): Promise<'replaced' | 'counted' | 'full'> {
  if (await withR2Retry(() => env.MEDIA.head(key))) return 'replaced';
  if (await incrementBelowCap(env, space)) return 'counted';
  const actual = await countObjects(env, space);
  await env.AUTH_DB.prepare(
    `UPDATE ${space.usageTable} SET objects = ?2 WHERE ${space.usageColumn} = ?1`,
  )
    .bind(space.usageId, actual)
    .run();
  return (await incrementBelowCap(env, space)) ? 'counted' : 'full';
}

async function incrementBelowCap(env: Env, space: MediaSpace): Promise<boolean> {
  const row = await env.AUTH_DB.prepare(
    `INSERT INTO ${space.usageTable} (${space.usageColumn}, objects) VALUES (?1, 1)
     ON CONFLICT(${space.usageColumn}) DO UPDATE SET objects = objects + 1
     WHERE objects < ?2
     RETURNING objects`,
  )
    .bind(space.usageId, MAX_OBJECTS)
    .first<{ objects: number }>();
  return row !== null;
}

async function adjustCount(env: Env, space: MediaSpace, delta: number): Promise<void> {
  await env.AUTH_DB.prepare(
    `UPDATE ${space.usageTable} SET objects = MAX(0, objects + ?2) WHERE ${space.usageColumn} = ?1`,
  )
    .bind(space.usageId, delta)
    .run();
}

/** Visits every stored key of the space, a page at a time. */
async function forEachPage(
  env: Env,
  space: MediaSpace,
  visit: (keys: string[]) => Promise<void>,
): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await withR2Retry(() =>
      env.MEDIA.list({ prefix: space.prefix, cursor, limit: 1000 }),
    );
    if (listed.objects.length) await visit(listed.objects.map((o) => o.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function countObjects(env: Env, space: MediaSpace): Promise<number> {
  let total = 0;
  await forEachPage(env, space, async (keys) => {
    total += keys.length;
  });
  return total;
}

export async function getMedia(env: Env, space: MediaSpace, path: string): Promise<Response> {
  if (!isValidAssetPath(path)) return json({ error: 'bad_path' }, 400);
  const object = await withR2Retry(() => env.MEDIA.get(mediaKey(space, path)));
  if (!object) return json({ error: 'not_found' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
    },
  });
}

/** Which of `paths` are already stored, so a phone uploads each image once. */
export async function existingMedia(
  env: Env,
  space: MediaSpace,
  paths: unknown,
): Promise<Response> {
  if (!Array.isArray(paths) || paths.length > MAX_EXISTS_BATCH) {
    return json({ error: 'bad_paths' }, 400);
  }
  const valid = paths.filter((p): p is string => typeof p === 'string' && isValidAssetPath(p));
  const heads = await Promise.all(
    valid.map((p) => withR2Retry(() => env.MEDIA.head(mediaKey(space, p)))),
  );
  return json({ existing: valid.filter((_, index) => heads[index] !== null) });
}

/** Deletes every image of the space (account deletion, a ledger no longer shared). */
export async function deleteAllMedia(env: Env, space: MediaSpace): Promise<void> {
  await forEachPage(env, space, (keys) => withR2Retry(() => env.MEDIA.delete(keys)));
}
