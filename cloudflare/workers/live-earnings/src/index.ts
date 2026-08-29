/**
 * money2time live-earnings Worker.
 *
 * Makes the amount on the Live Activity card tick.
 *
 * A Live Activity repaints only its *time-derived* views on its own - the
 * elapsed clock and the progress bar are rendered by iOS from two dates - while
 * the money figure is a plain string frozen at whatever the last update carried.
 * On the Lock Screen the app is suspended and cannot run code, and the only
 * other thing allowed to move that string is an ActivityKit push. So: the app
 * registers its session here when the clock starts, this Worker pushes the
 * current figure every minute, and the app deregisters when the clock stops.
 *
 * Two endpoints and a cron:
 *   POST /live-earnings/register    { appUserId, pushToken, environment, session }
 *   POST /live-earnings/unregister  { appUserId, pushToken? }
 *   cron * * * * *                  push every running session, prune the rest
 *
 * Both endpoints carry the same HMAC signature the receipt-scanner Worker uses.
 */

import type { ApnsCredentials } from './apns';
import { runPushWindow } from './sessions';
import { isLiveActivityPushToken } from './token';

export interface Env {
  MONEY2TIME_D1_LIVE_EARNINGS: D1Database;
  APNS_BUNDLE_ID?: string;
  APNS_KEY_ID?: string;
  APNS_TEAM_ID?: string;
  APNS_PRIVATE_KEY?: string;
  MONEY2TIME_REQUEST_SIGNING_KEY?: string;
}

const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

/** Bounds on what a registration may claim, so one call cannot store junk. */
const MAX_APP_USER_ID_CHARS = 128;
const MAX_CURRENCY_SYMBOL_CHARS = 8;
/**
 * iOS force-ends a Live Activity 8 hours after it starts, so a session longer
 * than that is either a bug or someone probing - either way it would sit in the
 * table being pushed to long after the card it names has gone.
 */
const MAX_SESSION_MS = 8 * 60 * 60 * 1000;

/**
 * Live sessions kept per account. One per device the person is running the
 * card on; the oldest is evicted past that.
 *
 * This is an abuse bound, not a product limit. The request signature is a
 * shared secret shipped inside the app bundle (`EXPO_PUBLIC_...`), so it is
 * extractable by anyone who unpacks the IPA - it raises the cost of casual
 * abuse, it is not authentication. Without a cap, one extracted key could
 * register unbounded rows under a single id and make every cron window do
 * unbounded work. Rows are self-limiting in time (a session is at most 8 hours
 * and the reaper drops it), so bounding them in number closes the other axis.
 */
const MAX_SESSIONS_PER_USER = 3;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, configured: apnsCredentials(env) !== null });
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    if (url.pathname === '/live-earnings/register') return handleRegister(request, env);
    if (url.pathname === '/live-earnings/unregister') return handleUnregister(request, env);
    return json({ error: 'not_found' }, 404);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // One invocation owns the whole minute: Cloudflare's cron floor is a
    // minute and the card is worth updating more often, so the window pushes
    // every ten seconds until the next invocation takes over.
    ctx.waitUntil(
      runPushWindow({
        store: env.MONEY2TIME_D1_LIVE_EARNINGS,
        credentials: apnsCredentials(env),
        now: () => Date.now(),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      }),
    );
  },
};

// --- Endpoints --------------------------------------------------------------

interface RegisterBody {
  appUserId?: unknown;
  pushToken?: unknown;
  environment?: unknown;
  startedAt?: unknown;
  endsAt?: unknown;
  hourlyRate?: unknown;
  currencySymbol?: unknown;
}

async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = (await readJson(request)) as RegisterBody | null;
  if (!body) return json({ error: 'invalid_json' }, 400);

  const appUserId = asString(body.appUserId);
  const pushToken = asString(body.pushToken);
  const environment = body.environment === 'production' ? 'production' : 'sandbox';
  const startedAt = asNumber(body.startedAt);
  const endsAt = asNumber(body.endsAt);
  const hourlyRate = asNumber(body.hourlyRate);
  const currencySymbol = asString(body.currencySymbol).slice(0, MAX_CURRENCY_SYMBOL_CHARS) || '$';

  if (!appUserId || !pushToken) return json({ error: 'missing_identity' }, 400);
  if (appUserId.length > MAX_APP_USER_ID_CHARS) return json({ error: 'invalid_identity' }, 400);
  if (!isLiveActivityPushToken(pushToken)) return json({ error: 'invalid_push_token' }, 400);
  if (!startedAt || !endsAt || endsAt <= startedAt) return json({ error: 'invalid_session' }, 400);
  if (endsAt - startedAt > MAX_SESSION_MS) return json({ error: 'invalid_session' }, 400);
  if (!(hourlyRate > 0) || !Number.isFinite(hourlyRate)) return json({ error: 'invalid_rate' }, 400);

  if (!(await verifySignature(request, appUserId, env))) return json({ error: 'unauthorized' }, 401);

  const now = Date.now();
  // Upsert: ActivityKit can hand the app a fresh token for the same session, and
  // the app re-registers on every foreground, so a register is "this is the
  // current truth for this token" rather than "insert a new session".
  await env.MONEY2TIME_D1_LIVE_EARNINGS.prepare(
    `INSERT INTO live_activity_sessions
       (push_token, app_user_id, environment, started_at, ends_at, hourly_rate,
        currency_symbol, last_pushed_text, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?8)
     ON CONFLICT(push_token) DO UPDATE SET
       app_user_id = excluded.app_user_id,
       environment = excluded.environment,
       started_at = excluded.started_at,
       ends_at = excluded.ends_at,
       hourly_rate = excluded.hourly_rate,
       currency_symbol = excluded.currency_symbol,
       updated_at = excluded.updated_at`,
  )
    .bind(
      pushToken,
      appUserId,
      environment,
      startedAt,
      endsAt,
      hourlyRate,
      currencySymbol,
      now,
    )
    .run();

  // Evict the account's oldest registrations beyond the cap. Keyed on
  // updated_at, so the devices actually in use are the ones that survive.
  await env.MONEY2TIME_D1_LIVE_EARNINGS.prepare(
    `DELETE FROM live_activity_sessions
      WHERE app_user_id = ?1
        AND push_token NOT IN (
          SELECT push_token FROM live_activity_sessions
           WHERE app_user_id = ?1
           ORDER BY updated_at DESC
           LIMIT ?2
        )`,
  )
    .bind(appUserId, MAX_SESSIONS_PER_USER)
    .run();

  return json({ ok: true });
}

async function handleUnregister(request: Request, env: Env): Promise<Response> {
  const body = (await readJson(request)) as { appUserId?: unknown; pushToken?: unknown } | null;
  if (!body) return json({ error: 'invalid_json' }, 400);

  const appUserId = asString(body.appUserId);
  const pushToken = asString(body.pushToken);
  if (!appUserId || appUserId.length > MAX_APP_USER_ID_CHARS) {
    return json({ error: 'missing_identity' }, 400);
  }
  if (pushToken && !isLiveActivityPushToken(pushToken)) {
    return json({ error: 'invalid_push_token' }, 400);
  }
  if (!(await verifySignature(request, appUserId, env))) return json({ error: 'unauthorized' }, 401);

  // Without a token, drop every card the account has running - which is what a
  // sign-out or a data reset wants.
  const statement = pushToken
    ? env.MONEY2TIME_D1_LIVE_EARNINGS.prepare(
        'DELETE FROM live_activity_sessions WHERE push_token = ?1 AND app_user_id = ?2',
      ).bind(pushToken, appUserId)
    : env.MONEY2TIME_D1_LIVE_EARNINGS.prepare(
        'DELETE FROM live_activity_sessions WHERE app_user_id = ?1',
      ).bind(appUserId);
  await statement.run();

  return json({ ok: true });
}

// --- Plumbing ---------------------------------------------------------------

function apnsCredentials(env: Env): ApnsCredentials | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const privateKeyPem = env.APNS_PRIVATE_KEY?.trim();
  const bundleId = env.APNS_BUNDLE_ID?.trim();
  if (!keyId || !teamId || !privateKeyPem || !bundleId) return null;
  return { keyId, teamId, privateKeyPem, bundleId };
}

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Verify HMAC-SHA256(`<timestamp>.<appUserId>`) in X-Signature, with X-Timestamp
// within skew. Passes through when no signing key is configured (preview/dev).
// Same scheme and same shared secret as the receipt-scanner Worker.
async function verifySignature(request: Request, appUserId: string, env: Env): Promise<boolean> {
  const secret = env.MONEY2TIME_REQUEST_SIGNING_KEY?.trim();
  if (!secret) return true;

  const signature = request.headers.get('X-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  if (!signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_MAX_SKEW_MS) return false;

  const expected = await hmacHex(secret, `${timestamp}.${appUserId}`);
  return timingSafeEqual(expected, signature);
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
