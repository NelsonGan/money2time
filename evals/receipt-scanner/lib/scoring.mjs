// Turns per-case results into a model's score card.
//
// Two scores per case, both 0-100 on the same rubric weights:
//   judge — Opus's rubric grading (the headline number)
//   auto  — the same criteria filled in from the deterministic checks alone, so
//           a --no-judge run still produces a comparable figure and a large
//           judge/auto gap flags a case worth reading.
// A scan that failed outright (HTTP error, timeout) scores 0 on both: that is
// what the user experiences.

import { RUBRICS } from './rubric.mjs';
import { mean, percentile } from './util.mjs';

const frac = (list, pred) => (list.length ? list.filter(pred).length / list.length : null);

function categoryPoints(r) {
  if (r.categoryBest) return 4;
  if (r.categoryAcceptable) return 3;
  if (r.categoryValid) return 1;
  return 0;
}

/** Rubric-shaped criterion scores (0-4) derived only from the checks. */
export function autoCriteria(kase, checks) {
  const criteria = RUBRICS[kase.mode].map((c) => c.key);
  if (!checks || checks.error || checks.noAnswerKey) return null;
  const t = checks.transactions;
  if (t.expectedCount === 0) {
    // Same rule the judge applies: nothing reaches the app = 4 (3 if the Worker had to drop junk rows).
    const reachedApp = t.predictedCount > 0 || (kase.mode === 'itemized' && checks.detail?.present);
    const v = reachedApp ? 0 : t.droppedByWorker > 0 ? 3 : 4;
    return Object.fromEntries(criteria.map((k) => [k, v]));
  }
  const rows = t.rows.filter((r) => !r.missing);
  const share = (pred) => (t.rows.length ? (rows.filter(pred).length / t.rows.length) * 4 : 0);
  const f = checks.format;
  const formatPts = !f.parseable
    ? 0
    : f.pureJson && f.minified && f.missingKeys.length === 0
      ? 4
      : f.pureJson
        ? 3.5
        : 3;
  const s = {
    amount: share((r) => r.amountOk),
    segmentation: t.countOk ? 4 : t.missedAll ? 0 : 1,
    date: share((r) => r.rawDateOk),
    category: rows.length ? rows.reduce((sum, r) => sum + categoryPoints(r), 0) / t.rows.length : 0,
    merchant: share((r) => r.noteOk),
    format: rows.every((r) => r.currencyPinned && r.typeOk) ? formatPts : Math.min(formatPts, 1),
  };
  if (kase.mode === 'screenshot') {
    s.account = t.rows.length
      ? t.rows.reduce(
          (sum, r) =>
            sum +
            (r.missing
              ? 0
              : r.accountOk
                ? 4
                : r.accountError === 'missed'
                  ? 2
                  : r.accountError === 'invented' || r.accountError === 'guessed'
                    ? 1
                    : 0),
          0,
        ) / t.rows.length
      : 0;
  }
  if (kase.mode === 'itemized') {
    const d = checks.detail;
    if (!d.presenceOk) s.segmentation = Math.min(s.segmentation, 1);
    if (d.expectedPresent && d.present) {
      s.completeness = d.recall * 4;
      s.accuracy = (d.precision * 0.6 + d.quantityAccuracy * 0.4) * 4;
      s.exclusions = Math.max(0, 4 - d.extraItems.length);
      s.metadata = ((d.merchantOk ? 1 : 0) + (d.currencyOk ? 1 : 0) + (d.dateOk ? 1 : 0)) * (4 / 3);
    } else if (d.expectedPresent) {
      Object.assign(s, { completeness: 0, accuracy: 0, exclusions: 0, metadata: 0 });
    } else {
      Object.assign(s, { completeness: 4, accuracy: 4, exclusions: 4, metadata: 4 });
    }
  }
  return Object.fromEntries(criteria.map((k) => [k, s[k] ?? 0]));
}

const weighted = (mode, scores) =>
  RUBRICS[mode].reduce((sum, c) => sum + (c.weight * (scores[c.key] ?? 0)) / 4, 0);

export function scoreCase(r) {
  if (!r.scan.ok) return { judge: r.judge ? 0 : null, auto: 0 };
  const auto = autoCriteria(r.kase, r.checks);
  return {
    judge: r.judge && !r.judge.error ? r.judge.score : null,
    auto: auto ? Math.round(weighted(r.kase.mode, auto) * 10) / 10 : null,
  };
}

/** The score card for one model over its case results. */
export function summarize(results, weights) {
  const modes = [...new Set(results.map((r) => r.kase.mode))];
  const byMode = {};
  for (const mode of modes) {
    const list = results.filter((r) => r.kase.mode === mode);
    byMode[mode] = {
      cases: list.length,
      judge: mean(list.map((r) => r.score.judge)),
      auto: mean(list.map((r) => r.score.auto)),
      strict: frac(
        list.filter((r) => r.checks.strictPass !== null),
        (r) => r.checks.strictPass,
      ),
    };
  }
  const overall = (key) => {
    const parts = modes.filter((m) => byMode[m][key] != null);
    const totalW = parts.reduce((s, m) => s + (weights[m] ?? 1), 0);
    return totalW
      ? parts.reduce((s, m) => s + byMode[m][key] * (weights[m] ?? 1), 0) / totalW
      : null;
  };

  const ok = results.filter((r) => r.scan.ok && r.checks.transactions);
  const rows = ok.flatMap((r) => r.checks.transactions.rows);
  const realRows = rows.filter((x) => !x.missing);
  const shotRows = ok
    .filter((r) => r.kase.mode === 'screenshot')
    .flatMap((r) => r.checks.transactions.rows.filter((x) => !x.missing));
  const noReceipt = ok.filter((r) => r.checks.transactions.expectedCount === 0);
  const details = ok.map((r) => r.checks.detail).filter((d) => d?.expectedPresent && d.present);
  const latencies = results
    .filter((r) => r.scan.ok)
    .map((r) => r.scan.attempts.reduce((s, a) => s + (a.latencyMs ?? 0), 0));
  // A scan's cost is unknown (null) when its provider reported none, never $0.
  const costs = results
    .filter((r) => r.scan.ok)
    .map((r) => {
      const known = r.scan.attempts.filter((a) => Number.isFinite(a.usage?.cost));
      return known.length ? known.reduce((s, a) => s + a.usage.cost, 0) : null;
    });
  const costMean = mean(costs);
  const attempts = results.flatMap((r) => r.scan.attempts.filter((a) => a.usage));

  const tagScores = {};
  for (const r of results) {
    const v = r.score.judge ?? r.score.auto;
    if (v == null) continue;
    for (const tag of r.kase.tags) (tagScores[tag] ??= []).push(v);
  }

  return {
    overall: { judge: overall('judge'), auto: overall('auto'), strict: overall('strict') },
    byMode,
    metrics: {
      amountAccuracy: frac(rows, (x) => !x.missing && x.amountOk),
      countAccuracy: frac(
        ok.filter((r) => r.checks.transactions),
        (r) => r.checks.transactions.countOk,
      ),
      dateAccuracy: frac(realRows, (x) => x.rawDateOk),
      categoryValid: frac(realRows, (x) => x.categoryValid),
      categoryAcceptable: frac(realRows, (x) => x.categoryAcceptable),
      merchantAccuracy: frac(realRows, (x) => x.noteOk),
      accountAccuracy: frac(shotRows, (x) => x.accountOk),
      // Posted to an account the screen does not support: a different one, or a guess between candidates.
      wrongAccountRate: frac(
        shotRows,
        (x) => x.accountError === 'wrong' || x.accountError === 'guessed',
      ),
      hallucinationRate: frac(
        noReceipt,
        (r) => r.checks.transactions.hallucinated || Boolean(r.checks.detail?.present),
      ),
      itemRecall: mean(details.map((d) => d.recall)),
      itemPrecision: mean(details.map((d) => d.precision)),
      pureJson: frac(ok, (r) => r.checks.format.pureJson),
      currencyPinned: frac(realRows, (x) => x.currencyPinned),
      emptyFirstAttempt: frac(ok, (r) => r.checks.emptyFirstAttempt),
      errorRate: frac(results, (r) => !r.scan.ok),
      userAccept: frac(
        results.filter((r) => r.judge && !r.judge.error),
        (r) => r.judge.user_would_accept,
      ),
    },
    latency: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      mean: mean(latencies),
    },
    cost: {
      perScan: costMean,
      per1000: costMean == null ? null : costMean * 1000,
      total: costs.reduce((s, c) => s + (c ?? 0), 0),
      promptTokens: mean(attempts.map((a) => a.usage.promptTokens)),
      completionTokens: mean(attempts.map((a) => a.usage.completionTokens)),
      reasoningTokens: mean(attempts.map((a) => a.usage.reasoningTokens)),
      cacheReadTokens: mean(attempts.map((a) => a.usage.cacheReadTokens)),
      cacheWriteTokens: mean(attempts.map((a) => a.usage.cacheWriteTokens)),
      // claude -p only: the same tokens with no prompt caching (null for OpenRouter).
      perScanUncached: mean(
        results
          .filter((r) => r.scan.ok)
          .map((r) => {
            const known = r.scan.attempts.filter((a) => Number.isFinite(a.usage?.costUncached));
            return known.length ? known.reduce((s, a) => s + a.usage.costUncached, 0) : null;
          }),
      ),
    },
    judgeCost: results.reduce(
      (s, r) => s + (r.judge && !r.judge.cached ? (r.judge.cost ?? 0) : 0),
      0,
    ),
    tags: Object.fromEntries(
      Object.entries(tagScores).map(([k, v]) => [k, { mean: mean(v), n: v.length }]),
    ),
  };
}
