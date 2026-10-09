// OpenRouter client that sends the exact request the receipt-scanner Worker
// sends (same prompt, body, token budget, temperature and reasoning switch,
// built by the Worker's own buildCompletionBody), plus the Worker's one
// retry on an empty result. The only addition is `usage: { include: true }`,
// which asks OpenRouter to report the cost of the call so a run can price a
// model per scan. Model ids prefixed `claude-code:` go through `claude -p`
// instead (./claudeCode.mjs).

import {
  buildCompletionBody,
  buildReceiptPrompt,
  EMPTY_RESULT_RETRIES,
  maxTokensForMode,
  parseLikeWorker,
  RETRY_TEMPERATURE,
} from './worker.mjs';
import { completeClaudeCode, isClaudeCodeModel } from './claudeCode.mjs';
import { sleep } from './util.mjs';

const OPENROUTER = 'https://openrouter.ai/api/v1';
// Same per-attempt ceiling as INFERENCE_TIMEOUT_MS in the Worker.
const ATTEMPT_TIMEOUT_MS = 45000;

/** Look a model up in OpenRouter's catalogue (no key needed): modalities, pricing, context. */
export async function fetchModelInfo(modelId) {
  const res = await fetch(`${OPENROUTER}/models`);
  if (!res.ok) throw new Error(`OpenRouter /models ${res.status}`);
  const { data } = await res.json();
  const m = data.find((x) => x.id === modelId || x.canonical_slug === modelId);
  if (!m) {
    // Same provider, and the name starts the same way: catches typos like gpt-4o-mni.
    const [provider, name = ''] = modelId.split('/');
    const stem = name.slice(0, Math.max(3, Math.min(6, name.length - 2)));
    const close = data
      .map((x) => x.id)
      .filter((id) => id.startsWith(`${provider}/`) && id.split('/')[1].startsWith(stem))
      .slice(0, 8);
    return { found: false, suggestions: close };
  }
  return {
    found: true,
    id: m.id,
    name: m.name,
    contextLength: m.context_length,
    inputModalities: m.architecture?.input_modalities ?? [],
    acceptsImages: (m.architecture?.input_modalities ?? []).includes('image'),
    pricing: {
      prompt: Number(m.pricing?.prompt ?? 0),
      completion: Number(m.pricing?.completion ?? 0),
      image: Number(m.pricing?.image ?? 0),
    },
  };
}

/** One chat completion with transport retries (429 / 5xx / network / timeout). */
async function complete({ apiKey, body, retries }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    const startedAt = Date.now();
    try {
      const res = await fetch(`${OPENROUTER}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://money2time.com',
          // Distinct from the Worker's title so eval spend is separable in the OpenRouter dashboard.
          'X-Title': 'money2time receipt-scanner eval',
        },
        signal: controller.signal,
        body: JSON.stringify({ ...body, usage: { include: true } }),
      });
      const latencyMs = Date.now() - startedAt;
      const text = await res.text();
      if (!res.ok) {
        lastError = new Error(`openrouter ${res.status}: ${text.slice(0, 300)}`);
        lastError.status = res.status;
        // 4xx other than 408/429 is a request problem (bad model id, no image support): don't retry.
        if (res.status < 500 && res.status !== 408 && res.status !== 429) break;
      } else {
        const json = JSON.parse(text);
        if (json.error) {
          lastError = new Error(`openrouter error: ${JSON.stringify(json.error).slice(0, 300)}`);
        } else {
          return {
            content: json.choices?.[0]?.message?.content ?? '',
            finishReason: json.choices?.[0]?.finish_reason ?? null,
            provider: json.provider ?? null,
            model: json.model ?? body.model,
            usage: {
              promptTokens: json.usage?.prompt_tokens ?? null,
              // Billed `cost` already reflects these: cached reads are discounted, writes may carry a premium.
              cacheReadTokens: json.usage?.prompt_tokens_details?.cached_tokens ?? null,
              cacheWriteTokens: json.usage?.prompt_tokens_details?.cache_write_tokens ?? null,
              completionTokens: json.usage?.completion_tokens ?? null,
              reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens ?? null,
              cost: json.usage?.cost ?? null,
            },
            latencyMs,
            transportRetries: attempt,
          };
        }
      }
    } catch (err) {
      lastError =
        err.name === 'AbortError' ? new Error(`timeout after ${ATTEMPT_TIMEOUT_MS}ms`) : err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(1500 * 2 ** attempt + Math.random() * 500);
  }
  throw lastError;
}

/**
 * Scan one case the way production does. Returns every attempt plus the
 * Worker-normalized result of the last one (what the app would receive).
 */
export async function scanCase({
  apiKey,
  model,
  kase,
  imageBase64,
  now,
  emptyRetry = true,
  retries = 2,
  detail,
}) {
  const prompt = buildReceiptPrompt(
    kase.input.categories,
    kase.input.currency,
    kase.mode,
    kase.input.accounts ?? [],
  );
  const maxTokens = maxTokensForMode(kase.mode);
  const dataUrl = `data:${kase.mime};base64,${imageBase64}`;
  const attempts = [];
  let final = null;
  const maxAttempts = emptyRetry ? EMPTY_RESULT_RETRIES + 1 : 1;
  for (let i = 0; i < maxAttempts; i += 1) {
    const body = buildCompletionBody({
      model,
      prompt,
      dataUrl,
      detail,
      maxTokens,
      temperature: i === 0 ? 0 : RETRY_TEMPERATURE,
    });
    let result;
    try {
      result = isClaudeCodeModel(model)
        ? await completeClaudeCode({ model, prompt, mime: kase.mime, imageBase64, retries })
        : await complete({ apiKey, body, retries });
    } catch (err) {
      // Like the Worker: a failed first attempt fails the scan; a failed retry keeps the empty first answer.
      attempts.push({ error: String(err.message ?? err), status: err.status ?? null });
      if (i === 0) return { ok: false, error: String(err.message ?? err), attempts, final: null };
      break;
    }
    const parsed = parseLikeWorker(result.content, kase.mode, now);
    attempts.push({
      ...result,
      // claude -p cannot set a temperature, so its retry is a plain resample.
      temperature: isClaudeCodeModel(model) ? null : body.temperature,
      count: parsed.transactions.length,
    });
    final = { content: result.content, ...parsed };
    if (parsed.transactions.length > 0) break;
  }
  return { ok: true, attempts, final };
}
