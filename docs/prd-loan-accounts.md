# PRD: Loan Accounts

A tracked debt ("Car loan", "Mortgage", "Student loan", "Phone instalment
plan") with an original principal, a fixed monthly repayment, a payment due
day, an optional interest rate, and a live "how much is left / when am I
free" answer. Built as a **new account type** (`type: 'loan'`) so balances,
transfers, recurring rules, multi-currency, net worth, backup and the
transaction list are reused rather than re-invented.

This is the mirror image of [Savings Goals](./prd-savings-goals.md): a goal is
an asset account climbing toward a target, a loan is a liability account
falling toward zero.

---

## Problem

money2time tracks two kinds of money today: what you have (debit accounts,
goals) and what you have spent on a revolving line (credit cards). It has no
answer for **instalment debt**, which for most users is the single largest
line on their balance sheet.

A user with a car loan today has three bad options:

1. **Ignore it.** Net worth is then wrong by tens of thousands, and the
   Assets/Debt split on the accounts tab is a fiction.
2. **Model it as a credit card.** The balance math is actually correct
   (`accountsRepository.getBalances` treats credit as a liability), but every
   piece of surrounding UI lies: the card shows "Balance Payable" and
   "Outstanding Balance" split by a _statement cycle_ that a loan does not
   have, the billing chips talk about statements, and "Pay this card" offers
   to clear a payable that was never billed. There is nowhere to put the
   monthly repayment or the payoff date, which is the only thing the user
   actually wants to see.
3. **Log the repayment as a plain expense** from their bank account. The
   monthly cash flow is right, but the debt itself is invisible: no remaining
   balance, no progress, no end date, and net worth silently overstates by the
   full outstanding principal.

The missing answer is a single number and a single date: **"how much is
left, and when does this end?"** That question is emotionally heavier than
any spending chart, and it is asked repeatedly for years, which makes it a
retention surface rather than a one-off setup screen.

It is also the strongest possible fit for the app's differentiator. Time
display mode turns "RM 84,000 remaining" into **"1,840 hours of your life
still belong to this car"** — a framing no debt tracker on either store
offers.

## Product shape: why a new account type

### A. New account type `'loan'` (chosen)

A loan **is an account** holding a negative position: `balance` = the amount
still owed, plus loan metadata (original principal, monthly repayment,
payment day, rate, term, lifecycle stamps). Repayments are ordinary
**transfers** from a debit account into the loan account.

Why this is nearly free, structurally:

- The balance SQL already computes a liability the right way. In
  `lib/repositories/accountsRepository.ts:226` a credit account's balance is
  `startingBalance + expense + transfersOut - income - transfersIn +
adjustments`. Under that formula a transfer **into** the account subtracts
  from the balance — which is exactly what a repayment does to a loan — and an
  expense **on** the account adds to it, which is exactly what an interest
  charge or a further drawdown does. No new balance code.
- `utils/accountBalances.ts:3` negates a liability's contribution to net
  worth, so Assets/Debt/Net worth and the `asset_history` insight are correct
  the moment the type is classified as a liability.
- Cross-currency is already solved: a foreign-currency loan repaid from a
  local account is a cross-currency transfer with `toAmount`, and the debt
  total uses `convertedBalance`.
- Recurring transfer rules give **auto-repayment** with zero new machinery, in
  the same way they gave goals auto-save.
- Backup/restore serializes `SELECT * FROM accounts`
  (`services/dataManagementService.ts:95`), so new columns ride along free.
- Soft-delete, search, calendar visibility, the account transaction list and
  the Excel export all key off the account, not its type.

### B. Reuse `type: 'credit'` with loan metadata (rejected)

Add the loan fields to credit accounts and branch the UI on "has a monthly
repayment". Rejected because the credit-card machinery is not dormant — it is
actively wrong for a loan and would have to be suppressed at every site:
`computeCreditCycleSummary` (`utils/statementPeriods.ts:196`) would split a
loan balance into payable/outstanding by a statement day that does not exist;
`statementPeriodKeyForTransactionDate` would bucket the loan's transaction
pager into statement cycles instead of months; the billing chips and the
unpaid-statement pulse in `AccountCardStack.tsx:380` would fire on
nonsense. A distinct literal keeps every one of those branches honestly
credit-card-only, and keeps the two concepts separable in analytics.

### C. A "debt" feature that is not an account (rejected)

A parallel debts table with its own payment ledger. Rejected for the same
reasons the goals PRD rejected virtual envelopes: it needs a second ledger
with its own consistency rules, it answers "is this real money?" with "sort
of", and it reuses none of the transfer/FX/recurring/backup machinery. It
also makes net worth a special case instead of a consequence.

### D. Attach loan metadata to an existing credit account (deferred)

"Convert this credit card into a loan" is a real migration path for users who
already modelled their car loan as a card. It is deferred to v2 and is safe
to add later precisely because credit and loan share identical sign
semantics — the conversion is a type flip plus a metadata backfill, with no
transaction rewriting.

### One loan = one account

A single real loan maps to a single app account, exactly as one goal maps to
one account. A user tracking three instalment plans creates three loans;
their sum is their instalment debt.

## The one structural change: liability ≠ credit card

Today `type === 'credit'` means two different things at once, and every call
site conflates them. Adding loans requires splitting the predicate:

```ts
// utils/accountBalances.ts
export const LIABILITY_ACCOUNT_TYPES = ['credit', 'loan'] as const;
export function isLiabilityAccountType(type: AccountType) {
  return type === 'credit' || type === 'loan';
}
```

**Becomes `isLiabilityAccountType` (sign / net-worth semantics):**

| Site                                                    | What it does                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `utils/accountBalances.ts:4`                            | `getNetAssetContribution` negates the balance                            |
| `lib/repositories/accountsRepository.ts:226`            | the balance formula branch                                               |
| `features/settings/screens/AccountsScreen.tsx:2087`     | the assets-vs-debt split behind Net worth                                |
| `features/settings/screens/AccountsScreen.tsx:1185`     | the "pay from" account list must exclude every liability, not just cards |
| `features/settings/components/AccountCardStack.tsx:822` | the group-section subtotal                                               |

`InsightsScreen.tsx:3550` and `:4274` already go through
`getNetAssetContribution`, so `asset_history` is correct for free.

**Stays `type === 'credit'` (credit-card-only UI):**
`AccountCardStack.tsx:275` (card palette), `:329`/`:384` (billing chips and
the unpaid-statement pulse), `:707` (`creditSummaryByAccountId`),
`AccountsScreen.tsx:576` (statement/due day persistence), `:752` (the
statement-day form fields), `:1023`, `:1328`, `:1769`, `:1843`, `:2380`,
`:2479` (the payable/outstanding detail header and statement pager), and the
whole of `utils/statementPeriods.ts`.

**Stays untouched:** `services/mmbakImport/writer.ts:56-62` infers `credit`
from a Money Manager backup's card fields. Money Manager has no loan concept,
so imported rows keep landing on `credit`; a user converts one via D (v2) or
recreates it.

A test in `__tests__/utils/accountBalances.test.ts` asserting
`getNetAssetContribution('loan', 250) === -250` is the cheapest possible
guard against a regression here.

## Goals

- Create a loan with a name, lender logo, original principal, current balance
  owed, monthly repayment, payment day, and optional interest rate and end
  date, in under 45 seconds.
- Answer "how much is left" and "when does this end" on the card face,
  without opening anything.
- Record a repayment in two taps, pre-filled with the monthly amount, as an
  ordinary searchable transfer.
- Optional auto-repayment via a recurring transfer rule, offered inside the
  create flow.
- Show the loan's remaining balance in work hours in time display mode.
- Flag an overdue repayment as loudly as an unpaid credit statement is
  flagged today.
- Net worth, Assets/Debt, and `asset_history` stay exactly correct, with the
  loan counted once as debt and repayments netting to zero.
- A payoff moment when the balance reaches zero, then a tidy archive path.

## Non-goals (v1)

- **A per-payment amortization schedule** (this payment: X principal, Y
  interest). v1 projects a payoff date and an estimated total interest, but
  does not generate or store a payment-by-payment table. Doing it truthfully
  needs compounding conventions, day-count basis, and rate-change history that
  users cannot reliably supply.
- **Automatic interest posting.** v1 never writes a transaction the user did
  not ask for. See [Interest](#interest-the-honest-model).
- **Variable / tiered / promotional rates**, offset accounts, redraw
  facilities, lump-sum "what if I pay extra" simulators.
- **A dedicated loan due-date notification.** A user who sets up
  auto-repayment already gets the existing `recurringAlert`
  (`types/index.ts:60`). A standalone due reminder is the first fast-follow,
  not v1 — it needs a new preference block, scheduling, and 23 locales.
- **Lending money to other people.** That is Settle Up.
- **Simple mode.** Loans are Power mode only, by the same permanent decision
  as goals: Simple mode has no accounts tab and its promise is "just track
  spending".
- **Statement import into a loan account** and **quick-entry account
  selection** — loans are excluded from both lists, as goals are today
  (`StatementImportScreen.tsx:141`, `QuickEntrySettingsScreen.tsx:160`).
- Home-screen loan widgets, a dedicated Insights page, shared/household debts.

## Experience

### Creating a loan

Entry point: a **"New loan"** action in the Loans section header of the
account card stack, plus that section's empty-state CTA. The generic account
editor's type chips stay **Debit / Credit** (`constants/appDefaults.ts:31`) —
loans get their own flow so the form can speak loan language, exactly as
goals did.

Single screen, matching the account editor's sheet styling:

| Field              | Notes                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name               | Required. "Car loan", "Mortgage".                                                                                                                                                                                    |
| Lender logo        | The existing `AccountLogoPickerSheet`. A lender **is** an institution, so unlike goals (which use an emoji) loans reuse the bank-logo picker unchanged.                                                              |
| Original principal | Required, > 0. What was borrowed. Anchors the progress bar.                                                                                                                                                          |
| Balance owed today | Required, > 0. Defaults to the principal for a brand-new loan; a user starting mid-loan types what they owe now. Written to `startingBalance`.                                                                       |
| Monthly repayment  | Required, > 0. Drives the payoff projection and pre-fills the payment sheet.                                                                                                                                         |
| Payment day        | Required, 1–28 (clamped by `clampStatementDate`). Drives "next due" and the overdue flag.                                                                                                                            |
| Interest rate      | Optional annual % (APR). Projection only, always labelled an estimate.                                                                                                                                               |
| Currency           | Defaults to the reporting currency; `CurrencyPickerSheet`.                                                                                                                                                           |
| Account group      | Defaults to a "Loans" group, created on demand, mirroring how the seed templates group "Credit Cards" (`constants/appDefaults.ts:202`).                                                                              |
| Auto-repayment     | Optional inline toggle: source account + start date. The amount and cadence are already known (monthly repayment, on the payment day), so this is one picker, not a form. Creates a recurring transfer rule on save. |

Live hints under the fields, recomputed as the user types:

- Payoff estimate: **"Paid off around March 2029 · 34 payments left"**.
- In time display mode: **"≈ 1,840 hours of work remaining"**.
- If the repayment does not cover the monthly interest: a warning, **"At
  4.5%, this repayment does not cover the monthly interest — the balance
  will grow."** (a real and under-communicated trap on credit-consolidation
  loans).

Save runs the Pro gate, creates the account (`type: 'loan'`,
`includeInTotals: true`), and the auto-repayment rule if configured.

### The loan card

Loans render **inside the existing account card stack**, not on a separate
rail and not behind a fourth `AssetsTab` tab
(`features/items/components/AssetsTabBar.tsx:9`). A loan is an account with a
balance, a transaction history and a place in net worth; the stack already
carries a visually distinct credit-card palette, so a third face is a
continuation, not an exception. The face is chosen by `account.type`, never
by which group the user filed it under.

Collapsed:

```
🏦  Car loan                                    RM 42,180
    ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  47% paid off
    RM 1,250 / month  ·  Next due 15 Mar
```

Expanded, three actions matching the credit card's: **Make a payment**,
**View transactions**, **Edit loan**.

Overdue behaviour mirrors the unpaid-statement treatment exactly: when a
repayment was expected in the current cycle and none has been recorded, the
"Next due" chip turns urgent and pulses, reusing the `flashAnim` sequence at
`AccountCardStack.tsx:406`.

Paid-off loans show a full bar, a "Paid off" badge, and no payment chips.

### Loan detail

Reached by tapping the card (`AccountDetail`) or from a dedicated
`LoanDetail` route. Header replaces the credit card's Payable/Outstanding
pair with three tiles:

| Remaining | Paid off        | Next payment       |
| --------- | --------------- | ------------------ |
| RM 42,180 | RM 37,820 (47%) | RM 1,250 on 15 Mar |

Below it, one projection line — "On track to finish **March 2029**, about 34
payments left · est. RM 3,410 interest remaining" — with the estimate
qualified whenever a rate is set. In time display mode the remaining balance
also reads in hours.

Then the ordinary account transaction list. Unlike a credit card, a loan's
pager is a **plain financial-month pager**: `bucketTransactionsByAccountPeriod`
(`utils/statementPeriods.ts:120`) already falls back to
`financialMonthKeyForIso` when `statementDay` is null, and a loan's is always
null, so this is the existing default path.

### Making a payment

`PayCreditCardScreen` (`AccountsScreen.tsx:1164`) is generalized rather than
duplicated. It already: filters the "from" list, computes the suggested
amount, handles the cross-currency `toAmount` via `convert`, and writes a
plain transfer. Two changes:

1. The suggested amount comes from a strategy — `computeCreditCycleSummary`
   for a card, the loan's monthly repayment (capped at the remaining balance)
   for a loan.
2. The "from" list excludes every liability, not just cards.

The route is renamed `PayAccount` (keeping `PayCreditCard` as an alias for
one release so any persisted navigation state stays valid), and the copy is
keyed off the target account's type.

Recording a payment larger than the balance is allowed — the overpayment
simply drives the balance below zero and the loan reads as paid off, the same
way an over-withdrawn goal is handled today.

### Auto-repayment

A recurring transfer rule, identical in kind to a goal's auto-save. Created
inline from the loan editor, editable afterwards in Settings → Recurring like
any other rule. Because it is an ordinary rule, the existing recurring
notification (`recurringAlert`) is what tells the user the payment ran.

The loan editor surfaces the linked rule's state ("Auto-repayment on, from
Maybank, 15th") and lets the user turn it off without hunting through
settings.

### Payoff and archive

When the balance first reaches zero (with the sub-cent tolerance
`normalizeMoneyAmount` already applies), an AppContext effect stamps
`loanPaidOffAt` once and fires a celebration — the same one-shot pattern as
the goal achievement effect at `context/AppContext.tsx:4003`, reusing
`GoalCelebrationOverlay` with loan copy ("Car loan paid off. That's 1,840
hours back.").

Archiving sets `loanArchivedAt`, deactivates the auto-repayment rule (mirror
of `setGoalArchived`), hides the loan from the stack and from
`AccountPickerSheet` (`components/ui/AccountPickerSheet.tsx:93`), and drops it
out of the debt total — while keeping every historical transaction, so past
months' cash flow and `asset_history` are unchanged.

## Interest: the honest model

**v1 tracks the balance the user tells it about. It does not accrue
interest.**

The rate is used for **projection only** — payoff date, payments remaining,
estimated total interest. Everything derived from it is labelled an estimate.

When the lender charges interest, the user records it as an **expense on the
loan account**, which increases the balance — the identical mechanism to a
credit-card purchase, requiring no new transaction type. The create flow
suggests an "Interest" category for this.

This is deliberate, and the alternative was considered and rejected for v1:
auto-posting a monthly interest transaction would mean the app silently
creating transactions the user never entered, which then flow into their
expense totals, their category breakdown, and their budgets. Getting the
amount wrong (wrong compounding, wrong day count, a rate the user mistyped)
would corrupt real reports. It is a v2 feature behind an explicit opt-in
toggle, not a v1 default.

**The drift this creates, and its mitigation.** A user who records only
repayments will see the tracked balance fall faster than the real one. Two
mitigations, both already built:

1. The loan detail states plainly that the balance reflects what has been
   recorded.
2. Editing **Current balance** on an account writes a `balance_adjustment`
   (`accounts.current_balance_hint` / `balance_adjustment_prompt_title` in
   `lib/i18n/locales/en.ts:1620`), which is excluded from insights totals.
   Reconciling a loan against the lender's statement is therefore a two-tap
   operation with correct reporting semantics on day one.

The loan detail surfaces that as an explicit **"Update balance from
statement"** action rather than leaving the user to find it in the editor.

## Data model

Migration `052_account_loan_fields`, following `047_account_goal_fields`
verbatim in shape — `addColumnsIfMissing`, idempotent, its own transaction,
`user_version` bumped inside it.

```ts
addColumnsIfMissing(db, 'accounts', [
  ['loan_original_principal', 'REAL'],
  ['loan_monthly_payment', 'REAL'],
  ['loan_payment_day', 'INTEGER'],
  ['loan_interest_rate', 'REAL'], // annual %, null = not modelled
  ['loan_end_date', 'TEXT'], // optional YYYY-MM-DD contractual end
  ['loan_paid_off_at', 'TEXT'], // one-shot celebration stamp
  ['loan_archived_at', 'TEXT'], // null = active
]);
```

All null on non-loan accounts. `startingBalance` carries the balance owed at
the moment tracking starts, so `loan_original_principal` is what makes a
mid-loan signup show truthful progress; when the two are equal the loan is
being tracked from day one.

Mirrored in `lib/db/schema.ts`, `types/index.ts` (`Account`, plus
`LoanProgress` / `LoanWithProgress`), `lib/repositories/mappers.ts:188`,
`lib/repositories/accountsRepository.ts` (`CreateAccountInput` /
`UpdateAccountInput`), and `constants/appDefaults.ts` templates. `asAccountType`
(`mappers.ts:51`) gains `case 'loan'`; every unknown string keeps folding to
`debit`, so no existing row can flip.

No new tables. No changes to transactions.

## Math

New pure module `features/loans/lib/loanMath.ts`, mirroring
`features/goals/lib/goalMath.ts`: no `Date.now()`, no I/O, evaluation date
injected, fully unit-tested.

```ts
computeLoanProgress({
  balance, originalPrincipal, monthlyPayment,
  paymentDay, annualRatePercent, paidOffAt, todayIso,
}): LoanProgress
```

Returning:

| Field                        | Definition                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `remaining`                  | `max(0, balance)`                                                                          |
| `paid`                       | `max(0, originalPrincipal - remaining)`                                                    |
| `paidRatio`                  | `clamp(paid / originalPrincipal, 0, 1)`; `1` when `originalPrincipal <= 0`                 |
| `isPaidOff`                  | `paidOffAt != null \|\| normalizeMoneyAmount(balance) <= 0`                                |
| `nextDueDate`                | `nextOccurrenceOfMonthDay(paymentDay, today)` — reused from `utils/statementPeriods.ts:69` |
| `paymentsRemaining`          | `ceil(n)`, below                                                                           |
| `projectedPayoffDate`        | `nextDueDate` plus `paymentsRemaining - 1` months                                          |
| `estimatedInterestRemaining` | `monthlyPayment * n - remaining`, or `null` without a rate                                 |
| `paymentCoversInterest`      | `false` when the repayment is smaller than one month's interest                            |

With `r = annualRatePercent / 100 / 12`:

- `r === 0` (or no rate): `n = remaining / monthlyPayment`.
- `monthlyPayment <= remaining * r`: never amortizes — `n = null`,
  `paymentCoversInterest = false`, no projected date, and the UI shows the
  warning instead of a date.
- otherwise: `n = -ln(1 - r * remaining / monthlyPayment) / ln(1 + r)`.

Edge cases the tests pin: zero/negative principal, a balance already at or
below zero, a missing or zero repayment (`n = null`, no projection), a
payment exactly equal to the monthly interest (the divide-by-zero boundary),
a payment day of 29–31 clamped into short months by `clampStatementDate`, and
a balance that grows because interest expenses exceed repayments.

Overdue detection lives beside it:

```ts
isRepaymentOverdue(account, transactions, now);
```

`true` when the previous occurrence of the payment day has passed and no
transfer into the loan account is dated on or after it. It reads the same
`getTransactionsByAccount(accountId)` slice the credit summary already uses
(`AccountsScreen.tsx:2107`), so no new query.

`useLoans()` (`features/loans/useLoans.ts`) composes these over
`accounts` + `accountBalances` + `recurringRules`, returns
`{ active, archived }`, and short-circuits in Simple mode — a direct
transliteration of `useGoals()`.

## Engineering plan

Phased so each phase is independently shippable and testable.

**Phase 1 — type and semantics (no visible UI).**
`AccountType` gains `'loan'`; `isLiabilityAccountType` lands in
`utils/accountBalances.ts` and replaces the five sign-semantics call sites
above; migration 052; schema, mappers, repository inputs, `asAccountType`.
Tests: `accountBalances`, `mappers`. At the end of this phase a loan row
inserted by hand already computes a correct balance and a correct net worth.

**Phase 2 — math.** `features/loans/lib/loanMath.ts` and its test file,
written test-first per the repo's `tdd` skill. No UI.

**Phase 3 — create and edit.** `LoanEditorScreen` + `LoanEditor` root route,
the "New loan" entry point and `AddLoanButton` with the Pro gate,
auto-repayment rule creation, the "Loans" default group. Loans excluded from
`StatementImportScreen` / `QuickEntrySettingsScreen` account lists; archived
loans excluded from `AccountPickerSheet`.

**Phase 4 — surfaces.** The loan card face and palette in `AccountCardStack`
(a third branch in `getCardPalette`/`getExpandedHeight`, plus a
`LoanCardBody`), the loan detail header and projection line in
`AccountsScreen`, `AccountLogo`'s loan fallback icon, and the generalized
`PayAccount` sheet.

**Phase 5 — lifecycle.** The `loanPaidOffAt` one-shot effect in AppContext,
the payoff celebration, archive/unarchive, and archive-deactivates-the-rule.

**Phase 6 — launch.** i18n across 23 locales, analytics, a numbered
`features/news/announcements/` entry with a `LoanShowcase`, and the paywall
copy line.

**Not touched:** budgets, albums, split bills, receipt scan, the calendar,
the credit-card statement machinery, and `services/mmbakImport`.

### Files

| File                                                | Change                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `lib/db/migrations/052_account_loan_fields.ts`      | new                                                                            |
| `lib/db/schema.ts`                                  | 7 columns                                                                      |
| `types/index.ts`                                    | `AccountType`, `Account` fields, `LoanProgress`, `LoanWithProgress`            |
| `lib/repositories/mappers.ts`                       | `asAccountType` case, row → domain mapping                                     |
| `lib/repositories/accountsRepository.ts`            | create/update inputs, liability balance branch                                 |
| `utils/accountBalances.ts`                          | `isLiabilityAccountType`, `LIABILITY_ACCOUNT_TYPES`                            |
| `features/loans/lib/loanMath.ts`, `useLoans.ts`     | new                                                                            |
| `features/loans/screens/`                           | `LoanEditorScreen`, `LoanDetailScreen`                                         |
| `features/loans/components/`                        | `LoanCard`, `AddLoanButton`                                                    |
| `features/settings/components/AccountCardStack.tsx` | palette, height, loan card body, section subtotal                              |
| `features/settings/screens/AccountsScreen.tsx`      | liability totals, detail header, `PayAccount` generalization, Pro-count filter |
| `components/ui/AccountLogo.tsx`                     | loan fallback icon                                                             |
| `components/ui/AccountPickerSheet.tsx`              | hide archived loans                                                            |
| `navigation/rootStack.ts`, `App.tsx`                | `LoanEditor`, `LoanDetail`, `PayAccount` routes                                |
| `constants/proLimits.ts`                            | `FREE_MAX_LOANS`                                                               |
| `constants/appDefaults.ts`                          | loan-null fields on templates                                                  |
| `context/AppContext.tsx`                            | paid-off effect, `setLoanArchived`                                             |
| `lib/i18n/locales/*.ts`                             | 23 locales                                                                     |
| `services/analytics`                                | event names                                                                    |

## Pro gating

`FREE_MAX_LOANS: 1` in `constants/proLimits.ts`, counted over non-archived
loans, gated with `useProGate().checkLimit` at loan creation — the same
treatment as `FREE_MAX_SAVINGS_GOALS: 2`.

Loans do **not** count toward `FREE_MAX_ACCOUNTS`. The existing
`nonGoalCount` filter (`AccountsScreen.tsx:2359`) must therefore become
`a.type !== 'goal' && a.type !== 'loan'`, or a user's loans would silently
consume their five free bank accounts.

One free loan is deliberate: it is enough to prove the value on the debt the
user cares most about, and the second loan (most users have several) is a
natural, non-punitive upgrade moment.

## Copy and i18n

New keys under `accounts.loan.*` in `lib/i18n/locales/en.ts`, then all 23
locales, or `__tests__/i18n/localeParity.test.ts` fails. Roughly 40 keys:
the editor fields and hints, the card chips, the three detail tiles, the
projection sentence, the overdue and interest warnings, the payoff
celebration, and the archive confirmations.

Per the repo copy rule, **no em or en dashes** in any of it.

The projection sentence must stay pluralization-safe and must never present
an estimate as a fact: "Paid off around {{month}}", not "Paid off
{{month}}".

## Analytics

`loan_created` (with `has_rate`, `has_autopay`, `currency`,
`term_months_estimate`), `loan_payment_recorded` (`source: 'manual' |
'recurring'`, `is_overpayment`), `loan_balance_reconciled`,
`loan_paid_off`, `loan_archived`, `loan_limit_hit`.

The two questions these must answer: do people set an interest rate (if
almost nobody does, the amortization v2 is not worth building), and does
auto-repayment adoption predict retention (if it does, promote it harder in
the create flow).

## Testing

Node-env Jest only; no RN render tests exist in this repo.

- `__tests__/utils/accountBalances.test.ts` — loan is a liability.
- `__tests__/features/loanMath.test.ts` — every case in [Math](#math),
  including the no-amortization boundary and the clamped payment day.
- `__tests__/repositories/mappers.test.ts` — `'loan'` survives the round
  trip; unknown types still fold to `debit`.
- A balance test asserting that a transfer into a loan reduces the balance
  and an expense on it increases the balance.
- A multi-currency test asserting a cross-currency repayment conserves net
  worth, in the shape of `__tests__/utils/multiCurrencyScenarios.test.ts:91`.
- A backup round-trip asserting the seven columns survive export/import, and
  that restoring a **pre-052 backup** into a post-052 build leaves the loan
  columns null rather than failing the insert.

## Risks

| Risk                                                                                                       | Mitigation                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tracked balance drifts from the real one** because interest is not accrued.                              | Explicit copy, plus the one-action "Update balance from statement" reconciliation path (already-built `balance_adjustment`).                         |
| **A liability site is missed** in the credit-predicate split, silently inverting net worth for loan users. | The split is mechanical and enumerated above; the `getNetAssetContribution('loan', …)` test is the guard. Grep for `'credit'` at review time.        |
| **Users model a loan as a card today** and now have two ways to do the same thing.                         | Ship v1 without conversion, then D as a fast follow. The News announcement should say conversion is coming so users do not recreate history by hand. |
| **Projection is mistaken for a contractual schedule.**                                                     | Never render a projected date without "around"/"estimated"; never show a per-payment principal/interest split in v1.                                 |
| **A negative-amortization loan** (repayment below monthly interest) shows an infinite payoff.              | Detected explicitly, warned about at entry time, and rendered as a warning rather than a date.                                                       |
| **Scope creep into a full amortization engine.**                                                           | v1 ships one formula and one date. The rate-adoption analytics decide whether v2 is justified.                                                       |

## Milestones

1. **Phase 1–2** — type, liability split, migration, math. Fully tested, no UI.
2. **Phase 3–4** — create/edit, card face, detail, payment sheet. Internally usable.
3. **Phase 5–6** — payoff, archive, i18n, analytics, announcement. Ship.

## Open questions

1. **Free limit: 1 or 2 loans?** 1 is proposed. Goals get 2 because users
   naturally have several small goals; most users have one dominant debt, so
   1 free proves the value while making the second loan a real upgrade
   moment. Worth revisiting against `loan_limit_hit`.
2. **Does the loan card belong in the stack or on its own rail?** Proposed:
   the stack, because a loan is a balance-bearing account and the stack
   already carries a distinct credit palette. A separate rail becomes right
   only if users routinely track four or more loans.
3. **Should a dedicated due-date notification be v1 after all?** It is the
   highest-value item on the fast-follow list, and the argument for deferring
   it is cost (a new preference block plus 23 locales), not value. Worth
   reconsidering if Phase 1–4 land ahead of schedule.
4. **Should `loanEndDate` drive anything in v1**, or is it a display-only
   field? Proposed: display-only, with the projection compared against it
   ("ahead of schedule" / "behind schedule") only if it proves cheap.
