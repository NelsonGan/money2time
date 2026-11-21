// Place search for tagging transactions with where they happened (README:
// Places Worker), served at workers-places.money2time.com:
//
//   POST /search   { appUserId, query, latitude?, longitude?, language? }
//   POST /reverse  { appUserId, latitude, longitude, language? }
//
// Both answer { places: PlaceResult[] } from the Apple Maps Server API
// (places.ts). Works signed out: a request is signed with the app's shared key
// like the other Workers. An edge-cache hit answers without touching the
// user's daily allowance or Apple; a miss checks the allowance, asks Apple,
// then counts one use and caches the answer. Neither the query nor a
// coordinate is ever logged: together they say where someone is.

import {
  appleGet,
  parseReverseRequest,
  parseSearchRequest,
  type PlaceResult,
  PlacesError,
  type PlacesEnv,
  readCachedPlaces,
  reversePath,
  searchPath,
  toPlaceResults,
  writeCachedPlaces,
} from './places';
import { checkQuota, consumeQuota, pruneExpired, type QuotaEnv } from './quota';

export interface Env extends PlacesEnv, QuotaEnv {
  // Shared secret the app signs requests with (X-Signature / X-Timestamp).
  // When unset, signature checking is skipped so local runs still work.
  MONEY2TIME_REQUEST_SIGNING_KEY?: string;
  // Requests per client IP per minute (wrangler.toml). Optional so tests and
  // local runs without the binding still work.
  PLACES_LIMITER?: RateLimit;
}

const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

type Kind = 'search' | 'reverse';
const ROUTES: Record<string, Kind> = { '/search': 'search', '/reverse': 'reverse' };

// One JSON line per event for Workers Logs.
function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...data }));
}
function logError(event: string, data: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...data }));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const kind = ROUTES[new URL(request.url).pathname];
    if (request.method !== 'POST' || !kind) return json({ error: 'not_found' }, 404);
    if (await overLimit(env.PLACES_LIMITER, request)) return json({ error: 'rate_limited' }, 429);
    return handlePlaces(request, env, ctx, kind);
  },

  // Daily cron: D1 has no TTL, so drop the counters of days that are over.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      pruneExpired(env, new Date())
        .then(() => log('prune_expired', {}))
        .catch((err) =>
          logError('prune_failed', { error: err instanceof Error ? err.message : String(err) }),
        ),
    );
  },
};

async function handlePlaces(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  kind: Kind,
): Promise<Response> {
  const reqId = crypto.randomUUID();
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed = kind === 'search' ? parseSearchRequest(raw) : parseReverseRequest(raw);
  if ('error' in parsed) {
    logError('bad_request', { reqId, kind, error: parsed.error });
    return json({ error: parsed.error }, 400);
  }
  if (!(await verifySignature(request, parsed.appUserId, env))) {
    logError('bad_signature', { reqId, appUserId: parsed.appUserId });
    return json({ error: 'unauthorized' }, 401);
  }
  const path =
    kind === 'search'
      ? searchPath(parsed as Parameters<typeof searchPath>[0])
      : reversePath(parsed as Parameters<typeof reversePath>[0]);
  const cached = await readCachedPlaces(path);
  if (cached) return json({ places: cached }, 200);

  const now = new Date();
  const quota = await checkQuota(parsed.appUserId, env, now);
  if (!quota.allowed) {
    log('limit_reached', { reqId, appUserId: parsed.appUserId, used: quota.used });
    return json({ error: 'limit_reached' }, 429);
  }
  let places: PlaceResult[];
  try {
    places = toPlaceResults(await appleGet(env, path, now.getTime()));
  } catch (err) {
    const error = err instanceof PlacesError ? err : new PlacesError('upstream', 502);
    logError('apple_failed', { reqId, kind, error: error.code });
    return json({ error: error.code }, error.status);
  }
  ctx.waitUntil(
    Promise.all([
      consumeQuota(parsed.appUserId, env, now).catch(() => undefined),
      writeCachedPlaces(path, places),
    ]),
  );
  log('places_ok', { reqId, kind, results: places.length });
  return json({ places }, 200);
}

/** True when this client IP is over its per-minute limit. No binding, no limit. */
async function overLimit(limiter: RateLimit | undefined, request: Request): Promise<boolean> {
  if (!limiter) return false;
  const key = request.headers.get('cf-connecting-ip') ?? 'unknown';
  return !(await limiter.limit({ key })).success;
}

// HMAC-SHA256(`<timestamp>.<appUserId>`) in X-Signature, with X-Timestamp
// within skew: the same scheme as the receipt-scanner Worker. Passes through
// when no signing key is configured (local runs).
async function verifySignature(request: Request, appUserId: string, env: Env): Promise<boolean> {
  const secret = env.MONEY2TIME_REQUEST_SIGNING_KEY?.trim();
  if (!secret) return true;
  const signature = request.headers.get('X-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  if (!signature || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_MAX_SKEW_MS) return false;
  return timingSafeEqual(await hmacHex(secret, `${timestamp}.${appUserId}`), signature);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
