// The user's images (receipts, album and goal covers, custom icons, avatar,
// payment QR) in R2, keyed `u/<userId>/<asset path>`. The asset path is the
// same relative path the app stores in its rows (`receipts/<uuid>.jpg`), so a
// synced row finds its image under the same name on every phone.

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

export function isValidAssetPath(path: string): boolean {
  return ASSET_PATH.test(path);
}

export function contentTypeFor(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? null;
}

export function mediaKey(userId: string, path: string): string {
  return `${userPrefix(userId)}${path}`;
}

export async function putMedia(
  env: Env,
  userId: string,
  path: string,
  request: Request,
): Promise<Response> {
  const contentType = contentTypeFor(path);
  if (!isValidAssetPath(path) || !contentType) return json({ error: 'bad_path' }, 400);
  // A declared length is required, so the body streams to R2 without being
  // buffered and an oversized upload is refused before it is read.
  const length = Number(request.headers.get('content-length') ?? '');
  if (!Number.isFinite(length) || length <= 0 || !request.body) {
    return json({ error: 'length_required' }, 411);
  }
  if (length > MAX_BYTES) return json({ error: 'too_large' }, 413);
  const key = mediaKey(userId, path);
  const counted = await countNewImage(env, userId, key);
  if (counted === 'full') return json({ error: 'quota' }, 507);
  try {
    await env.MEDIA.put(key, request.body, { httpMetadata: { contentType } });
  } catch (error) {
    if (counted === 'counted') await adjustCount(env, userId, -1);
    throw error;
  }
  return json({ ok: true });
}

/** At most this many images per user, a backstop against runaway uploads. */
const MAX_OBJECTS = 20_000;

/**
 * Counts a new image against the user's quota. Replacing an image adds
 * nothing. The counter can drift (parallel uploads of one new path, images
 * the app no longer uses are not deleted), so when it says full the real
 * count is read from R2 before refusing.
 */
async function countNewImage(
  env: Env,
  userId: string,
  key: string,
): Promise<'replaced' | 'counted' | 'full'> {
  if (await env.MEDIA.head(key)) return 'replaced';
  if (await incrementBelowCap(env, userId)) return 'counted';
  const actual = await countObjects(env, userId);
  await env.AUTH_DB.prepare('UPDATE media_usage SET objects = ?2 WHERE user_id = ?1')
    .bind(userId, actual)
    .run();
  return (await incrementBelowCap(env, userId)) ? 'counted' : 'full';
}

async function incrementBelowCap(env: Env, userId: string): Promise<boolean> {
  const row = await env.AUTH_DB.prepare(
    `INSERT INTO media_usage (user_id, objects) VALUES (?1, 1)
     ON CONFLICT(user_id) DO UPDATE SET objects = objects + 1
     WHERE objects < ?2
     RETURNING objects`,
  )
    .bind(userId, MAX_OBJECTS)
    .first<{ objects: number }>();
  return row !== null;
}

async function adjustCount(env: Env, userId: string, delta: number): Promise<void> {
  await env.AUTH_DB.prepare(
    'UPDATE media_usage SET objects = MAX(0, objects + ?2) WHERE user_id = ?1',
  )
    .bind(userId, delta)
    .run();
}

function userPrefix(userId: string): string {
  return `u/${userId}/`;
}

/** Visits every stored key of the user, a page at a time. */
async function forEachPage(
  env: Env,
  userId: string,
  visit: (keys: string[]) => Promise<void>,
): Promise<void> {
  let cursor: string | undefined;
  do {
    const listed = await env.MEDIA.list({ prefix: userPrefix(userId), cursor, limit: 1000 });
    if (listed.objects.length) await visit(listed.objects.map((o) => o.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function countObjects(env: Env, userId: string): Promise<number> {
  let total = 0;
  await forEachPage(env, userId, async (keys) => {
    total += keys.length;
  });
  return total;
}

export async function getMedia(env: Env, userId: string, path: string): Promise<Response> {
  if (!isValidAssetPath(path)) return json({ error: 'bad_path' }, 400);
  const object = await env.MEDIA.get(mediaKey(userId, path));
  if (!object) return json({ error: 'not_found' }, 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
    },
  });
}

/** Which of `paths` are already stored, so a phone uploads each image once. */
export async function existingMedia(env: Env, userId: string, paths: unknown): Promise<Response> {
  if (!Array.isArray(paths) || paths.length > MAX_EXISTS_BATCH) {
    return json({ error: 'bad_paths' }, 400);
  }
  const valid = paths.filter((p): p is string => typeof p === 'string' && isValidAssetPath(p));
  const heads = await Promise.all(valid.map((p) => env.MEDIA.head(mediaKey(userId, p))));
  return json({ existing: valid.filter((_, index) => heads[index] !== null) });
}

/** Deletes every image of the user (account deletion). */
export async function deleteAllMedia(env: Env, userId: string): Promise<void> {
  await forEachPage(env, userId, (keys) => env.MEDIA.delete(keys));
}
