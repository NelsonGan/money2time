# PRD: Reimbursements

Mark an out-of-pocket expense as "someone is paying me back for this", track
every open claim in one place, and clear it when the money lands so it stops
counting as your spending.

## Problem

People routinely front money that is not really theirs to spend: a work trip
booked on a personal card, a client lunch, a software licence bought before
Finance sets up the account, a medical bill an insurer will refund. In
money2time today these look exactly like real expenses:

- The full amount hits the category breakdown, the month's budget, the album
  total, and the time-mode "this cost you 4.2 hours" framing. For a $1,800
  flight the user will be reimbursed for, all of that is a lie.
- There is no list of what is still outstanding. Users track claims in a note
  app or in their head, and forget to file them.
- When the reimbursement finally arrives, the only ways out are all wrong:
  delete the transaction (loses the record that it happened), log a matching
  income (inflates income and leaves the expense inflated too), or edit the
  amount to 0 by hand (loses the original number and any memory of why).

Split Bill already solves the shape of this problem for friends: you paid, they
owe you, you mark it settled. Reimbursements are the same shape with a
different counterparty (an employer, a client, an insurer) and a different
resolution: the whole thing typically comes back, not a slice.

## Product shape: how a cleared reimbursement is booked

This is the central decision, because it determines whether every aggregate in
the app needs to learn about reimbursements or none of them do.

### A. Reduce the expense in place (chosen)

Clearing a claim subtracts the claimed amount from `transactions.amount`. A
fully reimbursed $1,800 flight becomes a $1,800 → $0 row that stays in the
list, keeps its date, category, note, receipt, and album membership, and
carries a "Reimbursed" badge plus the original figure as subtext.

- This is what the user asked for, and it is honest about the end state: the
  money was not, in the end, spent.
- **Every aggregate in the app gets it right for free.** Cashflow, category and
  subcategory breakdowns, insights trends, budget depletion, album totals,
  calendar day totals, widgets, and the Excel export all read `amount` (or
  `reportingAmount ?? amount`). None of them need a reimbursement-aware branch,
  and none of them can drift out of sync with one later.
- **It is the pattern this codebase already uses.** `markSplitPaid` in
  `context/AppContext.tsx` reduces the parent expense by the settled split
  amount and, when the money lands in a different account, books a transfer
  from the paying account to the receiving one. Reimbursements reuse that
  mechanic verbatim, which also means the two features compose instead of
  fighting.
- The original amount is never lost: it is `amount + reimbursementAmount`, the
  same way a split's `totalOwed` reconstructs the pre-settlement total.

**The cost, stated plainly:** this rewrites history. A February expense drops
out of February's numbers when the money arrives in April, so a report the user
screenshotted in March no longer matches. The account balance timeline is also
compressed: the card shows the reduced amount from the expense date rather than
the full amount for the weeks it was actually outstanding.

Two things make that acceptable. First, it is already the app's behavior for
settled splits, so choosing anything else here would make two adjacent features
disagree about the same question. Second, the cross-account payout path (below)
does date the money's return, because the transfer is stamped with the
reimbursement date, which covers the common "paid on my personal card,
reimbursed into my salary account" case.

### B. Book an offsetting income or refund (rejected)

Leave the expense at $1,800 and log a $1,800 inflow on the day the money
arrives.

Rejected: the expense still shows up as $1,800 of spending in the original
month's category breakdown, which is precisely the thing the user is trying to
fix. It also inflates income with money that is not income, and it would force
every aggregate to learn to net reimbursement inflows against reimbursed
expenses, which is exactly the coupling option A avoids.

### C. An `isReimbursed` flag that aggregates skip (rejected)

Keep `amount` intact and have every query exclude reimbursed rows.

Rejected: it requires touching every aggregation path in the app (cashflow,
five breakdown queries, budget math, album stats, widget snapshots, export)
and each one is a place a future query can forget the branch. It also has no
natural answer for partial claims. Option A gets the identical outcome by
changing one number.

### D. Reuse `transaction_splits` with the employer as a "person" (rejected)

Model the employer as a split row and let Settle Up handle it.

Rejected on product grounds, not technical ones: it would mix "Priya owes me
$24 for dinner" with "Acme owes me $1,800 for a flight" in the same list,
which are different obligations with different urgency, different resolution
flows, and different counterparty vocabulary. It also cannot express "the whole
transaction is claimable" without a synthetic 100% split row, and it would make
a transaction that is both split _and_ claimable impossible to represent.
A reimbursement is a 0..1 property of a transaction, not a many-to-many.

## Goals

- Let a user mark any expense as reimbursable in one tap from the transaction
  editor, and in bulk from the activity list.
- Give every claim a payer ("Work", "Acme Corp", "BlueCross") so outstanding
  money can be grouped by who owes it.
- Support partial claims: the $95 dinner where only the $60 client portion is
  claimable.
- Give the user a single screen listing everything outstanding, with a running
  "you are owed" total, reachable from Settings.
- Clearing a claim keeps the transaction row and removes its claimed amount
  from every spending number, correctly, including in the reporting currency.
- Clearing is reversible. Filing a claim by mistake, or a rejected claim, must
  not require deleting and re-entering the transaction.

## Non-goals (v1)

- Exporting or submitting an expense report to an external system. The user
  files their claim wherever they already file it; money2time tracks state.
- Reimbursements on income or transfers. Expense-only, like splits.
- Per-payer reimbursement policies, approval workflows, or mileage rates.
- Auto-marking by category or merchant rule ("everything in Client Travel is
  claimable"). This is the highest-value follow-up, deferred to phase 3.
- Reminders or notifications for stale claims. Phase 3.
- Multi-payer claims on one transaction (half from Work, half from insurance).
  One transaction, one payer.

## Experience

### Marking an expense as reimbursable

**From the transaction editor.** A **Claim** pill joins the numpad drawer
toolbar alongside Split Bill, Sentiment, and Receipt, shown for expenses only
(`showClaimButton`, gated the same way `showSplitButton` is). It is inactive
by default and tinted `bg-primary/15 border-primary/40` when a claim is
attached, matching the Split pill's active treatment.

Tapping it opens a compact sheet:

| Field     | Behavior                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Payer     | Free text with autocomplete from previously used payers (mirrors `recentSplitPersonNames`). Defaults to the last payer used.    |
| Amount    | Defaults to the full transaction amount. Editable for partial claims. Cannot exceed the transaction amount.                     |
| Claim all | A toggle. On (default) keeps the amount pinned to the transaction total as the user edits it; switching it off frees the field. |

"Claim all" matters more than it looks: without it, a user who attaches a claim
and then keeps typing the amount ends up with a stale claim figure. With it on,
the claim tracks the total until the user deliberately makes it partial.

Saving the transaction persists `reimbursementStatus = 'pending'`.

**From the activity list.** The existing row swipe/long-press action sheet gains
**Mark as reimbursable**, which applies the last-used payer and a full-amount
claim without opening a sheet. The multi-select toolbar
(`TransactionSelectionToolbar` / `BulkEditTransactionsSheet`) gains the same
action for a whole selection, with one payer prompt for the batch. Filing a
trip's worth of receipts at once is the common case and should not cost one
editor round-trip per row.

### Seeing what is outstanding

**On the transaction row.** A pending claim renders a small amber "Claim" chip
in `TransactionItem`, reusing the placement and treatment of the unpaid-splits
badge (`hasUnpaidSplits` → `bg-warning/10 border-warning/25`). Tapping it opens
the Reimbursements screen filtered to that payer. A cleared claim renders a
muted "Reimbursed" chip instead, with the pre-reimbursement amount as struck
subtext next to the $0.

**In Settings.** A new tile, **"Reimbursements"** with the subtitle
"Waiting to be paid back", sits directly beneath the existing "Who owes you"
tile. It carries a `ReimbursementsTileBadge` showing the count of pending
claims, built exactly like `SettleUpTileBadge`: its own component, driven by a
count-only selector, so a transaction write anywhere re-renders the badge and
not the whole Settings screen.

### The Reimbursements screen

A full-page root screen (`Reimbursements`), registered in both the root stack
and the settings stack the way `SettleUp` is, with two underline tabs over the
same pool of claims. This mirrors Settle Up's two-tab shape deliberately: the
two screens are siblings and should feel like it.

**Tab 1: Pending.** Header shows the total owed in the reporting currency, plus
per-currency subtotals when claims span currencies. Below it, claims grouped by
payer, newest payer activity first, each group showing its own subtotal and
claim count. Each row is one transaction: date, category icon, note or merchant,
and the claimed amount (with the full transaction amount as subtext when the
claim is partial).

Actions:

- **Tap a row** to open the transaction editor.
- **Tap the payer group header** to select every claim in it, for a one-shot
  "Acme paid me for all four".
- **Select rows** (checkbox or long-press) to enable a bottom bar:
  **Mark reimbursed** and **Remove claim**.
- **Mark reimbursed** opens a small sheet asking two questions with sensible
  defaults: **which account** the money landed in (defaults to the account that
  paid; a picker for anything else) and **what date** (defaults to today).
  Applying it runs the clearing mechanic below for every selected claim.
- **Remove claim** drops the claim without any money movement, for a claim
  filed by mistake or one the employer rejected. The transaction returns to
  being an ordinary expense at its full amount.

Empty state uses the existing `EmptyState` mascot pattern with a one-line
explainer and a "How to claim an expense" link into the editor flow.

**Tab 2: Reimbursed.** The same rows for cleared claims, most recent first,
scoped to the last twelve months with a "Load older" affordance. Each row shows
the payer, the amount recovered, and the date it was cleared. Selecting rows
offers **Undo reimbursement**, which reverses the clearing mechanic and returns
the claim to Pending.

### Clearing a claim: what actually happens

Given a transaction `T` with `reimbursementAmount = C`, cleared into account
`A` on date `D`:

1. `T.amount` becomes `T.amount - C` (a full claim lands on exactly 0).
2. `T.reportingAmount`, when present, becomes `T.reportingAmount - C * T.fxRate`.
   **This step is what keeps foreign-currency claims honest** and is called out
   separately in "Money math" below, because the existing settle-up path omits
   its equivalent.
3. If `A` is not the account that paid, a **transfer** of `C` is created from
   `T.accountId` to `A`, dated `D`, noted "Reimbursed by {payer}", and linked
   back through `T.reimbursementTransactionId`. If `A` _is_ the paying account,
   no extra row is created: the reduced expense already nets the balance
   correctly, exactly as a same-account split payback does.
4. `reimbursementStatus` becomes `'reimbursed'`, and `reimbursedAt`,
   `reimbursementAccountId`, `reimbursementTransactionId` are stamped.

**Undo** reverses all four steps: restore `amount` and `reportingAmount`, delete
the linked transfer if there is one, clear the stamps, and set the status back
to `'pending'`. This is the direct analogue of `markSplitUnpaid`.

## Data model

Migration **`049_transaction_reimbursements.ts`**, seven nullable columns on
`transactions`, added with `addColumnsIfMissing` from
`lib/db/migrations/helpers.ts` so a replay on a half-migrated install is safe:

| Column                         | Type | Meaning                                                                              |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------ |
| `reimbursement_status`         | TEXT | `null` (not claimable), `'pending'`, or `'reimbursed'`.                              |
| `reimbursement_payer`          | TEXT | Who owes the money. Null is allowed and groups under "Unassigned".                   |
| `reimbursement_amount`         | REAL | Claimed amount in the transaction's own currency. Frozen when the claim is attached. |
| `reimbursement_claimed_at`     | TEXT | ISO stamp of when the claim was attached. Drives "outstanding for 34 days".          |
| `reimbursed_at`                | TEXT | ISO stamp of clearing. Null while pending.                                           |
| `reimbursement_account_id`     | TEXT | Account the money landed in. Null while pending.                                     |
| `reimbursement_transaction_id` | TEXT | The linked payout transfer, for cross-account clears only. Null otherwise.           |

Columns rather than a `reimbursements` table, for the same reason the savings
goal fields live on `accounts`: the relationship is 0..1, and the pending badge
is read on **every transaction row render**. A side table would mean a second
query and an attach pass (like `attachSplits`) on every transaction load, paid
by every user, for a feature most rows never use. Seven nullable columns cost
nothing when unused.

No migration backfill is needed: every existing row is correctly
`reimbursement_status = null`.

Corresponding work: `TransactionRow` fields in `lib/db/schema.ts`, the mapper in
`lib/repositories/mappers.ts`, `Transaction` in `types/index.ts` plus a
`ReimbursementStatus` union and a `ReimbursementClaim` view type, and
`normalizeTransactionInput` in `lib/repositories/transactionsRepository.ts`.

Backup and restore (`services/dataManagementService.ts`) and the `.mmbak` import
path pick the columns up through the existing transaction serializer; the round
trip needs a test, not new code.

## Money math

All arithmetic lives in a pure module, `features/transactions/lib/reimbursements.ts`,
next to `settleUp.ts` and tested in isolation the way `settleUp.test.ts` and
`splitMath.test.ts` are. It exports:

- `aggregatePendingClaimsByPayer(transactions, options)` returning per-payer
  totals, reusing `settleUp.ts`'s reporting-currency approach: prefer the
  parent's frozen `fxRate`, fall back to a live rate, and fall back again to
  the native amount rather than dropping the claim.
- `applyReimbursement(tx, { amount, fxRate })` and `revertReimbursement(...)`
  returning the new `{ amount, reportingAmount }` pair, so the AppContext
  optimistic path and the deferred DB write cannot disagree about the numbers.
- `pendingClaimCount(transactions)`, the cheap count-only selector behind the
  Settings badge.

Amounts use the app-wide two-decimal cents convention and `normalizeMoneyAmount`.

### The reporting-currency trap

`transactionsRepository.update(id, { amount })` writes `amount` and nothing
else; it does not recompute `reportingAmount`. Today `markSplitPaid` calls
exactly that when it reduces the parent expense, so **for a foreign-currency
split the stale full `reportingAmount` survives**, and every aggregate that
reads `reportingAmount ?? amount` (budget math, insights, album stats) keeps
counting the unreduced figure. Reimbursements must write both values in the
same update. Worth fixing on the split path in the same pass, since the two
features will otherwise disagree about the same transaction.

## How it composes with the rest of the app

**Split Bill.** A transaction can be both split and claimable. The rule is that
splits resolve against the total first and the claim is bounded by what is left:
`reimbursementAmount <= amount` at all times. If settling a split reduces
`amount` below an existing claim, the claim clamps down to the new `amount` and
the Reimbursements screen shows a one-time "claim reduced" note on the row. The
reverse ordering is naturally safe, because clearing a claim only ever reduces
`amount`, and split rows are frozen against it.

**Budgets.** A pending claim counts fully against the month's budget, which is
correct: the money left the account. Clearing it retroactively frees that
budget room in the original month. This follows from option A and is the same
thing that already happens when a split settles.

**Albums.** A reimbursed transaction stays in its album and its contribution to
the album total drops to the net figure. For a work trip that is exactly right.

**Time display mode.** A $0 expense is 0 hours. Nothing special needed.

**Recurring rules.** Generated transactions are ordinary expenses and are not
auto-claimed in v1. Auto-claim rules are phase 3.

**Deleting.** Deleting a reimbursed transaction must also soft-delete its linked
payout transfer, matching how the split payback transfer is handled.

**Editing a cleared claim.** Once reimbursed, the amount field edits the _net_
amount and the claim is shown as a locked chip. To change the claim, undo the
reimbursement first. This mirrors "paid split rows are always frozen".

## Simple mode and Pro

**Simple mode.** Fully available. The accounts tab is hidden in simple mode, so
the "which account did the money land in" question does not arise: clearing
always nets against the single simple wallet and never creates a transfer.

**Pro.** Free users can hold `FREE_MAX_PENDING_REIMBURSEMENTS` (proposed: **5**)
pending claims at once, gated the same way `FREE_MAX_UNSETTLED_SPLIT_BILLS`
(currently 3) is: counted per transaction, checked at claim time via
`useProGate().requirePro('reimbursements')`, with the paywall shown on the
attempt that would exceed it. Clearing a claim frees a slot, so a free user with
a normal claim cadence never hits it, while someone expensing a full business
trip does. Existing claims are never retroactively locked if a subscription
lapses; only new ones are blocked.

## Edge cases and rules

- **Claim exceeds the amount.** Blocked at input. If a later edit reduces the
  transaction amount below the claim, the claim clamps down and the row is
  flagged in the pending list.
- **Zero or negative claim.** Not allowed; removing the claim is the way out.
- **Payer left blank.** Allowed. Groups under "Unassigned" in the pending list,
  the way unnamed splits collapse into `UNNAMED_PERSON_KEY`.
- **Payer name casing drift.** "Acme" and "acme" group together on a trimmed,
  case-folded key, with the most recently used casing winning the display name.
  Same rule as `aggregateUnpaidSplitsByPerson`.
- **Cross-currency claim.** The claim is denominated in the transaction's own
  currency. The payout transfer inherits that currency; if the receiving account
  holds a different one, it takes the existing cross-currency transfer path.
- **Reimbursed into a since-deleted account.** The linked transfer survives as
  an ordinary transfer; undo still restores the amount and deletes it.
- **Claim on an already-$0 transaction.** Blocked; there is nothing to claim.
- **Partial claim cleared, then claimed again.** Allowed. Clearing sets status
  to `'reimbursed'`; re-claiming the remainder attaches a fresh claim over the
  reduced amount. The history tab shows both events by date.
- **Undo after the payout account was reconciled.** Undo deletes the payout
  transfer, which moves the receiving account's balance. This is stated in the
  undo confirmation, not silently done.

## Copy, i18n, analytics, announcement

**i18n.** New keys under a `reimbursements.*` namespace in
`lib/i18n/locales/en.ts`, added to all 23 locales in the same commit or
`__tests__/i18n/localeParity.test.ts` fails. Per the project copywriting rule,
no em or en dashes in any user-facing string.

Key strings: `reimbursements.title`, `.tile_subtitle`, `.tab_pending`,
`.tab_reimbursed`, `.owed_total`, `.claim_button`, `.payer_label`,
`.payer_placeholder`, `.claim_amount_label`, `.claim_all_toggle`,
`.mark_reimbursed`, `.remove_claim`, `.undo_reimbursement`,
`.reimbursed_badge`, `.pending_badge`, `.unassigned_payer`,
`.received_into_account`, `.received_on_date`, `.empty_title`, `.empty_body`,
`.claim_clamped_note`, `.limit_reached_title`, `.limit_reached_body`.

**Analytics** (`AnalyticsEvents` in `services/analytics.shared.ts`):
`REIMBURSEMENT_CLAIMED` (props: `partial`, `from_bulk`, `has_payer`),
`REIMBURSEMENT_CLEARED` (props: `same_account`, `bulk_size`, `days_outstanding`),
`REIMBURSEMENT_REVERTED`, `REIMBURSEMENT_CLAIM_REMOVED`,
`REIMBURSEMENTS_SCREEN_OPENED`. `days_outstanding` is the one number that tells
us whether the feature is actually changing behavior or just recording it.

**Announcement.** A numbered entry under `features/news/announcements/` plus a
`ReimbursementsShowcase` component, following the established pattern.

## Phasing

**Phase 1: the loop works.**
Migration, schema, mappers, types. The Claim pill and sheet in the editor. The
pending chip on transaction rows. The Reimbursements screen with the Pending tab,
payer grouping, and single-row "Mark reimbursed" defaulting to the paying account
(no transfer path yet). Undo. `reimbursements.ts` with its tests. English strings
plus the 22 other locales.

Shippable on its own: mark it, see it, clear it.

**Phase 2: the flows people actually have.**
Cross-account payout with the linked transfer. Partial claims and the "Claim all"
toggle. Bulk marking from the activity list and bulk clearing from the pending
list. The Reimbursed history tab. Payer autocomplete. The Settings tile badge.
The `reportingAmount` fix on both the reimbursement and the split path.

**Phase 3: it does the work for you.**
Auto-claim rules (mark a category or a merchant as always claimable so matching
transactions arrive pre-claimed). A "claims outstanding" line in Insights.
Optional reminders for claims older than N days, hung off the existing
notification preferences. Pro gate, paywall copy, and the news announcement.

Phase 3's auto-claim rule is the item most likely to change daily behavior:
users forget to mark, not to clear.

## Implementation map

| Area               | Files                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration          | `lib/db/migrations/049_transaction_reimbursements.ts`                                                                                                                                                   |
| Schema and types   | `lib/db/schema.ts`, `lib/repositories/mappers.ts`, `types/index.ts`                                                                                                                                     |
| Repository         | `lib/repositories/transactionsRepository.ts` (`normalizeTransactionInput`, a `listPendingClaims` query, and an `updateAmountWithReporting` helper)                                                      |
| Pure math          | `features/transactions/lib/reimbursements.ts`                                                                                                                                                           |
| Context            | `context/AppContext.tsx`: `setReimbursementClaim`, `removeReimbursementClaim`, `markReimbursed`, `markUnreimbursed`, `markReimbursedBulk`. Optimistic plus deferred write, modelled on `markSplitPaid`. |
| Screens            | `features/transactions/screens/ReimbursementsScreen.tsx`; routes in `navigation/rootStack.ts` and `navigation/settingsStack.ts`                                                                         |
| Editor             | `features/transactions/components/TransactionEditorScreen.tsx` (Claim pill in the numpad toolbar), new `features/transactions/components/editor/ClaimSheet.tsx`                                         |
| List surfaces      | `features/transactions/components/TransactionItem.tsx` (chip), `TransactionSelectionToolbar.tsx` and `BulkEditTransactionsSheet.tsx` (bulk action)                                                      |
| Settings           | `features/settings/screens/SettingsScreen.tsx` (tile), new `features/transactions/components/ReimbursementsTileBadge.tsx`                                                                               |
| Pro                | `constants/proLimits.ts` (`FREE_MAX_PENDING_REIMBURSEMENTS`), `hooks/useProGate`                                                                                                                        |
| i18n               | `lib/i18n/locales/*.ts` (all 23)                                                                                                                                                                        |
| Analytics and news | `services/analytics.shared.ts`, `features/news/announcements/`                                                                                                                                          |
| Tests              | `__tests__/features/reimbursements.test.ts`, additions to `__tests__/repositories/mappers.test.ts` and `transactionsRepository.test.ts`, backup round-trip coverage                                     |

The context work is the only genuinely delicate part, and it has a working
template thirty lines away: `markSplitPaid` already documents the React 19
batching hazard (the optimistic updater runs after the synchronous handler, so
the deferred write must re-read from the DB rather than trust a value captured
in the updater). The reimbursement mutations must follow the same structure.

Refresh scope: these mutations change transaction rows, so they use
`refreshTransactions()` plus `refreshAccountBalances()`, never the full
`refreshAll()`.

## Success criteria

- A user can attach a claim, find it in one place later, and clear it in under
  three taps from the Settings tile.
- After clearing, the transaction's contribution to every spending number
  (cashflow, category and subcategory breakdowns, budget usage, album total,
  calendar day total, widgets, export) is the net figure, in both the entry
  currency and the reporting currency, with no aggregate needing a
  reimbursement-specific branch.
- The pre-reimbursement amount remains visible on the row and in history; no
  information is destroyed by clearing.
- Undo restores the exact prior state, including deleting any payout transfer,
  and is byte-identical to never having cleared.
- Split Bill, Settle Up, and their aggregation are unaffected, except for the
  shared `reportingAmount` fix, which makes settled foreign-currency splits more
  correct than they are today.
- `days_outstanding` on `REIMBURSEMENT_CLEARED` shows claims being cleared, not
  just filed.

## Open questions

1. **Free limit.** Is 5 pending claims the right free tier, given
   `FREE_MAX_UNSETTLED_SPLIT_BILLS` is 3? A business trip generates more than 5
   receipts, so 5 may make the gate feel punitive at exactly the moment the
   feature proves its worth. A count of 10, or gating the _screen_ rather than
   the claims, are both worth considering.
2. **Screen placement.** Settings mirrors "Who owes you" and is where this PRD
   puts it. But a claim is time-sensitive in a way most settings are not, and
   Insights or a calendar-tab affordance would surface it more often. Settings
   for v1, revisit once `REIMBURSEMENTS_SCREEN_OPENED` shows real traffic.
3. **Should a pending claim be visually discounted in Insights?** Showing "$4,200
   spent, $1,800 of it claimable" in the month summary is genuinely useful and
   costs one extra aggregate. Deferred to phase 3 rather than rejected.
4. **Payers as first-class records?** v1 keeps them as free text on the
   transaction, which is enough for grouping. A `payers` table would enable
   per-payer defaults (which account they pay into, typical turnaround time) but
   is not worth it until the free-text version shows repeat usage.
