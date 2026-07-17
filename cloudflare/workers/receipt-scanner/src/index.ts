// Cloudflare Worker proxy for receipt scanning.
// Served at https://workers-receipt-scanner.money2time.com/scan.
//
// Flow:
//   1. Validate request body.
//   2. Verify RevenueCat entitlement (server-side, cached in D1).
//   3. Enforce the per-user scan quota (Pro and free, counters in D1).
//   4. Call OpenRouter (Gemini 2.5 Flash Lite) with the receipt image + categories.
//   5. Parse the JSON, consume one unit of quota (only if it found a
//      transaction), return transactions.
//
// The OpenRouter key lives only in this Worker's secrets — never in the app.

import { checkQuota, consumeQuota } from './ratelimit';
import { getEntitlement } from './revenuecat';
import {
  buildReceiptPrompt,
  maxTokensForMode,
  normalizeReceiptDetail,
  type ScanMode,
  type ScannedReceiptDetail,
} from './scanModes';

export interface Env {
  // D1 database holding the rate-limit counters + entitlement cache
  // (schema: cloudflare/d1/receipt-scanner/schema.sql).
  MONEY2TIME_D1_RECEIPT_SCANNER: D1Database;
  OPENROUTER_API_KEY: string;
  REVENUECAT_SECRET_KEY: string;
  // Shared secret the app signs requests with (X-Signature / X-Timestamp).
  // When unset, signature checking is skipped so preview builds still work.
  MONEY2TIME_REQUEST_SIGNING_KEY?: string;
  ENTITLEMENT_ID: string;
  MODEL: string;
  // Per-tier scan caps and metering cadence. INTERVAL is one of
  // day | week | month | year with an optional count prefix — e.g. "100year"
  // is an effectively-lifetime window (defaults: free 100year, Pro month; see
  // interval.ts).
  FREE_LIMIT: string;
  FREE_INTERVAL: string;
  PRO_LIMIT: string;
  PRO_INTERVAL: string;
  // Optional image-resolution hint forwarded to the provider as OpenAI-style
  // image_url.detail ("low" | "high" | "auto"). "low" cuts image input tokens
  // by making the provider downsample, at some OCR-accuracy risk. Unset = omit
  // the field (provider default). Reversible from wrangler with no code change.
  IMAGE_DETAIL?: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';
const INFERENCE_TIMEOUT_MS = 45000;
// Cap on the base64 payload (~6MB of actual image); the app enforces the same
// number before uploading so an oversized photo fails fast client-side.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Signature, X-Timestamp',
};

// Requests older than this (by their signed timestamp) are rejected.
const SIGNATURE_MAX_SKEW_MS = 5 * 60 * 1000;

interface ScanRequest {
  appUserId: string;
  image: string;
  mime: string;
  currency: string;
  categories: string[];
  // 'itemized' also extracts line items + totals breakdown (receiptDetail).
  // 'screenshot' parses arbitrary payment screenshots and detects the account.
  // Absent/'quick' keeps the original total-only behavior byte-for-byte.
  mode?: ScanMode;
  // The user's account names — screenshot mode matches the payment source shown
  // on screen against these; other modes never send them.
  accounts?: string[];
}

interface ScannedTransaction {
  type: 'expense' | 'income';
  amount: number;
  currency: string;
  date: string | null;
  category: string;
  note: string;
  sentiment: 'happy' | 'neutral' | 'sad';
  /** Screenshot mode: the matched account name from the list sent, or "". */
  account: string;
}

// Structured logging for Workers Logs — one JSON line per event, keyed by
// `reqId` so a single scan's lines can be grouped/filtered.
function log(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...data }));
}
function logError(event: string, data: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...data }));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/scan') {
      return json({ error: 'not_found' }, 404);
    }

    const reqId = crypto.randomUUID();
    const startedAt = Date.now();

    let body: ScanRequest;
    try {
      body = (await request.json()) as ScanRequest;
    } catch {
      logError('bad_request', { reqId, error: 'invalid_json' });
      return json({ error: 'invalid_json' }, 400);
    }

    const validationError = validate(body);
    if (validationError) {
      logError('bad_request', { reqId, error: validationError });
      return json({ error: validationError }, 400);
    }

    if (!(await verifySignature(request, body, env))) {
      logError('bad_signature', { reqId, appUserId: body.appUserId });
      return json({ error: 'unauthorized' }, 401);
    }

    const mode: ScanMode =
      body.mode === 'itemized' || body.mode === 'screenshot' ? body.mode : 'quick';
    log('scan_request', {
      reqId,
      appUserId: body.appUserId,
      currency: body.currency,
      mime: body.mime,
      mode,
      imageBytes: body.image.length,
      categoryCount: Array.isArray(body.categories) ? body.categories.length : 0,
      accountCount: Array.isArray(body.accounts) ? body.accounts.length : 0,
    });

    const now = new Date();

    // 2. Entitlement (Pro and free are metered separately; caps + cadence per tier)
    const { isPro } = await getEntitlement(body.appUserId, env);

    // 3. Quota (check without consuming; consume only on success)
    const quota = await checkQuota(body.appUserId, isPro, env, now);
    log('entitlement', {
      reqId,
      appUserId: body.appUserId,
      isPro,
      limit: quota.limit,
      interval: quota.interval,
    });
    if (!quota.allowed) {
      logError('quota_blocked', {
        reqId,
        appUserId: body.appUserId,
        used: quota.used,
        limit: quota.limit,
        interval: quota.interval,
        isPro,
      });
      return json(
        { error: 'limit_reached', isPro, limit: quota.limit, used: quota.used, interval: quota.interval },
        402,
      );
    }

    // 4. OpenRouter — returns one transaction total per receipt (plus the
    // line-item breakdown in itemized mode).
    let transactions: ScannedTransaction[] = [];
    let receiptDetail: ScannedReceiptDetail | null = null;
    try {
      ({ transactions, receiptDetail } = await runInference(body, env, reqId, mode));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'inference_failed';
      const capacity = /429|overloaded|capacity|concurren/i.test(message);
      logError('inference_failed', {
        reqId,
        capacity,
        error: message,
        ms: Date.now() - startedAt,
      });
      return json(
        { error: capacity ? 'capacity' : 'inference_failed', detail: message },
        capacity ? 429 : 502,
      );
    }

    // 5. Consume one unit only when the parse actually yielded something — an
    // unreadable receipt (empty result) returns 200 but must not burn quota.
    // The write runs via waitUntil so the user (who already sat through
    // inference) isn't kept waiting on a D1 round trip; the reported `used`
    // is the optimistic new total.
    const count = transactions.length;
    let used = quota.used;
    if (count > 0) {
      used = quota.used + 1;
      ctx.waitUntil(consumeQuota(body.appUserId, isPro, env, now));
    }

    log('scan_success', {
      reqId,
      appUserId: body.appUserId,
      count,
      itemCount: receiptDetail?.items.length ?? 0,
      mode,
      used,
      limit: quota.limit,
      isPro,
      ms: Date.now() - startedAt,
    });
    const quotaOut = { used, limit: quota.limit, isPro, interval: quota.interval };
    // schemaVersion 2 = receiptDetail may be present. Old clients ignore both
    // extra fields; old workers simply never send them.
    return json(
      { transactions, receiptDetail: receiptDetail ?? undefined, quota: quotaOut, schemaVersion: 2 },
      200,
    );
  },

  // Daily cron (see wrangler.toml [triggers]). D1 has no native TTL: prune rows
  // whose window has expired so scan_usage / entitlement_cache don't grow
  // unbounded.
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(pruneExpired(env));
  },
};

async function pruneExpired(env: Env): Promise<void> {
  const db = env.MONEY2TIME_D1_RECEIPT_SCANNER;
  const now = Date.now();
  try {
    await db.batch([
      db.prepare('DELETE FROM scan_usage WHERE expires_at <= ?1').bind(now),
      db.prepare('DELETE FROM entitlement_cache WHERE expires_at <= ?1').bind(now),
    ]);
    log('prune_expired', { now });
  } catch (err) {
    logError('prune_failed', { error: err instanceof Error ? err.message : String(err) });
  }
}

function validate(body: ScanRequest): string | null {
  if (!body || typeof body !== 'object') return 'invalid_body';
  if (!body.appUserId || typeof body.appUserId !== 'string') return 'missing_app_user_id';
  if (!body.image || typeof body.image !== 'string') return 'missing_image';
  if (body.image.length > MAX_IMAGE_BYTES) return 'image_too_large';
  if (!body.mime || !/^image\/(jpe?g|png|webp|heic)$/i.test(body.mime)) return 'invalid_mime';
  if (!body.currency || typeof body.currency !== 'string') return 'missing_currency';
  if (
    body.mode !== undefined &&
    body.mode !== 'quick' &&
    body.mode !== 'itemized' &&
    body.mode !== 'screenshot'
  ) {
    return 'invalid_mode';
  }
  return null;
}

/**
 * Verify the request's shared-secret signature: HMAC-SHA256 of
 * `<timestamp>.<appUserId>` sent in the X-Signature header, with X-Timestamp
 * within the allowed clock skew. Passes through when no signing key is
 * configured so preview/dev environments keep working.
 */
async function verifySignature(request: Request, body: ScanRequest, env: Env): Promise<boolean> {
  // Trim to match the client, which trims EXPO_PUBLIC_REQUEST_SIGNING_KEY — a
  // trailing newline (e.g. from `echo | wrangler secret put`) would otherwise
  // change the key and reject every request. A whitespace-only secret is unset.
  const secret = env.MONEY2TIME_REQUEST_SIGNING_KEY?.trim();
  if (!secret) return true;

  const signature = request.headers.get('X-Signature');
  const timestamp = request.headers.get('X-Timestamp');
  if (!signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGNATURE_MAX_SKEW_MS) return false;

  const expected = await hmacHex(secret, `${timestamp}.${body.appUserId}`);
  return timingSafeEqual(expected, signature);
}

/** HMAC-SHA256 of `message` with `secret`, hex-encoded (lowercase). */
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

/** Length-checked, constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Sends the receipt image + prompt to OpenRouter and returns the raw model
 * output.
 */
async function completeWithImage(
  body: ScanRequest,
  env: Env,
  reqId: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const dataUrl = `data:${body.mime};base64,${body.image}`;
  const model = env.MODEL || DEFAULT_MODEL;
  // Optional resolution hint (see Env.IMAGE_DETAIL). Only attached when set so
  // the default request shape is unchanged.
  const detail = env.IMAGE_DETAIL?.trim();
  const imageUrl: { url: string; detail?: string } = detail
    ? { url: dataUrl, detail }
    : { url: dataUrl };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INFERENCE_TIMEOUT_MS);
  const calledAt = Date.now();
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // Optional OpenRouter attribution headers.
        'HTTP-Referer': 'https://money2time.com',
        'X-Title': 'money2time receipt scanner',
      },
      signal: controller.signal,
      body: JSON.stringify({
        // Note: we deliberately do NOT send response_format/structured outputs —
        // not every OpenRouter-served provider accepts it, and an unsupported
        // param can fail the whole request. The prompt pins JSON-only output and
        // the parsers tolerate fences/prose, so this stays portable.
        model,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: imageUrl },
            ],
          },
        ],
      }),
    });

    log('openrouter_response', {
      reqId,
      model,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - calledAt,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`openrouter ${res.status}: ${text.slice(0, 200)}`);
    }

    const completion = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return completion?.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

async function runInference(
  body: ScanRequest,
  env: Env,
  reqId: string,
  mode: ScanMode,
): Promise<{ transactions: ScannedTransaction[]; receiptDetail: ScannedReceiptDetail | null }> {
  const prompt = buildReceiptPrompt(body.categories, body.currency, mode, body.accounts ?? []);
  const maxTokens = maxTokensForMode(mode);
  const content = await completeWithImage(body, env, reqId, prompt, maxTokens);
  const parsed = extractParsedObject(content);
  const transactions = parseTransactions(parsed);
  const receiptDetail = mode === 'itemized' ? normalizeReceiptDetail(parsed) : null;
  log('parsed', {
    reqId,
    contentChars: content.length,
    count: transactions.length,
    itemCount: receiptDetail?.items.length ?? 0,
    accountDetected: transactions.some((t) => t.account !== ''),
  });
  return { transactions, receiptDetail };
}

/** A line amount as a positive finite number, or null when unusable. */
function coerceAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Tolerant parse: models sometimes wrap JSON in prose or code fences despite
// instructions. Extract the first {...} block and JSON-parse it.
function extractParsedObject(content: string): unknown {
  const raw = extractJsonObject(content);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseTransactions(parsed: unknown): ScannedTransaction[] {
  const list = (parsed as { transactions?: unknown })?.transactions;
  if (!Array.isArray(list)) return [];

  return list
    .map(normalizeRow)
    .filter((row): row is ScannedTransaction => row !== null);
}

function extractJsonObject(content: string): string | null {
  const fenced = content.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return fenced.slice(start, end + 1);
}

function normalizeRow(input: unknown): ScannedTransaction | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const amount = coerceAmount(row.amount);
  if (amount === null) return null;

  const type = row.type === 'income' ? 'income' : 'expense';
  const sentiment =
    row.sentiment === 'happy' || row.sentiment === 'sad'
      ? row.sentiment
      : 'neutral';
  const date =
    typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
      ? row.date
      : null;

  return {
    type,
    amount,
    currency: typeof row.currency === 'string' ? row.currency.toUpperCase() : 'USD',
    date,
    category: typeof row.category === 'string' ? row.category : 'Other',
    note: typeof row.note === 'string' ? row.note : '',
    sentiment,
    // Screenshot mode only; the other prompts never emit it, so it degrades to "".
    account: typeof row.account === 'string' ? row.account : '',
  };
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
