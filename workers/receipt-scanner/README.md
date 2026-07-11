# money2time Receipt-Scanner Worker

Cloudflare Worker that proxies receipt-scan requests to **Featherless
(Qwen3-VL)**. It keeps the Featherless API key server-side, verifies the
caller's **RevenueCat** entitlement, and meters usage so the flat-rate
Featherless plan can't be abused from the no-login app.

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

Quota is consumed **only on a successful parse**, so failed scans don't burn a
user's allowance.

## Config

`wrangler.toml` `[vars]`: `MODEL`, `ENTITLEMENT_ID`, `FREE_MONTHLY_LIMIT` (free
scans per month), `PRO_DAILY_LIMIT` (Pro scans per day).

Switch models (e.g. to `Qwen/Qwen3-VL-32B-Instruct`) by changing `MODEL` — no
app change needed. The 8B default has more Featherless concurrency headroom.

## Deploy

```bash
cd workers/receipt-scanner
npm install

# one-time: create the KV namespace and paste its id into wrangler.toml
# (binding: MONEY2TIME_WORKERS_KV_RECEIPT_SCANNER)
npx wrangler kv namespace create money2time-workers-kv-receipt-scanner

# one-time: set secrets
npx wrangler secret put FEATHERLESS_API_KEY
npx wrangler secret put REVENUECAT_SECRET_KEY

# deploy (provisions the workers-receipt-scanner.money2time.com custom domain)
npm run deploy
```

## Local dev

```bash
npx wrangler dev
curl -X POST http://localhost:8787/scan \
  -H 'Content-Type: application/json' \
  -d "{\"appUserId\":\"m2t_test\",\"image\":\"$(base64 -w0 sample-receipt.jpg)\",\"mime\":\"image/jpeg\",\"currency\":\"USD\",\"categories\":[\"Food\",\"Groceries\",\"Other\"]}"
```
