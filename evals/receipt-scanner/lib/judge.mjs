// Opus as the judge, through Claude Code's programmatic mode (`claude -p`).
//
// Each case is one headless, tool-restricted session: the judge may only Read
// files in the dataset folder (so it can look at the receipt image itself),
// loads no CLAUDE.md, settings, skills or MCP servers, and must answer in the
// rubric's JSON schema (--json-schema). It is blind to which model produced
// the answer. Judgements are cached on disk by a hash of everything that could
// change them, so re-running a model, or re-scoring after a report tweak,
// never pays for the same judgement twice.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { judgeSchema, RUBRIC_VERSION, RUBRICS, SCALE, weightedScore } from './rubric.mjs';
import { sha } from './util.mjs';

const JUDGE_TIMEOUT_MS = 240000;
const MAX_RAW_CHARS = 12000;

const APP_CONTEXT = {
  quick:
    'Quick receipt scan: the user snaps a receipt and the app pre-fills an expense (amount, date, category, merchant) from the result. Users usually save without re-checking, so a wrong total silently corrupts their records.',
  itemized:
    'Split by Item: the user scans a receipt to split it among friends. The app shows receiptDetail.items for assignment to people, then adds tax/service itself proportionally, so items must be the purchased lines at pre-tax prices. The transaction amount pre-fills the expense.',
  screenshot:
    'Screenshot auto-log: the user shares a payment screenshot (bank app, wallet, notification, email, order, or a receipt photo) and the app logs it automatically with no review screen, posting to the matched account. A wrong account or amount goes straight into their books.',
};

function systemPrompt(mode) {
  const criteria = RUBRICS[mode]
    .map((c) => `- ${c.key} (weight ${c.weight}) — ${c.title}: ${c.guide}`)
    .join('\n');
  return `You are a meticulous, strict evaluator of a vision model used inside money2time, a personal finance app. The model reads an image and must return JSON that the app turns into transactions.

Feature under test (${mode} mode): ${APP_CONTEXT[mode]}

${SCALE}

Criteria for ${mode} mode:
${criteria}

Rules:
- The answer key is authoritative: it was generated from the same data that was rendered into the image. Use the deterministic checks as established facts (they compare numbers exactly).
- You may open the image with the Read tool to resolve anything the answer key does not settle (e.g. whether a merchant spelling is faithful, whether text is genuinely illegible, whether a category is defensible). If the case has no answer key, read the image and judge from it directly.
- Judge the model's RAW output for what the model did, and the Worker-normalized output for what the app receives. Never penalise the model for the Worker's deliberate date clamp.
- When the correct answer is an empty transactions list (no receipt / not a payment): score every criterion 4 if the raw output has no transactions (and no receiptDetail). If the raw output only had rows the Worker drops (amount 0 or missing), so the app receives nothing, score every criterion 3 (harmless to the user but a sign of confusion). If any transaction or a receiptDetail reaches the app (Worker-normalized output), score every criterion 0.
- If the output is unparseable or missing entirely, every criterion is 0.
- Do not reward length or explanation. Do not guess which model produced the answer.
- critical_errors: short labels for errors that would corrupt the user's data (e.g. "wrong_total: used cash tendered 100.00", "wrong_account", "hallucinated_transaction", "split_receipt"). Empty array if none.
- user_would_accept: true only if a careful user would save every transaction exactly as returned.
- summary: one or two sentences on what the model got right and wrong.`;
}

function userPrompt(kase, scan, checks, imagePath) {
  const final = scan.final;
  const payload = {
    case: {
      id: kase.id,
      mode: kase.mode,
      difficulty: kase.difficulty,
      tags: kase.tags,
      notes: kase.notes,
    },
    image: imagePath,
    request: {
      currency: kase.input.currency,
      allowedCategories: kase.input.categories,
      ...(kase.mode === 'screenshot' ? { userAccounts: kase.input.accounts ?? [] } : {}),
    },
    answerKey: kase.expect ?? 'none: judge from the image',
    modelRawOutput: scan.ok ? String(final.content).slice(0, MAX_RAW_CHARS) : null,
    workerNormalizedOutput: scan.ok
      ? { transactions: final.transactions, receiptDetail: final.receiptDetail ?? undefined }
      : null,
    scanError: scan.ok ? undefined : scan.error,
    emptyResultRetryUsed: scan.ok && scan.attempts.length > 1,
    deterministicChecks: checks,
  };
  return `Grade this ${kase.mode}-mode answer. The image is at ${imagePath}.\n\n${JSON.stringify(payload, null, 2)}`;
}

function runClaude({ args, input, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`judge timed out after ${JUDGE_TIMEOUT_MS / 1000}s`));
    }, JUDGE_TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        err.code === 'ENOENT'
          ? new Error('`claude` CLI not found on PATH (needed for the Opus judge)')
          : err,
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0)
        return reject(new Error(`claude exited ${code}: ${(stderr || stdout).slice(0, 500)}`));
      resolve(stdout);
    });
    child.stdin.end(input);
  });
}

export function judgeCacheKey({ kase, scan, checks, judgeModel }) {
  return sha({
    v: RUBRIC_VERSION,
    // Any change to the judge's instructions invalidates old verdicts.
    prompt: sha(systemPrompt(kase.mode)),
    judgeModel,
    id: kase.id,
    imageSha: kase.imageSha,
    expect: kase.expect ?? null,
    notes: kase.notes,
    raw: scan.ok ? scan.final.content : scan.error,
    retry: scan.ok ? scan.attempts.length : 0,
    // The judge reads the checks as evidence, so a change to the check logic re-judges.
    checks,
  });
}

/** Judge one case; returns { scores, score, critical_errors, user_would_accept, summary, cost, model, cached }. */
export async function judgeCase({
  kase,
  scan,
  checks,
  datasetDir,
  cacheDir,
  judgeModel = 'claude-opus-5-5',
}) {
  const key = judgeCacheKey({ kase, scan, checks, judgeModel });
  const cacheFile = path.join(cacheDir, `${key.slice(0, 32)}.json`);
  if (existsSync(cacheFile))
    return { ...JSON.parse(readFileSync(cacheFile, 'utf8')), cached: true };

  const imagePath = path.join(datasetDir, kase.imageFile);
  const args = [
    '-p',
    '--model',
    judgeModel,
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(judgeSchema(kase.mode)),
    '--system-prompt',
    systemPrompt(kase.mode),
    '--tools',
    'Read',
    '--allowedTools',
    'Read',
    '--add-dir',
    datasetDir,
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
  ];

  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const stdout = await runClaude({
        args,
        input: userPrompt(kase, scan, checks, imagePath),
        cwd: datasetDir,
      });
      const out = JSON.parse(stdout);
      if (out.is_error || !out.structured_output)
        throw new Error(
          `judge returned no structured output: ${String(out.result ?? out.subtype).slice(0, 300)}`,
        );
      const verdict = out.structured_output;
      const scores = Object.fromEntries(
        Object.entries(verdict.criteria).map(([k, v]) => [k, v.score]),
      );
      const result = {
        scores,
        reasons: Object.fromEntries(
          Object.entries(verdict.criteria).map(([k, v]) => [k, v.reason]),
        ),
        score: Math.round(weightedScore(kase.mode, scores) * 10) / 10,
        critical_errors: verdict.critical_errors,
        user_would_accept: verdict.user_would_accept,
        summary: verdict.summary,
        cost: out.total_cost_usd ?? null,
        model: Object.keys(out.modelUsage ?? {})[0] ?? judgeModel,
        rubricVersion: RUBRIC_VERSION,
      };
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(cacheFile, `${JSON.stringify(result, null, 2)}\n`);
      return { ...result, cached: false };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
