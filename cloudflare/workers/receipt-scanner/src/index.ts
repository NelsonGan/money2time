// Cloudflare Worker proxy for receipt scanning, served at /scan. Validates the
// request, verifies the RevenueCat entitlement and per-user scan quota, runs
// OpenRouter inference (primary MODEL, falling back to BACKUP_MODEL), and
// returns the parsed transactions. The OpenRouter key lives only in this
// Worker's secrets — never in the app.

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
  // Rate-limit counters + entitlement cache (schema in cloudflare/d1/receipt-scanner/schema.sql).
  MONEY2TIME_D1_RECEIPT_SCANNER: D1Database;
  OPENROUTER_API_KEY: string;
  REVENUECAT_SECRET_KEY: string;
  // Shared secret the app signs requests with (X-Signature / X-Timestamp).
  // When unset, signature checking is skipped so preview builds still work.
  MONEY2TIME_REQUEST_SIGNING_KEY?: string;
  ENTITLEMENT_ID: string;
  MODEL: string;
  // Backup model tried when the primary MODEL errors or times out. Unset falls
  // back to DEFAULT_BACKUP_MODEL; set equal to MODEL to disable failover.
  BACKUP_MODEL?: string;
  // Per-tier scan caps + metering cadence. INTERVAL is day|week|month|year with
  // an optional count prefix ("100year" ≈ lifetime); see interval.ts.
  FREE_LIMIT: string;
  FREE_INTERVAL: string;
  PRO_LIMIT: string;
  PRO_INTERVAL: string;
  // Optional OpenAI-style image_url.detail hint ("low" | "high" | "auto").
  // "low" downsamples to cut input tokens at some OCR-accuracy risk; unset omits it.
  IMAGE_DETAIL?: string;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Fallback for an unset MODEL / BACKUP_MODEL.
const DEFAULT_BACKUP_MODEL = 'google/gemma-3-4b-it';
const INFERENCE_TIMEOUT_MS = 45000;
// Cap on the base64 payload; the app enforces the same limit before uploading.
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
  // 'itemized' adds a line-item breakdown; 'screenshot' detects the account.
  // Absent/'quick' is total-only. See scanModes/.
  mode?: ScanMode;
  // User's account names — screenshot mode only, matched against the payment source.
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

// One JSON line per event (keyed by reqId) for Workers Logs.
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

    const { isPro } = await getEntitlement(body.appUserId, env);

    // Check quota without consuming; consume only on a successful parse.
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

    // Consume quota only when the parse yielded something — an unreadable
    // receipt returns 200 but must not burn a scan. Written via waitUntil so the
    // response isn't held on a D1 round trip; `used` is the optimistic total.
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
    // schemaVersion 2 = receiptDetail may be present; old clients ignore it.
    return json(
      { transactions, receiptDetail: receiptDetail ?? undefined, quota: quotaOut, schemaVersion: 2 },
      200,
    );
  },

  // Daily cron: D1 has no TTL, so prune expired scan_usage / entitlement_cache rows.
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

// Verify HMAC-SHA256(`<timestamp>.<appUserId>`) in X-Signature, with X-Timestamp
// within skew. Passes through when no signing key is configured (preview/dev).
async function verifySignature(request: Request, body: ScanRequest, env: Env): Promise<boolean> {
  // Trim to match the client; a stray trailing newline would otherwise reject
  // every request. A whitespace-only secret counts as unset.
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

// Models to try in order: primary MODEL, then BACKUP_MODEL (skipped when equal).
function resolveModels(env: Env): string[] {
  const primary = env.MODEL?.trim() || DEFAULT_BACKUP_MODEL;
  const backup = env.BACKUP_MODEL?.trim() || DEFAULT_BACKUP_MODEL;
  return backup && backup !== primary ? [primary, backup] : [primary];
}

// Sends the receipt image + prompt to OpenRouter and returns the raw output.
async function completeWithImage(
  body: ScanRequest,
  env: Env,
  reqId: string,
  prompt: string,
  maxTokens: number,
  model: string,
): Promise<string> {
  const dataUrl = `data:${body.mime};base64,${body.image}`;
  // Resolution hint attached only when set (see Env.IMAGE_DETAIL).
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
        // OpenRouter attribution headers.
        'HTTP-Referer': 'https://money2time.com',
        'X-Title': 'money2time receipt scanner',
      },
      signal: controller.signal,
      body: JSON.stringify({
        // No response_format/structured outputs: not every provider accepts it.
        // The prompt pins JSON-only output and the parsers tolerate fences/prose.
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

// Tries each model in order, retrying on any error; rethrows the last failure.
async function completeWithFailover(
  body: ScanRequest,
  env: Env,
  reqId: string,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  const models = resolveModels(env);
  let lastError: unknown;
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    try {
      return await completeWithImage(body, env, reqId, prompt, maxTokens, model);
    } catch (err) {
      lastError = err;
      logError('inference_model_failed', {
        reqId,
        model,
        isBackup: i > 0,
        willRetry: i < models.length - 1,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw lastError;
}

async function runInference(
  body: ScanRequest,
  env: Env,
  reqId: string,
  mode: ScanMode,
): Promise<{ transactions: ScannedTransaction[]; receiptDetail: ScannedReceiptDetail | null }> {
  const prompt = buildReceiptPrompt(body.categories, body.currency, mode, body.accounts ?? []);
  const maxTokens = maxTokensForMode(mode);
  const content = await completeWithFailover(body, env, reqId, prompt, maxTokens);
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

// Tolerant parse: extract the first {...} block (models add fences/prose).
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
    // Screenshot mode only; other prompts never emit it.
    account: typeof row.account === 'string' ? row.account : '',
  };
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
