// Workers AI: the last model in the chain, run by Cloudflare itself rather
// than through OpenRouter. Every other model goes through OpenRouter, so one
// OpenRouter refusal used to end the scan: on 2026-11-25 it began answering
// "Request path cannot be relayed" (400) to requests from mainland China,
// whose users never reach Claude and had only OpenRouter's Qwen and DeepSeek.
// Workers AI is not refused by where the user is, and it needs no key: the
// `AI` binding in wrangler.toml bills this Cloudflare account.

import type { OpenRouterUsage } from './posthog';

/**
 * The slice of the `AI` binding this Worker uses. Narrower than the generated
 * `Ai` type, whose `run` is typed per model, so tests can stand in for it.
 */
export interface WorkersAiBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

/** Workers AI bills neurons: $0.011 per 1,000 (developers.cloudflare.com/workers-ai/platform/pricing). */
const USD_PER_NEURON = 0.011 / 1000;

interface WorkersAiCompletion {
  choices?: { message?: { content?: unknown } }[];
  response?: unknown;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    neurons?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export interface WorkersAiResult {
  content: string;
  /** In OpenRouter's shape, so the PostHog generation reads it the same way. */
  usage?: OpenRouterUsage;
}

/**
 * One chat completion on Workers AI. Rejects after `timeoutMs`: the binding
 * takes no abort signal, and its queue can hold a request for tens of seconds,
 * so the scan budget is enforced here.
 */
export async function runWorkersAi(
  ai: WorkersAiBinding,
  model: string,
  content: Record<string, unknown>[],
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
): Promise<WorkersAiResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('workers-ai timed out')), timeoutMs);
  });
  try {
    const result = (await Promise.race([
      ai.run(model, {
        messages: [{ role: 'user', content }],
        max_tokens: maxTokens,
        temperature,
        // Reading a receipt needs no reasoning. With it on, Qwen 3.8 and
        // Gemma 4 spent the whole 1,200-token budget thinking and returned
        // nothing on a bank statement and an SMS, and took 7-15 s a scan.
        chat_template_kwargs: { enable_thinking: false },
      }),
      timeout,
    ])) as WorkersAiCompletion | null;
    const text = result?.choices?.[0]?.message?.content ?? result?.response;
    const usage = result?.usage;
    return {
      content: typeof text === 'string' ? text : '',
      usage: usage
        ? {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            cost:
              typeof usage.neurons === 'number' && Number.isFinite(usage.neurons)
                ? usage.neurons * USD_PER_NEURON
                : undefined,
            prompt_tokens_details: usage.prompt_tokens_details,
          }
        : undefined,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
