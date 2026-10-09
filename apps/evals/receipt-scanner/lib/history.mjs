// The committed run history. results/ is gitignored scratch (raw outputs, big
// run.json files); history/ is the small, permanent record of every run, so the
// git log shows how each model scored, on which dataset and code, and what it cost:
//
//   history/runs.jsonl        one JSON line per model per run (machine-readable)
//   history/runs/<runId>.md   that run's full report
//   history/HISTORY.md        every run as one table, newest first
//
// After writing, the three paths are committed on their own (`git commit -- <paths>`),
// so anything else staged in the working tree is left alone.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT } from './worker.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const HISTORY_DIR = path.join(HERE, '..', 'history');
const JSONL = path.join(HISTORY_DIR, 'runs.jsonl');
const INDEX = path.join(HISTORY_DIR, 'HISTORY.md');

const git = (...args) =>
  execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

/** The code a run measured: commit plus whether the eval or Worker had uncommitted edits. */
export function codeVersion() {
  try {
    const commit = git('rev-parse', '--short', 'HEAD');
    const dirty =
      git(
        'status',
        '--porcelain',
        '--',
        'apps/evals/receipt-scanner',
        'apps/cloudflare/workers/receipt-scanner',
      )
        .split('\n')
        .filter((line) => line && !line.includes('apps/evals/receipt-scanner/history/')).length > 0;
    return { commit, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}

const round = (v, d = 4) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

function entryFor(run, m) {
  const s = m.summary;
  const worst = [...m.cases]
    .filter((c) => (c.score.judge ?? c.score.auto) != null && (c.score.judge ?? c.score.auto) < 100)
    .sort((a, b) => (a.score.judge ?? a.score.auto) - (b.score.judge ?? b.score.auto))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      score: c.score.judge ?? c.score.auto,
      errors: c.error ? [`scan_failed: ${c.error}`] : (c.judge?.critical_errors ?? []),
    }));
  return {
    runId: run.runId,
    at: run.startedAt,
    rescoredAt: run.rescoredAt ?? null,
    model: m.model,
    production: m.production,
    subset: run.config.subset,
    filters: run.config.filters,
    cases: m.cases.length,
    dataset: run.dataset.sourceHash,
    rubric: run.rubricVersion,
    judge: run.config.judge ? run.config.judgeModel : null,
    code: run.code ?? null,
    score: {
      judge: round(s.overall.judge, 1),
      auto: round(s.overall.auto, 1),
      strict: round(s.overall.strict),
    },
    byMode: Object.fromEntries(
      Object.entries(s.byMode).map(([k, v]) => [
        k,
        {
          cases: v.cases,
          judge: round(v.judge, 1),
          auto: round(v.auto, 1),
          strict: round(v.strict),
        },
      ]),
    ),
    metrics: Object.fromEntries(
      [
        'amountAccuracy',
        'accountAccuracy',
        'wrongAccountRate',
        'hallucinationRate',
        'itemRecall',
        'dateAccuracy',
        'userAccept',
        'errorRate',
      ].map((k) => [k, round(s.metrics[k])]),
    ),
    cost: {
      perScan: round(s.cost.perScan, 8),
      per1000: round(s.cost.per1000, 4),
      perScanUncached: round(s.cost.perScanUncached, 8),
      modelSpend: round(s.cost.total, 4),
      judgeSpend: round(s.judgeCost, 2),
      promptTokens: round(s.cost.promptTokens, 0),
      cacheReadTokens: round(s.cost.cacheReadTokens, 0),
      cacheWriteTokens: round(s.cost.cacheWriteTokens, 0),
      completionTokens: round(s.cost.completionTokens, 0),
    },
    latencyMs: { p50: s.latency.p50, p95: s.latency.p95 },
    worst,
  };
}

const pct = (v) => (v == null ? '–' : `${(v * 100).toFixed(1)}%`);
const num = (v) => (v == null ? '–' : v.toFixed(1));

function renderIndex(entries) {
  const rows = [...entries]
    .sort((a, b) => (b.at < a.at ? -1 : b.at > a.at ? 1 : a.model.localeCompare(b.model)))
    .map((e) => {
      const modes = ['quick', 'itemized', 'screenshot'].map((k) =>
        num(e.byMode[k]?.judge ?? e.byMode[k]?.auto),
      );
      const code = e.code?.commit ? `\`${e.code.commit}\`${e.code.dirty ? '+' : ''}` : '–';
      return `| ${e.at.slice(0, 16).replace('T', ' ')} | \`${e.model}\` | ${e.subset === 'full' ? e.cases : `${e.cases} (partial)`} | **${num(e.score.judge ?? e.score.auto)}** | ${pct(e.score.strict)} | ${modes.join(' | ')} | ${pct(e.metrics.wrongAccountRate)} | ${pct(e.metrics.hallucinationRate)} | ${e.cost.per1000 == null ? '–' : `$${e.cost.per1000.toFixed(2)}`} | ${e.latencyMs.p50 == null ? '–' : `${(e.latencyMs.p50 / 1000).toFixed(1)}s`} | \`${e.dataset}\` | ${code} | [report](runs/${e.runId}.md) |`;
    });
  return `# Receipt-scanner eval history

Every eval run, newest first, written and committed by \`apps/evals/receipt-scanner/run.mjs\`.
Scores are the Opus judge's (0-100; the check-based auto score when a run had no judge).
Compare rows only on the same dataset and rubric. Cost per 1,000 scans includes prompt
caching; time is UTC; Code is the commit measured (\`+\` = with uncommitted eval or Worker edits).

| Run (UTC) | Model | Cases | Score | Strict | quick | itemized | screenshot | Wrong/guessed acct | Invented payments | Cost / 1k | p50 | Dataset | Code | Details |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
}

/** Write a run into history/ and commit it. Never throws: a run's results matter more than its log. */
export function recordRun(run, reportMd, { commit = true, log = () => {} } = {}) {
  try {
    mkdirSync(path.join(HISTORY_DIR, 'runs'), { recursive: true });
    const existing = existsSync(JSONL)
      ? readFileSync(JSONL, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
    // A rescore replaces that run's lines instead of adding new ones.
    const kept = existing.filter((e) => e.runId !== run.runId);
    const added = run.models.map((m) => entryFor(run, m));
    const all = [...kept, ...added];
    writeFileSync(JSONL, `${all.map((e) => JSON.stringify(e)).join('\n')}\n`);
    const reportPath = path.join(HISTORY_DIR, 'runs', `${run.runId}.md`);
    writeFileSync(reportPath, reportMd);
    writeFileSync(INDEX, renderIndex(all));
    log(`History:     ${path.relative(process.cwd(), INDEX)}`);
    if (!commit) return;

    const paths = [JSONL, INDEX, reportPath].map((p) => path.relative(REPO_ROOT, p));
    git('add', '--', ...paths);
    if (!git('diff', '--cached', '--name-only', '--', ...paths)) return;
    const summary = added.map((e) => `${e.model} ${num(e.score.judge ?? e.score.auto)}`).join(', ');
    const what = run.rescoredAt ? 'Rescore eval run' : 'Eval run';
    git(
      'commit',
      '-m',
      `${what} ${run.runId}: ${summary}`,
      '-m',
      `Dataset ${run.dataset.sourceHash}, ${run.config.subset} suite (${run.dataset.cases} cases), judge ${run.config.judge ? run.config.judgeModel : 'off'}.`,
      '--',
      ...paths,
    );
    log(`Committed:   ${git('log', '-1', '--format=%h %s')}`);
  } catch (err) {
    log(
      `  ! could not record or commit the run history (${String(err.message ?? err).split('\n')[0]}); results are still in results/.`,
    );
  }
}
