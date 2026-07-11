// Cloudflare Worker proxy for receipt scanning.
// Served at https://workers-receipt-scanner.money2time.com/scan.
//
// Flow:
//   1. Validate request body.
//   2. Verify RevenueCat entitlement (server-side, cached).
//   3. Enforce per-user quota (Pro: daily, free: monthly).
//   4. Call Featherless (Qwen3-VL) with the receipt image + user's categories.
//   5. Parse the JSON, consume one unit of quota, return transactions.
//
// The Featherless key lives only in this Worker's secrets — never in the app.

import { buildReceiptPrompt } from './prompt';
import { checkQuota, consumeQuota } from './ratelimit';
import { getEntitlement } from './revenuecat';

export interface Env {
  MONEY2TIME_WORKERS_KV_RECEIPT_SCANNER: KVNamespace;
  FEATHERLESS_API_KEY: string;
  REVENUECAT_SECRET_KEY: string;
  ENTITLEMENT_ID: string;
  MODEL: string;
  FREE_MONTHLY_LIMIT: string;
  PRO_DAILY_LIMIT: string;
}

const FEATHERLESS_URL = 'https://api.featherless.ai/v1/chat/completions';
const INFERENCE_TIMEOUT_MS = 45000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // ~8MB of base64

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface ScanRequest {
  appUserId: string;
  image: string;
  mime: string;
  currency: string;
  categories: string[];
}

interface ScannedTransaction {
  type: 'expense' | 'income';
  amount: number;
  currency: string;
  date: string | null;
  category: string;
  note: string;
  sentiment: 'happy' | 'neutral' | 'sad';
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
  async fetch(request: Request, env: Env): Promise<Response> {
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

    log('scan_request', {
      reqId,
      appUserId: body.appUserId,
      currency: body.currency,
      mime: body.mime,
      imageBytes: body.image.length,
      categoryCount: Array.isArray(body.categories) ? body.categories.length : 0,
    });

    const now = new Date();

    // 2. Entitlement (Pro is metered per day, free per month)
    const { isPro } = await getEntitlement(body.appUserId, env);

    // 3. Quota (check without consuming; consume only on success)
    const quota = await checkQuota(body.appUserId, isPro, env, now);
    log('entitlement', { reqId, appUserId: body.appUserId, isPro, limit: quota.limit });
    if (!quota.allowed) {
      logError('quota_blocked', {
        reqId,
        appUserId: body.appUserId,
        used: quota.used,
        limit: quota.limit,
        isPro,
      });
      return json(
        { error: 'limit_reached', isPro, limit: quota.limit, used: quota.used },
        402,
      );
    }

    // 4. Featherless
    let transactions: ScannedTransaction[];
    try {
      transactions = await runInference(body, env, reqId);
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

    // 5. Consume one unit only after a successful parse.
    const used = await consumeQuota(body.appUserId, isPro, env, now);

    log('scan_success', {
      reqId,
      appUserId: body.appUserId,
      count: transactions.length,
      used,
      limit: quota.limit,
      isPro,
      ms: Date.now() - startedAt,
    });
    return json({ transactions, quota: { used, limit: quota.limit, isPro } }, 200);
  },
};

function validate(body: ScanRequest): string | null {
  if (!body || typeof body !== 'object') return 'invalid_body';
  if (!body.appUserId || typeof body.appUserId !== 'string') return 'missing_app_user_id';
  if (!body.image || typeof body.image !== 'string') return 'missing_image';
  if (body.image.length > MAX_IMAGE_BYTES) return 'image_too_large';
  if (!body.mime || !/^image\/(jpe?g|png|webp|heic)$/i.test(body.mime)) return 'invalid_mime';
  if (!body.currency || typeof body.currency !== 'string') return 'missing_currency';
  return null;
}

async function runInference(
  body: ScanRequest,
  env: Env,
  reqId: string,
): Promise<ScannedTransaction[]> {
  const prompt = buildReceiptPrompt(body.categories, body.currency);
  const dataUrl = `data:${body.mime};base64,${body.image}`;
  const model = env.MODEL || 'Qwen/Qwen3-VL-8B-Instruct';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INFERENCE_TIMEOUT_MS);
  const calledAt = Date.now();
  try {
    const res = await fetch(FEATHERLESS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.FEATHERLESS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        // Note: we deliberately do NOT send response_format/guided_json — not
        // every Featherless-served model accepts it, and an unsupported param
        // would 400 the whole request. The prompt pins JSON-only output and
        // parseTransactions tolerates fences/prose, so this stays portable.
        model,
        temperature: 0,
        // Category-grouped splitting can yield several transactions per
        // receipt, so allow generous headroom over a single-total response.
        max_tokens: 2500,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    log('featherless_response', {
      reqId,
      model,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - calledAt,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`featherless ${res.status}: ${text.slice(0, 200)}`);
    }

    const completion = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = completion?.choices?.[0]?.message?.content ?? '';
    const transactions = parseTransactions(content);
    log('parsed', { reqId, contentChars: content.length, count: transactions.length });
    return transactions;
  } finally {
    clearTimeout(timer);
  }
}

// Tolerant parse: models sometimes wrap JSON in prose or code fences despite
// instructions. Extract the first {...} block and validate each row.
export function parseTransactions(content: string): ScannedTransaction[] {
  const raw = extractJsonObject(content);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
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
  const amount = Number(row.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

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
  };
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
