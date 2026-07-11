# money2time Receipt-Scanner Worker

Cloudflare Worker that proxies receipt-scan requests to **Featherless
(Qwen3-VL)**. It keeps the Featherless API key server-side, verifies the
caller's **RevenueCat** entitlement, and meters usage so the flat-rate
Featherless plan can't be abused from the no-login app.

State (entitlement cache + rate-limit counters) lives in a pluggable store —
**KV** (default) or **D1** — selected by the `STORAGE_BACKEND` var. The backends
sit behind one interface in `src/storage.ts`, so the rest of the Worker is
storage-blind. See **Storage backend** below.

Served at **`https://workers-receipt-scanner.money2time.com/scan`**.

Lives under `workers/receipt-scanner` — the `workers/` tree holds one folder per
Cloudflare Worker so more can be added later. Each folder is isolated from the
Expo app: it has its own `package.json` / `tsconfig.json`, and the whole
`workers/` tree is excluded from the root `tsconfig`, ESLint, Jest, Prettier,
Metro bundling, and EAS so `npm run check` / `npm test` at the repo root ignore it.

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
// 429 { "error": "capacity" }                       // Featherless saturated (retryable)
// 400 { "error": "missing_image" | "invalid_mode" | … }
// 502 { "error": "inference_failed", "detail": "…" }
```

Quota is consumed **only when the parse yields at least one transaction**, so
failed scans and unreadable receipts (`transactions: []`) don't burn a user's
allowance.

## Config

`wrangler.toml` `[vars]`: `MODEL`, `ENTITLEMENT_ID`, `FREE_MONTHLY_LIMIT` (free
scans per month), `PRO_DAILY_LIMIT` (Pro scans per day), `STORAGE_BACKEND`
(`"kv"` default, or `"d1"`).

Switch models (e.g. to `Qwen/Qwen3-VL-32B-Instruct`) by changing `MODEL` — no
app change needed. The 8B default has more Featherless concurrency headroom.

## Storage backend (KV ⇄ D1)

Both the rate-limit counter and the entitlement cache go through one interface
(`src/storage.ts`); `STORAGE_BACKEND` picks the implementation:

| Concern           | Key                                            | KV                                | D1 (`scan_usage` / `entitlement_cache`)         |
| ----------------- | ---------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| Usage counter     | `scans:day:YYYY-MM-DD:{id}` / `scans:YYYY-MM:{id}` | value = count, native TTL     | `count` + `expires_at`; atomic upsert           |
| Entitlement cache | `rc:{id}` (KV) / `app_user_id` (D1)            | `pro`/`free`, native 60s TTL      | `is_pro` (0/1) + `expires_at` (checked on read) |

- **KV (default)** works out of the box with the namespace binding in
  `wrangler.toml`; keys self-expire, so the daily cron is a no-op.
- **D1** has no native TTL, so `schema.sql` stores `expires_at` and the daily
  cron (`scheduled()`) prunes stale rows. `scan_usage` keys embed the day/month,
  so a new window starts a fresh row; `entitlement_cache` is keyed by the stable
  App User ID and expired on read.

**To switch to D1:** uncomment the `[[d1_databases]]` block in `wrangler.toml`,
run `wrangler d1 create money2time-workers-receipt-scanner`, paste the id, apply
`schema.sql` (see Deploy), and set `STORAGE_BACKEND = "d1"`. **Back to KV:** set
`STORAGE_BACKEND = "kv"`. Counters don't carry across backends, but they're
short-lived windows so a switch just resets everyone's current-window count.

## Deploy

```bash
cd workers/receipt-scanner
npm install

# one-time: set secrets
npx wrangler secret put FEATHERLESS_API_KEY
npx wrangler secret put REVENUECAT_SECRET_KEY

# --- D1 backend only (skip for KV): create the DB, paste its id into
#     wrangler.toml ([[d1_databases]] → database_id), then apply the schema ---
npx wrangler d1 create money2time-workers-receipt-scanner
npx wrangler d1 execute money2time-workers-receipt-scanner --remote --file=./schema.sql

# deploy (provisions the workers-receipt-scanner.money2time.com custom domain)
npm run deploy
```

## Local dev

```bash
# D1 backend only: apply the schema to the local dev DB first
npx wrangler d1 execute money2time-workers-receipt-scanner --local --file=./schema.sql

npx wrangler dev
curl -X POST http://localhost:8787/scan \
  -H 'Content-Type: application/json' \
  -d "{\"appUserId\":\"m2t_test\",\"image\":\"$(base64 -w0 sample-receipt.jpg)\",\"mime\":\"image/jpeg\",\"currency\":\"USD\",\"categories\":[\"Food\",\"Groceries\",\"Other\"]}"
```
