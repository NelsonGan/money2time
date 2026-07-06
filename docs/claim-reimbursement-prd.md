# Claim / Reimbursement — Product Requirements (PRD)

Status: **Proposed** · Branch: `claude/claim-reimbursement-prd-nqduk4`

Let users flag an expense they expect to get back — a work trip, a client
lunch, a medical bill their insurer covers — track how much is outstanding,
and record the money landing when it's reimbursed. In money2time's language:
**expenses you'll get back are hours of your life you'll get back.** The
feature surfaces that pending value and closes the loop when it arrives.

This PRD is grounded in the existing schema and the **split-bill / payback**
feature, which already models the closest thing we have: "someone owes me
money, mark it settled." Claims reuse that settlement pattern but diverge in
two deliberate ways (see §3 and §6).

### Terminology (read first)

The word "claim" is overloaded, so this doc fixes it:

| Term                  | Means                                                                                                     | Code identifiers                                    |
| --------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Claimable expense** | A single expense transaction flagged as recoverable. The V1 unit of the feature.                          | `claimStatus`, `claimAmount` on `transactionsTable` |
| **Reimbursement**     | An inbound (income) transaction that settles some or all of a claimable expense.                          | inflow row with `reimbursesTransactionId` set       |
| **Claim (report)**    | **V2, Pro.** A named bundle of claimable expenses submitted together (an expense report). Not part of V1. | `claimsTable`, `claimId`                            |

User-facing copy avoids "claim" as a noun for the unit — it says
"claimable," "reimburse," "reimbursement," and (V2) "expense report."

---

## 1. Problem & motivation

Today a reimbursable expense is indistinguishable from any other. A user who
pays $600 for a flight their employer will refund sees $600 of spending, no
memory of what's owed, and no signal when the refund never arrives. They fall
back on screenshots, a Notes app list, or memory.

The pain has three parts:

1. **Marking** — "this one isn't really mine, I'll get it back." No way to say so.
2. **Tracking** — "how much am I owed right now, and by whom?" No running total.
3. **Closing** — "the money came back" — no clean way to record the inflow and
   stop counting the expense against real spending.

The split-bill feature solves exactly this shape for _friends_. Reimbursements
are the same loop with a different counterparty (an employer, an insurer, a
client) and, usually, the **whole** amount rather than a per-person share.

### Why not just use split-bill?

Splits model _per-person shares of one expense_ and, when settled, **reduce the
parent expense** so your account balance reflects only your net outlay
(`markSplitPaid`, `context/AppContext.tsx:2285`). They also live **outside the
SQL filter layer** — splits are attached after the query
(`summarizeSplits`, `lib/repositories/transactionsRepository.ts:102`), so the
activity list _cannot_ filter by owed status. For claims we want:

- The **whole** transaction flagged, not a sub-row.
- A **filterable** status ("show me everything I can still claim").
- Gross spend preserved for expense reports / per-diem / tax, with an opt-in
  net view.
- **Multiple settlements** per expense (a $600 flight refunded in two tranches).

So claims get **first-class status columns on the transaction** plus a
**back-pointer** from each reimbursement inflow. We reuse the split _settlement_
mechanics, not the split _data model_.

---

## 2. Goals & non-goals

### Goals

- Mark any expense as **claimable** in one tap, from the editor or a row swipe.
- Track a running **"pending reimbursement"** total (money and hours) across all
  claimable expenses.
- Support **partial and multiple** settlements (claim $50/night of a $70/night
  hotel; a refund that arrives in two tranches).
- Record each reimbursement as a real inflow into a chosen account when it lands.
- **Filter** the activity list and search by claim status.
- Keep historical aggregates correct — gross spend stays gross, reimbursement
  inflows never inflate income, and "net of reimbursements" is an explicit
  toggle, never a silent mutation.

### Non-goals (V1)

- **No claim grouping / expense reports.** Bundling claimable expenses into a
  submittable report is **V2, Pro** (see §11). V1 reimburses expenses
  individually.
- No integrations with employer/expense systems (Expensify, SAP Concur, etc.).
- No PDF/CSV expense-report export (V2 candidate — see §11).
- No OCR/receipt auto-detection of reimbursable-ness (the app already has
  `receiptUri`; auto-suggestion is V2).
- No multi-party reimbursers on one expense (one claimable expense, one
  logical reimburser). If you split _and_ claim the same expense, see §9.
- No approval workflow / partial-approval states beyond "reimbursed amount ≤
  claimed amount."

---

## 3. Concepts & state model

A claimable expense moves through a small status machine. Status lives in a
single filterable column, `claimStatus`, on the transaction.

```
none ──mark claimable──▶ claimable ──(V2) submit──▶ submitted
                              │                          │
                              └──── reimburse (partial) ──┤
                                                          ▼
                                     partially_reimbursed ──reimburse (rest)──▶ reimbursed
```

| Status                 | Meaning                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `none`                 | Ordinary expense (default). Not shown as claimable anywhere.                              |
| `claimable`            | Flagged; full `claimAmount` outstanding. Counts toward "pending reimbursement."           |
| `submitted`            | **V2** — added to an expense report and marked submitted. Still outstanding. Inert in V1. |
| `partially_reimbursed` | Some but not all of `claimAmount` has come back.                                          |
| `reimbursed`           | Fully settled. No longer outstanding; one or more reimbursement inflows exist.            |

Only **expenses** are claimable. Income / transfer / balance_adjustment rows
never get a claim status (enforced in the editor and repository). The
`submitted` value ships in the V1 enum for forward-compatibility but is
unreachable until V2 grouping lands.

### The claim amount

`claimAmount` is what you expect back and defaults to the **full expense
amount** in the transaction's own currency. Editable for partial claims. It is
always `> 0` and `≤ amount`. `reimbursedAmount` is a **denormalized running sum**
of settled inflows (`0 → claimAmount`):

- `reimbursedAmount === 0` → `claimable` (or `submitted` in V2)
- `0 < reimbursedAmount < claimAmount` → `partially_reimbursed`
- `reimbursedAmount === claimAmount` → `reimbursed`

`reimbursedAmount` is denormalized for a cheap outstanding-total query; it is
always recomputable as the sum of live reimbursement inflows pointing at the
expense, so a reconciliation pass can rebuild it if it ever drifts.

### Reimbursement is an inflow, not an expense reversal (key divergence)

Unlike splits — which shrink the parent expense — each reimbursement **creates a
separate inbound transaction** and leaves the original expense untouched. Why:

- **Expense reports & per-diem** need the _gross_ amount ("I spent $600, claiming
  $600"). Shrinking the expense to $0 destroys that record.
- **Tax / audit**: gross spend and the matching refund should both be visible.
- **Multiple settlements**: one expense can be refunded in several tranches;
  each is its own inflow row.
- **Insights** can net them on demand (a toggle), but the raw history stays honest.

Each reimbursement inflow is a `type: 'income'` transaction into the chosen
account, carrying a **back-pointer** `reimbursesTransactionId` → the claimable
expense it settles. `reportingAmount`/`fxRate` are snapshotted at settlement
time (per the multi-currency rule). The back-pointer does triple duty:

1. **One-to-many settlements** — an expense can have many inflows; the FK lives
   on the inflow, not a single column on the expense.
2. **Insights exclusion** — any row with `reimbursesTransactionId` set is a
   reimbursement, so income aggregates exclude it (§8) and it never inflates
   "income."
3. **Reverse lookup** — deleting an inflow finds its expense to rewind status
   (mirrors `findByPaidTransactionId`, `transactionSplitsRepository.ts:117`).

Same-account vs cross-account is just the inflow's `accountId`: if the refund
lands back in the paying account, the −expense/+income pair nets to zero on that
balance while both rows stay visible in history. We deliberately do **not** adopt
the split "silently reduce the parent" path — it hides the event, which is wrong
for a reimbursement.

Reversing ("mark unclaimable" / "undo a reimbursement") soft-deletes the linked
inflow(s) and rewinds `reimbursedAmount`/`claimStatus`, in the spirit of
`markSplitUnpaid` (`context/AppContext.tsx:2433`).

---

## 4. User stories

- _As a consultant_, I pay for a client dinner, tap **Claimable** in the editor,
  and see it land in "Pending reimbursement: $84 · 3.2 hrs of your time."
- _As a frequent traveller_, my $600 flight is refunded in two tranches; I mark
  $300 reimbursed twice and watch the status go `claimable → partially_reimbursed
→ reimbursed`.
- _As someone on a per-diem_, I spent $70 on a hotel but can only claim $50, so I
  set the claim amount to $50; the other $20 stays as real spend.
- _As a careful budgeter_, I toggle Insights to **net of reimbursements** so my
  category spend reflects only what I actually bore.
- _As anyone_, I filter the activity list to **Outstanding** to chase down what
  I'm still owed.

---

## 5. UX & surfaces

### 5.1 Transaction editor (`TransactionEditorScreen`)

A **Claimable** toggle in the expense editor, sitting near the existing
Split-bill entry (`features/transactions/components/editor/`). When on, it
reveals:

- **Claim amount** (defaults to full amount, editable, capped at amount).
- **Reimburse into** account picker (defaults to the paying account) — the
  target when settling. Reuses `AccountPickerSheet`. **Simple mode:** the picker
  is hidden; reimbursements land in the single wallet automatically (§9).
- Read-only status chip once it has history ("Outstanding $x," "Reimbursed on …").

Marking a reimbursement from the editor: a **Mark reimbursed** pill (mirrors the
split "Mark paid" pill at `SplitBillModal.tsx:592`) → a small amount + account +
date confirm (defaulting to the full outstanding amount / chosen account /
today) → calls `markReimbursed`. A **partially_reimbursed** expense shows the
remaining outstanding amount and lets you record another tranche.

### 5.2 Activity row (`TransactionItem.tsx`)

- A subtle **badge/chip** on claimable rows — an amber "claimable" dot when
  outstanding (with the outstanding amount), a green check when fully reimbursed
  — modeled on the existing red unpaid-split badge (`TransactionItem.tsx:113`).
- **Swipe action**: "Claimable" / "Mark reimbursed" as a quick action, matching
  existing row affordances.
- Reimbursement **inflow** rows render with a small "reimbursement" affordance
  linking back to the source expense (they are excluded from income insights,
  §8, so the row should read as a refund, not salary).

### 5.3 Reimbursements hub (new screen)

A dedicated screen (nav label **"Reimbursements"**), reached from Settings
and/or an Insights entry (following the budgeting precedent where a feature
screen is both a route and an embedded Insights page). V1 shows:

- **Summary header**: total outstanding (money + hours), count, largest
  outstanding expense.
- **Outstanding** — claimable + partially_reimbursed expenses, each with its
  remaining amount and a one-tap reimburse action.
- **History** — fully reimbursed expenses.

**V2 (Pro)** adds an **Expense reports** section: named claims (`claimsTable`)
with a date range, submit state, and a **Mark all reimbursed** batch action.

The "hours of your time" framing is the money2time hook: outstanding money is
converted through `getTrueHourlyRateForDate` so a pending $600 reads as, e.g.,
"22 hours of your work, still owed."

### 5.4 Filters

Add claim status to `TransactionFilters` (see §7) so the activity list and
search can scope by claim state. A filter chip in the existing filter UI.

---

## 6. Data model & migration

**V1 migration is `043_claimable_expenses.ts`** (version 43 — latest is
`042_budget_template_options.ts`). It adds **columns to `transactionsTable`
only**; the `claimsTable` and `claimId` FK ship with **V2** in their own
migration (append-only convention — no reason to ship an unused table now).
Follow the **`add-db-migration`** skill (migration file + `schema.ts` +
`mappers.ts` + `types/index.ts`). Existing rows default to `claimStatus = 'none'`
and `reimbursedAmount = 0`, so no data backfill is needed.

### 6.1 Columns on `transactionsTable` (`lib/db/schema.ts`) — V1

```ts
// added to transactionsTable
claimStatus: text('claim_status').notNull().default('none'),
  // 'none' | 'claimable' | 'submitted' | 'partially_reimbursed' | 'reimbursed'
claimAmount: real('claim_amount'),          // expected back, tx currency; null when not claimable
reimbursedAmount: real('reimbursed_amount').notNull().default(0), // denormalized Σ of inflows
reimbursedAt: text('reimbursed_at'),        // ISO ts when fully settled; null otherwise
reimbursementAccountId: text('reimbursement_account_id'), // preferred settle-into account
reimbursesTransactionId: text('reimburses_transaction_id'),
  // set ONLY on reimbursement-inflow (income) rows -> the claimable expense they settle
```

Two partial indexes:

```sql
-- fast "what's outstanding" scan
CREATE INDEX idx_transactions_claim_outstanding
  ON transactions (claim_status)
  WHERE deleted_at IS NULL
    AND claim_status IN ('claimable','submitted','partially_reimbursed');

-- reverse lookup expense -> its reimbursement inflows
CREATE INDEX idx_transactions_reimburses
  ON transactions (reimburses_transaction_id)
  WHERE deleted_at IS NULL AND reimburses_transaction_id IS NOT NULL;
```

Rationale for status-on-transaction (vs a splits-style side table): it makes
claim status **filterable in the SQL predicate layer** (`buildSqlPredicates`,
`transactionsRepository.ts:242`), which the splits design explicitly can't do —
and the back-pointer keeps one-to-many settlements clean without a join table.

### 6.2 New `claimsTable` (V2, Pro grouping — expense reports)

Ships with V2, not V1. Recorded here so the V1 columns are chosen with it in
mind (V2 adds a nullable `claimId` column to `transactionsTable`).

```ts
export const claimsTable = sqliteTable('claims', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), // "Berlin trip — March"
  status: text('status').notNull().default('open'), // 'open' | 'submitted' | 'settled'
  submittedAt: text('submitted_at'),
  settledAt: text('settled_at'),
  reimbursementAccountId: text('reimbursement_account_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'), // soft-delete, per convention
});
```

Membership is the `transactions.claimId` FK (one expense ∈ at most one claim),
avoiding a join table since the relationship is 1-to-many. A claim's totals are
computed from its member expenses (like `getAlbumStats`).

### 6.3 Types (`types/index.ts`)

```ts
export type ClaimStatus =
  | 'none'
  | 'claimable'
  | 'submitted'
  | 'partially_reimbursed'
  | 'reimbursed';

// The claim fields map straight from the transaction row onto
// Transaction / TransactionWithRelations — no attach step (a win over splits).

// V2:
export interface Claim {
  id: string;
  name: string;
  status: 'open' | 'submitted' | 'settled';
  submittedAt: string | null;
  settledAt: string | null;
  reimbursementAccountId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ClaimStats {
  // computed, à la AlbumStats
  transactionCount: number;
  claimedTotal: number; // Σ claimAmount (reporting currency)
  reimbursedTotal: number; // Σ reimbursedAmount
  outstandingTotal: number; // claimedTotal - reimbursedTotal
  outstandingHours: number; // via getTrueHourlyRateForDate
}
```

---

## 7. Repository & context API

### `transactionsRepository` additions

- `listClaimable(status?)` — outstanding / reimbursed claimable expenses.
- `listReimbursementsFor(expenseId)` — inflows where
  `reimbursesTransactionId = expenseId` (for rewind + net calcs).
- Claim predicates in `buildSqlPredicates` / `normalizeTransactionFilters`
  (`transactionsRepository.ts:85,242`).

### `AppContext` additions (`useApp()`)

Claim mutations write transaction rows, so every one calls `refreshTransactions()`
(the CLAUDE.md rule: include `refreshTransactions()` only when the write changes
transaction rows — these do). The reimburse mutations reuse the `markSplitPaid`
deferred-write pattern (`runDeferredWrite` + `scheduleRefreshTransactions`) to
dodge the React-19 batching race.

- `markClaimable(txId, opts?: { claimAmount?, reimbursementAccountId? })` —
  set `claimStatus='claimable'`, default `claimAmount` to full amount.
- `markUnclaimable(txId)` — back to `none`; only allowed while
  `reimbursedAmount === 0` (otherwise the user must undo reimbursements first).
- `markReimbursed(txId, { amount, accountId, date })` — create the inflow
  (§3) with `reimbursesTransactionId=txId`, add to `reimbursedAmount` (clamped
  ≤ `claimAmount`), set status, snapshot FX.
- `undoReimbursement(inflowTxId)` — soft-delete the inflow, subtract its amount
  from the expense's `reimbursedAmount`, recompute status (reverse lookup via
  `reimbursesTransactionId`).
- Selector `outstandingReimbursementTotal` (money + hours). **Per the CLAUDE.md
  memo rule, this selector is transaction-derived, so it must key on
  `useTransactions().transactions`** even though the action functions live on
  `useApp()`.

**V2:** `claimsRepository` (mirrors `albumsRepository`) + `createClaim`,
`updateClaim`, `deleteClaim`, `addToClaim`, `removeFromClaim`, `submitClaim`,
`markClaimReimbursed(claimId, accountId)` (settles every outstanding member).

### `TransactionFilters` (`types/index.ts:570`)

Add a single field:

```ts
claimStatus: 'all' | 'outstanding' | 'reimbursed' | 'claimable_any' | 'none';
//  all        -> no filter (default)
//  outstanding-> claimStatus IN ('claimable','submitted','partially_reimbursed')
//  reimbursed -> claimStatus = 'reimbursed'
//  claimable_any-> claimStatus != 'none' (ever flagged)
//  none       -> claimStatus = 'none' (ordinary expenses only)
```

Handle it in `normalizeTransactionFilters` and `buildSqlPredicates` as a real
SQL predicate. Reimbursement **inflow** rows (`reimbursesTransactionId` set) are
not themselves claimable and are unaffected by this filter.

---

## 8. Insights, widgets, analytics, i18n

- **Income integrity (required, not optional):** reimbursement inflows carry
  `reimbursesTransactionId`, so `getIncomeBreakdown` / `getCashflowSummary` /
  the insights income series **exclude** them by default. A reimbursement is
  recovered spend, not earnings — counting it as income would overstate both
  income and net savings.
- **"Net of reimbursements" toggle** on Insights: subtracts each reimbursement
  inflow from the linked expense's category/expense total (computed at query
  time via the back-pointer and frozen FX — never mutates data, consistent with
  the frozen-FX rule). Off by default so gross spend stays visible.
- **Reimbursement category:** reimbursement inflows use a reserved, non-deletable
  **"Reimbursement"** income category, auto-seeded on migration (resolves §12
  Q4 — chosen over free-pick so the exclusion/netting logic has a stable anchor
  and users don't have to think about it). It is hidden from the normal
  category pickers.
- **Widget** (V2): a "Pending reimbursement" glance via `widgetSnapshot.ts`.
- **Analytics** (`services/analytics.ts`, `AnalyticsEvents`): mirror the split
  events — `CLAIM_MARKED_CLAIMABLE`, `CLAIM_MARKED_UNCLAIMABLE`,
  `CLAIM_REIMBURSED` (prop: `isPartial`, `isFull`), `CLAIM_REIMBURSEMENT_UNDONE`.
  V2 adds `CLAIM_REPORT_CREATED`, `CLAIM_REPORT_SUBMITTED`,
  `CLAIM_REPORT_SETTLED`, plus `PRO_LIMIT_HIT` on the grouping gate.
- **i18n**: all strings via `I18n.t` added to `en.ts` and all 23 locales
  (**`add-i18n-string`** skill keeps `localeParity.test.ts` green). Keys under
  `reimbursements.*` and `transactions.editor.claim.*`, plus the seeded
  category name `categories.reimbursement`.

---

## 9. Edge cases & rules

- **Simple mode.** Simple mode hides the accounts tab and uses one wallet
  (`simpleWalletId`). The "reimburse into" picker is hidden and reimbursements
  land in the simple wallet automatically. The feature otherwise works
  unchanged; the Reimbursements hub is reachable from Settings.
- **Split _and_ claim the same expense.** Allowed but distinct: a split reduces
  the parent (a friend paid their share); the claim amount then defaults to the
  _remaining_ parent amount, not the original. Guard: `claimAmount ≤` current
  `amount`.
- **Delete a claimable / reimbursed expense.** Soft-deleting the expense also
  soft-deletes its reimbursement inflows (found via `reimbursesTransactionId`)
  and detaches it from any V2 claim, so no refund dangles.
- **Delete a reimbursement inflow directly.** Rewind the source expense:
  subtract the inflow amount from `reimbursedAmount`, recompute `claimStatus`
  (`reimbursed → partially_reimbursed → claimable`), clear `reimbursedAt` if it
  is no longer fully settled.
- **Multi-currency.** `claimAmount` is in the expense's currency; each inflow
  snapshots its own `reportingAmount`/`fxRate` at settlement. Outstanding totals
  aggregate in reporting currency via the frozen snapshots — never recompute
  from live rates.
- **Editing `amount` after claiming.** If the new amount `< claimAmount`, clamp
  `claimAmount` down (and never below `reimbursedAmount`) and warn.
- **Over-reimbursement.** `reimbursedAmount` can never exceed `claimAmount`; the
  reimburse sheet caps the entered amount at the remaining outstanding.
- **Non-expense types** can never be claimable (editor + repository guard).
- **Recurring expenses.** A recurring rule that generates claimable instances is
  out of scope for V1 (V3, §11); generated instances start at `claimStatus='none'`.

---

## 10. Pro gating

Per-transaction **marking, tracking, and reimbursing are free** — this is core
value and drives the "time you'll get back" hook. The **claim grouping /
expense-report** layer (V2) is **Pro**, matching how albums and budget templates
gate (`useProGate`, `constants/proLimits.ts`).

- Add `FREE_MAX_CLAIMS` (proposal: **1** open expense report on free, unlimited
  on Pro) to `PRO_LIMITS`, a `'claims'` `LimitType` + `LIMIT_MAP` entry
  (`hooks/useProGate.ts:9`), and a `pro.limit_claims` string.
- Gate at report creation: `if (!checkLimit('claims', openReports.length)) return;`

V1 ships **entirely free** — there is nothing to gate until grouping arrives.
See §12 Q1 for whether grouping should be Pro at all.

---

## 11. Phasing

**V1 (this effort) — the core loop, free:**

- Migration 043 (transaction claim columns + two indexes; seed the
  "Reimbursement" category).
- Editor toggle + claim amount + reimburse-into account (simple-mode aware).
- `markClaimable` / `markUnclaimable` / `markReimbursed` / `undoReimbursement`.
- Activity-row badge + swipe action; reimbursement inflow rows link back.
- `TransactionFilters.claimStatus` + filter chip.
- Reimbursements hub: outstanding list + running total (money + hours) + history.
- Insights income exclusion (required) + "net of reimbursements" toggle.
- Analytics + i18n (23 locales) + tests (see §14).

**V2:**

- Claim grouping / expense reports (Pro): `claimsTable`, `claimId` migration,
  submit + batch-settle, the hub's Expense-reports section.
- CSV/PDF expense-report export (share sheet).
- Receipt-aware suggestion ("this has a receipt — claimable?").
- "Pending reimbursement" home-screen widget + a `news` feature announcement.
- Reminders ("$1,240 outstanding for 30+ days — chase it?") via `notifications`.

**V3 / exploratory:**

- Reimburser directory (employer/insurer/client) with per-reimburser totals.
- Recurring claimable rules (monthly transit pass).

---

## 12. Open questions

1. **Grouping = Pro?** V1 is fully free; should V2 expense-report grouping be
   Pro, or free-with-a-cap? (Leaning: marking/reimbursing free forever,
   multi-report grouping Pro.)
2. **Default reimburse-into account**: paying account (current default) vs. a
   user-set "reimbursements land here" account in settings?
3. **Reimbursed inflow visibility in cashflow**: excluded from income entirely
   (this PRD) — but should the hub still show a lifetime "recovered" total so
   users feel the wins? (Leaning: yes, in the hub only.)
4. **Where does the Reimbursements hub live** — Settings route, Insights page,
   or both (budgeting precedent)?
5. **Onboarding surface**: a `news` announcement + a one-time coach-mark on the
   editor toggle, or announcement only?

_(Resolved during review: reimbursement is always a visible inflow, never a
silent net-out; the inflow uses a reserved auto-seeded "Reimbursement" category;
partial/multiple settlements are modeled via a back-pointer, not a single FK.)_

---

## 13. Success metrics

- **Adoption**: % of active users who mark ≥1 expense claimable in 30 days.
- **Loop completion**: of expenses marked claimable in a cohort, the % that
  reach `reimbursed` within 90 days (cohort ratio, not a raw event ratio).
- **Time to settle**: median days `claimable → reimbursed`.
- **Pro pull** (if V2 grouping is Pro): `PRO_LIMIT_HIT` on `claims` → paywall →
  conversion.
- **Retention proxy**: outstanding-total surfaced (money + hours) as a recurring
  reason to reopen the app.

---

## 14. Testing

Per the repo's Jest + ts-jest setup (node env, native deps mocked), the
testable surface is pure logic — not RN render. Target:

- **Status machine** — `claimable → partially_reimbursed → reimbursed` across
  single, partial, and multiple settlements; clamping at `claimAmount`.
- **Rewind** — `undoReimbursement` and expense deletion correctly recompute
  `reimbursedAmount`/`claimStatus` and cascade inflow soft-deletes.
- **Repository predicates** — `TransactionFilters.claimStatus` SQL for each
  enum value.
- **Insights** — income aggregates exclude `reimbursesTransactionId` rows;
  "net of reimbursements" subtracts correctly under multi-currency (frozen FX).
- **Mappers** — new columns round-trip row ↔ domain.
- **i18n parity** — new keys present in all 23 locales.

---

## Appendix — how this reuses the split-bill feature

| Concern        | Split-bill (existing)                               | Claim/reimbursement (this PRD)                         |
| -------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Counterparty   | A named friend, per share                           | A reimburser (employer/insurer), whole expense         |
| Data location  | `transaction_splits` side table                     | Columns on `transactions` + inflow back-pointer        |
| Settlement     | Reduces parent expense; transfer only cross-account | Creates visible income inflow(s); parent untouched     |
| Cardinality    | One payback per split                               | Many reimbursements per expense (partial tranches)     |
| Reverse        | `markSplitUnpaid` restores parent, deletes transfer | `undoReimbursement` rewinds status, deletes inflow     |
| Deferred write | `runDeferredWrite` + refresh (React-19 race)        | Same pattern                                           |
| Filterable     | No (attached post-query)                            | Yes (SQL predicate on `claimStatus`)                   |
| Insights       | Reduces spend directly                              | Excluded from income; optional net-of toggle for spend |
| Gating         | Free                                                | V1 free; V2 grouping Pro                               |

The settlement plumbing (`markSplitPaid`/`markSplitUnpaid`,
`context/AppContext.tsx:2285`) is the reference implementation to copy; the data
model deliberately differs to make claims filterable, support multiple
settlements, and preserve gross spend without inflating income.
