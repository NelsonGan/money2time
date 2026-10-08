# money2time Receipt-Scanner Worker

Cloudflare Worker that proxies receipt-scan requests to **OpenRouter**. It keeps
the OpenRouter API key server-side, verifies the
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
`npm test` at the repo root ignore it, except the explicit Worker contract tests under `__tests__/cloudflare/`.

## Endpoint

`POST /scan`

```jsonc
// request
{
  "appUserId": "m2t_…", // settings.appUserId from the app
  "image": "<base64>", // no data: prefix
  "mime": "image/jpeg",
  "currency": "USD", // user's reporting currency
  "categories": ["Food", "…"], // user's expense category names
  "mode": "quick", // "quick" (default) | "itemized" | "screenshot"
  "accounts": ["Visa", "…"], // screenshot mode only, matched against the payment source
}
```

`mode` picks the prompt and the response shape (see `src/scanModes/`): `quick` reads
the total only, `itemized` adds a line-item breakdown for Split by Item, and
`screenshot` also matches the payment source against `accounts`.

```jsonc
// 200
{
  "transactions": [
    /* ScannedTransaction[] */
  ],
  "quota": { "used": 3, "limit": 10, "isPro": false, "interval": "month" },
}
// 402 { "error": "limit_reached", "isPro": false, "limit": 10, "used": 10, "interval": "month" }
// 429 { "error": "capacity" }                       // upstream saturated (retryable)
// 400 { "error": "missing_image" | "invalid_mime" | … }
// 502 { "error": "inference_failed", "detail": "…" }
```

Quota is consumed **only when the parse yields at least one transaction**, so
failed scans and unreadable receipts (`transactions: []`) don't burn a user's
allowance.

## Config

`wrangler.toml` `[vars]`: `MODEL`, `ENTITLEMENT_ID`, and the per-tier quota:

| Var             | Default   | Meaning                                                         |
| --------------- | --------- | --------------------------------------------------------------- |
| `FREE_LIMIT`    | `20`      | Free scans allowed per window                                   |
| `FREE_INTERVAL` | `100year` | Free metering cadence (a 100-year window ≈ lifetime)            |
| `PRO_LIMIT`     | `500`     | Pro scans allowed per window (fair-use; paywall says unlimited) |
| `PRO_INTERVAL`  | `month`   | Pro metering cadence                                            |

The rate limiter is interval-agnostic (`src/interval.ts`): a `*_INTERVAL` is a
unit (`day`/`week`/`month`/`year`) with an optional count prefix, so changing a
tier's cadence — including a "lifetime" tier via a huge window like `100year` —
needs **no code or schema change**. A `scan_usage` row is keyed by
`(interval_unit, window_start)` where `interval_unit` is the base unit
(`100year` rows store `year`), so switching cadence just opens fresh rows under
the new key. Single-count windows are UTC and calendar-aligned (weeks start
Monday); multi-count windows are anchored at the Unix epoch (`100year` =
1970–2070). Adding another base unit (e.g. `quarter`) is a single case in
`interval.ts` plus its value in the schema's `interval_unit` CHECK. If you
change an interval, update the app's paywall/limit copy to match (free copy
currently says "in total"; Pro is advertised as unlimited).

Switch models by changing `MODEL` — no app change needed. Model IDs use
OpenRouter's naming. Any multimodal model on OpenRouter that accepts image
input works.

If the primary `MODEL` errors or times out (provider down or overloaded), the
Worker automatically retries the request once with `BACKUP_MODEL`
(`google/gemma-3-4b-it` when unset). Set `BACKUP_MODEL` to the same value as
`MODEL` to disable failover.

## Storage (D1)

Two time-bounded concerns, both in the `money2time-d1-receipt-scanner` D1
database (schema in `cloudflare/d1/receipt-scanner/schema.sql`):

| Concern           | Table               | Key                                          | Expiry                                    |
| ----------------- | ------------------- | -------------------------------------------- | ----------------------------------------- |
| Usage counter     | `scan_usage`        | `(app_user_id, interval_unit, window_start)` | window end in `expires_at`; cron-pruned   |
| Entitlement cache | `entitlement_cache` | `app_user_id`                                | `expires_at` checked on read; cron-pruned |

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

One-time: add the secrets in the Cloudflare dashboard — Workers & Pages →
money2time-workers-receipt-scanner → Settings → Variables and Secrets → add each
as a "Secret" (encrypted): `OPENROUTER_API_KEY`, `REVENUECAT_SECRET_KEY`, and
`MONEY2TIME_REQUEST_SIGNING_KEY` (the same value as the app's
`EXPO_PUBLIC_REQUEST_SIGNING_KEY`; leave unset to accept unsigned requests).
Dashboard secrets survive every deploy, so they only need to be set once.
(Equivalent CLI, if you prefer: `npx wrangler secret put <NAME>`.)

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

## Text-only notification mode

`POST /scan` also accepts a text-only request (no image or MIME):

```json
{
  "appUserId": "m2t_example",
  "mode": "notification",
  "text": "Salary MYR 3500 from ACME has been credited.",
  "capturedAt": "2026-10-08T01:00:00Z",
  "currency": "MYR",
  "categories": ["Food", "Other"],
  "incomeCategories": ["Salary", "Other"]
}
```

`currency` is the explicitly selected account's currency for ambiguous symbols.
The system prompt classifies completed expense/income, including completed refund
credits, and rejects promotions, reminders, codes, failed/pending payments, holds,
own-account transfers and unrelated text. Notification text is untrusted user
content, separate from the system instructions. One high-confidence completed
movement is required. The reply adds `notificationDecision: "transaction"` or
`"ignore"`; ignores have an empty transactions array and are not retried.
Malformed model output returns a retryable 502 rather than pretending it is an ignore.
Amounts/types/currencies and category type are validated before responding.
The response may include `secondary` for an explicitly billed foreign amount.
Text is capped at 12000 characters and is never logged by this Worker.

The existing signed request/entitlement flow applies. Notification counters use
`notification:<appUserId>` so receipt quota is untouched. `FREE_NOTIFICATION_LIMIT`
is 100 lifetime, `PRO_NOTIFICATION_LIMIT` is 2000/month, and
`NOTIFICATION_DAILY_ATTEMPTS` is 500 per UTC day, including ignores/failures.
Intentional ignores do not consume the valid-scan quota. Temporary 429/402 responses
leave captures queued on the client. The D1 schema needs no migration.

Run app contract tests with `npm test -- --runInBand __tests__/cloudflare` from the
repository root and run `npm run typecheck` here. Roll out this Worker before the
app. Existing image modes are unchanged; older Workers cannot accidentally classify
or discard new text requests.

For live semantic evaluation, run `node scripts/evaluate-notification-scanner.mjs`
from the repository root against a configured preview. It uses the synthetic
notification corpus and checks decision, amount and currency. Set
`SCANNER_EVALUATION_URL`, `SCANNER_EVALUATION_USER` and the preview's signing key;
optional fixture IDs select a subset. See
[`docs/notification-scanner-verification.md`](../../../docs/notification-scanner-verification.md)
for actual model/device evidence and remaining release checks.
