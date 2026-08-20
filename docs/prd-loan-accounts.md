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
// utils/accountBalances.ts
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

Entry point: an **add button on the Accounts tab header**, beside the settings
and hide-balances buttons, opening the account editor. The editor's first field
is a **type row** whose third chip is **Loan**, revealing the loan fields inline
exactly as picking **Credit** reveals statement day and due day today.

> **Deviation from the original draft**, decided during implementation. The
> draft kept the chips at Debit/Credit and gave loans their own screen, by
> analogy with goals. That analogy does not hold: a goal speaks emoji and
> target language and needed a bespoke form, whereas a loan is bank-shaped.
> It has a lender logo, an account group, a currency, a starting balance, a
> current-balance reconciliation path and a delete flow, all of which the
> account editor already implements correctly. A separate screen would have
> duplicated every one of them. Four extra fields sit alongside credit's two.
>
> The header add button came in the same pass. Before it, the only way to
> create _any_ account was Accounts, settings, a group card, "add account",
> which buried loans four taps deep behind a gear icon. The free-account Pro
> gate moved to save time so both entry points enforce it. The type row moved
> to the top of the form in the same pass, so the form adapts beneath the
> user's choice instead of asking for a name, logo, group and currency before
> it knows what is being created.

Single screen, matching the account editor's sheet styling:

| Field                              | Notes                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                               | Required. "Car loan", "Mortgage".                                                                                                                                                                                         |
| Lender logo                        | The existing `AccountLogoPickerSheet`. A lender **is** an institution, so unlike goals (which use an emoji) loans reuse the bank-logo picker unchanged.                                                                   |
| Amount borrowed                    | Required, > 0. Anchors the progress bar, and doubles as the balance owed until the toggle below says otherwise.                                                                                                           |
| I have already repaid some of this | Off by default. A brand-new loan owes exactly what was borrowed, so the balance field stays hidden rather than asking for the same number twice; mid-loan signups flip it on and edit the revealed **Balance owed** down. |
| Monthly repayment                  | Required, > 0. Drives the payoff projection and pre-fills the payment sheet.                                                                                                                                              |
| Payment day                        | 1 to 31, clamped into short months by `clampStatementDate`, the same treatment credit's statement day gets. Drives "next due" and the overdue flag.                                                                       |
| Interest rate                      | Optional annual % (APR). Projection only, always labelled an estimate.                                                                                                                                                    |
| Pay automatically                  | Optional. One toggle plus a source-account picker: the amount and cadence are already known (the monthly repayment, on the payment day), so it is a picker, not a form. Creates the recurring transfer rule on save.      |
| Currency                           | The editor's existing picker. Switching it converts the principal and repayment in place, and clears the auto-repayment source, which is restricted to the loan's currency.                                               |
| Account group                      | The editor's existing group picker.                                                                                                                                                                                       |

`LoanEditorProjection` sits under the balance field and recomputes as the
user types. It is a **stat block, not prose**, mirroring the goals summary
block so the two forward-looking surfaces read the same way:

```
┌─────────────────────────────────────┐
│ 🗓  PAID OFF BY                      │
│ Mar 2029                            │
├──────────────────┬──────────────────┤
│ ↻ PAYMENTS LEFT  │ % EST. INTEREST  │
│ 34               │ RM 3,410         │
└──────────────────┴──────────────────┘
```

The payoff month is the headline, because "when does this end?" is the
question the form exists to answer. The supporting figures sit in a divided
row, and the block degrades cleanly: with no interest rate the second cell
carries **Remaining** in time display mode (the one number the raw amount
field cannot give) and is dropped entirely in money mode, where it would only
echo the field above; with no payment day there is no payoff date, so the
payment count becomes the headline and the row disappears.

A repayment that loses to the interest replaces the whole block with a single
warning row, icon plus one line, rather than a paragraph.

Save runs the Pro gate and creates the account (`type:

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

Overdue behaviour mirrors the unpaid-statement treatment: when a repayment
was expected in the current cycle and none has been recorded, the "Next due"
chip turns urgent and pulses, reusing the same `flashAnim` sequence.

A repayment counts toward its cycle from **7 days before** the due date
(`REPAYMENT_GRACE_DAYS`). Without that window, everyone who pays a few days
early would be told they are overdue the moment the due date passed, which is
the common case rather than an edge case: a false alarm on a paying user costs
more trust than the late nudges it buys.

Paid-off loans show a full bar, a "Paid off" badge, and no payment chips.

### Loan detail

Reached by tapping the card (`AccountDetail`). The header replaces the credit
card's Payable/Outstanding pair with a Remaining/Paid off pair, matching that
two-tile layout rather than crowding in a third; the payment schedule and
payoff estimate live on the card face, one tap away. In time display mode both
tiles read in hours of work, through the same `renderVisibleBalanceNode` that
honours the hide-balances toggle.

Then the ordinary account transaction list. Unlike a credit card, a loan's
pager is a **plain financial-month pager**: `bucketTransactionsByAccountPeriod`
(`utils/statementPeriods.ts:120`) already falls back to
`financialMonthKeyForIso` when `statementDay` is null, and a loan's is always
null, so this is the existing default path.

### Making a payment

`PayCreditCardScreen` is generalized rather than duplicated. It already
filters the "from" list, computes the suggested amount, handles the
cross-currency `toAmount` via `convert`, and writes a plain transfer. Three
changes:

1. The suggested amount comes from the account type: `computeCreditCycleSummary`
   for a card, the monthly repayment capped at the remaining balance for a
   loan, so the final instalment offers only what is left.
2. The "from" list excludes every liability, not just cards, and hides
   archived goals and loans.
3. An `isLoan` flag switches the title, the default note and the due-amount
   label to loan language.

The route keeps the name `PayCreditCard`: renaming it would churn the root
stack and any persisted navigation state for no user-visible gain.

Recording a payment larger than the balance is allowed — the overpayment
simply drives the balance below zero and the loan reads as paid off, the same
way an over-withdrawn goal is handled today.

### Auto-repayment

A recurring transfer rule, identical in kind to a goal's auto-save and set up
the same way: inline in the create form, with one toggle and a source picker.
Because it is an ordinary rule it then appears under Settings, Recurring like
any other, and the existing recurring notification (`recurringAlert`) is what
tells the user the payment ran.

It is offered at create time only, matching the goal editor. Adding or changing
auto-repayment on an existing loan goes through the recurring editor; an inline
control on the edit form is a fast follow.

### Payoff and archive

When the balance first reaches zero (with the sub-cent tolerance
`normalizeMoneyAmount` already applies), an AppContext effect stamps
`loanPaidOffAt` once and fires `LoanPayoffOverlay`, the same one-shot pattern
as the goal achievement effect. The stamp gates the celebration and nothing
else: whether a loan reads as settled is derived from its balance alone, so a
loan drawn down again correctly owes money (pay button and all), and the same
effect clears the stamp so paying it off a second time celebrates again. In time display mode the celebration names the
principal in hours of work.

Archiving sets `loanArchivedAt` and deactivates the auto-repayment rules
(mirror of `setGoalArchived`), from a row in the loan's editor. An archived
loan drops out of the accounts card stack and out of `AccountPickerSheet`,
while keeping every historical transaction, so past months' cash flow and
`asset_history` are unchanged. It deliberately **stays in the debt total**:
hiding a still-owed balance from net worth would silently overstate it, and
the account stays reachable (and un-archivable) on the account management
screen.

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
  ['loan_paid_off_at', 'TEXT'], // gates the one-shot celebration
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

| Field                        | Definition                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `remaining`                  | `max(0, balance)`                                                                      |
| `paid`                       | `max(0, originalPrincipal - remaining)`                                                |
| `paidRatio`                  | `clamp(paid / originalPrincipal, 0, 1)`; `1` when `originalPrincipal <= 0`             |
| `isPaidOff`                  | `normalizeMoneyAmount(balance) <= 0`, purely balance-derived                           |
| `nextDueDate`                | `nextOccurrenceOfMonthDay(paymentDay, today)`, reused from `utils/statementPeriods.ts` |
| `paymentsRemaining`          | `ceil(n)`, below; `0` once paid off, `null` when it never amortizes                    |
| `projectedPayoffDate`        | `nextDueDate` plus `paymentsRemaining - 1` months, clamped into short months           |
| `estimatedInterestRemaining` | `monthlyPayment * n - remaining` at the fractional `n`; `null` without a rate          |
| `paymentCoversInterest`      | `false` when the repayment is smaller than one month's interest (the balance grows)    |

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

Overdue detection lives beside it, as `isRepaymentOverdue(account,
transactions, now)`: `true` when the previous occurrence of the payment day
has passed and no transfer into the loan account is dated within the window
that opens `REPAYMENT_GRACE_DAYS` (7) before it. It reads the same
`getTransactionsByAccount(accountId)` slice the credit summary already uses,
so no new query, and compares local-midnight-to-UTC stamps on both sides,
matching how the transaction editor writes dates.

`useLoans()` (`features/loans/useLoans.ts`) composes these over `accounts` and
`accountBalances`, returns `{ active, archived }`, and short-circuits in Simple
mode, a direct transliteration of `useGoals()`. The card stack computes the
same progress inline (alongside the credit summary) so it can pair it with the
overdue flag without a second hook.

The balance formula itself was lifted out of the repository into the pure
`computeAccountBalance` in `utils/accountBalances.ts`, so the single most
dangerous invariant in this change, a liability's flipped signs, is unit
tested rather than reachable only through SQLite.

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

**Phase 3 — create and edit.** The Loan type chip and its fields on the
account editor, validation, persistence through create/update and the
currency-change path, and the Pro gate. Loans excluded from
`StatementImportScreen` / `QuickEntrySettingsScreen` account lists; archived
loans excluded from `AccountPickerSheet` and from the "pay from" list.

**Phase 4 — surfaces.** The loan card face and amber palette in
`AccountCardStack` (a third branch in `getCardPalette`/`getExpandedHeight`,
plus a progress bar, paid/remaining tiles and a projection line), the loan
detail header, `AccountLogo`'s loan fallback icon, and the generalized pay
sheet.

**Phase 5 — lifecycle.** The `loanPaidOffAt` one-shot effect in AppContext,
the payoff celebration, archive/unarchive, and archive-deactivates-the-rule.

**Phase 6 — launch.** i18n across 23 locales and analytics. A numbered
`features/news/announcements/` entry with a `LoanShowcase`, and the paywall
copy line, are a separate release-time change.

**Not touched:** budgets, albums, split bills, receipt scan, the calendar,
the credit-card statement machinery, and `services/mmbakImport`.

### Files

| File                                                | Change                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| `lib/db/migrations/052_account_loan_fields.ts`      | new                                                                 |
| `lib/db/schema.ts`                                  | 7 columns                                                           |
| `types/index.ts`                                    | `AccountType`, `Account` fields, `LoanProgress`, `LoanWithProgress` |
| `lib/repositories/mappers.ts`                       | `asAccountType` case, row to domain mapping                         |
| `lib/repositories/accountsRepository.ts`            | create/update inputs, balance via `computeAccountBalance`           |
| `utils/accountBalances.ts`                          | `isLiabilityAccountType`, `computeAccountBalance`                   |
| `utils/recurringRates.ts`                           | `monthlyEquivalentInflowRate`, shared with goals                    |
| `features/loans/lib/loanMath.ts`, `useLoans.ts`     | new                                                                 |
| `features/loans/components/`                        | `LoanEditorProjection`, `LoanPayoffOverlay`                         |
| `features/settings/components/AccountCardStack.tsx` | palette, height, loan card body, `LoanCardSummary`                  |
| `features/settings/screens/AccountsScreen.tsx`      | liability totals, editor fields, detail header, pay sheet, Pro gate |
| `components/ui/AccountLogo.tsx`                     | loan fallback icon                                                  |
| `components/ui/AccountPickerSheet.tsx`              | hide archived loans                                                 |
| `App.tsx`                                           | mounts `LoanPayoffOverlay`                                          |
| `constants/proLimits.ts`, `hooks/useProGate.ts`     | `FREE_MAX_LOANS`, the `loans` limit key                             |
| `constants/appDefaults.ts`                          | the Loan type chip                                                  |
| `context/AppContext.tsx`                            | paid-off effect, `setLoanArchived`, loan FX re-denomination         |
| `lib/i18n/locales/*.ts`                             | 23 locales                                                          |
| `services/analytics`                                | event names                                                         |

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

1. **Free limit: 1 or 2 loans?** Shipped at 1. Goals get 2 because users
   naturally have several small goals; most users have one dominant debt, so
   1 free proves the value while making the second loan a real upgrade
   moment. Worth revisiting against `loan_limit_hit`.
2. **Does the loan card belong in the stack or on its own rail?** Shipped in
   the stack, because a loan is a balance-bearing account and the stack
   already carries a distinct credit palette. A separate rail becomes right
   only if users routinely track four or more loans.
3. **A dedicated due-date notification is still the top fast-follow.** It was
   deferred on cost (a new preference block plus 23 locales), not value. Today
   a due reminder only reaches users who set up an auto-repayment rule and so
   get the existing `recurringAlert`.
4. **`loanEndDate` shipped as a column with no UI.** The projection is
   computed from the repayment rather than compared against a contractual end
   date. Surfacing an "ahead of / behind schedule" read against it is the
   cheapest remaining win if the column earns its keep.
