// Place search for tagging transactions with where they happened (README:
// Places Worker), served at location.money2time.com:
//
//   POST /search   { appUserId, query, latitude?, longitude?, language? }
//   POST /nearby   { appUserId, latitude, longitude, category?, language? }
//   POST /reverse  { appUserId, latitude, longitude, language? }
//
// All answer { places: PlaceResult[] } from the Apple Maps Server API
// (places.ts). Works signed out: a request is signed with the app's shared key
// like the other Workers. An edge-cache hit answers without touching the
// user's daily allowance or Apple; a miss checks the allowance, asks Apple,
// then counts one use per Apple call and caches the answer. Neither the query nor a
// coordinate is ever logged: together they say where someone is.

import {
  appleGet,
  mergeNearby,
  nearbyCacheKey,
  nearbyCenter,
  nearbyPaths,
  parseNearbyRequest,
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
import {
  addressSubject,
  checkQuota,
  consumeQuota,
  pruneExpired,
  type QuotaEnv,
  type QuotaSubjects,
} from './quota';

export interface Env extends PlacesEnv, QuotaEnv {
  // Shared secret the app signs requests with (X-Signature / X-Timestamp).
  // When unset, signature checking is skipped so local runs still work.
  MONEY2TIME_REQUEST_SIGNING_KEY?: string;
  // Requests per client IP per minute (wrangler.toml). Optional so tests and
  // local runs without the binding still work.
  PLACES_LIMITER?: RateLimit;
}

const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;
// A request is a query and a point: anything bigger is refused unread.
const MAX_BODY_BYTES = 4096;

type Kind = 'search' | 'nearby' | 'reverse';
const ROUTES: Record<string, Kind> = {
  '/search': 'search',
  '/nearby': 'nearby',
  '/reverse': 'reverse',
};

// One JSON line per event for Workers Logs.
function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...data }));
}
function logError(event: string, data: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...data }));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    const kind = Object.hasOwn(ROUTES, pathname) ? ROUTES[pathname] : undefined;
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
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json({ error: 'too_large' }, 413);
  }
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return json({ error: 'too_large' }, 413);
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const parsed =
    kind === 'search'
      ? parseSearchRequest(raw)
      : kind === 'nearby'
        ? parseNearbyRequest(raw)
        : parseReverseRequest(raw);
  if ('error' in parsed) {
    logError('bad_request', { reqId, kind, error: parsed.error });
    return json({ error: parsed.error }, 400);
  }
  if (!(await verifySignature(request, parsed.appUserId, env))) {
    logError('bad_signature', { reqId, appUserId: parsed.appUserId });
    return json({ error: 'unauthorized' }, 401);
  }
  // The Apple calls this request needs, and the key its answer is cached
  // under: the Apple path itself, except for nearby, which merges several.
  let applePaths: string[];
  let cachePath: string;
  if (kind === 'nearby') {
    const nearby = parsed as Parameters<typeof nearbyPaths>[0];
    applePaths = nearbyPaths(nearby);
    cachePath = nearbyCacheKey(nearby);
  } else {
    cachePath =
      kind === 'search'
        ? searchPath(parsed as Parameters<typeof searchPath>[0])
        : reversePath(parsed as Parameters<typeof reversePath>[0]);
    applePaths = [cachePath];
  }
  const cached = await readCachedPlaces(cachePath);
  if (cached) return json({ places: cached }, 200);

  const now = new Date();
  const subjects: QuotaSubjects = {
    user: parsed.appUserId,
    address: await addressSubject(clientIp(request), now),
  };
  let quota: Awaited<ReturnType<typeof checkQuota>>;
  try {
    quota = await checkQuota(subjects, env, now, applePaths.length);
  } catch (err) {
    // The database is down: refuse with a JSON error rather than throw, and
    // never search Apple without the allowance checked.
    logError('quota_failed', { reqId, error: err instanceof Error ? err.message : String(err) });
    return json({ error: 'upstream' }, 503);
  }
  if (!quota.allowed) {
    log('limit_reached', { reqId, appUserId: parsed.appUserId, by: quota.reachedBy });
    return json({ error: 'limit_reached' }, 429);
  }
  // Every Apple call that answered counts, even when another one failed. A
  // nearby list missing one of its searches is still shown, but not cached.
  const settled = await Promise.allSettled(
    applePaths.map((path) => appleGet(env, path, now.getTime())),
  );
  const payloads = settled.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const failure = settled.find((result) => result.status === 'rejected');
  if (payloads.length > 0) {
    ctx.waitUntil(consumeQuota(subjects, env, now, payloads.length).catch(() => undefined));
  }
  if (failure && (kind !== 'nearby' || payloads.length === 0)) {
    const err = failure.reason;
    const error = err instanceof PlacesError ? err : new PlacesError('upstream', 502);
    logError('apple_failed', { reqId, kind, error: error.code });
    return json({ error: error.code }, error.status);
  }
  const places: PlaceResult[] =
    kind === 'nearby'
      ? mergeNearby(payloads, nearbyCenter(parsed as Parameters<typeof nearbyCenter>[0]))
      : toPlaceResults(payloads[0]);
  if (!failure) ctx.waitUntil(writeCachedPlaces(cachePath, places));
  log('places_ok', { reqId, kind, results: places.length });
  return json({ places }, 200);
}

/**
 * The client for limits: its IPv4 address, or its IPv6 /64 (the block one
 * subscriber usually gets), so rotating addresses inside it gets no new
 * per-minute or daily allowance.
 */
export function clientIp(request: Request): string {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  if (!ip.includes(':')) return ip;
  // Addresses arrive compressed (`2a01:4f8::1`): expand `::` before taking
  // the first four groups, or every interface id would get its own key.
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const groups = ip.includes('::')
    ? [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/** True when this client IP is over its per-minute limit. No binding, no limit. */
async function overLimit(limiter: RateLimit | undefined, request: Request): Promise<boolean> {
  if (!limiter) return false;
  return !(await limiter.limit({ key: clientIp(request) })).success;
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
