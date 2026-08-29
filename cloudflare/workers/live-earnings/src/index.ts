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
 * It also raises the card in the first place, for anyone who has set a shift
 * schedule. `Activity.request()` is foreground-only, so an app cannot start a
 * Live Activity by itself at 9am - but a **push-to-start** token (iOS 17.2+)
 * addresses the activity *type* on a device, and a push to it starts a card
 * with the app not running at all. The app registers the shift; this Worker
 * sends the start push at the right local minute. See `starts.ts`.
 *
 * Four endpoints and a cron:
 *   POST /live-earnings/register         { appUserId, pushToken, environment, session }
 *   POST /live-earnings/unregister       { appUserId, pushToken? }
 *   POST /live-earnings/schedule         { appUserId, pushToStartToken, timeZone, shift, copy }
 *   POST /live-earnings/schedule/clear   { appUserId, pushToStartToken? }
 *   cron * * * * *                       start what is due, push every running
 *                                        session, prune the rest
 *
 * Every endpoint carries the same HMAC signature the receipt-scanner Worker uses.
 */

import type { ApnsCredentials } from './apns';
import { armedStartAt } from './schedule';
import { runPushWindow } from './sessions';
import { runScheduledStarts, START_GRACE_MS } from './starts';
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

/** Longest IANA zone name in the tz database is well under this. */
const MAX_TIME_ZONE_CHARS = 64;
/** Longest prerendered label the card can carry. Ample for every locale. */
const MAX_COPY_CHARS = 120;
/** The shift lengths the app offers, in minutes: one hour to the iOS ceiling. */
const MIN_SHIFT_MINUTES = 60;
const MAX_SHIFT_MINUTES = MAX_SESSION_MS / 60_000;
/** `next_start_at` for a schedule that can never come due. */
const NEVER_SCHEDULED = 0;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, configured: apnsCredentials(env) !== null });
    }
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    if (url.pathname === '/live-earnings/register') return handleRegister(request, env);
    if (url.pathname === '/live-earnings/unregister') return handleUnregister(request, env);
    if (url.pathname === '/live-earnings/schedule') return handleSchedule(request, env);
    if (url.pathname === '/live-earnings/schedule/clear') {
      return handleClearSchedule(request, env);
    }
    return json({ error: 'not_found' }, 404);
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // One invocation owns the whole minute: Cloudflare's cron floor is a
    // minute and the card is worth updating more often, so the window pushes
    // every ten seconds until the next invocation takes over.
    //
    // Starts go first and are awaited: the window below deliberately sleeps
    // out the rest of the minute, so anything after it would run a minute
    // late, and a shift that begins at 09:00 has to begin at 09:00. A session
    // started here is picked up by the very next window, once the woken app
    // has registered the card's update token.
    ctx.waitUntil(
      (async () => {
        const store = env.MONEY2TIME_D1_LIVE_EARNINGS;
        const credentials = apnsCredentials(env);
        try {
          await runScheduledStarts({ store, credentials, now: () => Date.now() });
        } catch (error) {
          // Never let a bad start pass take the update window with it: one
          // stops a shift from beginning, the other freezes every card that is
          // already running.
          console.error('live-earnings: scheduled starts failed', error);
        }
        await runPushWindow({
          store,
          credentials,
          now: () => Date.now(),
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        });
      })(),
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
  if (!(hourlyRate > 0) || !Number.isFinite(hourlyRate))
    return json({ error: 'invalid_rate' }, 400);

  if (!(await verifySignature(request, appUserId, env)))
    return json({ error: 'unauthorized' }, 401);

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
    .bind(pushToken, appUserId, environment, startedAt, endsAt, hourlyRate, currencySymbol, now)
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
  if (!(await verifySignature(request, appUserId, env)))
    return json({ error: 'unauthorized' }, 401);

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

interface ScheduleBody {
  appUserId?: unknown;
  pushToStartToken?: unknown;
  environment?: unknown;
  timeZone?: unknown;
  days?: unknown;
  hour?: unknown;
  minute?: unknown;
  durationMinutes?: unknown;
  hourlyRate?: unknown;
  currencySymbol?: unknown;
  titleText?: unknown;
  rateText?: unknown;
  endsText?: unknown;
  totalText?: unknown;
  refreshText?: unknown;
  zeroText?: unknown;
  alertTitle?: unknown;
  alertBody?: unknown;
  accentLightHex?: unknown;
  accentDarkHex?: unknown;
}

/**
 * Arms (or re-arms) a device's shift schedule.
 *
 * Upsert on the push-to-start token, and called on every app foreground rather
 * than only when the schedule changes: that is what repairs a registration
 * that failed while offline, picks up a token iOS has rotated, and refreshes
 * the prerendered copy after a change of wage, currency, language or theme.
 *
 * The next occurrence is computed here rather than sent by the app, because it
 * has to be recomputed after every start with no app involved. Recomputing it
 * from *now* on each register is also what stops a foreground at 09:00:30 from
 * re-arming the 09:00 start that has just fired: `nextScheduledStart` is
 * strictly forward-looking.
 */
async function handleSchedule(request: Request, env: Env): Promise<Response> {
  const body = (await readJson(request)) as ScheduleBody | null;
  if (!body) return json({ error: 'invalid_json' }, 400);

  const appUserId = asString(body.appUserId);
  const pushToStartToken = asString(body.pushToStartToken);
  const environment = body.environment === 'production' ? 'production' : 'sandbox';
  const timeZone = asString(body.timeZone).slice(0, MAX_TIME_ZONE_CHARS);
  const days = asWeekdays(body.days);
  const hour = asIntInRange(body.hour, 0, 23);
  const minute = asIntInRange(body.minute, 0, 59);
  const durationMinutes = asIntInRange(body.durationMinutes, MIN_SHIFT_MINUTES, MAX_SHIFT_MINUTES);
  const hourlyRate = asNumber(body.hourlyRate);
  const currencySymbol = asString(body.currencySymbol).slice(0, MAX_CURRENCY_SYMBOL_CHARS) || '$';

  if (!appUserId || !pushToStartToken) return json({ error: 'missing_identity' }, 400);
  if (appUserId.length > MAX_APP_USER_ID_CHARS) return json({ error: 'invalid_identity' }, 400);
  if (!isLiveActivityPushToken(pushToStartToken)) {
    return json({ error: 'invalid_push_token' }, 400);
  }
  if (!isKnownTimeZone(timeZone)) return json({ error: 'invalid_time_zone' }, 400);
  if (hour === null || minute === null || durationMinutes === null) {
    return json({ error: 'invalid_schedule' }, 400);
  }
  if (!(hourlyRate > 0) || !Number.isFinite(hourlyRate))
    return json({ error: 'invalid_rate' }, 400);

  if (!(await verifySignature(request, appUserId, env)))
    return json({ error: 'unauthorized' }, 401);

  const now = Date.now();
  // What this device's schedule has already started, so a re-registration in
  // the seconds around a start neither loses it nor sends it twice. Read before
  // the upsert, which deliberately leaves that column alone.
  const { results } = await env.MONEY2TIME_D1_LIVE_EARNINGS.prepare(
    'SELECT last_started_at FROM live_activity_schedules WHERE push_to_start_token = ?1',
  )
    .bind(pushToStartToken)
    .all<{ last_started_at: number | null }>();
  const lastStartedAt = results?.[0]?.last_started_at ?? 0;

  const nextStartAt =
    armedStartAt({
      schedule: { days, hour, minute, timeZone },
      now,
      lastStartedAt,
      graceMs: START_GRACE_MS,
    }) ?? NEVER_SCHEDULED;

  await env.MONEY2TIME_D1_LIVE_EARNINGS.prepare(
    `INSERT INTO live_activity_schedules
       (push_to_start_token, app_user_id, environment, time_zone, days, hour, minute,
        duration_minutes, hourly_rate, currency_symbol, title_text, rate_text, ends_text,
        total_text, refresh_text, zero_text, alert_title, alert_body, accent_light,
        accent_dark, next_start_at, last_started_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
             ?19, ?20, ?21, NULL, ?22, ?22)
     ON CONFLICT(push_to_start_token) DO UPDATE SET
       app_user_id = excluded.app_user_id,
       environment = excluded.environment,
       time_zone = excluded.time_zone,
       days = excluded.days,
       hour = excluded.hour,
       minute = excluded.minute,
       duration_minutes = excluded.duration_minutes,
       hourly_rate = excluded.hourly_rate,
       currency_symbol = excluded.currency_symbol,
       title_text = excluded.title_text,
       rate_text = excluded.rate_text,
       ends_text = excluded.ends_text,
       total_text = excluded.total_text,
       refresh_text = excluded.refresh_text,
       zero_text = excluded.zero_text,
       alert_title = excluded.alert_title,
       alert_body = excluded.alert_body,
       accent_light = excluded.accent_light,
       accent_dark = excluded.accent_dark,
       next_start_at = excluded.next_start_at,
       updated_at = excluded.updated_at`,
  )
    .bind(
      pushToStartToken,
      appUserId,
      environment,
      timeZone,
      JSON.stringify(days),
      hour,
      minute,
      durationMinutes,
      hourlyRate,
      currencySymbol,
      asCopy(body.titleText),
      asCopy(body.rateText),
      asCopy(body.endsText),
      asCopy(body.totalText),
      asCopy(body.refreshText),
      asCopy(body.zeroText),
      asCopy(body.alertTitle),
      asCopy(body.alertBody),
      asHex(body.accentLightHex),
      asHex(body.accentDarkHex),
      nextStartAt,
      now,
    )
    .run();

  // Same eviction as sessions, for the same reason: the request signature is a
  // shared secret shipped in the app bundle, so the row count per account has
  // to be bounded by something other than good faith.
  await env.MONEY2TIME_D1_LIVE_EARNINGS.prepare(
    `DELETE FROM live_activity_schedules
      WHERE app_user_id = ?1
        AND push_to_start_token NOT IN (
          SELECT push_to_start_token FROM live_activity_schedules
           WHERE app_user_id = ?1
           ORDER BY updated_at DESC
           LIMIT ?2
        )`,
  )
    .bind(appUserId, MAX_SESSIONS_PER_USER)
    .run();

  return json({ ok: true, nextStartAt });
}

/**
 * Disarms a schedule: the user switched auto-start off, turned Live Activities
 * off in iOS Settings, or cleared their wage.
 *
 * Without a token it drops every schedule the account has, which is what a
 * data reset wants.
 */
async function handleClearSchedule(request: Request, env: Env): Promise<Response> {
  const body = (await readJson(request)) as {
    appUserId?: unknown;
    pushToStartToken?: unknown;
  } | null;
  if (!body) return json({ error: 'invalid_json' }, 400);

  const appUserId = asString(body.appUserId);
  const pushToStartToken = asString(body.pushToStartToken);
  if (!appUserId || appUserId.length > MAX_APP_USER_ID_CHARS) {
    return json({ error: 'missing_identity' }, 400);
  }
  if (pushToStartToken && !isLiveActivityPushToken(pushToStartToken)) {
    return json({ error: 'invalid_push_token' }, 400);
  }
  if (!(await verifySignature(request, appUserId, env)))
    return json({ error: 'unauthorized' }, 401);

  const statement = pushToStartToken
    ? env.MONEY2TIME_D1_LIVE_EARNINGS.prepare(
        'DELETE FROM live_activity_schedules WHERE push_to_start_token = ?1 AND app_user_id = ?2',
      ).bind(pushToStartToken, appUserId)
    : env.MONEY2TIME_D1_LIVE_EARNINGS.prepare(
        'DELETE FROM live_activity_schedules WHERE app_user_id = ?1',
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

function asCopy(value: unknown): string {
  return asString(value).slice(0, MAX_COPY_CHARS);
}

/** A 0xRRGGBB colour, clamped to the range the Swift `UInt32` expects. */
function asHex(value: unknown): number {
  const raw = asNumber(value);
  if (!Number.isInteger(raw) || raw < 0) return 0;
  return Math.min(0xffffff, raw);
}

function asIntInRange(value: unknown, min: number, max: number): number | null {
  const raw = asNumber(value);
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  return rounded < min || rounded > max ? null : rounded;
}

/** Deduplicated and sorted, so two equal schedules store identical rows. */
function asWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = new Set<number>();
  for (const entry of value) {
    if (typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry <= 6) {
      days.add(entry);
    }
  }
  return [...days].sort((a, b) => a - b);
}

/**
 * Rejected rather than silently coerced to UTC: a zone the runtime cannot
 * format is one whose schedule would fire at the wrong hour every day, and the
 * app is the one that can fix it by sending a name that resolves.
 */
function isKnownTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
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
