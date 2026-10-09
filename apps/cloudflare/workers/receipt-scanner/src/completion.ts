// The I/O-free half of a scan: the OpenRouter request body index.ts sends, and
// the parse that turns the model's reply into the transactions the app gets.
// Kept apart from index.ts so the local model eval (apps/cloudflare/evals)
// imports exactly what production runs instead of a copy that could drift.

// Vision models are flaky in one specific way: they occasionally return an
// empty transactions array for a receipt they read perfectly well on a second
// pass. One empty result therefore buys exactly one more attempt.
export const EMPTY_RESULT_RETRIES = 1;
// The first attempt runs at 0 for a stable, reproducible read. A retry at 0
// would largely resample the same path and reproduce the same empty answer, so
// the retry nudges the sampler just far enough to land somewhere else.
export const RETRY_TEMPERATURE = 0.2;

export interface ScannedTransaction {
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

export interface CompletionRequest {
  model: string;
  prompt: string;
  /** data: URL of the receipt image. */
  dataUrl: string;
  /** Optional OpenAI-style image_url.detail hint ("low" | "high" | "auto"). */
  detail?: string;
  maxTokens: number;
  temperature: number;
}

// The chat-completions body for one scan attempt.
export function buildCompletionBody(req: CompletionRequest): Record<string, unknown> {
  const imageUrl: { url: string; detail?: string } = req.detail
    ? { url: req.dataUrl, detail: req.detail }
    : { url: req.dataUrl };
  return {
    // No response_format/structured outputs: not every provider accepts it.
    // The prompt pins JSON-only output and the parsers tolerate fences/prose.
    model: req.model,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    // Receipt parsing is a mechanical OCR/extraction task, so disable
    // reasoning: on reasoning-capable models the chain-of-thought would
    // otherwise be billed as output tokens and add latency for no accuracy
    // gain. OpenRouter normalizes this across model families.
    reasoning: { enabled: false },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: req.prompt },
          { type: 'image_url', image_url: imageUrl },
        ],
      },
    ],
  };
}

/** A line amount as a positive finite number, or null when unusable. */
function coerceAmount(value: unknown): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Tolerant parse: extract the first {...} block (models add fences/prose).
export function extractParsedObject(content: string): unknown {
  const raw = extractJsonObject(content);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseTransactions(parsed: unknown, now: Date): ScannedTransaction[] {
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
export function clampReceiptDate(raw: string | null, now: Date): string {
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
