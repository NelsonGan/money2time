// Receipt-scan prompts, hosted in PostHog prompt management so they can be read
// next to their `$ai_generation` traces and edited without a deploy.
//
// Each prompt lives in PostHog (project 658608) under the name in PROMPT_NAMES,
// and the Worker serves the version the `production` label points at. The
// bundled copies below are the fallback, so a missing key, a PostHog outage or
// a deleted prompt degrades to exactly the prompts this Worker shipped with,
// never to a failed scan. Edit a prompt in PostHog, check it, then move the
// `production` label; keep the bundled copy in sync when a change should
// survive a PostHog outage (tests and reviews read the bundled one).
//
// Variables use PostHog's `{{name}}` syntax and are filled in one pass, so a
// user's category or account name that happens to contain `{{…}}` is inserted
// as text rather than expanded.

export const PROMPT_NAMES = {
  quick: 'receipt-scan-quick',
  itemized: 'receipt-scan-itemized',
  screenshot: 'receipt-scan-screenshot',
  screenshotAccounts: 'receipt-scan-screenshot-accounts',
} as const;

export type PromptName = (typeof PROMPT_NAMES)[keyof typeof PROMPT_NAMES];

export interface PromptEnv {
  /** Public project token (sent as `token`, as PostHog's SDKs do). */
  POSTHOG_PROJECT_TOKEN?: string;
  /** Personal API key with only the `llm_prompt:read` scope. Unset serves the bundled prompts. */
  POSTHOG_PROMPTS_API_KEY?: string;
  /** App host for the prompts API (not the ingestion host). */
  POSTHOG_APP_HOST?: string;
}

export interface ResolvedPrompt {
  name: PromptName;
  template: string;
  /** PostHog version number; null for the bundled fallback. */
  version: number | null;
  source: 'posthog' | 'bundled';
}

const PROMPTS_PROJECT_ID = 658608;
const DEFAULT_APP_HOST = 'https://us.posthog.com';
const PROMPT_LABEL = 'production';
/**
 * A label move reaches the Worker within 30 minutes. Every fetch is a billable
 * `$llm_prompt_fetched` event, and at 5 minutes the edge cache still logged
 * ~37,000 a month (about one per prompt per Cloudflare location per refresh).
 */
const CACHE_TTL_MS = 30 * 60 * 1000;
/** After a failed refresh, keep serving what we have for a minute before retrying. */
const RETRY_AFTER_FAILURE_MS = 60 * 1000;
/** A prompt fetch must never eat into the scan's own time budget. */
const FETCH_TIMEOUT_MS = 2000;

export const BUNDLED_PROMPTS: Record<PromptName, string> = {
  'receipt-scan-quick': `You are a receipt-parsing engine for a personal finance app, given an image of one or more receipts. Return ONLY minified JSON — a single line, no extra whitespace, no prose, no markdown, no code fences.

Emit exactly ONE transaction per receipt (one array element each). Never split a single receipt into multiple rows; if the image holds several separate receipts, emit one element per receipt.

## Finding the total (the most common mistake)
The final total is what the customer actually paid, AFTER tax, tip and discounts — usually the largest money figure near the bottom, labelled TOTAL, GRAND TOTAL, AMOUNT DUE, BALANCE DUE, or the amount charged to the card. If both a SUBTOTAL and a TOTAL are printed, use the TOTAL. Ignore SUBTOTAL, individual TAX/VAT/GST lines, AMOUNT TENDERED / CASH / CARD / PAID, CHANGE, loyalty balances, and per-item unit prices.

## Output schema
{"transactions":[{"type":"expense","amount":0.00,"currency":"{{currency_code}}","date":"YYYY-MM-DD","category":"Other","note":"string"}]}

- type: "expense" | "income" — receipts are almost always "expense".
- amount: the receipt's FINAL TOTAL. Number only, 2 decimals, "." decimal separator, strip currency symbols and thousands separators (e.g. "1.234,56" -> 1234.56).
- currency: ALWAYS "{{currency_code}}". Never detect or convert currency.
- date: "YYYY-MM-DD" from the receipt. If only day/month show, infer the most recent plausible year; null if absent.
- note: the merchant name (e.g. "Walmart").

## Allowed categories (pick the single best fit — value must match EXACTLY, case included)
{{allowed_categories}}
If nothing fits well, use "Other" when present, otherwise the closest general-purpose category. Never invent a category.

If the image has no readable receipt, return {"transactions":[]}.`,

  'receipt-scan-itemized': `You are a receipt-parsing engine for a personal finance app, given an image of one or more receipts. Return ONLY minified JSON — a single line, no extra whitespace, no prose, no markdown, no code fences.

1. Emit exactly ONE transaction per receipt (the "transactions" array).
2. When the image holds exactly ONE receipt, ALSO emit a "receiptDetail" object listing its line items. Omit "receiptDetail" entirely for multi-receipt images or when there is no readable receipt.

## Finding the total (for the transaction amount)
The final total is what the customer actually paid, AFTER tax, tip and discounts — usually the largest money figure near the bottom, labelled TOTAL, GRAND TOTAL, AMOUNT DUE, BALANCE DUE, or the amount charged to the card. If both a SUBTOTAL and a TOTAL are printed, use the TOTAL. Ignore SUBTOTAL, tax/VAT/GST lines, AMOUNT TENDERED / CASH / CARD / CHANGE, and loyalty balances.

## Output schema
{"transactions":[{"type":"expense","amount":0.00,"currency":"{{currency_code}}","date":"YYYY-MM-DD","category":"Other","note":"string"}],"receiptDetail":{"merchant":"string","date":"YYYY-MM-DD","currency":"USD","items":[{"name":"string","quantity":1,"lineTotal":0.00,"confidence":"high"}],"itemsConfidence":"high"}}

- transactions[].amount/currency follow the total rules above; "currency" is ALWAYS "{{currency_code}}".
- receiptDetail.currency: the ISO code detected from the receipt's own symbols/labels (e.g. "MYR", "JPY"); null when unsure — never guess.
- items: one entry per purchased line, top to bottom. ALWAYS include "quantity": the printed count of units on that line (a whole number when the receipt shows "2", "3x", "2 @", etc.; default 1; a weight like 0.45 is allowed). "lineTotal" is that line's total pre-tax cost for ALL its units (fold in any per-item discount), number only, 2 decimals. Do NOT include subtotal, tax, service charge, tips, receipt-level discounts, rounding, change, loyalty points, or payment lines as items — the app adds tax/service itself.
- "confidence" / "itemsConfidence": "high" | "low" ("low" when hard to read). If the item section is unreadable, return "items":[] with "itemsConfidence":"low". Never invent items.
- date fields: "YYYY-MM-DD"; infer the recent plausible year from a day/month; null if absent.

## Allowed categories (pick the single best fit — value must match EXACTLY, case included)
{{allowed_categories}}
If nothing fits well, use "Other" when present, otherwise the closest general-purpose category. Never invent a category.

If the image has no readable receipt, return {"transactions":[]} with no "receiptDetail".`,

  'receipt-scan-screenshot': `You are a transaction-parsing engine for a personal finance app, given a screenshot from a phone: a bank or card app, a payment/wallet confirmation (PayPal, Apple Pay, GCash, etc.), a transfer receipt, a purchase notification, or a photo of a paper receipt. Return ONLY minified JSON — a single line, no extra whitespace, no prose, no markdown, no code fences.

Emit ONE transaction for the payment the screenshot is about (one array element). Most screenshots show a single payment — emit just that one. Only when the image is clearly a list of several distinct payments should you emit one element per row.

Every transaction is an "expense" — the app records these as money spent. Report the magnitude of the payment as a positive amount and always set "type" to "expense".

## Finding the amount
Use the amount actually transacted — the total charged or sent. On a paper receipt that is the final TOTAL after tax, tip and discounts (ignore SUBTOTAL, tax lines, AMOUNT TENDERED / CASH / CARD / PAID, and CHANGE). On a payment or banking screen it is the headline amount of the payment. Number only, 2 decimals, "." decimal separator, strip currency symbols and thousands separators (e.g. "1.234,56" -> 1234.56).

## Output schema
{"transactions":[{"type":"expense","amount":0.00,"currency":"{{currency_code}}","date":"YYYY-MM-DD","category":"Other","note":"string","account":""}]}

- type: ALWAYS "expense".
- amount: per the amount rule above.
- currency: ALWAYS "{{currency_code}}". Never detect or convert currency.
- date: "YYYY-MM-DD" from the screen. If only day/month show, infer the most recent plausible year; null if absent.
- note: the merchant, payee, or payer shown (e.g. "Walmart", "John Smith").
- account: per the account rules below; "" when unknown.

## Allowed categories (pick the single best fit — value must match EXACTLY, case included)
{{allowed_categories}}
If nothing fits well, use "Other" when present, otherwise the closest general-purpose category. Never invent a category.

{{accounts_section}}

If the image shows no readable payment or receipt, return {"transactions":[]}.`,

  'receipt-scan-screenshot-accounts': `## Detecting the account (the payment source)
Screenshots usually show WHERE the money moved: a card ("Visa ••1234", "•• 4242"), a bank or account name ("Chase Checking"), or a wallet/app ("GCash", "PayPal", "Apple Pay"). If the source shown clearly corresponds to exactly ONE of the user's accounts below, set "account" to that account's name — the value must match EXACTLY, case included. If no source is shown, or no listed account is a clear match, set "account" to "". Never invent an account name and never guess between two candidates.

### User's accounts (choose the single clear match, or "")
{{allowed_accounts}}`,
};

/** The accounts section when the app sent no account names: nothing to match. */
export const NO_ACCOUNTS_SECTION = `## Detecting the account
Always set "account" to "".`;

/** Fill `{{name}}` variables in one pass; unknown variables are left as written. */
export function compilePrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match,
  );
}

interface CacheEntry {
  template: string;
  version: number;
  fetchedAt: number;
  /** After a failed refresh, the next network attempt waits until this time. */
  retryAt: number;
}

// Per-isolate cache, for the requests one isolate serves back to back.
const cache = new Map<PromptName, CacheEntry>();

// Cloudflare starts and retires isolates so often that the map above alone
// missed on almost every scan: the first day live logged 743 prompt fetches
// (each one a `$llm_prompt_fetched` event in PostHog) against 744 model calls.
// The data centre's cache sits between the two, shared by every isolate in the
// location, so PostHog is asked about once per prompt per location per cache
// period (CACHE_TTL_MS). The key is a URL on the Worker's own hostname that is never served.
const EDGE_CACHE_HOST = 'https://workers-receipt-scanner.money2time.com/__prompt-cache/';

function edgeCache(): Cache | null {
  try {
    return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

async function readEdgeCache(
  name: PromptName,
): Promise<{ template: string; version: number } | null> {
  const edge = edgeCache();
  if (!edge) return null;
  try {
    const hit = await edge.match(new Request(`${EDGE_CACHE_HOST}${name}`));
    if (!hit) return null;
    const body = (await hit.json()) as { template?: unknown; version?: unknown };
    if (typeof body.template !== 'string' || typeof body.version !== 'number') return null;
    return { template: body.template, version: body.version };
  } catch {
    return null;
  }
}

async function writeEdgeCache(name: PromptName, prompt: { template: string; version: number }) {
  const edge = edgeCache();
  if (!edge) return;
  try {
    await edge.put(
      new Request(`${EDGE_CACHE_HOST}${name}`),
      new Response(JSON.stringify(prompt), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `max-age=${CACHE_TTL_MS / 1000}`,
        },
      }),
    );
  } catch {
    // The edge cache is an optimisation; the isolate's own copy still serves.
  }
}

async function fetchPrompt(
  env: PromptEnv,
  name: PromptName,
): Promise<{ template: string; version: number } | null> {
  const key = env.POSTHOG_PROMPTS_API_KEY?.trim();
  if (!key) return null;
  const host = (env.POSTHOG_APP_HOST?.trim() || DEFAULT_APP_HOST).replace(/\/$/, '');
  const params = new URLSearchParams({ label: PROMPT_LABEL });
  const token = env.POSTHOG_PROJECT_TOKEN?.trim();
  if (token) params.set('token', token);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${host}/api/projects/${PROMPTS_PROJECT_ID}/llm_prompts/name/${encodeURIComponent(name)}/?${params}`,
      { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal },
    );
    if (!res.ok) {
      console.error(JSON.stringify({ event: 'prompt_fetch_failed', name, status: res.status }));
      return null;
    }
    const body = (await res.json()) as { prompt?: unknown; version?: unknown };
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) return null;
    return {
      template: body.prompt,
      version: typeof body.version === 'number' ? body.version : 0,
    };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'prompt_fetch_failed',
        name,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The template for `name`: PostHog's `production` version, cached for
 * CACHE_TTL_MS, served stale while a refresh fails, and the bundled copy when
 * PostHog never answered.
 */
export async function resolvePrompt(
  env: PromptEnv,
  name: PromptName,
  now: number = Date.now(),
): Promise<ResolvedPrompt> {
  const cached = cache.get(name);
  if (cached && (now - cached.fetchedAt < CACHE_TTL_MS || now < cached.retryAt)) {
    return { name, template: cached.template, version: cached.version, source: 'posthog' };
  }
  const shared = await readEdgeCache(name);
  if (shared) {
    cache.set(name, { ...shared, fetchedAt: now, retryAt: 0 });
    return { name, template: shared.template, version: shared.version, source: 'posthog' };
  }
  const fetched = await fetchPrompt(env, name);
  if (fetched) {
    cache.set(name, { ...fetched, fetchedAt: now, retryAt: 0 });
    await writeEdgeCache(name, fetched);
    return { name, template: fetched.template, version: fetched.version, source: 'posthog' };
  }
  if (cached) {
    cached.retryAt = now + RETRY_AFTER_FAILURE_MS;
    return { name, template: cached.template, version: cached.version, source: 'posthog' };
  }
  return { name, template: BUNDLED_PROMPTS[name], version: null, source: 'bundled' };
}

/** Test hook: forget cached prompts. */
export function clearPromptCache(): void {
  cache.clear();
}
