// Markdown report for one run, plus the cross-run leaderboard.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { fmtUsd } from './util.mjs';

const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(1)}%`);
const num = (v, d = 1) => (v == null ? 'n/a' : v.toFixed(d));
const ms = (v) => (v == null ? 'n/a' : `${(v / 1000).toFixed(1)}s`);

function table(header, rows) {
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ].join('\n');
}

export function renderRunReport(run) {
  const { models, config } = run;
  const modes = config.modes;
  const lines = [];
  lines.push(`# Receipt-scanner model eval — ${run.runId}`);
  lines.push('');
  lines.push(
    `Dataset: ${run.dataset.cases} cases (source ${run.dataset.sourceHash}, reference date ${run.dataset.referenceDate}). Judge: ${config.judge ? `${config.judgeModel} via \`claude -p\` (rubric v${run.rubricVersion})` : 'off (auto scores only)'}. Empty-result retry: ${config.emptyRetry ? 'on (as production)' : 'off'}.`,
  );
  lines.push('');
  lines.push('## Leaderboard');
  lines.push('');
  const sorted = [...models].sort(
    (a, b) =>
      (b.summary.overall.judge ?? b.summary.overall.auto ?? 0) -
      (a.summary.overall.judge ?? a.summary.overall.auto ?? 0),
  );
  lines.push(
    table(
      [
        'Model',
        'Score (judge)',
        'Score (auto)',
        'Strict pass',
        ...modes.map((m) => `${m}`),
        'Errors',
        'p50 / p95',
        'Cost / 1k scans',
      ],
      sorted.map((m) => [
        `\`${m.model}\`${m.production ? ` (${m.production})` : ''}`,
        `**${num(m.summary.overall.judge)}**`,
        num(m.summary.overall.auto),
        pct(m.summary.overall.strict),
        ...modes.map((mode) => {
          const b = m.summary.byMode[mode];
          return b ? `${num(b.judge ?? b.auto)} (${pct(b.strict)})` : '–';
        }),
        pct(m.summary.metrics.errorRate),
        `${ms(m.summary.latency.p50)} / ${ms(m.summary.latency.p95)}`,
        m.summary.cost.per1000 == null ? 'n/a' : fmtUsd(m.summary.cost.per1000, 2),
      ]),
    ),
  );
  lines.push('');
  lines.push(
    'Per-mode cells read `score (strict pass rate)`. Score is 0-100 on the rubric; strict pass means every amount (and account / item list) came back exactly right.',
  );
  lines.push('');
  lines.push('## What the app would get');
  lines.push('');
  const metricRows = [
    ['Amount exactly right', 'amountAccuracy'],
    ['Transaction count right', 'countAccuracy'],
    ['Date read right', 'dateAccuracy'],
    ['Category valid (in user list)', 'categoryValid'],
    ['Category acceptable', 'categoryAcceptable'],
    ['Merchant recognisable', 'merchantAccuracy'],
    ['Account right (screenshot)', 'accountAccuracy'],
    ['Wrong or guessed account (screenshot)', 'wrongAccountRate'],
    ['Hallucinated on non-receipts', 'hallucinationRate'],
    ['Item recall (itemized)', 'itemRecall'],
    ['Item precision (itemized)', 'itemPrecision'],
    ['Pure JSON output', 'pureJson'],
    ['Currency pinned to user', 'currencyPinned'],
    ['Empty first attempt (retry needed)', 'emptyFirstAttempt'],
    ['User would accept (judge)', 'userAccept'],
  ];
  lines.push(
    table(
      ['Metric', ...sorted.map((m) => `\`${m.model}\``)],
      metricRows.map(([label, key]) => [label, ...sorted.map((m) => pct(m.summary.metrics[key]))]),
    ),
  );
  lines.push('');
  lines.push(
    table(
      ['Cost & speed', ...sorted.map((m) => `\`${m.model}\``)],
      [
        ['Mean cost / scan', ...sorted.map((m) => fmtUsd(m.summary.cost.perScan, 6))],
        ['Mean prompt tokens', ...sorted.map((m) => num(m.summary.cost.promptTokens, 0))],
        ['Mean completion tokens', ...sorted.map((m) => num(m.summary.cost.completionTokens, 0))],
        [
          'Mean thinking tokens (in completion)',
          ...sorted.map((m) => num(m.summary.cost.reasoningTokens, 0)),
        ],
        ['Mean latency', ...sorted.map((m) => ms(m.summary.latency.mean))],
        ['Model-call spend (this run)', ...sorted.map((m) => fmtUsd(m.summary.cost.total, 4))],
        ['Judge spend (this run, uncached)', ...sorted.map((m) => fmtUsd(m.summary.judgeCost, 2))],
      ],
    ),
  );

  for (const m of sorted) {
    lines.push('');
    lines.push(`## \`${m.model}\``);
    lines.push('');
    const weakTags = Object.entries(m.summary.tags)
      .filter(([, v]) => v.n >= 1)
      .sort((a, b) => a[1].mean - b[1].mean)
      .slice(0, 8);
    lines.push(
      `Weakest tags: ${weakTags.map(([t, v]) => `\`${t}\` ${num(v.mean)} (n=${v.n})`).join(', ') || 'n/a'}`,
    );
    lines.push('');
    const worst = [...m.cases]
      .sort((a, b) => (a.score.judge ?? a.score.auto ?? 0) - (b.score.judge ?? b.score.auto ?? 0))
      .slice(0, 10);
    lines.push(
      table(
        ['Case', 'Judge', 'Auto', 'Strict', 'What went wrong'],
        worst.map((c) => [
          `\`${c.id}\``,
          num(c.score.judge),
          num(c.score.auto),
          c.strictPass == null ? '–' : c.strictPass ? 'yes' : 'no',
          (c.error
            ? `scan failed: ${c.error}`
            : c.judge?.error
              ? `judge failed: ${c.judge.error}`
              : [c.judge?.critical_errors?.join('; '), c.judge?.summary]
                  .filter(Boolean)
                  .join(' — ') || ''
          )
            .replace(/\|/g, '\\|')
            .replace(/\n/g, ' '),
        ]),
      ),
    );
  }
  lines.push('');
  lines.push(`Raw outputs, checks and judge reasons for every case: \`run.json\` in this folder.`);
  return `${lines.join('\n')}\n`;
}

/** Keep the latest result per model (per dataset + rubric) and re-render LEADERBOARD.md. */
export function updateLeaderboard(resultsDir, run) {
  const file = path.join(resultsDir, 'leaderboard.json');
  const board = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { entries: [] };
  for (const m of run.models) {
    const key = `${m.model}|${run.dataset.sourceHash}|${run.rubricVersion}|${run.config.judge ? run.config.judgeModel : 'auto'}|${run.config.subset}`;
    board.entries = board.entries.filter((e) => e.key !== key);
    board.entries.push({
      key,
      model: m.model,
      runId: run.runId,
      at: run.finishedAt,
      dataset: run.dataset.sourceHash,
      subset: run.config.subset,
      cases: m.cases.length,
      judge: run.config.judge ? run.config.judgeModel : null,
      overall: m.summary.overall,
      byMode: Object.fromEntries(
        Object.entries(m.summary.byMode).map(([k, v]) => [
          k,
          { judge: v.judge, auto: v.auto, strict: v.strict },
        ]),
      ),
      wrongAccountRate: m.summary.metrics.wrongAccountRate,
      errorRate: m.summary.metrics.errorRate,
      p50: m.summary.latency.p50,
      per1000: m.summary.cost.per1000,
    });
  }
  writeFileSync(file, `${JSON.stringify(board, null, 2)}\n`);

  const full = board.entries
    .filter((e) => e.subset === 'full' && e.dataset === run.dataset.sourceHash)
    .sort(
      (a, b) => (b.overall.judge ?? b.overall.auto ?? 0) - (a.overall.judge ?? a.overall.auto ?? 0),
    );
  const partial = board.entries.filter(
    (e) => e.subset !== 'full' && e.dataset === run.dataset.sourceHash,
  );
  const render = (entries) =>
    table(
      [
        'Model',
        'Judge',
        'Auto',
        'Strict',
        'quick',
        'itemized',
        'screenshot',
        'Wrong/guessed acct',
        'Errors',
        'p50',
        'Cost / 1k',
        'Run',
      ],
      entries.map((e) => [
        `\`${e.model}\``,
        `**${num(e.overall.judge)}**`,
        num(e.overall.auto),
        pct(e.overall.strict),
        ...['quick', 'itemized', 'screenshot'].map((k) =>
          e.byMode[k] ? num(e.byMode[k].judge ?? e.byMode[k].auto) : '–',
        ),
        pct(e.wrongAccountRate),
        pct(e.errorRate),
        ms(e.p50),
        e.per1000 == null ? 'n/a' : fmtUsd(e.per1000, 2),
        e.runId,
      ]),
    );
  const md = [
    '# Receipt-scanner model leaderboard',
    '',
    'Latest full-suite result per model (same dataset + rubric only). Regenerated by every run.',
    '',
    full.length ? render(full) : '_No full-suite runs yet._',
    '',
    ...(partial.length
      ? ['## Partial runs (filtered or limited, not comparable)', '', render(partial), '']
      : []),
  ].join('\n');
  writeFileSync(path.join(resultsDir, 'LEADERBOARD.md'), `${md}\n`);
}
