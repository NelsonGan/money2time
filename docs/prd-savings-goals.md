# PRD: Savings Goals

Named savings goals ("Japan trip", "Emergency fund", "New MacBook") with a
target amount, real deposit/withdraw money movement, progress + pace, optional
auto-save, and a celebration when the goal is hit. Built as a **new account
type** so the entire existing accounts/transfers/recurring/backup machinery is
reused rather than re-invented.

---

## Problem

money2time answers "where did my money go?" very well (calendar, insights,
budgets) but has nothing for the forward-looking half of personal finance:
**"am I getting closer to the thing I'm saving for?"**

Today a motivated user fakes it: they create a debit account called "Japan
Trip", transfer money into it, and mentally track the target. Everything about
that workaround works mechanically (transfers, balances, net worth) except the
part that matters emotionally: there is no target, no progress bar, no pace
("will I make it by June?"), and no payoff moment when they get there.

That gap is also a retention gap. Spending trackers are used when money leaves;
a goal gives users a reason to open the app when money _stays_ — deposits are
positive-affect interactions, and a progress ring is the single most
screenshot-able, habit-forming widget surface we don't have.

Finally, this is the feature where the app's core differentiator (time display
mode) shines hardest: _"this trip costs 87 hours of your work; you've already
earned 34 of them."_ No competitor frames goals this way.

## Product shape: why a new account type

Three shapes were considered.

### A. New account type (chosen)

A goal **is an account** (`type: 'goal'`) holding real money, plus goal
metadata (target amount, target date, emoji, lifecycle timestamps). Deposits
and withdrawals are ordinary **transfers**.

- Reuses, with zero new machinery: balance computation, multi-currency +
  frozen FX snapshots, the transfer editor (incl. cross-currency `toAmount`),
  recurring rules (= free auto-save), calendar/search visibility, soft-delete,
  backup/restore, net-worth and `asset_history` math.
- Financially honest: money in a goal is still the user's money. It counts as
  an asset; an internal transfer into a goal nets to zero in `asset_history`,
  so net worth never distorts.
- The codebase makes this cheap by construction: every balance-sign branch
  tests `type === 'credit'` (`utils/accountBalances.ts:3`,
  `lib/repositories/accountsRepository.ts:215`), so a third type inherits
  correct debit/asset semantics **by default**. Only UI surfaces need work.

### B. Virtual envelopes (rejected)

Goals as pure metadata allocations over existing account balances (YNAB-style
envelopes): no real transfers, an allocation ledger instead. Rejected: it
requires a parallel ledger with its own consistency rules, answers "is this
real money?" with "sort of", and reuses none of the transfer/recurring/FX
machinery. It also breaks the mental model of users who _do_ keep a separate
bank savings account per goal.

### C. Goal = target attached to any existing account (rejected for v1)

Add `goalTargetAmount` to accounts and let any debit account "become" a goal.
Attractive for users whose bank savings account already exists, but it makes
the goal identity fuzzy (is my main checking account a goal now?), complicates
the Accounts tab grouping, and muddies the create flow. Instead, v1 keeps a
crisp identity (goals are their own type) and a future release can add
**"Convert account to goal"** — safe because debit and goal share identical
sign semantics.

### One goal = one account

Some banks (Monzo pots) allow many goals inside one real account. We
deliberately map **one goal to one app account**. money2time accounts are
already virtual representations, not bank connections, so a "Japan Trip"
account costs the user nothing and keeps every existing invariant (an account
has one balance; a transfer has one from and one to). A user mirroring one
real bank account across three goals simply creates three goal accounts; their
sum is the real balance.

## Goals

- Create a named goal with an emoji, target amount, optional target date, and
  optional starting amount, in any supported currency, in under 30 seconds.
- Deposit and withdraw via the existing transfer flow with one-tap pre-filled
  entry points; every movement is an ordinary searchable transaction.
- Show progress (saved / target), pace against the target date, and a
  projected completion date derived from active auto-save rules.
- First-class time display mode: target and progress expressed in work hours.
- Auto-save: a recurring transfer into the goal, offered inside goal creation.
- A celebration moment when the goal is reached, then a tidy archive path.
- Net worth, asset history, and all historical aggregates stay exactly
  correct with no double counting.

## Non-goals (v1)

- Simple mode. Goals are **Power mode only**, permanently by decision (not
  just deferred): Simple mode has no accounts tab and forces every entry
  point to the single wallet, and its promise is "just track spending".
  No Simple-mode goals surface is planned.
- Converting an existing debit account into a goal (v2; see shape C).
- Open-ended goals with no target amount (a target is what makes it a goal
  tracker; "just watch it grow" is served today by a plain debit account).
- Home-screen goal widgets, a dedicated Insights page, shared/household goals,
  round-ups (no bank sync, so no transaction feed to round).
- Any change to budgets, albums, split bills, or the credit-card machinery.

## Experience

### Creating a goal

Entry points: a **"New goal"** action in the Goals section header on the
Accounts tab (plus the section's empty-state CTA). The generic account
editor's type chips stay Debit/Credit only — goals are created through their
own flow so the form can speak goal language, not bank language.

The create flow (single screen, matching the account editor's sheet styling):

| Field           | Notes                                                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name            | Required. e.g. "Japan trip".                                                                                                                                                                                                                                                                    |
| Emoji           | The **same inline emoji chip picker the category editor uses** (`CATEGORY_ICON_PICKER_VALUES` chips + `CategoryEmoji`, with name-based auto-suggestion via the emoji matcher, as in `CategoriesScreen`). No new picker component, no bank-logo picker. Cleared/unset falls back to 🎯.          |
| Target amount   | Required, > 0, in the goal's currency.                                                                                                                                                                                                                                                          |
| Currency        | Defaults to reporting currency; CurrencyPickerSheet.                                                                                                                                                                                                                                            |
| Target date     | Optional. Must be in the future at create/edit time. Drives pace ("on track / behind").                                                                                                                                                                                                         |
| Starting amount | Optional. Written as `startingBalance` (money already set aside).                                                                                                                                                                                                                               |
| Auto-save       | Optional inline toggle: amount + monthly/weekly cadence + source account. Creates a recurring transfer rule on save. The inline source picker offers only accounts in the goal's currency; cross-currency auto-save is set up via the full recurring editor, which already supports `toAmount`. |

Time display mode shows a live hint under the target field: "≈ 87 hours of
work".

Save runs the Pro gate (below), creates the account (`type: 'goal'`,
`includeInTotals: true`), and the auto-save rule if configured.

### Goals on the Accounts tab

A **Goals section** renders above the account groups in the card stack
(`AccountCardStack`), visually distinct from bank cards: compact **progress
cards** instead of stacked account cards.

Each goal card shows: emoji + name, a progress bar (fill in the theme accent),
`saved / target` (or hours in time mode), percent, and a small pace chip when
a target date is set: **On track** / **Behind** / **Achieved**. When balance
masking is on, amounts mask but the bar and percent stay (a ratio reveals no
absolute amount).

The section header shows total saved across active goals and the "New goal"
button. Archived goals are hidden behind a "Show archived" footer row.
Sorting: manual (`sortOrder`), same interaction as account reordering.

The net-assets overview header counts goal balances inside **assets** (they
are assets); no separate line in v1.

### Goal detail

Tapping a card opens **GoalDetail** (root-stack screen). Layout:

1. **Hero**: emoji, name, big progress ring, `saved / target`, percent,
   target date and pace line. In time mode the ring is annotated in hours.
2. **Projection line** (when an active auto-save rule targets this goal):
   "At RM500/month you'll reach this around March 2027." When a target date
   is also set and the projection misses it: "Save RM720/month to hit
   June 2027."
3. **Deposit / Withdraw** buttons (primary / secondary):
   - **Deposit** opens the transaction editor in transfer mode with
     `toAccountId` pre-set to the goal; the user picks the source and amount.
   - **Withdraw** opens transfer mode with `fromAccountId` pre-set, and is
     disabled while the goal balance is ≤ 0.
     Both need **no editor changes**: `AddTransactionDetailed` already accepts
     `initialValues.{type, fromAccountId, toAccountId}`
     (`navigation/rootStack.ts:10`). Cross-currency transfers use the existing
     FX modal.
4. **Activity list**: the goal account's transactions, reusing the existing
   AccountDetail month pager (goal accounts have no statement cycles, so
   calendar-month paging applies).
5. Overflow menu: Edit goal (name/emoji/target/date/currency), Manage
   auto-save (jumps to the recurring rule editor filtered to this goal),
   Archive/Complete, Delete.

### Deposits, withdrawals, and honesty

Because a goal is an account, we deliberately do **not** block any transaction
type against it:

- Direct **income** into a goal (cash gift straight into the fund) works.
- Direct **expense** from a goal works and is the natural end of many goals:
  when the trip happens, the user pays for it straight from the "Japan trip"
  account and watches the fund do its job. Progress simply decreases.
- Goal accounts appear in every AccountPickerSheet with their emoji so
  transfers from anywhere can target them. `AccountLogo` gains a goal-emoji
  variant (goals have no bank `logoId`); pickers and rows render it wherever
  accounts render today.

The Deposit/Withdraw buttons are the _paved road_, not a wall.

### Pace, projection, and the math

All derived numbers come from one pure module,
`features/goals/lib/goalMath.ts` (unit-tested, same pattern as
`budgetMath.ts`):

- `progressRatio = clamp(balance / targetAmount, 0, …)` — over-saving shows
  as >100% ("RM5,250 of RM5,000, 105%"), never an error.
- Negative balances (over-withdrawal) clamp the bar to 0 but show the real
  number.
- **Pace** (target date set): compare saved against a **starting-balance
  adjusted** expected line, so a goal created already part-funded is not
  scored as ahead: `expected(t) = startingBalance + (target − startingBalance)
× elapsed(created → t) / total(created → targetDate)`. Saved ≥ expected =
  On track, else Behind. A target date at or before the creation date is
  rejected by validation; a date that has passed shows Behind unless
  achieved.
- **Projection** (auto-save rule active): monthly-equivalent contribution rate
  from active recurring transfer rules whose `toAccountId` is the goal;
  `monthsLeft = (target − balance) / monthlyRate`.
- **Required pace** (target date set, behind): `(target − balance) /
monthsRemaining`.
- All balance math is in the goal's own currency (targets live in the goal
  currency), so FX drift can never distort progress. Time-mode conversion
  divides by `trueHourlyRate` at display time, like every other hours surface.

### Reaching the goal

When a goal's balance crosses from below target to ≥ target:

- **Detection lives in one place**: an AppContext effect watching
  `accountBalances` compares each active goal against its target and stamps
  `goalAchievedAt` via the accounts repository (followed by the scoped
  `refreshAccountsAndGroups`). It is not tied to the Deposit button, so
  organic transfers, income, recurring auto-saves, and target edits all
  trigger it.
- Success haptic + a one-time celebration overlay (mascot + confetti,
  consistent with existing feedback components) fires immediately on
  whatever screen the user is on, following the review-prompt overlay
  pattern. Because the stamp is persisted, the celebration never repeats,
  including across restarts and restores.
- The card's pace chip becomes **Achieved**; the ring caps its fill styling.
- The goal stays fully functional (keep saving past 100%, or start spending
  it down — which does not un-achieve it; `goalAchievedAt` is a high-water
  timestamp, not derived state).

**Complete/Archive**: from GoalDetail. If the balance is non-zero the flow
offers "Move remaining RM X to…" (one pre-filled transfer), then stamps
`goalArchivedAt`. Archived goals leave the Goals rail (behind "Show
archived"), stop appearing in pickers' default lists, and keep their account

- transactions intact for history. **Archiving deactivates** (`isActive =
false`) any recurring transfer rules paying into the goal; without this an
  archived goal would keep silently accumulating auto-saves. (Deletion needs no
  new behavior: `accountsRepository.softDelete` already cascades, soft-deleting
  rules and transactions referencing the account.) Un-archive clears the
  archive stamp (rules stay paused; the user re-enables deliberately). Deleting
  a goal is the existing account delete flow with goal-flavored copy.

### Everywhere-else behavior (mostly free)

| Surface                 | Behavior                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Net worth header        | Goal balances count as assets via the existing non-credit branch. `includeInTotals` toggle still works. |
| `asset_history` insight | Correct automatically: transfers into goals net to zero across included accounts.                       |
| Calendar / search       | Deposits and withdrawals are ordinary transfers; visible and searchable today.                          |
| Recurring screen        | Auto-save rules are ordinary recurring transfers; the existing editor manages them.                     |
| Backup / restore        | Accounts + new columns round-trip through the existing account backup path.                             |
| Money Manager import    | Unchanged; imports never produce goal accounts (heuristics still yield debit/credit).                   |
| Pay credit card         | Goal accounts are valid payment sources (the exclusion at `AccountsScreen.tsx:1218` stays credit-only). |
| Statement import        | Goal accounts selectable like any debit account.                                                        |

## Data model

**Decision: goal fields live as nullable columns on `accounts`**, following
the exact precedent of the credit-only columns (`creditStatementDay`,
`creditDueDay`). A separate `savings_goals` table was considered and rejected
for v1: it adds a repository, join, and backup path for a strict 1:1
relationship with no independent lifecycle.

Migration `047` (append-only, via the `add-db-migration` skill):

```sql
ALTER TABLE accounts ADD COLUMN goal_target_amount REAL;        -- required for type='goal'
ALTER TABLE accounts ADD COLUMN goal_target_date TEXT;          -- YYYY-MM-DD, optional
ALTER TABLE accounts ADD COLUMN goal_emoji TEXT;                -- optional
ALTER TABLE accounts ADD COLUMN goal_achieved_at TEXT;          -- high-water stamp
ALTER TABLE accounts ADD COLUMN goal_archived_at TEXT;          -- null = active
```

Type literal: **`'goal'`**, i.e. `AccountType = 'debit' | 'credit' | 'goal'`.
The literal `'savings'` is **unavailable**: `asAccountType`
(`lib/repositories/mappers.ts:49`) folds legacy persisted `'savings'` rows to
`'debit'`, and rows with that string may still exist on disk from old
imports. Reusing it would silently flip those into goals; `'goal'` has zero
collision and needs no data rewrite. The compat mapper gains a `'goal'`
passthrough case.

Domain type additions (`types/index.ts`): the five fields on `Account`
(null for non-goal accounts), plus a `GoalProgress` derived shape returned by
`goalMath` (`saved`, `target`, `ratio`, `pace: 'onTrack' | 'behind' |
'achieved' | null`, `projectedDate`, `requiredMonthly`).

Invariants:

- `type === 'goal'` ⟹ `goal_target_amount > 0` (enforced at the
  repository/create layer, not by SQL). `goal_emoji` may be null; every
  display site falls back to 🎯.
- Non-goal accounts always have all five columns null.
- `goal_achieved_at` is monotonic (set once; only cleared by editing the
  target upward past the current balance, in which case it resets so the
  celebration can legitimately fire again).
- Balance semantics: identical to debit in `getNetAssetContribution` and
  `accountsRepository.getBalances` (both keep branching on `credit` only).

## Simple mode and Pro

**Simple mode**: goals are hidden entirely, by decision (no accounts tab,
single forced wallet; a transfer-based feature has no home there). The goal
selectors simply return nothing in simple mode, and no Simple-mode surface
is planned. Existing goals survive a mode switch untouched and reappear on
switching back to Power mode (see the edge case on auto-saves below).

**Pro gating**:

- New limit `FREE_MAX_SAVINGS_GOALS = 2` in `constants/proLimits.ts`, wired
  as a new `LimitType` (`'goals'`) in `useProGate` — same pattern as albums.
  Two free goals is enough to form the habit and feel the value; the third
  goal is a natural upgrade moment (albums converts on the same shape).
  The count covers **non-archived** goals only (like the unsettled-split-
  bills cap, which counts current state, not lifetime). Un-archiving runs
  the same gate, so archive-and-swap does not bypass it.
- Goal accounts do **not** count toward `FREE_MAX_ACCOUNTS` (and vice versa):
  the accounts gate at `AccountsScreen.tsx:2354` filters to non-goal
  accounts. A free user at 5 accounts must still be able to try goals, or the
  feature is dead on arrival for exactly the most engaged free users.
- The paywall's feature list gains a goals row; hitting the gate routes
  through the existing `requestOpenPaywall`.

## Edge cases & rules

- **Over-saving** past the target is fine: >100% shown, no cap, no warning.
- **Over-withdrawing** below zero is allowed (accounts allow it); the bar
  clamps at 0 and the saved amount shows negative. No blocking.
- **Editing the target** recomputes progress instantly. Raising the target
  above the current balance clears `goal_achieved_at` (see invariants).
  Lowering it below the balance triggers the normal achievement path.
- **Currency change** on a goal converts the target amount with the same
  live-convert preview the account editor already shows for balances, so
  progress ratio is preserved rather than distorted. If active auto-save
  rules target the goal, the edit flow surfaces a "review your auto-save"
  prompt, since the rules' amounts are now denominated against a different
  goal currency.
- **Switching to Simple mode** with active goals: goals disappear from view
  (no accounts tab) but auto-save rules keep executing via
  `runDueTransactions`, which is data-correct but invisible. The existing
  switch-to-simple confirmation gains one line noting active goals and
  auto-saves continue in the background.
- **Deleting the source account** of an auto-save rule: covered by existing
  behavior. `accountsRepository.softDelete` cascades to recurring rules
  referencing the deleted account (as `accountId`, `fromAccountId`, or
  `toAccountId`), so no orphaned rule survives an account deletion.
- **Masked balances**: amounts mask; progress bar and percent remain.
- **Archived goals are excluded from account pickers** entirely. Depositing
  into one requires un-archiving first (which re-runs the Pro gate). The
  archived goal's detail screen, reached via "Show archived", still offers
  Withdraw so leftover money is never stranded.
- **Recurring deposit lands after the target date**: nothing special; pace
  chip already says Behind or Achieved.
- **`includeInTotals` off** on a goal: excluded from net worth and
  `asset_history` like any account; the Goals rail still shows it (the rail
  is about the goal, not net worth).
- **Type immutability**: like debit/credit, `'goal'` is fixed at creation in
  v1 (the editor keeps type read-only when editing).

## Copy, i18n, analytics, announcement

- All new strings via the `add-i18n-string` skill across all 23 locales; no
  long dashes in any user-facing copy (per the copywriting rule).
- Analytics events: `goal_created` (target size bucket, has date, has
  auto-save), `goal_deposit` / `goal_withdraw` (source = button vs organic
  transfer), `goal_achieved` (days to achieve, deposit count),
  `goal_archived`, plus the automatic `PRO_LIMIT_HIT` on the gate.
- Feature announcement `010_savings_goals` + `SavingsGoalsShowcase`,
  following the numbered-entry pattern in `features/news/announcements/`.

## Phasing

**v1 (this PRD)**: `'goal'` account type + columns, create flow, Goals rail
on the Accounts tab, GoalDetail with deposit/withdraw and activity, progress

- pace + auto-save projection, achievement celebration, archive flow, Pro
  gate, announcement, full i18n, `goalMath` test suite.

**v1.1**: home-screen goal ring widget (registry pattern exists; widget id
`goal_ring`, since `home-savings` is already taken by the savings-rate
widget), goal milestone notifications (50% / achieved, via the existing
notifications service), "Convert account to goal" (debit ⇄ goal is
sign-safe), goal cover photos (album-style).

**v2**: open-ended goals, a goals Insights page (contribution trend per
goal).

## Implementation map

| Area         | Files                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema       | `lib/db/migrations/047_*.ts`, `lib/db/schema.ts`, `lib/repositories/mappers.ts` (asAccountType + goal fields), backup/restore field lists                                                                                                                                                                                                                                                                  |
| Types        | `types/index.ts` (`AccountType`, `Account`, `GoalProgress`)                                                                                                                                                                                                                                                                                                                                                |
| Math         | `features/goals/lib/goalMath.ts` + `__tests__/features/goalMath.test.ts` (pure; pace, projection, required-monthly, clamps)                                                                                                                                                                                                                                                                                |
| Context      | `context/AppContext.tsx`: goal selectors (active/archived goals with progress), `createGoal` / `updateGoal` / `archiveGoal` thin wrappers over account ops (archive also deactivates targeting rules); the achievement-detection effect watching `accountBalances`; scoped `refreshAccountsAndGroups` refresh                                                                                              |
| UI           | Goals rail in `features/settings/components/AccountCardStack.tsx`; `features/goals/screens/GoalEditorScreen.tsx`, `GoalDetailScreen.tsx` (root-stack routes in `navigation/rootStack.ts`); goal-emoji variant in `components/ui/AccountLogo.tsx`; archived-goal filtering in `AccountPickerSheet`. Deposit/Withdraw reuse the existing `AddTransactionDetailed` `initialValues` params — no editor changes |
| Gating       | `constants/proLimits.ts`, `hooks/useProGate.ts`, accounts-gate filter at `AccountsScreen.tsx:2354`, paywall feature list                                                                                                                                                                                                                                                                                   |
| Untouched    | Balance formula, `getNetAssetContribution`, `asset_history` deltas, transfer editor internals, recurring engine — all inherit correct behavior via the credit-only branches (verified)                                                                                                                                                                                                                     |
| Announcement | `features/news/announcements/010_savings_goals.ts` + showcase                                                                                                                                                                                                                                                                                                                                              |

## Success criteria

- A Power-mode user can go from nothing to a funded goal (create + first
  deposit) in under a minute, and every resulting row is an ordinary
  account/transfer visible in calendar, search, and backups.
- Net worth and `asset_history` are byte-for-byte unchanged for users with no
  goals, and exactly correct (no double count, transfers net to zero) for
  users with goals.
- Progress, pace, and projection derive from one pure tested module; no
  screen computes goal math ad hoc.
- The achievement celebration fires exactly once per achievement.
- Free users hit a clear, fair gate at the third goal; goals never consume
  the free account quota.
- Product metrics to watch: % of active users with ≥1 goal, deposits per goal
  per month, retention delta of goal creators, paywall conversion from the
  goals gate, achievement rate.

## Resolved during review

- **Emoji only** for goal identity, reusing the **category editor's inline
  emoji chip picker verbatim** (`CATEGORY_ICON_PICKER_VALUES` +
  `CategoryEmoji` + name-based suggestion); no new picker component and no
  bank-logo or custom-logo path. (Owner decision.)
- **No Simple-mode goals surface**, now or later; goals are Power mode only.
  (Owner decision.)
- **Free limit is 2** non-archived goals. Albums (3) convert well on this
  shape and goals have a stronger habit loop, so the tighter cap is the
  better upgrade moment; loosen later if funnel data disagrees.
- **Deposit/Withdraw need no editor work**: `AddTransactionDetailed` already
  accepts `initialValues.{type, fromAccountId, toAccountId}`.
- **Rule cleanup on archive is a real requirement**: archiving has no
  existing cascade, so it must deactivate auto-save rules explicitly.
  (Deletion already cascades at the repository layer.)

## Open questions

1. **Rail placement**: Goals above or below account groups on the Accounts
   tab? (PRD assumes above; visual weight of progress cards may argue for
   below the net-worth header but above groups.)
