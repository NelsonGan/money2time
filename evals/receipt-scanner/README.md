# Receipt-scanner model eval

Local pipeline for choosing the vision model behind the app's only LLM feature,
the receipt-scanner Worker (`cloudflare/workers/receipt-scanner`). It sends each
test image to an OpenRouter model **exactly as production does**, grades every
answer with **Opus as the judge** (Claude Code's programmatic `claude -p`) on a
rubric, and gives each model a score next to its strict accuracy, reliability,
latency and cost per 1,000 scans.

It is local only: nothing here is imported by the app, and `evals/` is kept out
of Metro (blockList), the EAS archive (`.easignore`) and the CI store-build
trigger (`deploy.yml`).

```bash
npm run eval:receipts -- --model google/gemini-2.5-flash-lite            # one model, full suite
npm run eval:receipts -- --model x/a --model y/b --production            # compare against prod MODEL + BACKUP_MODEL
npm run eval:receipts -- --model x/a --limit 3                           # smoke test, 3 cases per mode
npm run eval:receipts -- --model x/a --dry-run                           # validate the id, plan, rough cost; no calls
```

The `run-model-evals` skill (`/run-model-evals <model>`) wraps this end to end.

## What is tested

The Worker has three modes, each a real flow in the app, and the dataset covers
all three (107 cases):

| Mode         | App flow                                             | Cases | What the cases stress                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quick`      | Snap a receipt, pre-fill an expense                  | 46    | cash tendered/change, handwritten tips, service + SST + rounding, discounts, tax-inclusive yen, `1.234,56` and `Rp 125.000` formats, currency pinning, 2-3 receipts per photo, faded/blurred/sideways/dim photos, date clamp, menus |
| `itemized`   | Split by Item (line items to assign to people)       | 32    | quantity layouts (`2 x`, `3 @`, own line, by weight), per-line vs receipt-level discounts, tax/service/tip/rounding exclusion, modifiers, POS abbreviations, long receipts, multi-receipt (no detail), currency detection           |
| `screenshot` | Auto-log a payment screenshot (posts with no review) | 29    | account matching by last 4 / wallet name, ambiguous sources (must be `""`), decoy digits, lock-screen noise and promos, balances, transfers, transaction lists, order totals, FX billed amount, emailed receipts, paper receipts    |

Cases are a mix of hand-written traps (`dataset/cases.mjs`, each with a `notes`
line naming the trap) and seeded procedural variety across nine locales
(`dataset/procedural.mjs`: MYR, USD, SGD, GBP, JPY, IDR, EUR, PHP, AUD, each
with that locale's date order, tax regime, rounding, payment methods and the
category list a user there would have, localized names included).

**Answer keys are exact.** Receipts are rendered from a spec (`dataset/receipt.mjs`)
and every figure is computed in integer minor units from the same numbers that
get printed, so the expected total can never disagree with the image. Photos are
composited on table backgrounds with tilt, blur, fade, noise and side light
(`dataset/scene.mjs`), then downscaled exactly like the app does before upload
(long edge 1600px, JPEG). Dates are written against a fixed reference "today"
(`REFERENCE_DATE`), and the Worker's 30-day date clamp is applied against it, so
the dataset rebuilds byte-identically and never goes stale.

**Real photos.** Drop private receipts into `dataset/real/` (gitignored), see
[dataset/real/README.md](dataset/real/README.md). They join the suite, downscaled
the same way; without an answer key the judge grades them from the image.

## How a case is scored

1. **Scan** — the Worker's own TypeScript is imported (`lib/worker.mjs`), so the
   prompt (`buildReceiptPrompt`), request body (`buildCompletionBody`: temperature 0,
   reasoning off, per-mode `max_tokens`) and response parse (`parseTransactions`,
   `normalizeReceiptDetail`, the date clamp) are production's, not copies. The
   Worker's single retry on an empty result (at temperature 0.2) is replicated;
   `--no-empty-retry` turns it off to measure first-pass behaviour.
2. **Checks** (`lib/checks.mjs`) — deterministic facts against the answer key:
   amount exact, count, raw and app-facing date, category valid/best/acceptable,
   merchant, account (`wrong` / `invented` / `missed`), item recall/precision,
   quantities, item sum, JSON purity, currency pinned. A case **strict-passes** when
   the app would get every amount (and account / item list) exactly right.
3. **Judge** (`lib/judge.mjs`) — one headless `claude -p --model opus` session per
   case: Read-only tools scoped to the dataset folder (it can open the image), no
   CLAUDE.md/settings/skills/MCP, answer forced into the rubric's JSON schema with
   `--json-schema`. It sees the request, answer key, raw and Worker-normalized
   output and the checks, and is **blind to the model name**. Each rubric
   criterion gets 0-4 with a reason, plus critical errors, `user_would_accept`
   and a summary.
4. **Score** (`lib/scoring.mjs`) — criteria weighted per mode (`lib/rubric.mjs`) into
   0-100. A failed scan scores 0. An **auto score** fills the same criteria from
   the checks alone, so `--no-judge` runs are still comparable and a large
   judge/auto gap marks a case worth reading. A model's score is the mean per
   mode, then the mean across modes (equal weights unless `--weights`).

Rubric weights (sum to 100 per mode):

| quick              | itemized                | screenshot        |
| ------------------ | ----------------------- | ----------------- |
| amount 40          | amount 15               | amount 30         |
| receipt count 15   | count + detail 10       | account 25        |
| category 15        | item completeness 20    | count 15          |
| date 10            | item accuracy 20        | merchant/payee 10 |
| merchant 10        | non-items excluded 10   | category 10       |
| output contract 10 | detail metadata 10      | date 5            |
|                    | category 5, contract 10 | output contract 5 |

Judgements are cached in `results/.judge-cache/`, keyed by the judge prompt,
rubric version, judge model, case, image and the exact model output, so re-runs
only pay for answers that changed.

## Output

Each run writes `results/<timestamp>/report.md` (leaderboard, app-facing metrics,
cost and speed, and per model its weakest tags and worst cases with the judge's
explanation) and `run.json` (every raw output, attempt, check and judge reason).
`results/LEADERBOARD.md` keeps the latest full-suite result per model on the
current dataset; filtered or limited runs are listed separately as partial.
`results/` is gitignored scratch.

## Run history (committed)

Every run is also logged to `history/` and **committed automatically**, so `git log`
shows how each model scored over time:

- `history/HISTORY.md`: one table of every run, newest first (time, model, score per mode,
  strict pass, wrong/guessed accounts, invented payments, cost per 1,000 scans, latency,
  dataset version, and the code commit measured, `+` when the eval or Worker had uncommitted edits).
- `history/runs/<timestamp>.md`: that run's full report.
- `history/runs.jsonl`: the same, one JSON line per model per run.

The commit contains only those files (`git commit -- <paths>`), so anything else you have
staged is left alone. It is not pushed. Smoke tests and filtered runs are logged too, marked
partial. `--no-commit` writes the history without committing; `rescore.mjs` updates that run's
lines (and commits) instead of adding new ones.

## Cost

Costs include prompt caching. OpenRouter's billed `cost` already discounts cached reads and
includes any cache-write premium; the report also shows the mean cached and cache-written prompt
tokens. For `claude-code:` models and the judge, cost is computed per token type at Anthropic list
price (`lib/anthropicPricing.mjs`): plain input, cache writes at 1.25x (5-minute) or 2x (1-hour)
input, cache reads at 0.1x (0.05x on Opus 5.5), and output. `claude -p` writes each prompt to a
1-hour cache, so a `claude-code:` row also shows the cost with no caching, which is closer to a
one-off production call. The CLI's own `total_cost_usd` is kept only for reference: it has no price
for models it does not list yet and was about 66x off for Haiku 5.5.

OpenRouter calls are cheap (the production models cost cents per thousand scans). The judge
dominates: about **$0.03-0.05 per judgement**, so roughly **$4-6 per model** for the full suite, and
nothing for answers already in the cache. `--dry-run` prints the plan and a rough estimate first.

## Setup

- Node 24+ (the Worker's TypeScript is loaded with Node's built-in type stripping) and `sharp` (already a dependency).
- `claude` CLI on PATH, signed in (the judge runs on your Claude Code account).
- `OPENROUTER_API_KEY` in `evals/receipt-scanner/.env` (gitignored), `.env.local`, or the environment.

## Flags

```
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
--out <dir>             results directory (default evals/receipt-scanner/results)
--dry-run               validate models and print the plan; no API calls
--no-commit             write the run to history/ but do not commit it
--force                 run a model even if OpenRouter says it takes no images
```

After changing `lib/checks.mjs` or `lib/scoring.mjs`, re-score a saved run without calling any
model or the judge (judge verdicts are kept):

```bash
node evals/receipt-scanner/rescore.mjs evals/receipt-scanner/results/<run>
```

Rebuild or inspect the dataset on its own:

```bash
node evals/receipt-scanner/build-dataset.mjs --list     # case table
node evals/receipt-scanner/build-dataset.mjs --force    # re-render into dataset/generated/
```

## Changing things

- **Prompts or parsing** live in the Worker and are picked up automatically; re-run the models you care about.
- **New case**: add it to `dataset/cases.mjs` (receipt spec, screen template data, or paper SVG) with a `notes` line naming the trap. `build-dataset` validates that expected categories and accounts are in the case's own lists.
- **Rubric**: edit `lib/rubric.mjs` and bump `RUBRIC_VERSION`.
- **Procedural set**: bump `PROCEDURAL_VERSION` in `dataset/procedural.mjs` to reshuffle it deliberately.
