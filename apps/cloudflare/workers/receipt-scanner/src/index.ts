// Cloudflare Worker proxy for receipt scanning, served at /scan. Validates the
// request, verifies the RevenueCat entitlement and per-user scan quota, runs
// OpenRouter inference (primary MODEL, falling back to BACKUP_MODEL; a Claude
// model runs only on our own Anthropic key), and
// returns the parsed transactions. The OpenRouter key lives only in this
// Worker's secrets — never in the app.

import { AiTrace, type OpenRouterUsage, type PostHogEnv, readSessionId } from './posthog';
import type { PromptEnv, ResolvedPrompt } from './prompts';
import { checkQuota, consumeQuota } from './ratelimit';
import { getEntitlement } from './revenuecat';
import {
  type BuiltPrompt,
  buildReceiptPrompt,
  maxTokensForMode,
  normalizeReceiptDetail,
  type ScanMode,
  type ScannedReceiptDetail,
} from './scanModes';

export interface Env extends PostHogEnv, PromptEnv {
  // Rate-limit counters + entitlement cache (schema in apps/cloudflare/d1/receipt-scanner/schema.sql).
  MONEY2TIME_D1_RECEIPT_SCANNER: D1Database;
  OPENROUTER_API_KEY: string;
  REVENUECAT_SECRET_KEY: string;
  ENTITLEMENT_ID: string;
  // An `anthropic/` model in MODEL or BACKUP_MODEL runs on our own Anthropic
  // key through OpenRouter BYOK, never on OpenRouter credits (ANTHROPIC_ONLY).
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
// An Anthropic model runs on our own Anthropic key (BYOK) and never on
// OpenRouter credits, whichever slot it is in. OpenRouter also serves Claude
// from Bedrock, Vertex, Azure and Claude Platform on AWS, on its own accounts
// and so on credits, so the request names Anthropic alone and allows no other
// provider. The Anthropic key in OpenRouter (Settings, Integrations) must also
// be set never to use shared capacity, or a rate-limited key runs on
// OpenRouter's own Anthropic account instead of failing; no request field can
// say that. `byokBroken` checks both.
const ANTHROPIC_ONLY = { only: ['anthropic'], allow_fallbacks: false };
// Set when an Anthropic answer says our key did not pay for it, so OpenRouter
// charged credits. The rest of this isolate's scans skip Anthropic models
// rather than risk another; a new isolate tries them again. The routing above
// rules this out, so it only fires if that routing stops holding.
let byokBroken = false;
const INFERENCE_TIMEOUT_MS = 45000;
// Claude's prompt text, ahead of the receipt, goes in Anthropic's prompt cache:
// a hit is a tenth of the input price, a write 1.25x it for 5 minutes or 2x for
// an hour. The templates end with the user's settings (USER_SETTINGS_HEADING),
// so the text above them is the same for every user and is cached once for
// all: any user's scan keeps it warm. A scan follows another of its mode
// within an hour 100% (screenshot), 99% (quick) and 74% (itemized) of the time
// but within 5 minutes only 98%, 75% and 35%, which makes the hour the cheaper
// of the two for every mode. A hosted template from before the settings moved
// to the end has no shared part, so the whole prompt is cached per user, where
// the same user repeats within 5 minutes 36-40% of the time and barely more
// within an hour: 5 minutes is the cheaper there (22% hits to repay against
// over 52%).
const SHARED_PROMPT_CACHE = { type: 'ephemeral', ttl: '1h' };
const PER_USER_PROMPT_CACHE = { type: 'ephemeral' };
// Hosted prompts (name@version) already logged as having no shared part, so a
// `production` label left on a pre-split template shows in Workers Logs once
// per isolate rather than on every scan.
const reportedUnsharedPrompts = new Set<string>();
// What a model with another behind it in the chain leaves for that one: a hung
// primary times out early enough that the backup still has a real attempt
// inside the budget, rather than starting with seconds left (or none).
const BACKUP_RESERVE_MS = 25000;
// Wall clock the whole request gets, spanning every attempt below (the model
// failover and the empty-result retry). It is anchored at request entry rather
// than at the first inference call on purpose: the entitlement lookup (8s of
// its own, and a cache miss every 60s) and the quota round trip run first, and
// a budget that ignored them would let the response land after the app's own
// fetch timeout (FETCH_TIMEOUT_MS in services/receiptScan.native.ts) — turning
// a scan the Worker was about to answer 200 into "network request failed".
const SCAN_BUDGET_MS = 70000;
// Vision models are flaky in one specific way: they occasionally return an
// empty transactions array for a receipt they read perfectly well on a second
// pass. One empty result therefore buys exactly one more attempt, for photos.
// Screenshots get none: most empty ones are screens with no payment on them,
// and in the week of 2026-10-12 the second pass found a transaction in 46 of
// 5,101 empty screenshots (0.9%), while adding ~2 s to each and a quarter of
// all AI observability events. Photos still recover often enough to keep it.
function emptyResultRetries(mode: ScanMode): number {
  return mode === 'screenshot' ? 0 : 1;
}
// Floor on what is left before a retry may start: an attempt cut off partway is
// a billed call thrown away and pushes the response past the client's timeout,
// which is worse than the empty answer already in hand. The real gate is the
// first attempt's own duration (the best estimate of the second's); this is
// just the floor for when that attempt was very fast.
const MIN_RETRY_BUDGET_MS = 15000;
// The first attempt runs at 0 for a stable, reproducible read. A retry at 0
// would largely resample the same path and reproduce the same empty answer, so
// the retry nudges the sampler just far enough to land somewhere else.
const RETRY_TEMPERATURE = 0.2;
// Cap on the base64 payload; the app enforces the same limit before uploading.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Signature, X-Timestamp',
};

interface ScanRequest {
  appUserId: string;
  image?: string;
  mime?: string;
  currency: string;
  categories: string[];
  // 'itemized' adds a line-item breakdown; 'screenshot' detects the account.
  // Absent/'quick' is total-only. See scanModes/.
  mode?: ScanMode | 'notification';
  // User's account names — screenshot mode only, matched against the payment source.
  accounts?: string[];
}

interface ScannedTransaction {
  type: 'expense' | 'income';
  amount: number;
  currency: string;
  /** YYYY-MM-DD — the receipt's own date when within 30 days back / 2 days ahead, else today (UTC). */
  date: string;
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

    // Request signing is switched off for now (temporary). The app still sends
    // X-Signature / X-Timestamp; they are ignored. Per-user quotas still apply.

    const mode: ScanMode =
      body.mode === 'itemized' || body.mode === 'screenshot'
        ? body.mode
        : 'quick';
    log('scan_request', {
      reqId,
      appUserId: body.appUserId,
      currency: body.currency,
      mime: body.mime,
      mode,
      imageBytes: body.image?.length ?? 0,
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
        {
          error: 'limit_reached',
          isPro,
          limit: quota.limit,
          used: quota.used,
          interval: quota.interval,
        },
        402,
      );
    }

    // One PostHog AI trace per scan; sent after the response via waitUntil.
    const trace = new AiTrace(
      reqId,
      body.appUserId,
      { scan_mode: mode, is_pro: isPro },
      readSessionId(request),
    );
    let transactions: ScannedTransaction[] = [];
    let receiptDetail: ScannedReceiptDetail | null = null;
    try {
      ({ transactions, receiptDetail } = await runInference(
        body,
        env,
        reqId,
        mode,
        now,
        startedAt + SCAN_BUDGET_MS,
        trace,
      ));
    } catch (err) {
      ctx.waitUntil(trace.flush(env));
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
    ctx.waitUntil(trace.flush(env));
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
      {
        transactions,
        receiptDetail: receiptDetail ?? undefined,
        quota: quotaOut,
        schemaVersion: 2,
      },
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
  // Retired text-only endpoint must never forward notification content to AI.
  if (body.mode === 'notification') return 'notification_scanning_removed';
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

// The image's type as its first bytes say, or null for anything else (HEIC,
// whatever its declared type). Anthropic refuses an image whose declared type
// is not what it is (a PNG sent as image/jpeg), where other providers never
// minded, and every type it reads that the request check allows has one of
// these signatures.
function sniffImageMime(base64: string): string | null {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return null;
}

interface ModelChoice {
  model: string;
  /** An Anthropic model: runs on our own key, locked to that provider (ANTHROPIC_ONLY). */
  byok: boolean;
  /** BACKUP_MODEL's slot (or the default standing in), whether or not a model ran before it. */
  isBackup: boolean;
}

// OpenRouter's `~anthropic/…-latest` aliases are Claude too, so they get the
// same lock.
function isAnthropicModel(model: string): boolean {
  return /^~?anthropic\//i.test(model);
}

// Models to try in order: primary MODEL, then BACKUP_MODEL (skipped when equal).
// Anthropic models drop out once one has been billed to credits (`byokBroken`),
// and for an image whose bytes are not a type Claude reads (`imageType` null):
// HEIC, labelled as it is or as a JPEG, is refused every time with a 400.
function resolveModels(env: Env, imageType: string | null): ModelChoice[] {
  const primary = env.MODEL?.trim() || DEFAULT_BACKUP_MODEL;
  const backup = env.BACKUP_MODEL?.trim() || DEFAULT_BACKUP_MODEL;
  const chain = (backup !== primary ? [primary, backup] : [primary])
    .map((model, i) => ({ model, byok: isAnthropicModel(model), isBackup: i > 0 }))
    .filter((choice) => !(choice.byok && (byokBroken || !imageType)));
  return chain.length ? chain : [{ model: DEFAULT_BACKUP_MODEL, byok: false, isBackup: true }];
}

// One attempt's inference settings, shared by the failover chain.
interface AttemptOptions {
  prompt: BuiltPrompt;
  maxTokens: number;
  temperature: number;
  /** Epoch ms after which no further inference may start (INFERENCE_BUDGET_MS). */
  deadline: number;
  /** Empty-result attempt this belongs to (0 = first), for AI observability. */
  attempt: number;
  mode: ScanMode;
  trace: AiTrace;
  /** The hosted prompt this attempt used, linked on its generation. */
  promptRef: ResolvedPrompt;
}

// The prompt as the text blocks ahead of the image. Claude gets the shared part
// and the user's settings as two blocks, the first cached for everyone; a
// template without a shared part is cached whole, per user. Other models get
// the one block they always did, the same text either way.
function promptBlocks(prompt: BuiltPrompt, claude: boolean) {
  if (!claude) return [{ type: 'text', text: prompt.text }];
  if (!prompt.personal) {
    return [{ type: 'text', text: prompt.text, cache_control: PER_USER_PROMPT_CACHE }];
  }
  return [
    { type: 'text', text: prompt.shared, cache_control: SHARED_PROMPT_CACHE },
    { type: 'text', text: prompt.personal },
  ];
}

// Sends the receipt image + prompt to OpenRouter and returns the raw output.
async function completeScan(
  body: ScanRequest,
  env: Env,
  reqId: string,
  opts: AttemptOptions,
  choice: ModelChoice,
  mime: string,
): Promise<string> {
  const { model } = choice;
  // Claude takes no temperature: the empty-result retry resamples it anyway.
  const temperature = choice.byok ? undefined : opts.temperature;
  const dataUrl = `data:${mime};base64,${body.image}`;
  // Resolution hint attached only when set (see Env.IMAGE_DETAIL).
  const detail = env.IMAGE_DETAIL?.trim();
  const imageUrl: { url: string; detail?: string } = detail
    ? { url: dataUrl, detail }
    : { url: dataUrl };

  // Never outlive the shared budget: a late attempt gets whatever is left of it.
  const remaining = opts.deadline - Date.now();
  if (remaining <= 0) throw new Error('inference_budget_exhausted');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(INFERENCE_TIMEOUT_MS, remaining));
  const promptCache = choice.byok ? (opts.prompt.personal ? 'shared' : 'per_user') : undefined;
  if (promptCache === 'per_user') {
    const { name, version } = opts.promptRef;
    const key = `${name}@${version ?? 'bundled'}`;
    if (!reportedUnsharedPrompts.has(key)) {
      reportedUnsharedPrompts.add(key);
      logError('prompt_cache_per_user', { reqId, prompt: name, version });
    }
  }
  const calledAt = Date.now();
  let httpStatus: number | undefined;
  let usage: OpenRouterUsage | undefined;
  let failure: string | undefined;
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // OpenRouter app attribution: the referer is the app's identity there
        // and the title its display name, so this names the app, not the Worker.
        'HTTP-Referer': 'https://money2time.com',
        'X-Title': 'Money2Time',
      },
      signal: controller.signal,
      body: JSON.stringify({
        // No response_format/structured outputs: not every provider accepts it.
        // The prompt pins JSON-only output and the parsers tolerate fences/prose.
        model,
        ...(choice.byok ? { provider: ANTHROPIC_ONLY } : { temperature }),
        max_tokens: opts.maxTokens,
        // Receipt parsing is a mechanical OCR/extraction task, so disable
        // reasoning: on reasoning-capable models the chain-of-thought would
        // otherwise be billed as output tokens and add latency for no accuracy
        // gain. OpenRouter normalizes this across model families.
        reasoning: { enabled: false },
        // Usage accounting adds the real USD cost to `usage`, which the
        // PostHog generation records instead of re-pricing from tokens.
        usage: { include: true },
        messages: [{ role: 'user', content: [
          ...promptBlocks(opts.prompt, choice.byok),
          { type: 'image_url', image_url: imageUrl },
        ] }],
      }),
    });

    httpStatus = res.status;
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
      usage?: OpenRouterUsage;
    };
    usage = completion?.usage;
    if (choice.byok && usage?.is_byok === false) {
      byokBroken = true;
      logError('byok_billed_to_credits', { reqId, model });
    } else if (choice.byok && typeof usage?.is_byok !== 'boolean') {
      // Nothing to check against: who paid for this call is unknown.
      logError('byok_unverified', { reqId, model });
    }
    const content = completion?.choices?.[0]?.message?.content ?? '';
    // An answer with no JSON in it parses as no transactions, which is the
    // empty result rather than a failure, and would stop at Claude. From Claude
    // it is a failure, so the backup model gets the receipt.
    if (choice.byok && extractParsedObject(content) === null) {
      throw new Error('answer held no JSON object');
    }
    return content;
  } catch (err) {
    failure = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    clearTimeout(timer);
    opts.trace.recordGeneration({
      model,
      spanName: `receipt_scan_${opts.mode}`,
      startedAt: calledAt,
      endedAt: Date.now(),
      httpStatus,
      usage,
      temperature,
      maxTokens: opts.maxTokens,
      isBackupModel: choice.isBackup,
      attempt: opts.attempt,
      prompt: opts.promptRef,
      promptCache,
      error: failure,
    });
  }
}

// Tries each model in order, retrying on any error; rethrows the last failure.
async function completeWithFailover(
  body: ScanRequest,
  env: Env,
  reqId: string,
  opts: AttemptOptions,
  validateContent?: (content: string) => void,
): Promise<string> {
  const imageType = sniffImageMime(body.image ?? '');
  const mime = imageType ?? (body.mime?.trim().toLowerCase() || 'image/jpeg');
  const models = resolveModels(env, imageType);
  let lastError: unknown;
  for (let i = 0; i < models.length; i += 1) {
    const choice = models[i];
    const { model } = choice;
    // A model with another behind it stops short of the deadline, keeping
    // BACKUP_RESERVE_MS (or half of what is left) for the next one.
    const remaining = opts.deadline - Date.now();
    const deadline =
      i < models.length - 1
        ? opts.deadline - Math.min(BACKUP_RESERVE_MS, Math.max(0, remaining / 2))
        : opts.deadline;
    try {
      const content = await completeScan(body, env, reqId, { ...opts, deadline }, choice, mime);
      validateContent?.(content);
      return content;
    } catch (err) {
      const failure = err;
      lastError = failure;
      // Read the clock after the attempt, not before it: the attempt is what
      // spends the budget, so a check made at loop entry can wave through a
      // model that then throws inference_budget_exhausted, burying this error.
      const willRetry = i < models.length - 1 && Date.now() < opts.deadline;
      logError('inference_model_failed', {
        reqId,
        model,
        isBackup: choice.isBackup,
        byok: choice.byok,
        willRetry,
        error: failure instanceof Error ? failure.message : String(failure),
      });
      if (!willRetry) break;
    }
  }
  throw lastError;
}

async function runInference(
  body: ScanRequest,
  env: Env,
  reqId: string,
  mode: ScanMode,
  now: Date,
  deadline: number,
  trace: AiTrace,
): Promise<{
  transactions: ScannedTransaction[];
  receiptDetail: ScannedReceiptDetail | null;
}> {
  const built = await buildReceiptPrompt(
    env,
    body.categories,
    body.currency,
    mode,
    body.accounts ?? [],
  );
  const maxTokens = maxTokensForMode(mode);

  // An empty transactions array is not an error — the failover above never sees
  // it — but it is the flaky answer, so run the whole chain again. The last
  // attempt's result stands either way, so an unreadable receipt still returns
  // 200 with nothing (and burns no quota) rather than failing.
  let last: { transactions: ScannedTransaction[]; receiptDetail: ScannedReceiptDetail | null } = {
    transactions: [],
    receiptDetail: null,
  };
  const emptyRetries = emptyResultRetries(mode);
  for (let attempt = 0; attempt <= emptyRetries; attempt += 1) {
    const attemptStartedAt = Date.now();
    let content: string;
    try {
      content = await completeWithFailover(body, env, reqId, {
        prompt: built,
        maxTokens,
        deadline,
        temperature: attempt === 0 ? 0 : RETRY_TEMPERATURE,
        attempt,
        mode,
        trace,
        promptRef: built.prompt,
      });
    } catch (err) {
      // The first attempt's failure is the request's failure, as before. A
      // later one only ever had an empty result to improve on, so a 429 or a
      // timeout there must not turn "couldn't read it" into "scan failed".
      if (attempt === 0) throw err;
      logError('empty_result_retry_failed', {
        reqId,
        attempt,
        mode,
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }
    const parsed = extractParsedObject(content);
    const transactions = parseTransactions(parsed, now);
    const receiptDetail = mode === 'itemized' ? normalizeReceiptDetail(parsed) : null;
    if (receiptDetail) receiptDetail.date = clampReceiptDate(receiptDetail.date, now);
    trace.annotateLatest({
      parsed_transactions: transactions.length,
      parsed_items: receiptDetail?.items.length ?? 0,
    });
    log('parsed', {
      reqId,
      attempt,
      contentChars: content.length,
      count: transactions.length,
      itemCount: receiptDetail?.items.length ?? 0,
      accountDetected: transactions.some((t) => t.account !== ''),
    });
    last = { transactions, receiptDetail };
    if (transactions.length > 0) break;

    // This attempt's duration is the best estimate of the next one's, so
    // require at least that much left rather than a flat floor — otherwise a
    // slow 40s pass is followed by a retry that gets cut off at 35s.
    const attemptMs = Date.now() - attemptStartedAt;
    const remainingMs = deadline - Date.now();
    const willRetry =
      attempt < emptyRetries && remainingMs >= Math.max(MIN_RETRY_BUDGET_MS, attemptMs);
    log('empty_result', { reqId, attempt, mode, attemptMs, remainingMs, willRetry });
    if (!willRetry) break;
  }
  return last;
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

function parseTransactions(parsed: unknown, now: Date): ScannedTransaction[] {
  const list = (parsed as { transactions?: unknown })?.transactions;
  if (!Array.isArray(list)) return [];

  return list
    .map((row) => normalizeRow(row, now))
    .filter((row): row is ScannedTransaction => row !== null);
}

function extractJsonObject(content: string): string | null {
  const fenced = content.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return fenced.slice(start, end + 1);
}

// How far back a receipt's printed date is trusted; anything older posts today.
const RECEIPT_DATE_MAX_AGE_DAYS = 30;
// "Today" here is UTC but the user's device may be up to a day ahead (and a
// just-printed receipt already carries that local date), so allow a small
// forward window instead of clamping every seemingly future date.
const RECEIPT_DATE_MAX_FUTURE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `date` as a YYYY-MM-DD day key (UTC). */
function dayKeyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// The date a scanned transaction should post on. The model is only asked to
// read a date off the receipt (null when absent); validation happens here, not
// in the app: keep the receipt's date when it falls between 30 days ago and 2
// days ahead (timezone slack), otherwise (absent, unparsable, further in the
// future, or older) use today.
function clampReceiptDate(raw: string | null, now: Date): string {
  const today = dayKeyUtc(now);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today;
  // Date.parse rejects non-calendar days (e.g. 2026-02-30) in strict ISO form.
  if (!Number.isFinite(Date.parse(`${raw}T00:00:00Z`))) return today;
  const oldest = dayKeyUtc(new Date(now.getTime() - RECEIPT_DATE_MAX_AGE_DAYS * DAY_MS));
  const newest = dayKeyUtc(new Date(now.getTime() + RECEIPT_DATE_MAX_FUTURE_DAYS * DAY_MS));
  // Day-key strings compare chronologically.
  return raw > newest || raw < oldest ? today : raw;
}

function normalizeRow(input: unknown, now: Date): ScannedTransaction | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const amount = coerceAmount(row.amount);
  if (amount === null) return null;

  const type = row.type === 'income' ? 'income' : 'expense';
  const sentiment =
    row.sentiment === 'happy' || row.sentiment === 'sad' ? row.sentiment : 'neutral';
  const date = clampReceiptDate(typeof row.date === 'string' ? row.date : null, now);

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
