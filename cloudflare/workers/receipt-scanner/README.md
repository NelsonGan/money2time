# money2time Receipt-Scanner Worker

Cloudflare Worker that proxies receipt-scan requests to **OpenRouter
(Gemini 2.5 Flash Lite)**. It keeps the OpenRouter API key server-side, verifies the
caller's **RevenueCat** entitlement, and meters usage so OpenRouter spend
can't be abused from the no-login app.

State (entitlement cache + rate-limit counters) lives in **D1**
(`money2time-d1-receipt-scanner`, bound as `MONEY2TIME_D1_RECEIPT_SCANNER`) —
schema in `cloudflare/d1/receipt-scanner/schema.sql`.

Served at **`https://workers-receipt-scanner.money2time.com/scan`**.

Lives under `cloudflare/workers/receipt-scanner` — the `cloudflare/` tree holds
the Cloudflare resources by product: one folder per Worker under
`cloudflare/workers/`, one folder per D1 database schema under `cloudflare/d1/`.
Each Worker folder is isolated from the Expo app: it has its own `package.json`
/ `tsconfig.json`, and the whole `cloudflare/` tree is excluded from the root
`tsconfig`, ESLint, Jest, Prettier, Metro bundling, and EAS so `npm run check` /
`npm test` at the repo root ignore it.

## Endpoint

`POST /scan`

```jsonc
// request
{
  "appUserId": "m2t_…",        // settings.appUserId from the app
  "image": "<base64>",          // no data: prefix
  "mime": "image/jpeg",
  "currency": "USD",            // user's reporting currency
  "categories": ["Food", "…"],  // user's expense category names (single mode)
  "mode": "single"              // "single" (default) | "items" (split-bill breakdown)
}
```

```jsonc
// 200 (mode "single")
{ "transactions": [ /* ScannedTransaction[] */ ], "quota": { "used": 3, "limit": 10, "isPro": false } }
// 200 (mode "items") — itemized breakdown for splitting
{ "merchant": "Cafe", "date": "2026-07-11", "items": [ { "name": "Latte", "amount": 4.5 } ], "quota": { … } }
// 402 { "error": "limit_reached", "isPro": false, "limit": 10, "used": 10 }
// 429 { "error": "capacity" }                       // upstream saturated (retryable)
// 400 { "error": "missing_image" | "invalid_mode" | … }
// 502 { "error": "inference_failed", "detail": "…" }
```

Quota is consumed **only when the parse yields at least one transaction**, so
failed scans and unreadable receipts (`transactions: []`) don't burn a user's
allowance.

## Config

`wrangler.toml` `[vars]`: `MODEL`, `ENTITLEMENT_ID`, and the per-tier quota:

| Var             | Default   | Meaning                                          |
| --------------- | --------- | ------------------------------------------------ |
| `FREE_LIMIT`    | `10`      | Free scans allowed per window                     |
| `FREE_INTERVAL` | `month`   | Free metering cadence: `day`/`week`/`month`/`year`|
| `PRO_LIMIT`     | `200`     | Pro scans allowed per window                       |
| `PRO_INTERVAL`  | `month`   | Pro metering cadence                               |

The rate limiter is interval-agnostic (`src/interval.ts`): change a tier's
`*_INTERVAL` to re-meter it daily/weekly/monthly/yearly with **no code or schema
change** — a `scan_usage` row is keyed by `(interval_unit, window_start)`, so
switching cadence just opens fresh rows under the new `interval_unit`. Windows
are UTC and calendar-aligned; weeks start Monday. Adding another cadence (e.g.
`quarter`) is a single case in `interval.ts` plus its value in the schema's
`interval_unit` CHECK. If you change an interval, update the app's paywall/limit
copy to match (it currently says "per month").

Switch models (e.g. to `google/gemini-2.5-flash`) by changing `MODEL` — no app
change needed. Model IDs use OpenRouter's naming
(`google/gemini-2.5-flash-lite` is the default). Any multimodal model on
OpenRouter that accepts image input works.

## Storage (D1)

Two time-bounded concerns, both in the `money2time-d1-receipt-scanner` D1
database (schema in `cloudflare/d1/receipt-scanner/schema.sql`):

| Concern           | Table               | Key                                              | Expiry                                    |
| ----------------- | ------------------- | ------------------------------------------------ | ----------------------------------------- |
| Usage counter     | `scan_usage`        | `(app_user_id, interval_unit, window_start)`     | window end in `expires_at`; cron-pruned   |
| Entitlement cache | `entitlement_cache` | `app_user_id`                                    | `expires_at` checked on read; cron-pruned |

D1 has no native TTL, so every row carries an `expires_at` (epoch-ms) and the
daily cron (`scheduled()`) prunes stale rows. `scan_usage` is one row per
`(app_user_id, interval_unit, window_start)` — `interval_unit` is the cadence
(`day`/`week`/`month`/`year`) and `window_start` is the epoch-ms at the window's
UTC start — so a new window starts a fresh row and the counter increment is a
single atomic upsert on that key. A user's counter is shared across a tier change
within the same window (an upgrade keeps the count and raises the ceiling).

**PR previews share this database.** Preview versions keep the bindings from
`wrangler.toml`, so branch previews read/write the production D1. That's
acceptable: the rows are throwaway rate-limit counters and a 60s cache. A PR
that changes the schema is only applied on merge to `main` (the deploy job), so
test destructive schema changes locally first.

## Deploy

# one-time: add the secrets in the Cloudflare dashboard — Workers & Pages →
# money2time-workers-receipt-scanner → Settings → Variables and Secrets → add
# each as a "Secret" (encrypted): OPENROUTER_API_KEY and REVENUECAT_SECRET_KEY.
# Dashboard secrets survive every deploy, so they only need to be set once.
# (Equivalent CLI, if you prefer: `npx wrangler secret put <NAME>`.)

```bash
cd cloudflare/workers/receipt-scanner
npm install

# one-time: create the D1 database, paste its id into wrangler.toml
# ([[d1_databases]] → database_id), then apply the schema
npx wrangler d1 create money2time-d1-receipt-scanner
npx wrangler d1 execute money2time-d1-receipt-scanner --remote --file=../../d1/receipt-scanner/schema.sql

# deploy (provisions the workers-receipt-scanner.money2time.com custom domain)
npm run deploy
```

Production deploys normally run through CI (`.github/workflows/cloudflare.yml`
on push to `main` when `cloudflare/**` changes), which re-applies the schema
before every deploy — so additive schema changes ship on merge without a manual
step. Keep the schema idempotent (`IF NOT EXISTS`).

## Local dev

```bash
# apply the schema to the local dev DB first
npx wrangler d1 execute money2time-d1-receipt-scanner --local --file=../../d1/receipt-scanner/schema.sql

npx wrangler dev
curl -X POST http://localhost:8787/scan \
  -H 'Content-Type: application/json' \
  -d "{\"appUserId\":\"m2t_test\",\"image\":\"$(base64 -w0 sample-receipt.jpg)\",\"mime\":\"image/jpeg\",\"currency\":\"USD\",\"categories\":[\"Food\",\"Groceries\",\"Other\"]}"
```
