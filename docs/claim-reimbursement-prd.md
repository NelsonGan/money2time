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

So claims get **first-class status columns on the transaction** plus an optional
**claim grouping** (an expense report). We reuse the split _settlement_
mechanics, not the split _data model_.

---

## 2. Goals & non-goals

### Goals

- Mark any expense as **claimable** in one tap, from the editor or a row swipe.
- Track a running **"pending reimbursement"** total (money and hours) across all
  claimable expenses.
- Support **partial** claims (claim $50/night of a $70/night hotel; per-diem caps).
- Record reimbursement as a real inflow into a chosen account when it lands.
- **Filter** the activity list and search by claim status.
- (Pro) Group claimable expenses into a **claim / expense report** with a title,
  submission date, and one-tap "mark all reimbursed."
- Keep historical aggregates correct — gross spend stays gross; net-of-
  reimbursement is an explicit toggle, never a silent mutation.

### Non-goals (V1)

- No integrations with employer/expense systems (Expensify, SAP Concur, etc.).
- No PDF/CSV expense-report export (V2 candidate — see §11).
- No OCR/receipt auto-detection of reimbursable-ness (the app already has
  `receiptUri`; auto-suggestion is V2).
- No multi-party claims (one transaction, one reimburser). If you split _and_
  claim the same expense, see the edge case in §9.
- No approval workflow / partial-approval states beyond "reimbursed amount ≤
  claimed amount."

---

## 3. Concepts & state model

A claimable transaction moves through a small status machine. Status lives in a
single filterable column, `claimStatus`, on the transaction.

```
none ──mark claimable──▶ claimable ──(optional)submit──▶ submitted
                              │                              │
                              └──────── mark reimbursed ─────┤
                                                             ▼
                                          reimbursed  /  partially_reimbursed
```

| Status                 | Meaning                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `none`                 | Ordinary expense (default). Not shown as claimable anywhere.                             |
| `claimable`            | Flagged; money is outstanding. Counts toward "pending reimbursement."                    |
| `submitted`            | (Pro, optional) Added to a claim/expense report and marked submitted. Still outstanding. |
| `partially_reimbursed` | Some but not all of `claimAmount` has come back.                                         |
| `reimbursed`           | Fully settled. No longer outstanding; a reimbursement inflow exists.                     |

Only **expenses** are claimable. Income/transfer/balance_adjustment rows never
get a claim status (enforced in the editor and repository).

### The claim amount

`claimAmount` is what you expect back and defaults to the **full expense
amount** in the transaction's own currency. Editable for partial claims. It is
always `> 0` and `≤ amount`. `reimbursedAmount` accumulates what has actually
been settled (`0 → claimAmount`).

- `reimbursedAmount === 0` → `claimable`/`submitted`
- `0 < reimbursedAmount < claimAmount` → `partially_reimbursed`
- `reimbursedAmount === claimAmount` → `reimbursed`

### Reimbursement is an inflow, not an expense reversal (key divergence)

Unlike splits — which shrink the parent expense — a reimbursement **creates a
separate inbound transaction** and leaves the original expense untouched. Why:

- **Expense reports & per-diem** need the _gross_ amount ("I spent $600, claiming
  $600"). Shrinking the expense to $0 destroys that record.
- **Tax / audit**: gross spend and the matching refund should both be visible.
- **Insights** can net them on demand (a toggle), but the raw history stays honest.

Mechanically we mirror `markSplitPaid`'s same-account-vs-cross-account logic:

- **Cross-account** (refund lands in a _different_ account than the expense
  was paid from, or into any explicitly chosen account): create a
  `type: 'income'` transaction into `reimbursementAccountId`, category
  "Reimbursement," `reportingAmount`/`fxRate` snapshotted at settlement time
  (per the multi-currency rule). Store its id in `reimbursementTransactionId`.
- **Same-account** default (refund lands back where you paid): still create an
  `income` row so the balance rises and the inflow is visible in history. (We do
  **not** adopt the split "silently reduce the parent" path — it hides the
  event, which is wrong for reimbursements.)

Reversing ("mark unclaimed" / "undo reimbursed") soft-deletes the linked inflow
and rewinds `reimbursedAmount`/`claimStatus`, exactly as `markSplitUnpaid`
reverses a payback (`context/AppContext.tsx:2433`).

---

## 4. User stories

- _As a consultant_, I pay for a client dinner, tap **Claimable** in the editor,
  and see it land in "Pending reimbursement: $84 · 3.2 hrs of your time."
- _As a frequent traveller_, I open **Claims**, see six outstanding expenses
  totalling $1,240, group them into "Berlin trip — March," mark it submitted,
  and two weeks later tap **Mark all reimbursed** into my checking account.
- _As someone on a per-diem_, I spent $70 on a hotel but can only claim $50, so I
  set the claim amount to $50; the other $20 stays as real spend.
- _As a careful budgeter_, I toggle Insights to **net of reimbursements** so my
  category spend reflects only what I actually bore.
- _As anyone_, I filter the activity list to **Claimable → outstanding** to chase
  down what I'm still owed.

---

## 5. UX & surfaces

### 5.1 Transaction editor (`TransactionEditorScreen`)

A **Claimable** toggle in the expense editor, sitting near the existing
Split-bill entry (`features/transactions/components/editor/`). When on, it
reveals:

- **Claim amount** (defaults to full amount, editable, capped at amount).
- **Reimburse into** account picker (defaults to the paying account) — used when
  settling. Reuses `AccountPickerSheet`.
- Read-only status chip once it has history ("Outstanding," "Reimbursed on …").

Marking reimbursed from the editor: a **Mark reimbursed** pill (mirrors the
split "Mark paid" pill at `SplitBillModal.tsx:592`) → opens a small amount +
account confirm (defaulting to the full outstanding amount / chosen account) →
calls `markReimbursed`.

### 5.2 Activity row (`TransactionItem.tsx`)

- A subtle **badge/chip** on claimable rows — an amber "claimable" dot when
  outstanding, a green check when reimbursed — modeled on the existing red
  unpaid-split badge (`TransactionItem.tsx:113`).
- **Swipe action**: "Claimable" / "Mark reimbursed" as a quick action, matching
  existing row affordances.

### 5.3 Claims hub (new screen, Pro for grouping)

Reached from Settings and/or an Insights entry (follow the budgeting precedent
where a feature screen is both a route and an embedded Insights page). Shows:

- **Summary header**: total outstanding (money + hours), count, largest claim.
- **Outstanding** list of claimable expenses (ungrouped + grouped).
- **Claims (expense reports)** — Pro: named groups with a date range, status,
  and totals. Create a claim, add/remove transactions, mark submitted, mark all
  reimbursed in one action.
- **History** of settled claims.

The "hours of your time" framing is the money2time hook: outstanding money is
converted through `getTrueHourlyRateForDate` so a pending $600 reads as, e.g.,
"22 hours of your work, still owed."

### 5.4 Filters

Add claim status to `TransactionFilters` (see §7) so the activity list and
search can scope to Claimable / Outstanding / Reimbursed. A filter chip in the
existing filter UI.

---

## 6. Data model & migration

Next migration is **`043_claim_reimbursement.ts`** (version 43 — latest is
`042_budget_template_options.ts`). Follow the **`add-db-migration`** skill
(migration file + `schema.ts` + `mappers.ts` + `types/index.ts` + backfill).
Existing rows default to `claimStatus = 'none'`, so no data migration is needed
beyond column adds.

### 6.1 Columns on `transactionsTable` (`lib/db/schema.ts`)

```ts
// added to transactionsTable
claimStatus: text('claim_status').notNull().default('none'),
  // 'none' | 'claimable' | 'submitted' | 'partially_reimbursed' | 'reimbursed'
claimAmount: real('claim_amount'),          // expected back, tx currency; null when not claimable
reimbursedAmount: real('reimbursed_amount').notNull().default(0),
reimbursedAt: text('reimbursed_at'),        // ISO ts of full settlement; null until reimbursed
reimbursementTxId: text('reimbursement_tx_id'),   // FK -> transactions.id of the inflow
reimbursementAccountId: text('reimbursement_account_id'), // where the refund lands
claimId: text('claim_id'),                  // nullable FK -> claims.id (Pro grouping)
```

Rationale for status-on-transaction (vs a splits-style side table): it makes
claim status **filterable in the SQL predicate layer** (`buildSqlPredicates`,
`transactionsRepository.ts:242`), which the splits design explicitly can't do.
Partial index for the outstanding query:

```sql
CREATE INDEX idx_transactions_claim_outstanding
  ON transactions (claim_status)
  WHERE deleted_at IS NULL AND claim_status IN ('claimable','submitted','partially_reimbursed');
```

### 6.2 New `claimsTable` (Pro grouping — expense reports)

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

Membership is the `transactions.claimId` FK (one transaction ∈ at most one
claim), avoiding a join table since the relationship is 1-to-many. A claim's
totals are computed from its member transactions (like `getAlbumStats`).

### 6.3 Types (`types/index.ts`)

```ts
export type ClaimStatus =
  | 'none'
  | 'claimable'
  | 'submitted'
  | 'partially_reimbursed'
  | 'reimbursed';

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

Extend `TransactionWithRelations` with the claim fields (they map straight from
the row, no attach step needed — another win over the splits approach).

---

## 7. Repository & context API

### `claimsRepository` (new, `lib/repositories/claimsRepository.ts`)

CRUD mirroring `albumsRepository`: `findById`, `listActive`, `create`,
`update`, `softDelete`, plus `listOutstandingTransactions()` and stats helpers.

### `AppContext` additions (`useApp()`)

Claim state is settings/grouping-shaped (low churn), so it belongs on
`useApp()`, not `useTransactions()`. But the per-transaction mutations touch
transaction rows, so they must call `refreshTransactions()`.

- `markClaimable(txId, claimAmount?)` — set `claimStatus='claimable'`,
  `claimAmount` (default full), `reimbursementAccountId` default.
- `markUnclaimable(txId)` — back to `none` (only if not yet reimbursed).
- `markReimbursed(txId, { amount, accountId, date })` — create the inflow
  (§3), bump `reimbursedAmount`, set status, snapshot FX. Reuses the
  `markSplitPaid` deferred-write pattern (`runDeferredWrite` +
  `scheduleRefreshTransactions`) to dodge the React-19 batching race.
- `undoReimbursed(txId, reimbursementTxId)` — soft-delete inflow, rewind status.
- Claim grouping (Pro): `createClaim`, `updateClaim`, `deleteClaim`,
  `addToClaim(claimId, txIds)`, `removeFromClaim(txIds)`,
  `submitClaim(claimId)`, `markClaimReimbursed(claimId, accountId)` (settles
  every outstanding member).
- Selectors: `outstandingClaimTotal` (money + hours), `getClaimStats(claimId)`,
  `claims`.

### `TransactionFilters` (`types/index.ts:570`)

Add:

```ts
claimStatus: 'all' | 'claimable_any' | 'outstanding' | 'reimbursed' | 'none';
```

Handle it in `normalizeTransactionFilters` and `buildSqlPredicates`
(`transactionsRepository.ts:85,242`) as a real SQL predicate.

---

## 8. Insights, widgets, analytics, i18n

- **Insights**: a **"Net of reimbursements"** toggle that subtracts reimbursed
  inflows from category/expense totals (never mutates data — computed at query
  time, consistent with the frozen-FX rule). A small "Reimbursements" strip
  showing pending vs settled over time.
- **Widget** (optional, V2): a "Pending reimbursement" glance via
  `widgetSnapshot.ts`.
- **Analytics** (`services/analytics.ts`, `AnalyticsEvents`): mirror the split
  events — `CLAIM_MARKED_CLAIMABLE`, `CLAIM_MARKED_REIMBURSED`,
  `CLAIM_MARKED_UNCLAIMED`, `CLAIM_CREATED`, `CLAIM_SUBMITTED`,
  `CLAIM_SETTLED`, plus `PRO_LIMIT_HIT` on the grouping gate.
- **i18n**: all strings via `I18n.t` added to `en.ts` and all 23 locales
  (**`add-i18n-string`** skill keeps `localeParity.test.ts` green). Keys under
  `claims.*` and `transactions.editor.claim.*`.

---

## 9. Edge cases & rules

- **Split _and_ claim the same expense.** Allowed but distinct: a split reduces
  the parent (a friend paid their share); the claim amount then defaults to the
  _remaining_ parent amount, not the original. Guard: `claimAmount ≤` current
  `amount`.
- **Delete a claimable/reimbursed expense.** Soft-deleting the expense should
  also soft-delete its reimbursement inflow (and detach from any claim), so the
  refund doesn't dangle. Reversal path already exists for splits.
- **Delete the reimbursement inflow directly.** Rewind the source transaction to
  `partially_reimbursed`/`claimable` (reverse lookup by
  `reimbursementTxId`, like `findByPaidTransactionId`).
- **Multi-currency.** `claimAmount` is in the transaction currency; the inflow
  snapshots its own `reportingAmount`/`fxRate` at settlement. Outstanding totals
  aggregate in reporting currency via the frozen snapshots — never recompute
  from live rates.
- **Editing `amount` after claiming.** If the new amount `< claimAmount`, clamp
  `claimAmount` down and warn.
- **Reimbursed amount can't exceed claimed.** Enforced in `markReimbursed`.
- **Non-expense types** can never be claimable (editor + repository guard).

---

## 10. Pro gating

Per-transaction **marking, tracking, and single-tap reimbursement are free** —
this is core value and drives the "time you'll get back" hook. The **claim
grouping / expense-report** layer is **Pro**, matching how albums and budget
templates gate (`useProGate`, `constants/proLimits.ts`).

- Add `FREE_MAX_CLAIMS` (proposal: **1** open claim on free, unlimited on Pro)
  to `PRO_LIMITS`, a `'claims'` `LimitType` + `LIMIT_MAP` entry
  (`hooks/useProGate.ts:9`), and a `pro.limit_claims` string.
- Gate at claim creation: `if (!checkLimit('claims', openClaims.length)) return;`

Open question (§12): whether grouping should be Pro at all, or whether a
gentler cap (free single active claim) is enough.

---

## 11. Phasing

**V1 (this effort) — the core loop, free:**

- Migration 043 (transaction columns only; ship `claimsTable` in the same
  migration but the grouping UI can follow).
- Editor toggle + claim amount + reimburse-into account.
- `markClaimable` / `markUnclaimable` / `markReimbursed` / `undoReimbursed`.
- Activity-row badge + swipe action.
- `TransactionFilters.claimStatus` + filter chip.
- Claims hub screen: outstanding list + running total (money + hours) + history.
- Insights "net of reimbursements" toggle.
- Analytics + i18n (23 locales) + tests.

**V2:**

- Claim grouping / expense reports (Pro) with submit + batch-settle.
- CSV/PDF expense-report export (share sheet).
- Receipt-aware suggestion ("this has a receipt — claimable?").
- "Pending reimbursement" home-screen widget.
- Reminders ("$1,240 outstanding for 30+ days — chase it?") via `notifications`.

**V3 / exploratory:**

- Reimburser directory (employer/insurer/client) with per-reimburser totals.
- Recurring claimable rules (monthly transit pass).

---

## 12. Open questions

1. **Grouping = Pro?** Or free single active claim + Pro for multiple? (Leaning:
   marking/settling free, multi-claim grouping Pro.)
2. **Same-account reimbursement**: always create a visible income inflow (this
   PRD's recommendation) vs. offer the split-style "silently net it out" option?
3. **Default reimburse-into account**: paying account vs. a user-set default
   "reimbursements land here" account in settings?
4. **Reimbursement category**: a reserved default "Reimbursement" income
   category (auto-seeded) vs. let the user pick?
5. **Where does the Claims hub live** — Settings route, Insights page, or both
   (budgeting precedent)?

---

## 13. Success metrics

- **Adoption**: % of active users who mark ≥1 expense claimable in 30 days.
- **Loop completion**: % of claimable expenses that reach `reimbursed`
  (`CLAIM_MARKED_REIMBURSED / CLAIM_MARKED_CLAIMABLE`).
- **Time to settle**: median days `claimable → reimbursed`.
- **Pro pull** (if grouped-claims are Pro): `PRO_LIMIT_HIT` on `claims` →
  paywall → conversion.
- **Retention proxy**: outstanding-total surfaced (money + hours) as a recurring
  reason to reopen the app.

---

## Appendix — how this reuses the split-bill feature

| Concern        | Split-bill (existing)                               | Claim/reimbursement (this PRD)                    |
| -------------- | --------------------------------------------------- | ------------------------------------------------- |
| Counterparty   | A named friend, per share                           | A reimburser (employer/insurer), whole tx         |
| Data location  | `transaction_splits` side table                     | Columns on `transactions` (filterable)            |
| Settlement     | Reduces parent expense; transfer only cross-account | Creates a visible income inflow; parent untouched |
| Reverse        | `markSplitUnpaid` restores parent, deletes transfer | `undoReimbursed` rewinds status, deletes inflow   |
| Deferred write | `runDeferredWrite` + refresh (React-19 race)        | Same pattern                                      |
| Filterable     | No (attached post-query)                            | Yes (SQL predicate)                               |
| Gating         | Free                                                | Marking free; grouping Pro                        |

The settlement plumbing (`markSplitPaid`/`markSplitUnpaid`,
`context/AppContext.tsx:2285`) is the reference implementation to copy; the data
model deliberately differs to make claims filterable and to preserve gross spend.
