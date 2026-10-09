---
name: run-model-evals
description: Run the receipt-scanner model eval for a named model (an OpenRouter id, or an Anthropic model via claude -p) and report its score against production. Use when someone asks to test, evaluate, benchmark or compare a model for the app's receipt scanning / Split by Item / screenshot auto-log, asks "is model X better than what we use", or names a model to run the eval suite on.
---

# Run the receipt-scanner model eval

The app's only LLM call is the receipt-scanner Worker (`cloudflare/workers/receipt-scanner`, three
modes: `quick`, `itemized`, `screenshot`). `evals/receipt-scanner/` runs a model over ~140 answer-keyed
images exactly as production does, grades every answer with Opus via `claude -p` on a rubric, and
scores it. Full design, flags and rubric: [evals/receipt-scanner/README.md](../../../evals/receipt-scanner/README.md).
Read it once if you have not this session.

## 1. Resolve the model id

The user names the model; the eval needs an exact id.

- **OpenRouter** (the default, and what production uses): `provider/model`, e.g. `google/gemini-2.5-flash-lite`.
  If they gave a loose name ("gemini flash", "gpt mini"), run a dry run with your best guess: an
  unknown id prints close matches. Pick the one that matches, and say which one you picked.
- **Anthropic model through Claude Code** (no OpenRouter key needed): `claude-code:<exact id>`, e.g.
  `claude-code:claude-haiku-5-5`. Always use the exact id, never an alias: `haiku` still resolves to
  Haiku 4.5.
- Production's own models are `--production` (reads `MODEL` / `BACKUP_MODEL` from `wrangler.toml`).

## 2. Pre-flight (cheap, no model calls)

```bash
npm run eval:receipts -- --model <id> --dry-run
```

This validates the id against OpenRouter's catalogue (and refuses models without image input),
builds the dataset if stale, and prints the case count and a rough cost. For OpenRouter models,
check the key is configured without printing it:

```bash
grep -q '^OPENROUTER_API_KEY=.' evals/receipt-scanner/.env && echo "key present"
```

If the key is missing, ask the user to add it to `evals/receipt-scanner/.env` (gitignored). Never
echo, log or commit the key.

**Cost.** Model calls are usually cents. The judge dominates: about $0.05 per case, so about $7 per
model for the full suite, and $0 for answers it has already judged (results/.judge-cache). Go ahead
for one or two models. Above roughly $20 of new judging, confirm with the user first.

## 3. Compare against production

A score means little alone. Check `evals/receipt-scanner/results/LEADERBOARD.md`: if production's
models already have a **full-suite** row on the current dataset, compare against that. If not, add
`--production` to the run (or ask whether they want it, if cost is a concern).

## 4. Run

Smoke test first when the model or provider is new to this session (3 cases per mode):

```bash
npm run eval:receipts -- --model <id> --limit 3
```

Then the full suite. It takes several minutes, so run it in the background and wait for it to
finish instead of polling:

```bash
npm run eval:receipts -- --model <id> [--model <id2>] [--production]
```

Useful variants: `--modes screenshot` (one flow), `--tags trap:tip,account:ambiguous` (specific
weaknesses), `--no-judge` (free auto scores only), `--no-empty-retry` (first-pass behaviour),
`--image-detail low` (the Worker's token-saving A/B). Filtered runs are marked partial and kept off the
main leaderboard.

## 5. Report

Read `evals/receipt-scanner/results/<run>/report.md` (and `run.json` for any case worth quoting). Tell the
user, in this order:

1. **Score** (judge, 0-100) overall and per mode, with strict pass rate, next to production's.
2. **What would reach users**: amount accuracy, wrong-account rate (screenshot auto-log posts with no
   review, so this is the costliest error), hallucinations on non-receipts, item recall/precision.
3. **Cost per 1,000 scans and p50/p95 latency** against production. Costs include prompt caching:
   OpenRouter's billed cost already does; `claude-code:` models are priced per token type at
   Anthropic list price, cache writes and reads included (the CLI's own figure is not used: it lacks
   prices for new models). For `claude-code:` rows also give the no-caching cost from the report,
   since `claude -p` writes every prompt to a 1-hour cache that a production call would not.
4. **Failure patterns**: group the worst cases by cause (e.g. "misreads DD-MM-YY years", "returns
   'Visa' instead of empty when ambiguous"), quoting the judge's critical errors.
5. A recommendation only if the evidence supports one, with its caveat: synthetic receipts, single run,
   and ±3-4 points of noise per mode at this case count.

Keep private details out of anything you post outside the terminal.

## Rules

- Never change `MODEL` / `BACKUP_MODEL` in `wrangler.toml` unless the user asks. Changing it deploys the
  Worker on merge to `main`, so it goes through a PR like any Worker change.
- Every run logs itself to `evals/receipt-scanner/history/` and commits only those files, so the run
  history is in git. Commit any code changes to the eval **before** running, or the history marks the
  run's code as uncommitted (`+`). Push the history commit with the branch; never pass `--no-commit`
  unless the user asks.
- Results under `evals/receipt-scanner/results/` are local and gitignored scratch. Do not commit them.
- If a judge call fails, the case shows `judge failed` and is excluded from the judge score. Re-run the
  same command: successful judgements are cached, so only the failures cost anything.
- A scan error rate above a few percent means a provider problem (429 / capacity), not a bad model.
  Re-run with `--concurrency 2` before drawing conclusions.
