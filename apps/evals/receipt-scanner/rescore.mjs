// Re-apply the current checks and scoring to a saved run, without calling any
// model or the judge (its verdicts are kept as they were). Use it after changing
// lib/checks.mjs or lib/scoring.mjs, so an existing run's report reflects the
// fix instead of paying for the whole suite again.
//
//   node rescore.mjs results/<run> [--no-commit]   (from apps/evals/receipt-scanner)

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildDataset } from './build-dataset.mjs';
import { nowFor } from './dataset/reference.mjs';
import { runChecks } from './lib/checks.mjs';
import { recordRun } from './lib/history.mjs';
import { renderRunReport, updateLeaderboard } from './lib/report.mjs';
import { scoreCase, summarize } from './lib/scoring.mjs';
import { parseLikeWorker } from './lib/worker.mjs';

const runDir = process.argv[2];
if (!runDir) {
  process.stdout.write('Usage: node rescore.mjs <results/run-dir>\n');
  process.exit(1);
}

const run = JSON.parse(readFileSync(path.join(runDir, 'run.json'), 'utf8'));
const manifest = await buildDataset({ quiet: true });
if (manifest.sourceHash !== run.dataset.sourceHash) {
  process.stdout.write(
    `The dataset changed since this run (${run.dataset.sourceHash} -> ${manifest.sourceHash}); answer keys may differ. Re-run the suite instead.\n`,
  );
  process.exit(1);
}
const byId = new Map(manifest.cases.map((c) => [c.id, c]));

let changed = 0;
for (const m of run.models) {
  const results = m.cases.map((c) => {
    const kase = byId.get(c.id);
    const last = c.attempts.findLast((a) => typeof a.content === 'string');
    const scan = c.error
      ? { ok: false, error: c.error, attempts: c.attempts, final: null }
      : {
          ok: true,
          attempts: c.attempts,
          final: {
            content: last.content,
            ...parseLikeWorker(last.content, kase.mode, nowFor(kase)),
          },
        };
    const checks = runChecks(kase, scan, nowFor(kase));
    const r = { kase, scan, checks, judge: c.judge };
    r.score = scoreCase(r);
    if (r.score.auto !== c.score.auto || checks.strictPass !== c.strictPass) changed += 1;
    Object.assign(c, { checks, score: r.score, strictPass: checks.strictPass ?? null });
    return r;
  });
  m.summary = summarize(results, run.config.weights ?? {});
}
run.rescoredAt = new Date().toISOString();
writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
const report = renderRunReport(run);
writeFileSync(path.join(runDir, 'report.md'), report);
// The leaderboard lives in the results folder that holds the run.
updateLeaderboard(path.dirname(path.resolve(runDir)), run);
recordRun(run, report, {
  commit: !process.argv.includes('--no-commit'),
  log: (line) => process.stdout.write(`${line}\n`),
});
process.stdout.write(
  `Rescored ${runDir}: ${changed} case(s) changed. Report and leaderboard updated.\n`,
);
