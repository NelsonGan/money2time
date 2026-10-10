// Anthropic list prices and the cost of one `claude -p` session, cache included.
//
// `claude -p` caches the prompt: it writes it to the prompt cache (1-hour TTL by
// default) and reads it back on a later turn or a repeat prefix. Those tokens bill
// at their own rates, so pricing every prompt token as plain input is wrong in both
// directions (writes cost more, reads far less). The CLI's own `total_cost_usd`
// is no substitute: for models it does not list yet it reports `costBasis:
// "unknown"` and came out ~40x above the cache-inclusive list price for Haiku 5.5.
//
// Source: the Claude API model table and prompt-caching economics, checked
// 2026-10-09. USD per million tokens, prompts up to 100K tokens. Cache writes are
// 1.25x input (5-minute TTL) or 2x (1-hour); reads are 0.1x input, except Opus 5.5
// (0.05x, $0.20) and Fable 5.1 (0.025x, $0.25).

const WRITE_5M = 1.25;
const WRITE_1H = 2;

export const ANTHROPIC_PRICES = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
};

/** Strip a date suffix or context tag so `claude-opus-5-5[1m]` / dated ids price like the base id. */
const baseId = (model) => model.replace(/\[.*\]$/, '').replace(/-\d{8}$/, '');

/**
 * Token breakdown and cost of one `claude -p` result.
 *
 * Per-model token counts come from `modelUsage`; the split of cache writes into
 * 5-minute and 1-hour TTL comes from the top-level `usage.cache_creation` and is
 * applied proportionally to each model. Returns cost null when a model has no price.
 */
export function costOfClaudeResult(result) {
  const ttl = result.usage?.cache_creation ?? {};
  const w5 = ttl.ephemeral_5m_input_tokens ?? 0;
  const w1 = ttl.ephemeral_1h_input_tokens ?? 0;
  // Without a breakdown, assume the CLI's default 1-hour writes.
  const share1h = w5 + w1 > 0 ? w1 / (w5 + w1) : 1;

  let cost = 0;
  let priced = true;
  const tokens = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, thinking: 0 };
  for (const [model, u] of Object.entries(result.modelUsage ?? {})) {
    const input = u.inputTokens ?? 0;
    const write = u.cacheCreationInputTokens ?? 0;
    const read = u.cacheReadInputTokens ?? 0;
    const output = u.outputTokens ?? 0;
    tokens.input += input;
    tokens.cacheWrite += write;
    tokens.cacheRead += read;
    tokens.output += output;
    tokens.thinking += u.thinkingTokens ?? 0;
    const p = ANTHROPIC_PRICES[baseId(model)];
    if (!p) {
      priced = false;
      continue;
    }
    const writeRate = p.input * (share1h * WRITE_1H + (1 - share1h) * WRITE_5M);
    cost += (input * p.input + write * writeRate + read * p.cacheRead + output * p.output) / 1e6;
  }
  return { cost: priced ? cost : null, tokens };
}

/** What the same tokens would cost sent straight to the API with no prompt caching. */
export function uncachedCost(model, tokens) {
  const p = ANTHROPIC_PRICES[baseId(model)];
  if (!p) return null;
  return (
    ((tokens.input + tokens.cacheWrite + tokens.cacheRead) * p.input + tokens.output * p.output) /
    1e6
  );
}
