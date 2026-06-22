# Multi-Currency — Design & Implementation Plan

Status: **Design / proposal** · Branch: `claude/multi-currency-design-ana50m`

This document describes how to add real multi-currency support to money2time:
multiple accounts each in their own currency, foreign-currency transactions,
and correct aggregation/display in a single user-chosen reporting currency,
with FX rates sourced daily from [Frankfurter](https://frankfurter.dev) plus a
manual "Update rates" button.

---

## 1. Where the codebase stands today

The storage layer is **already half-ready**; the behavior is **single-currency**.

Already present:

- `accountsTable.currency`, `transactionsTable.currency`, `recurringRulesTable.currency`
  (all `NOT NULL`) — `lib/db/schema.ts`.
- `settingsTable.currencyCode` + `currencySymbol` — one global currency.
- `MAJOR_CURRENCIES` (32 currencies with symbols) — `constants/appDefaults.ts:82`.
- Locale-based currency detection — `getLocaleCurrencyCode()` / `getLocaleCurrencySymbol()`
  in `utils/formatters.ts`.

Single-currency assumptions that must change:

- **`formatAmount()`** (`utils/formatters.ts:289`) reads only `settings.currencySymbol`
  and ignores each row's `currency`. So per-row currency is currently dead metadata.
- **`accountsRepository.getBalances()`** (`lib/repositories/accountsRepository.ts:142`)
  does raw `SUM(amount)` per account and the UI sums those across accounts — adding
  USD + JPY numerically.
- **`getCashflowSummary`**, **`buildBreakdown`**, `getExpenseBreakdownByCategory/BySubcategory`,
  `getIncomeBreakdown`, `getTransfersBetweenAccounts` (`context/AppContext.tsx`) all sum
  raw amounts with no currency awareness.
- **Time-mode** converts money→hours via `trueHourlyRate`, implicitly in the wage currency.
  FX must run *upstream* of money→time.
- No FX rate table, no conversion helper anywhere.

**Implication:** the data shape is mostly right. The work is a conversion + display
layer plus an FX rate source, not a schema rewrite.

---

## 2. Scope — two features

1. **Multi-currency accounts (net-worth aggregation).** Each account has its own
   currency; totals/insights are shown in one reporting currency. *Primary goal.*
2. **Foreign-currency transactions.** A transaction whose currency differs from its
   account's currency (e.g. ¥5,000 spent on an SGD card). *Extension reusing the same
   FX machinery.*

Both are covered below. Feature 1 is Phases 1–2; Feature 2 is Phase 3.

---

## 3. Core model decisions

### 3.1 Reporting currency
`settings.currencyCode` is repurposed as the **reporting currency** — the single
currency in which all aggregates (net worth, cashflow, insights, calendar totals,
time-mode) are displayed. `currencySymbol` is kept in sync with it.

### 3.2 Per-row currency = the "native" currency
- An **account's** `currency` is its source-of-truth currency. Its balance is always
  computed in that currency.
- A **transaction's** `amount` is **always stored in its account's currency.** This
  keeps balance math trivial (sum within an account never needs conversion).

### 3.3 Foreign-currency transactions
When the user enters an amount in a currency different from the account's, store both:

- `amount` + `currency` — value in the **account's** currency (what hit the account).
- `originalAmount` + `originalCurrency` — what the user actually typed (e.g. ¥5,000 JPY).
- `exchangeRate` — the rate used at entry time (snapshot; see 3.4).

Display shows the original with the converted underneath: `¥5,000 ≈ S$45.20`.
Balances/aggregates always use `amount` (account currency) → reporting currency.

### 3.4 Rate snapshotting (historical accuracy)
Aggregates convert **account currency → reporting currency** at *display* time using
the latest cached rate. This is acceptable for net worth (it should reflect today's
value). But for the foreign→account conversion of an individual transaction we snapshot
`exchangeRate` at creation so the recorded `amount` never silently changes.

Decision: **display-time conversion for reporting-currency aggregates** (simple, matches
user expectation of "current net worth"), **snapshot conversion for foreign→account
amounts** (faithful to what actually happened). No per-transaction reporting-currency
snapshot — keeps storage small and avoids rewriting history on rate refresh, at the cost
that historical insights re-value at current rates (documented in UI with a "≈" + "as of"
note).

### 3.5 Internal rate base
Store all rates relative to **one canonical base = the reporting currency** at refresh
time. Frankfurter returns a full table from one base in a single call, so
`convert(A→B) = rate(base→B) / rate(base→A)`. When the reporting currency changes, refetch
with the new base. Avoids an N×N matrix.

---

## 4. FX rates — Frankfurter integration

ECB-backed, free, no API key.

### 4.1 Endpoints
- Latest (all rates from one base, one request/day):
  `GET https://api.frankfurter.dev/v1/latest?base=USD`
  → `{ "amount": 1.0, "base": "USD", "date": "2026-06-19", "rates": { "EUR": 0.92, ... } }`
- Historical (for back-dated foreign transactions):
  `GET https://api.frankfurter.dev/v1/{YYYY-MM-DD}?base=USD`
- Currency list: `GET https://api.frankfurter.dev/v1/currencies`

Notes:
- ECB publishes on working days ~16:00 CET. Weekend/holiday requests return the last
  working day's rates — surface the returned `date` as "as of", not "today".
- Network: on device this is a normal request. In Claude Code web sessions the egress
  allowlist must include `api.frankfurter.dev` to exercise it during dev.

### 4.2 Coverage gap (must handle)
Frankfurter covers only the ~30 ECB reference currencies. **7 currencies in
`MAJOR_CURRENCIES` are NOT covered:** `TWD`, `VND`, `PKR`, `BDT`, `AED`, `RUB`, `UAH`.

Handling: rate rows carry `source: 'api' | 'manual'`. Uncovered currencies fall back to
**manual entry** with a "No automatic rate available — enter manually" hint in the
Exchange Rates screen. No second data source needed for v1.

### 4.3 Daily fetch — mirror the auto-backup pattern
Reuse the proven shape from `services/autoBackup*.ts` +
`services/autoBackupTaskRegistration.ts`:

- `runRateRefreshIfDue({ force? })` — skip if already refreshed today (staleness check
  like `isBackupStale(settings.lastAutoBackupAt)`), else fetch + upsert. Called on app
  foreground and from the background task.
- `refreshRatesNow()` — what the button calls; `runRateRefreshIfDue({ force: true })`.
- Register in the existing background task (or a sibling task) so it refreshes
  periodically without the app open.
- Always read from the cached table; the network call only *updates* cache → fully
  functional offline with last-known rates.

---

## 5. Schema changes

### 5.1 New table: `exchange_rates`
```ts
export const exchangeRatesTable = sqliteTable('exchange_rates', {
  id: text('id').primaryKey(),
  baseCurrency: text('base_currency').notNull(),   // canonical base at fetch time
  quoteCurrency: text('quote_currency').notNull(),
  rate: real('rate').notNull(),                    // 1 base = rate quote
  asOfDate: text('as_of_date').notNull(),          // date from Frankfurter (YYYY-MM-DD)
  source: text('source').notNull().default('api'), // 'api' | 'manual'
  updatedAt: text('updated_at').notNull(),
});
// unique index on (base_currency, quote_currency)
```

### 5.2 `transactions` — foreign-currency columns
- `originalAmount` `real` (nullable)
- `originalCurrency` `text` (nullable)
- `exchangeRate` `real` (nullable)

`recurring_rules` gets the same three so generated transactions inherit them.

### 5.3 `settings`
- `lastRateFetchAt` `text` (nullable)
- `lastRateFetchError` `text` (nullable)
- (optional) `autoFxRefreshEnabled` `integer` boolean default `true`

### 5.4 Migrations (additive, mirror existing convention)
New files in `lib/db/migrations/`, strictly ascending versions (next is `026`):
- `026_exchange_rates_table.ts` — create table + unique index.
- `027_transactions_foreign_currency.ts` — add 3 columns (idempotent `PRAGMA table_info`
  guard, like `002`).
- `028_recurring_rules_foreign_currency.ts`
- `029_settings_fx_refresh.ts`

Each uses the `PRAGMA table_info` existence check pattern from `002_settings_currency_code.ts`
and exports a `default` `DbMigration` with matching `version`. Bump `schema.ts` types
accordingly. The migration runner (`lib/db/migrations/index.ts`) auto-discovers files via
`require.context`, so no index edits needed — just the version/name must match the filename.

---

## 6. Conversion layer

### 6.1 New service `services/exchangeRates.ts` (+ `.native.ts` / `.shared.ts`)
Follow the platform-split convention (`.native.ts` real impl, `.shared.ts` web/test
fallback returning cached/identity rates).

```ts
runRateRefreshIfDue(opts?: { force?: boolean }): Promise<RateRefreshResult>
refreshRatesNow(): Promise<RateRefreshResult>           // force = true
getRateAsOfDate(): string | null                        // for "as of" labels
```

### 6.2 New repository `lib/repositories/exchangeRatesRepository.ts`
```ts
upsertRates(base, asOfDate, rates: Record<string, number>, source): void
getRate(from, to): number | null      // derives via canonical base
listRates(): ExchangeRate[]
setManualRate(from, to, rate): void
```

### 6.3 Pure helper in `utils/currency.ts`
```ts
convert(amount: number, from: string, to: string, rates: RateTable): number
```
Pure and synchronous (rates passed in / read from an in-memory snapshot held by
`AppContext`) so it is trivially unit-testable and usable inside `useMemo`s. Returns the
input unchanged when `from === to`; returns `amount` (un-converted) + flags
`isApproximate=false`/missing-rate when a rate is unavailable, so the UI can badge it.

### 6.4 `formatAmount` signature change
Currency must be explicit, not pulled from global settings:
```ts
formatAmount(amount, currency, settings, options)
```
- `currency` = the currency the `amount` is denominated in.
- Internally: if `currency !== settings.currencyCode`, convert to reporting currency
  first; if `displayMode === 'time'`, convert reporting-currency → hours via
  `trueHourlyRate` (FX strictly upstream of time).
- Symbol lookup from `MAJOR_CURRENCIES` by code (drop reliance on the stored
  `currencySymbol` for non-reporting currencies).
- This touches ~40 call sites (see §2 grep). Do it as a mechanical, test-guarded refactor:
  most call sites pass `settings.currencyCode` (reporting) and are behavior-neutral; the
  account/transaction views pass the row currency.

---

## 7. Aggregation changes (`context/AppContext.tsx` + repositories)

All cross-account/cross-currency sums convert to the reporting currency first:

- `accountsRepository.getBalances()` — keep each account's **native** balance, and add a
  `convertedBalance` in reporting currency (or convert in the context memo, keeping the
  repo currency-agnostic — preferred, so SQL stays simple).
- `accountBalances` memo (`AppContext.tsx:2325`) — net-worth total = sum of converted
  balances; respect `includeInTotals`.
- `getCashflowSummary` (`:2102`), `buildBreakdown` (`:2125`),
  `getExpenseBreakdownByCategory/BySubcategory`, `getIncomeBreakdown`,
  `getTransfersBetweenAccounts` — convert each transaction's `amount`
  (account currency → reporting) before accumulating. Account currency is resolved via
  `accountId` → account map (already available).
- Cross-currency **transfers** are a special case: the from/to amounts can differ. v1:
  treat transfer `amount` as the from-account value; when accounts differ in currency,
  store the received amount via the foreign-currency columns on the to-side (or a second
  amount field — see Open Questions).

Hold a single in-memory `RateTable` snapshot in `AppContext` (refreshed when rates update)
so all the `useMemo` aggregations stay synchronous and cheap.

---

## 8. UX / how it looks

- **Accounts list & detail:** each account shows its balance in **its own** currency
  (¥/€/$). A "Total" / net-worth row shows the converted sum in the reporting currency
  with a leading `≈` and a tap target to the Exchange Rates screen.
- **Add / edit transaction:** currency defaults to the selected account's currency. A
  small currency toggle by the amount enables foreign entry; when it differs from the
  account, show `original ≈ converted` inline with an editable rate (pre-filled from cache).
- **Settings → Exchange Rates (new screen):** fits the settings nested stack
  (`navigation/settingsStack.ts`). Shows reporting-currency picker, a list of currencies
  with current rate + "as of {date}", an **"Update rates"** button (`refreshRatesNow()`,
  loading → `triggerHaptic('success')` → "Updated · {date}"; on failure show cached date +
  `lastRateFetchError` via `getErrorMessage()`), and inline manual override for the 7
  uncovered currencies.
- **Insights / Calendar:** all figures in reporting currency, with a one-line "Converted
  at rates as of {date}" disclaimer.
- **Staleness:** if `asOfDate` is more than a few days old, badge converted totals.
- **i18n:** new strings in `lib/i18n/locales/en.ts` (+ `zh.ts`); keys for "Exchange
  rates", "Update rates", "as of", "Main currency", "No automatic rate", "≈ approximate".

---

## 9. Edge cases & cross-cutting

- **Offline / fetch failure:** never block UI; keep last cache; record `lastRateFetchError`.
- **Missing rate (uncovered currency, no manual entry):** show native amount only, omit it
  from converted totals, and surface a "set a rate" prompt rather than showing a wrong sum.
- **Reporting-currency change:** refetch with new base; existing transactions are
  unaffected (amounts are account-native).
- **Time-mode:** convert to reporting/wage currency before money→hours (§6.4).
- **mmbak / Money Manager import** (`services/mmbakImport*`): map source currency per
  account; default to reporting currency when absent.
- **Backup / restore & widget snapshot** (`services/dataManagementService.ts`,
  `widgetSnapshot.shared.ts`): include the new columns + rate table; widget shows reporting
  currency.
- **Splits** (`transaction_splits`): share amounts inherit the parent transaction's
  account currency.

---

## 10. Testing

Extend the Jest suites (`__tests__/`):
- `utils/currency.test.ts` — `convert()` incl. base derivation, identity, missing-rate.
- `formatters.test.ts` — `formatAmount` with currency arg, FX + time-mode composition.
- `repositories/exchangeRatesRepository.test.ts` — upsert/getRate/manual override.
- `repositories/accountsRepository` / mappers — converted balances, foreign columns.
- Mock the Frankfurter fetch in `__tests__/__mocks__/` (network is already mocked-style).
- Keep `npm run check && npm test` green (CI `test` job gates everything).

---

## 11. Phased rollout

1. **Phase 1 — FX foundation (no visible behavior change).** Migrations 026–029, `exchange_rates`
   table + repository, `services/exchangeRates*`, daily fetch + background task wiring,
   `utils/currency.ts` `convert()`, in-memory RateTable in `AppContext`, tests.
2. **Phase 2 — aggregation & display.** `formatAmount` signature + call-site refactor,
   currency-aware balances/cashflow/insights/calendar, per-account native display +
   converted net worth, Exchange Rates settings screen + "Update rates" button + reporting
   currency picker.
3. **Phase 3 — foreign-currency transactions.** `originalAmount`/`originalCurrency`/
   `exchangeRate` end to end, add/edit UX, recurring inheritance, historical-rate lookup.
4. **Phase 4 — polish.** Cross-currency transfers, staleness badges, import/backup/widget
   coverage, manual-rate UX for uncovered currencies, full i18n.

---

## 12. Open questions

1. **Cross-currency transfers:** store a single `amount` + foreign columns on the to-side,
   or add an explicit `toAmount`/`toCurrency` pair to `transactions`? (Affects schema.)
2. **Historical insights valuation:** display-time (current rates, simpler) vs snapshot per
   transaction (faithful but heavier). Plan assumes display-time — confirm.
3. **Uncovered currencies (TWD/VND/PKR/BDT/AED/RUB/UAH):** manual-only acceptable for v1,
   or add a secondary rate source?
4. **Auto-refresh toggle:** expose `autoFxRefreshEnabled` in settings, or always-on with
   just the manual button?
