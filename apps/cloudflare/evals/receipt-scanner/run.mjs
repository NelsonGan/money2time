// Receipt-scanner model eval: run OpenRouter models over the dataset exactly as
// the production Worker would, grade every answer with Opus (`claude -p`) on
// the rubric, and score each model.
//
// From apps/cloudflare/evals/receipt-scanner:
//
//   npm run eval -- --model google/gemini-2.5-flash-lite
//   npm run eval -- --model a/x --model b/y --production   # compare with prod MODEL/BACKUP_MODEL
//   npm run eval -- --model a/x --limit 3                  # smoke test: 3 cases per mode
//   npm run eval -- --model a/x --dry-run                  # plan + cost estimate, no calls
//
// `--help` lists every flag; "Receipt-scanner model eval" in the repository
// README explains the rest. Reads OPENROUTER_API_KEY from the environment or
// this directory's .env(.local).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { buildDataset, GENERATED_DIR } from './build-dataset.mjs';
import { nowFor } from './dataset/reference.mjs';
import { runChecks } from './lib/checks.mjs';
import { codeVersion, recordRun } from './lib/history.mjs';
import { judgeCase } from './lib/judge.mjs';
import { claudeModelInfo, isClaudeCodeModel } from './lib/claudeCode.mjs';
import { fetchModelInfo, scanCase } from './lib/openrouter.mjs';
import { renderRunReport, updateLeaderboard } from './lib/report.mjs';
import { RUBRIC_VERSION } from './lib/rubric.mjs';
import { scoreCase, summarize } from './lib/scoring.mjs';
import { fmtUsd, loadEnvFile, pool, rel, slug } from './lib/util.mjs';
import { productionModels } from './lib/worker.mjs';


const HELP = `Usage: npm run eval -- --model <id> [flags]   (from apps/cloudflare/evals/receipt-scanner)

--model, -m <id>        OpenRouter model id; repeat or comma-separate for several
--production            also run the Worker's MODEL and BACKUP_MODEL from wrangler.toml
--modes <list>          quick,itemized,screenshot (default: all)
--cases <list>          only case ids equal to / containing these strings
--tags <list>           only cases carrying any of these tags (e.g. trap:tip,account:ambiguous)
--limit <n>             first n cases per mode (hand-written traps come first)
--concurrency <n>       parallel OpenRouter calls (default 6)
--judge-concurrency <n> parallel judge sessions (default 4)
--judge-model <alias>   judge model for claude -p (default opus)
--no-judge              skip the judge; auto scores only
--no-empty-retry        disable the Worker's retry-on-empty (first-pass behaviour)
--retries <n>           transport retries on 429/5xx/timeouts (default 2)
--image-detail <v>      send image_url.detail low|high|auto (the Worker's IMAGE_DETAIL A/B)
--weights <k=v,...>     mode weights for the overall score, e.g. screenshot=2
--out <dir>             results directory (default ./results)
--dry-run               validate models and print the plan; no API calls
--no-commit             write the run to history/ but do not commit it
--force                 run a model even if OpenRouter says it takes no images
`;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = (s = '') => process.stdout.write(`${s}\n`);

const { values: args } = parseArgs({
  options: {
    model: { type: 'string', multiple: true, short: 'm' },
    production: { type: 'boolean', default: false },
    modes: { type: 'string' },
    cases: { type: 'string' },
    tags: { type: 'string' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '6' },
    'judge-concurrency': { type: 'string', default: '4' },
    // Pinned id, not the `opus` alias: aliases move (the `haiku` alias still meant Haiku 4.5).
    'judge-model': { type: 'string', default: 'claude-opus-5-5' },
    'no-judge': { type: 'boolean', default: false },
    'no-empty-retry': { type: 'boolean', default: false },
    retries: { type: 'string', default: '2' },
    'image-detail': { type: 'string' },
    weights: { type: 'string' },
    out: { type: 'string', default: path.join(HERE, 'results') },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'no-commit': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: false,
});

if (args.help) {
  out(HELP);
  process.exit(0);
}

loadEnvFile(path.join(HERE, '.env.local'));
loadEnvFile(path.join(HERE, '.env'));

// --- models -------------------------------------------------------------------------
const prod = productionModels();
const requested = (args.model ?? [])
  .flatMap((m) => m.split(','))
  .map((m) => m.trim())
  .filter(Boolean);
const models = [...requested.map((id) => ({ id }))];
if (args.production) {
  for (const [role, id] of [
    ['production primary', prod.primary],
    ['production backup', prod.backup],
  ]) {
    if (id && !models.some((m) => m.id === id)) models.push({ id, production: role });
  }
}
for (const m of models) {
  if (m.id === prod.primary) m.production ??= 'production primary';
  else if (m.id === prod.backup) m.production ??= 'production backup';
}
if (models.length === 0) {
  out('Name at least one model: --model <openrouter-id> (repeatable), and/or --production.');
  out(
    `Production today: MODEL=${prod.primary}, BACKUP_MODEL=${prod.backup} (apps/cloudflare/workers/receipt-scanner/wrangler.toml).`,
  );
  process.exit(1);
}

// --- argument validation ------------------------------------------------------------
const ALL_MODES = ['quick', 'itemized', 'screenshot'];
const fail = (msg) => {
  out(msg);
  process.exit(1);
};
const positiveInt = (name, { allowZero = false } = {}) => {
  if (args[name] == null) return;
  const n = Number(args[name]);
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1))
    fail(
      `--${name} must be a ${allowZero ? 'non-negative' : 'positive'} integer (got "${args[name]}").`,
    );
};
positiveInt('limit');
positiveInt('concurrency');
positiveInt('judge-concurrency');
positiveInt('retries', { allowZero: true });
if (args['image-detail'] && !['low', 'high', 'auto'].includes(args['image-detail']))
  fail('--image-detail must be low, high or auto.');
const modes = args.modes ? args.modes.split(',').map((s) => s.trim()) : ALL_MODES;
const badMode = modes.find((m) => !ALL_MODES.includes(m));
if (badMode) fail(`Unknown mode "${badMode}". Modes: ${ALL_MODES.join(', ')}.`);
const weights = Object.fromEntries(
  (args.weights ?? '')
    .split(',')
    .filter(Boolean)
    .map((kv) => kv.split('='))
    .map(([k, v]) => {
      if (!ALL_MODES.includes(k) || !(Number(v) >= 0))
        fail(`Bad --weights entry "${k}=${v}" (use e.g. screenshot=2).`);
      return [k, Number(v)];
    }),
);

// --- dataset & selection -----------------------------------------------------------
const manifest = await buildDataset({ quiet: true });
let cases = manifest.cases.filter((c) => modes.includes(c.mode));
if (args.cases) {
  const wanted = args.cases.split(',').map((s) => s.trim());
  cases = cases.filter((c) => wanted.some((w) => c.id === w || c.id.includes(w)));
}
if (args.tags) {
  const wanted = args.tags.split(',').map((s) => s.trim());
  cases = cases.filter((c) => c.tags.some((t) => wanted.includes(t)));
}
if (args.limit) {
  // Per mode, taking hand-written traps before procedural cases, so a smoke test still hits the hard parts.
  const n = Number(args.limit);
  cases = modes.flatMap((mode) => cases.filter((c) => c.mode === mode).slice(0, n));
}
if (cases.length === 0) {
  out('No cases match the filters.');
  process.exit(1);
}
const subset =
  args.cases || args.tags || args.limit || modes.length < ALL_MODES.length ? 'partial' : 'full';
const judge = !args['no-judge'];

// --- model metadata + plan ---------------------------------------------------------
out(
  `Receipt-scanner eval — ${cases.length} cases (${modes.map((m) => `${m} ${cases.filter((c) => c.mode === m).length}`).join(', ')}), dataset ${manifest.sourceHash}${subset === 'partial' ? ', PARTIAL' : ''}`,
);
let estimate = 0;
for (const m of models) {
  let info;
  try {
    info = isClaudeCodeModel(m.id) ? claudeModelInfo(m.id) : await fetchModelInfo(m.id);
  } catch (err) {
    out(
      `  ! could not reach OpenRouter's model list (${err.message}); continuing without validation`,
    );
    info = { found: true, unknown: true };
  }
  if (!info.found) {
    out(
      `  ✗ ${m.id} is not an OpenRouter model id.${info.suggestions.length ? ` Did you mean: ${info.suggestions.join(', ')}?` : ''}`,
    );
    process.exit(1);
  }
  if (!info.unknown && !info.acceptsImages) {
    out(
      `  ✗ ${m.id} does not accept image input (input: ${info.inputModalities.join(', ')}). The receipt scanner needs a vision model.${args.force ? ' Continuing (--force).' : ' Pass --force to run anyway.'}`,
    );
    if (!args.force) process.exit(1);
  }
  m.info = info;
  if (info.pricing) {
    // Rough: ~2.1k prompt tokens (prompt + one image), ~150 out (quick/screenshot) or ~600 (itemized).
    const perCase = (c) =>
      info.pricing.prompt * 2100 +
      info.pricing.image +
      info.pricing.completion * (c.mode === 'itemized' ? 600 : 150);
    m.estimate = cases.reduce((s, c) => s + perCase(c), 0);
    estimate += m.estimate;
  }
  out(
    `  • ${m.id}${m.production ? ` [${m.production}]` : ''}${info.name ? ` — ${info.name}` : ''}${m.estimate != null ? `, ~${fmtUsd(m.estimate, 3)} model calls` : ''}`,
  );
}
out(
  `  Judge: ${judge ? `${args['judge-model']} via claude -p, up to ${cases.length * models.length} judgements (cached ones are free; budget roughly $0.03-0.08 each)` : 'off (--no-judge)'}`,
);
out(`  Rough model-call estimate: ${fmtUsd(estimate, 3)}`);
if (args['dry-run']) process.exit(0);

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey && models.some((m) => !isClaudeCodeModel(m.id))) {
  out(
    'OPENROUTER_API_KEY is not set. Put it in apps/cloudflare/evals/receipt-scanner/.env (gitignored) or export it.',
  );
  process.exit(1);
}

// --- run -----------------------------------------------------------------------------
const startedAt = new Date();
const code = codeVersion();
const runId = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 23);
const runDir = path.join(args.out, runId);
mkdirSync(runDir, { recursive: true });
const images = new Map(
  cases.map((c) => [c.id, readFileSync(path.join(GENERATED_DIR, c.imageFile)).toString('base64')]),
);
const cacheDir = path.join(args.out, '.judge-cache');

const jobs = models.flatMap((m) => cases.map((kase) => ({ m, kase })));
let done = 0;
out(`\nScanning (${jobs.length} calls, concurrency ${args.concurrency})...`);
const scanned = await pool(jobs, Number(args.concurrency), async ({ m, kase }) => {
  const scan = await scanCase({
    apiKey,
    model: m.id,
    kase,
    imageBase64: images.get(kase.id),
    now: nowFor(kase),
    emptyRetry: !args['no-empty-retry'],
    retries: Number(args.retries),
    detail: args['image-detail'],
  });
  const checks = runChecks(kase, scan, nowFor(kase));
  done += 1;
  const mark = !scan.ok
    ? '✗ error'
    : checks.strictPass === null
      ? '· no key'
      : checks.strictPass
        ? '✓'
        : '✗';
  out(
    `  [${String(done).padStart(String(jobs.length).length)}/${jobs.length}] ${m.id}  ${kase.id}  ${mark}${scan.ok ? '' : `  ${scan.error.slice(0, 120)}`}`,
  );
  return { m, kase, scan, checks };
});

if (judge) {
  done = 0;
  out(`\nJudging with ${args['judge-model']} (concurrency ${args['judge-concurrency']})...`);
  await pool(scanned, Number(args['judge-concurrency']), async (r) => {
    if (!r.scan.ok) {
      // Nothing to grade: the user got an error. Scores 0 without spending a judgement.
      r.judge = {
        score: 0,
        scanFailed: true,
        critical_errors: ['scan_failed'],
        summary: `Scan failed: ${r.scan.error}`,
        cost: 0,
        cached: false,
      };
      done += 1;
      return;
    }
    try {
      r.judge = await judgeCase({
        kase: r.kase,
        scan: r.scan,
        checks: r.checks,
        datasetDir: GENERATED_DIR,
        cacheDir,
        judgeModel: args['judge-model'],
      });
    } catch (err) {
      r.judge = { error: String(err.message ?? err) };
    }
    done += 1;
    const label = r.judge.error
      ? `judge failed: ${r.judge.error.slice(0, 100)}`
      : `${r.judge.score}${r.judge.cached ? ' (cached)' : ''}`;
    out(
      `  [${String(done).padStart(String(scanned.length).length)}/${scanned.length}] ${r.m.id}  ${r.kase.id}  ${label}`,
    );
  });
}

// --- score & report --------------------------------------------------------------
const run = {
  runId,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  rubricVersion: RUBRIC_VERSION,
  // Read at the start of the run, so the history records the code that was actually measured.
  code,
  dataset: {
    sourceHash: manifest.sourceHash,
    referenceDate: manifest.referenceDate,
    cases: cases.length,
  },
  config: {
    modes,
    subset,
    judge,
    judgeModel: args['judge-model'],
    emptyRetry: !args['no-empty-retry'],
    imageDetail: args['image-detail'] ?? null,
    weights,
    filters: { cases: args.cases ?? null, tags: args.tags ?? null, limit: args.limit ?? null },
  },
  models: models.map((m) => {
    const results = scanned.filter((r) => r.m === m).map((r) => ({ ...r, score: scoreCase(r) }));
    return {
      model: m.id,
      production: m.production ?? null,
      info: m.info,
      summary: summarize(results, weights),
      cases: results.map((r) => ({
        id: r.kase.id,
        mode: r.kase.mode,
        tags: r.kase.tags,
        image: rel(path.join(GENERATED_DIR, r.kase.imageFile)),
        score: r.score,
        strictPass: r.checks.strictPass ?? null,
        error: r.scan.ok ? null : r.scan.error,
        attempts: r.scan.attempts,
        output: r.scan.final
          ? { transactions: r.scan.final.transactions, receiptDetail: r.scan.final.receiptDetail }
          : null,
        checks: r.checks,
        judge: r.judge ?? null,
      })),
    };
  }),
};
writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
const report = renderRunReport(run);
writeFileSync(path.join(runDir, 'report.md'), report);
updateLeaderboard(args.out, run);
// Committed record of every run (history/); --no-commit writes it without committing.
recordRun(run, report, { commit: !args['no-commit'], log: out });

out('\nResults');
for (const m of [...run.models].sort(
  (a, b) =>
    (b.summary.overall.judge ?? b.summary.overall.auto ?? 0) -
    (a.summary.overall.judge ?? a.summary.overall.auto ?? 0),
)) {
  const s = m.summary;
  const score =
    s.overall.judge != null
      ? `judge ${s.overall.judge.toFixed(1)}`
      : `auto ${s.overall.auto?.toFixed(1)}`;
  const perMode = Object.entries(s.byMode)
    .map(([k, v]) => `${k} ${(v.judge ?? v.auto)?.toFixed(1)}`)
    .join(', ');
  out(
    `  ${slug(m.model).padEnd(40)} ${score}  strict ${s.overall.strict == null ? 'n/a' : `${(s.overall.strict * 100).toFixed(0)}%`}  [${perMode}]  errors ${(s.metrics.errorRate * 100).toFixed(0)}%  ${fmtUsd(s.cost.per1000, 2)}/1k scans`,
  );
}
out(`\nReport:      ${rel(path.join(runDir, 'report.md'))}`);
out(`Leaderboard: ${rel(path.join(args.out, 'LEADERBOARD.md'))}`);
