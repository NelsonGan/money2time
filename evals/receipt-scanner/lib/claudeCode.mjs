// A second provider for the model under test: an Anthropic model run through
// Claude Code's programmatic mode (`claude -p`), selected with a model id like
// `claude-code:claude-haiku-5-5`. It needs no OpenRouter key and checks the
// pipeline end to end against a first-party model.
//
// The request is kept as close to the Worker's as the CLI allows:
//   - the Worker's own prompt and the image go in ONE user message, the image as
//     an inline base64 block (stream-json input), never a file the model must Read;
//   - no tools, no CLAUDE.md/settings/skills/MCP, and a one-line system prompt
//     (production sends none; the CLI's default would be a coding-agent prompt);
//   - as little thinking as the CLI allows. The Worker sends `reasoning: {enabled: false}`,
//     but the CLI cannot disable thinking on a model it does not list yet
//     (Haiku 5.5 logs `unrecognized_model`): MAX_THINKING_TOKENS=0 and a
//     settings override were both ignored in testing, while `--effort low` cut
//     ~600 thinking tokens a scan to 0-140. Thinking is billed as output, so it is
//     in the cost below, and the report shows the mean thinking tokens.
// The CLI cannot set temperature or max_tokens. Current Anthropic models reject
// non-default sampling anyway, and receipt answers are far below any cap.
//
// Cost: the CLI writes the prompt to a one-hour cache and prices it from its own
// table, which lags new models (it reports `costBasis: "unknown"` for Haiku 5.5
// and guesses high). A direct API call like the Worker's pays list price for
// every prompt token, so cost is recomputed from the token counts below.

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

export const CLAUDE_CODE_PREFIX = 'claude-code:';

// Anthropic first-party list prices in USD per million tokens, for prompts up to
// 100K tokens (receipt prompts are ~2K). Source: Claude API model table, checked 2026-10-09.
const PRICES = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
};

const ATTEMPT_TIMEOUT_MS = 120000;
const SYSTEM_PROMPT = "Follow the user's instructions exactly.";

export const isClaudeCodeModel = (id) => id.startsWith(CLAUDE_CODE_PREFIX);
export const claudeModelId = (id) => id.slice(CLAUDE_CODE_PREFIX.length);

/** Same shape as fetchModelInfo() so the run plan treats both providers alike. */
export function claudeModelInfo(id) {
  const model = claudeModelId(id);
  const price = PRICES[model];
  return {
    found: true,
    id,
    name: `${model} via claude -p`,
    acceptsImages: true,
    inputModalities: ['text', 'image'],
    // Per-token, like OpenRouter's pricing fields.
    pricing: price ? { prompt: price.input / 1e6, completion: price.output / 1e6, image: 0 } : null,
  };
}

function runOnce({ model, prompt, mime, imageBase64 }) {
  const message = {
    type: 'user',
    message: {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image', source: { type: 'base64', media_type: mime, data: imageBase64 } },
      ],
    },
  };
  const args = [
    '-p',
    '--model',
    model,
    '--effort',
    'low',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    '--tools',
    '',
    '--system-prompt',
    SYSTEM_PROMPT,
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
  ];
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn('claude', args, {
      cwd: tmpdir(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, MAX_THINKING_TOKENS: '0' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`timeout after ${ATTEMPT_TIMEOUT_MS}ms`));
    }, ATTEMPT_TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT' ? new Error('`claude` CLI not found on PATH') : err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const result = stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .find((event) => event?.type === 'result');
      if (!result)
        return reject(
          new Error(`claude exited ${code} without a result: ${(stderr || stdout).slice(-400)}`),
        );
      if (result.is_error)
        return reject(
          new Error(`claude error: ${String(result.result ?? result.subtype).slice(0, 300)}`),
        );
      const usage = Object.values(result.modelUsage ?? {})[0] ?? {};
      const promptTokens =
        (usage.inputTokens ?? 0) +
        (usage.cacheCreationInputTokens ?? 0) +
        (usage.cacheReadInputTokens ?? 0);
      const completionTokens = usage.outputTokens ?? 0;
      const price = PRICES[model];
      resolve({
        content: result.result ?? '',
        finishReason: result.stop_reason ?? null,
        provider: 'claude-code',
        model,
        usage: {
          promptTokens,
          completionTokens,
          reasoningTokens: usage.thinkingTokens ?? null,
          cost: price ? (promptTokens * price.input + completionTokens * price.output) / 1e6 : null,
          cliReportedCost: result.total_cost_usd ?? null,
        },
        latencyMs: result.duration_ms ?? Date.now() - startedAt,
      });
    });
    child.stdin.end(`${JSON.stringify(message)}\n`);
  });
}

/** One completion with retries, the claude -p counterpart of the OpenRouter call. */
export async function completeClaudeCode({ model, prompt, mime, imageBase64, retries }) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return {
        ...(await runOnce({ model: claudeModelId(model), prompt, mime, imageBase64 })),
        transportRetries: attempt,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
