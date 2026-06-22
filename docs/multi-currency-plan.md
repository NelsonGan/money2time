# Multi-Currency — Design & Implementation Plan

Status: **Design / proposal (decisions locked)** · Branch: `claude/multi-currency-design-ana50m`

This document describes how to add real multi-currency support to money2time —
a local-first budget tracker. Goals:

- Each account holds exactly **one currency**.
- Transactions are recorded in their account's currency and their reporting-currency
  value is **snapshotted at entry** so historical numbers never drift when FX rates move.
- **Cross-currency transfers** between two accounts, where the user supplies either the
  received amount or the exchange rate and we compute the other.
- A single user-chosen **reporting currency** for all aggregates.
- FX rates from [Frankfurter](https://frankfurter.dev): refreshed daily plus a manual
  "Update rates" button. Fully functional offline from cache.

---

## 1. Where the codebase stands today

The storage layer is **already half-ready**; the behavior is **single-currency**.

Already present:

- `accountsTable.currency`, `transactionsTable.currency`, `recurringRulesTable.currency`
  (all `NOT NULL`) — `lib/db/schema.ts`.
- `settingsTable.currencyCode` + `currencySymbol` — one global currency.
- `MAJOR_CURRENCIES` (32 currencies with symbols) — `constants/appDefaults.ts:82`.
- Locale currency detection — `getLocaleCurrencyCode()` / `getLocaleCurrencySymbol()`
  in `utils/formatters.ts`.

Single-currency assumptions to change:

- **`formatAmount()`** (`utils/formatters.ts:289`) reads only `settings.currencySymbol`
  and ignores each row's `currency` — per-row currency is dead metadata today.
- **`accountsRepository.getBalances()`** (`lib/repositories/accountsRepository.ts:142`)
  does raw `SUM(amount)` per account; the UI sums those across accounts (USD + JPY added
  numerically).
- **`getCashflowSummary`** (`context/AppContext.tsx:2102`), **`buildBreakdown`** (`:2125`),
  `getExpenseBreakdownByCategory/BySubcategory`, `getIncomeBreakdown`,
  `getTransfersBetweenAccounts` — all sum raw amounts, currency-blind.
- **Time-mode** converts money→hours via `trueHourlyRate`, implicitly in the wage currency.
  FX must run *upstream* of money→time.
- No FX table, no conversion helper.

**Implication:** the data shape is mostly right. The work is a snapshot + conversion +
display layer plus an FX source, not a schema rewrite.

---

## 2. Locked decisions

1. **One account = one currency.** A normal income/expense transaction is always in its
   account's currency. There is **no** per-transaction "original/foreign" currency for
   regular transactions (no `originalAmount`/`originalCurrency`). The only place two
   currencies meet is a cross-currency transfer.
2. **Snapshot history.** Every transaction stores its value in the reporting currency at
   entry time (`reportingAmount`, `reportingCurrency`, `fxRate`). All historical aggregates
   (cashflow, insights, calendar totals, time-mode) sum these frozen snapshots, so they
   **never change** when rates update.
3. **Net worth is live.** Account balances are computed exactly in each account's native
   currency. Net worth converts current native balances → reporting currency at the
   **latest** cached rate (this is a "right now" figure and should reflect today's rates).
   This is not a contradiction with (2): per-transaction history is frozen; present-moment
   net worth is live.
4. **Cross-currency transfers** carry both legs: `amount` (from-account currency) and
   `toAmount` (to-account currency). The user enters one of {`toAmount`, exchange rate} and
   we compute the other; both are stored. Transfers are excluded from cashflow/insights and
   carry no reporting snapshot.
5. **FX source:** Frankfurter, daily auto-refresh + manual button, cached locally,
   offline-tolerant. Currencies Frankfurter doesn't cover get manual rates.
6. **Reporting-currency change** is a rare explicit action that triggers a one-time
   re-snapshot backfill using historical rates per transaction date (best-effort, falls
   back to latest). Keeps the "frozen" property across a switch.

---

## 3. Data model

### 3.1 Reporting currency
`settings.currencyCode` becomes the **reporting currency** — the one currency in which all
aggregates display. `currencySymbol` is kept in sync.

### 3.2 Account currency (native)
`accountsTable.currency` is the account's only currency. Every transaction in that account
is denominated in it. Account balances are summed in native currency — exact, no FX.

### 3.3 Transaction reporting snapshot (frozen)
At creation, compute and store:

- `reportingCurrency` — the reporting currency code at entry time.
- `reportingAmount` — `amount` converted to that currency using the rate at entry.
- `fxRate` — the account-currency → reporting-currency rate used (snapshot).

These are immutable after entry. If `currency === reportingCurrency`, `fxRate = 1` and
`reportingAmount = amount`. Used by cashflow, insights, calendar totals, and time-mode.

### 3.4 Cross-currency transfer legs
A transfer between accounts of different currencies stores:

- `amount` — debited from `fromAccountId`, in the **from** account's currency.
- `toAmount` — credited to `toAccountId`, in the **to** account's currency.
- The implied rate is `toAmount / amount` (derivable; not stored separately).

Same-currency transfers leave `toAmount` null and behave as today (`amount` both sides).
Transfers carry no reporting snapshot (net-zero across accounts; excluded from cashflow).

---

## 4. Transfer entry — the from/to/rate triangle

Given from-account currency F and to-account currency T:

- User always enters the **from amount** (in F).
- Then exactly one of:
  - **To amount** (in T): e.g. from RM 100, to S$ 30 → we compute & display rate
    `0.30 (1 RM = 0.30 SGD)` and store `amount=100`, `toAmount=30`.
  - **Exchange rate**: e.g. rate `0.30` → we compute `toAmount = 100 × 0.30 = 30`.
- The currently-edited field drives the other (last-edited wins); both are shown live.
- The rate/to-amount is **pre-filled from the latest cached FX rate** as a convenience, and
  the user can override either field (real-world transfers rarely match the mid-market
  rate). Whatever the user commits is stored verbatim — no rounding surprises.
- Quick-entry parsing (`features/transactions/utils/parseQuickInput.ts`) can accept a
  shorthand like `100 rm -> 30 sgd` (both amounts → derive rate) or `100 rm @0.30`
  (rate → derive to-amount).

---

## 5. FX rates — Frankfurter integration

ECB-backed, free, no API key.

### 5.1 Endpoints
- Latest (all rates from one base, one request/day):
  `GET https://api.frankfurter.dev/v1/latest?base=USD`
  → `{ "amount": 1.0, "base": "USD", "date": "2026-06-19", "rates": { "EUR": 0.92, ... } }`
- Historical (back-snapshot on reporting-currency change, back-dated transfers):
  `GET https://api.frankfurter.dev/v1/{YYYY-MM-DD}?base=USD`
- Currency list: `GET https://api.frankfurter.dev/v1/currencies`

Notes:
- ECB publishes on working days ~16:00 CET; weekend/holiday requests return the last
  working day. Surface the returned `date` as "as of", not "today".
- Network: normal on device. In Claude Code web sessions the egress allowlist must include
  `api.frankfurter.dev` to exercise it during dev.

### 5.2 Coverage gap (handled, not blocking)
Frankfurter covers only the ~30 ECB reference currencies. **7 currencies in
`MAJOR_CURRENCIES` are NOT covered:** `TWD`, `VND`, `PKR`, `BDT`, `AED`, `RUB`, `UAH`.
Rate rows carry `source: 'api' | 'manual'`; uncovered currencies fall back to manual entry
in the Exchange Rates screen ("No automatic rate — enter manually"). No second source for v1.

### 5.3 Daily fetch — mirror the auto-backup pattern
Reuse the proven shape from `services/autoBackup*.ts` +
`services/autoBackupTaskRegistration.ts`:

- `runRateRefreshIfDue({ force? })` — skip if already refreshed today (staleness check like
  `isBackupStale(settings.lastAutoBackupAt)`), else fetch + upsert. Called on app foreground
  and from the background task.
- `refreshRatesNow()` — the manual button; `runRateRefreshIfDue({ force: true })`.
- Register in the existing background task (or a sibling) for periodic refresh while closed.
- Always read from the cached table; the network call only updates cache → offline-safe.

### 5.4 Internal base
Cache stores rates relative to **one canonical base = the reporting currency** at fetch
time. One Frankfurter call yields the full table; `convert(A→B) = rate(base→B)/rate(base→A)`.
On reporting-currency change, refetch with the new base. Snapshots already freeze history,
so a base change only affects live net worth and future entries.

---

## 6. Schema changes

### 6.1 New table: `exchange_rates`
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

### 6.2 `transactions` — snapshot + transfer leg
- `reportingCurrency` `text` (nullable; null for transfers / legacy rows)
- `reportingAmount` `real` (nullable)
- `fxRate` `real` (nullable) — native → reporting snapshot
- `toAmount` `real` (nullable) — credited amount for cross-currency transfers

### 6.3 `recurring_rules`
- `toAmount` `real` (nullable) — for cross-currency transfer rules.
- Reporting snapshot is **not** stored on the rule; it is computed per generated instance
  at generation time (correct snapshot for that date).

### 6.4 `settings`
- `lastRateFetchAt` `text` (nullable)
- `lastRateFetchError` `text` (nullable)
- `autoFxRefreshEnabled` `integer` boolean, default `true`

### 6.5 Migrations (additive, ascending; next version is `026`)
New files in `lib/db/migrations/`, each using the `PRAGMA table_info` existence-guard
pattern from `002_settings_currency_code.ts` and exporting a `default` `DbMigration` whose
`version` matches the filename (the runner auto-discovers via `require.context`):
- `026_exchange_rates_table.ts` — create table + unique index.
- `027_transactions_snapshot_and_transfer.ts` — add `reporting_currency`,
  `reporting_amount`, `fx_rate`, `to_amount`.
- `028_recurring_rules_to_amount.ts`
- `029_settings_fx_refresh.ts`

**Backfill in 027:** for existing rows set `reporting_currency = settings.currency_code`,
`fx_rate = 1`, `reporting_amount = amount` (every existing account is implicitly in the
current single currency today, so this is exact). Bump `schema.ts` `$inferSelect` types.

---

## 7. Conversion & snapshot layer

### 7.1 New service `services/exchangeRates.ts` (+ `.native.ts` / `.shared.ts`)
Platform-split per convention (`.native.ts` real fetch; `.shared.ts` cache/identity fallback
for web/tests).
```ts
runRateRefreshIfDue(opts?: { force?: boolean }): Promise<RateRefreshResult>
refreshRatesNow(): Promise<RateRefreshResult>          // force = true
getRateAsOfDate(): string | null                       // "as of" label
fetchHistoricalRate(from, to, date): Promise<number | null>  // backfill / back-dated transfer
```

### 7.2 New repository `lib/repositories/exchangeRatesRepository.ts`
```ts
upsertRates(base, asOfDate, rates: Record<string, number>, source): void
getRate(from, to): number | null      // derives via canonical base
listRates(): ExchangeRate[]
setManualRate(from, to, rate): void
```

### 7.3 Pure helper `utils/currency.ts`
```ts
convert(amount, from, to, rates: RateTable): { value: number; rateUsed: number | null }
```
Pure/synchronous (rates from an in-memory snapshot held by `AppContext`) so it is
unit-testable and usable inside `useMemo`. `from === to` → identity. Missing rate →
`rateUsed: null` so callers can badge/omit instead of showing a wrong sum.

### 7.4 Snapshot on write
`transactionsRepository.create` / `update` and the recurring-rule generator compute the
reporting snapshot at write time (via the in-memory rate snapshot, or
`fetchHistoricalRate` for back-dated entries). This is the single chokepoint that freezes
history.

### 7.5 `formatAmount` signature change
```ts
formatAmount(amount, currency, settings, options)
```
- `currency` = the currency `amount` is in.
- If `currency !== settings.currencyCode`, convert to reporting currency first; if
  `displayMode === 'time'`, convert reporting → hours via `trueHourlyRate` (FX upstream of
  time). Symbol from `MAJOR_CURRENCIES` by code.
- ~40 call sites (see §1 grep): mechanical, test-guarded refactor. Most pass
  `settings.currencyCode` (behavior-neutral); account/transaction rows pass the row's
  currency. Where a frozen `reportingAmount` exists, sum that directly rather than
  re-converting.

---

## 8. Aggregation changes (`context/AppContext.tsx` + repositories)

- **Account balances** (`accountsRepository.getBalances()`): unchanged math — sum native
  `amount` per account. Add the account's `currency` to each `AccountBalance` for display.
- **Net worth** (`accountBalances` memo, `AppContext.tsx:2325`): sum `convert(nativeBalance,
  accountCurrency, reportingCurrency, latestRates)` across accounts honoring
  `includeInTotals`. Live, current rates. Mark missing-rate accounts and exclude them from
  the total with a hint rather than poisoning it.
- **Cashflow / breakdowns / calendar / time-mode** (`getCashflowSummary` `:2102`,
  `buildBreakdown` `:2125`, `getExpenseBreakdownByCategory/BySubcategory`,
  `getIncomeBreakdown`): sum the frozen `reportingAmount` snapshot — no live conversion,
  no drift.
- **Transfers** (`getTransfersBetweenAccounts`): use `amount` for the from leg and
  `toAmount` (or `amount` when null) for the to leg; excluded from cashflow.
- Hold one in-memory `RateTable` snapshot in `AppContext`, refreshed when rates update, so
  all `useMemo`s stay synchronous and cheap.

---

## 9. UX / how it looks

- **Accounts list & detail:** each account's balance in **its own** currency (¥/€/$). A
  "Total" / net-worth row shows the converted sum in reporting currency with a leading `≈`,
  tapping through to Exchange Rates.
- **Add / edit transaction:** currency is fixed to the selected account's currency (no
  picker for normal transactions). For a **transfer** between differing currencies, show the
  from amount (from-account currency) plus a to-amount field and a rate field — editing one
  computes the other (§4), pre-filled from cache, both overridable, with a live
  `1 RM = 0.30 SGD` readout.
- **Settings → Exchange Rates (new screen):** fits the settings nested stack
  (`navigation/settingsStack.ts`). Reporting-currency picker (changing it kicks off the
  re-snapshot backfill with progress), a currency list with current rate + "as of {date}",
  an **"Update rates"** button (`refreshRatesNow()`: loading → `triggerHaptic('success')` →
  "Updated · {date}"; failure shows cached date + `lastRateFetchError` via
  `getErrorMessage()`), an auto-refresh toggle (`autoFxRefreshEnabled`), and inline manual
  override for the 7 uncovered currencies.
- **Insights / Calendar:** reporting currency throughout, with a "Historical figures use the
  rate at the time of each transaction" note (true, because of snapshots).
- **Staleness:** if net-worth rates' `asOfDate` is more than a few days old, badge the
  converted total.
- **i18n:** new keys in `lib/i18n/locales/en.ts` (+ `zh.ts`): "Exchange rates",
  "Update rates", "as of", "Main currency", "No automatic rate", "≈ approximate",
  transfer rate/received-amount labels.

---

## 10. Edge cases & cross-cutting

- **Offline / fetch failure:** never block UI; keep last cache; record `lastRateFetchError`.
  Snapshots use the latest cached rate; if none exists yet (brand-new install offline),
  snapshot with `fxRate=1` when `currency===reporting`, else mark for later backfill.
- **Missing rate for net worth (uncovered, no manual entry):** show native balance, omit
  from total, prompt "set a rate".
- **Reporting-currency change:** refetch base; run historical re-snapshot backfill over all
  transactions (batched, with progress); existing account balances unaffected.
- **Back-dated transfers / transactions:** snapshot via `fetchHistoricalRate(date)`, falling
  back to latest cached rate.
- **Time-mode:** convert to reporting/wage currency before money→hours (§7.5).
- **mmbak / Money Manager import** (`services/mmbakImport*`): map source currency per
  account; compute snapshots on import using historical rates by transaction date.
- **Backup / restore & widget snapshot** (`services/dataManagementService.ts`,
  `widgetSnapshot.shared.ts`): include new columns + `exchange_rates`; widget shows
  reporting currency.
- **Splits** (`transaction_splits`): share amounts inherit the parent's account currency.

---

## 11. Testing

Extend the Jest suites (`__tests__/`):
- `utils/currency.test.ts` — `convert()` base derivation, identity, missing-rate.
- `formatters.test.ts` — `formatAmount` with currency arg; FX + time-mode composition.
- `repositories/exchangeRatesRepository.test.ts` — upsert/getRate/manual override.
- transfer math — to-amount⇄rate derivation both directions; `parseQuickInput` shorthand.
- snapshot-on-write — frozen `reportingAmount` survives a later rate change.
- `accountsRepository` / mappers — native balances + new columns; net-worth conversion.
- Mock the Frankfurter fetch in `__tests__/__mocks__/`.
- Keep `npm run check && npm test` green (CI `test` job gates everything).

---

## 12. Phased rollout

1. **Phase 1 — FX foundation (no visible change).** Migrations 026–029 (+ backfill),
   `exchange_rates` table + repository, `services/exchangeRates*`, daily fetch + background
   task, `utils/currency.ts` `convert()`, in-memory RateTable in `AppContext`, snapshot
   chokepoint in `transactionsRepository`/recurring generator, tests.
2. **Phase 2 — aggregation & display.** `formatAmount` signature + call-site refactor;
   cashflow/insights/calendar/time-mode read frozen snapshots; per-account native balances +
   live converted net worth; Exchange Rates settings screen, reporting-currency picker +
   backfill, "Update rates" button, manual overrides, auto-refresh toggle.
3. **Phase 3 — cross-currency transfers.** `toAmount` end to end, transfer entry triangle
   (§4), quick-entry shorthand, recurring transfer rules, back-dated historical rates.
4. **Phase 4 — polish.** Staleness badges, import/backup/widget coverage, full i18n,
   missing-rate prompts, edge-case hardening.
