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
// Cost: priced per token type at Anthropic list rates by ./anthropicPricing.mjs,
// including the CLI's prompt-cache writes (2x input for its 1-hour TTL) and reads
// (0.1x), because that is what this run actually bills. `costUncached` is the
// same tokens with no caching, the closer match to a one-off Worker call. The
// CLI's own figure is kept as `cliReportedCost` for reference only (wrong for
// models it does not list yet).

import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

import { ANTHROPIC_PRICES, costOfClaudeResult, uncachedCost } from './anthropicPricing.mjs';

export const CLAUDE_CODE_PREFIX = 'claude-code:';

const ATTEMPT_TIMEOUT_MS = 120000;
const SYSTEM_PROMPT = "Follow the user's instructions exactly.";

export const isClaudeCodeModel = (id) => id.startsWith(CLAUDE_CODE_PREFIX);
export const claudeModelId = (id) => id.slice(CLAUDE_CODE_PREFIX.length);

/** Same shape as fetchModelInfo() so the run plan treats both providers alike. */
export function claudeModelInfo(id) {
  const model = claudeModelId(id);
  const price = ANTHROPIC_PRICES[model];
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
      const { cost, tokens } = costOfClaudeResult(result);
      resolve({
        content: result.result ?? '',
        finishReason: result.stop_reason ?? null,
        provider: 'claude-code',
        model,
        usage: {
          // Every prompt token, however it was billed (plain, cache write or cache read).
          promptTokens: tokens.input + tokens.cacheWrite + tokens.cacheRead,
          cacheWriteTokens: tokens.cacheWrite,
          cacheReadTokens: tokens.cacheRead,
          completionTokens: tokens.output,
          reasoningTokens: tokens.thinking,
          cost,
          costUncached: uncachedCost(model, tokens),
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
