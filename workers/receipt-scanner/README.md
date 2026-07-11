# money2time Receipt-Scanner Worker

Cloudflare Worker that proxies receipt-scan requests to **Featherless
(Qwen3-VL)**. It keeps the Featherless API key server-side, verifies the
caller's **RevenueCat** entitlement, and meters usage so the flat-rate
Featherless plan can't be abused from the no-login app.

State (entitlement cache + rate-limit counters) lives in a **D1** database
(`schema.sql`); rate-limit increments are a single atomic
`INSERT … ON CONFLICT DO UPDATE … RETURNING`, so parallel scans from one user
can't race past the limit.

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
  "categories": ["Food", "…"]   // user's expense category names
}
```

```jsonc
// 200
{ "transactions": [ /* ScannedTransaction[] */ ], "quota": { "used": 3, "limit": 10, "isPro": false } }
// 402 { "error": "limit_reached", "isPro": false, "limit": 10, "used": 10 }
// 429 { "error": "capacity" }                       // Featherless saturated (retryable)
// 400 { "error": "missing_image" | … }
// 502 { "error": "inference_failed", "detail": "…" }
```

Quota is consumed **only when the parse yields at least one transaction**, so
failed scans and unreadable receipts (`transactions: []`) don't burn a user's
allowance.

## Config

`wrangler.toml` `[vars]`: `MODEL`, `ENTITLEMENT_ID`, `FREE_MONTHLY_LIMIT` (free
scans per month), `PRO_DAILY_LIMIT` (Pro scans per day).

Switch models (e.g. to `Qwen/Qwen3-VL-32B-Instruct`) by changing `MODEL` — no
app change needed. The 8B default has more Featherless concurrency headroom.

## State (D1)

`schema.sql` defines two tables in one D1 database (binding `DB`):

| Table               | Key                                            | Purpose                                             |
| ------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `scan_usage`        | `day:YYYY-MM-DD:{id}` / `month:YYYY-MM:{id}`   | Rate-limit counter (`count`) + `expires_at` (reset) |
| `entitlement_cache` | `app_user_id`                                  | Cached RevenueCat `is_pro` (0/1) + `expires_at`     |

D1 has no native TTL. `scan_usage` keys embed the day/month, so a new window
starts a fresh row and `expires_at` is only for pruning
(`DELETE FROM scan_usage WHERE expires_at <= <now>`). `entitlement_cache` is
keyed by the stable App User ID, so its `expires_at` is checked on read.

## Deploy

```bash
cd workers/receipt-scanner
npm install

# one-time: create the D1 database, then paste the printed database_id into
# wrangler.toml ([[d1_databases]] → database_id)
npx wrangler d1 create money2time-workers-receipt-scanner

# one-time: apply the schema to the remote DB (drop --remote for local dev)
npx wrangler d1 execute money2time-workers-receipt-scanner --remote --file=./schema.sql

# one-time: set secrets
npx wrangler secret put FEATHERLESS_API_KEY
npx wrangler secret put REVENUECAT_SECRET_KEY

# deploy (provisions the workers-receipt-scanner.money2time.com custom domain)
npm run deploy
```

## Local dev

```bash
# one-time: apply the schema to the local dev DB
npx wrangler d1 execute money2time-workers-receipt-scanner --local --file=./schema.sql

npx wrangler dev
curl -X POST http://localhost:8787/scan \
  -H 'Content-Type: application/json' \
  -d "{\"appUserId\":\"m2t_test\",\"image\":\"$(base64 -w0 sample-receipt.jpg)\",\"mime\":\"image/jpeg\",\"currency\":\"USD\",\"categories\":[\"Food\",\"Groceries\",\"Other\"]}"
```
