# Savings Goal Tracker — Product Requirements Document

Status: **Proposed (PRD only)** · Branch: `claude/savings-goal-tracker-prd-7wp8a4`

This document is a design/requirements proposal. No app code is changed by
this PR — it exists to align on scope before implementation.

---

## 0. One-paragraph summary

Let users set a **savings goal** (a named target amount, optionally with a
deadline and a photo), then **contribute toward it** over time and watch a
progress bar fill up. Because money2time's signature is showing money as the
_time you worked for it_, every goal also answers the question no other
savings app answers: **"how many hours of my life am I away from this?"** A
goal can either track its own manual contribution ledger or mirror the balance
of a real savings account. Goals are surfaced as cards, drilldown into a
detail screen with a contribution history, and (Pro) can be unlimited with
milestone notifications.

---

## 1. Why build this

### Problem
money2time is excellent at recording where money _went_ (transactions,
budgets, albums, cost-per-day items) but has no first-class concept of money a
user is deliberately **setting aside for a future target**. Users today fake
it with a dedicated account and mental math. There is:

- No target amount to measure progress against.
- No projected "you'll get there by ___" date.
- No way to see a savings goal in **work-hours**, which is the app's whole
  differentiator.

### Opportunity
Savings goals are one of the most-requested primitives in personal finance
apps, and they map perfectly onto money2time's existing architecture:

- **Albums** already prove the "named group with a cover photo, date range,
  and rolled-up total" pattern.
- **Budgets** already prove the "target amount + progress + Pro-gated + lives
  in Insights" pattern.
- **Items** already prove the "standalone record that never creates
  transactions, but is expressed in work-hours" pattern.

A goal tracker is the natural "positive" counterpart to budgets (budgets cap
spending; goals grow savings), and it reuses the **money↔time** engine that
makes this app unique.

### Strategic fit
- Increases retention: a goal is a reason to reopen the app repeatedly over
  weeks/months and log contributions.
- Strong **Pro** upsell surface (unlimited goals, milestone notifications,
  auto-contribute rules) that mirrors existing gating.
- Reinforces the brand promise: "see your money as your time."

---

## 2. Goals & non-goals

### Product goals
1. A user can create a savings goal with a name, target amount, and optional
   deadline, currency, cover photo/emoji, and note.
2. A user can **contribute** to a goal (add money set aside) and **withdraw**
   from it (take money back out), building a contribution history.
3. A goal shows live progress: amount saved, % complete, amount remaining,
   and — in time mode — **work-hours remaining**.
4. A goal projects a **completion forecast** ("on track for Nov 2026" / "12
   days ahead of your deadline") from contribution pace.
5. Goals work in both **simple** and **power** mode, and respect
   **multi-currency** (frozen FX snapshot on each contribution).
6. Free users get 1 goal; Pro users get unlimited (+ milestone notifications).

### Non-goals (v1)
- **No investing / interest / APY projections.** A goal is a savings target,
  not a portfolio. (Reserved for a later "growth goals" iteration.)
- **No shared/collaborative goals** across multiple users/devices.
- **No automatic bank sync.** Contributions are manual or account-linked to an
  account _already tracked in the app_.
- **No debt-payoff mode** (paying _down_ a loan). Could be a sibling feature
  later; kept out to keep v1 focused.
- **No goal-specific home-screen widget** in v1 (fast follow, like budgets).

---

## 3. Users & key scenarios

| Persona | Scenario |
| --- | --- |
| **Simple-mode saver** | Wants an "Emergency fund — $3,000" goal. Taps + on the goal, types $200, done. No accounts, no categories. Sees "you're 74 hours of work away." |
| **Power-mode planner** | Has a real "Savings" account. Links a "House down payment — $30,000" goal to it so progress tracks the account balance automatically. |
| **Deadline-driven** | "Japan trip — $4,000 by March." App shows "$155/week to stay on track" and warns when they fall behind. |
| **Multi-goal Pro user** | Runs 4 goals at once (emergency fund, new laptop, trip, gift), gets a push when each hits 25/50/75/100%. |

---

## 4. Product behavior (requirements, resolved)

### 4.1 What a goal is

A **goal** is a standalone record (like an Item) with:

- `name` — required, e.g. "Emergency fund".
- `targetAmount` + `currency` — required. Currency defaults to the reporting
  currency; can be any tracked currency.
- `deadline` — optional target date (`YYYY-MM-DD`).
- `coverPhotoUri` / `emoji` — optional visual (reuse album cover picker + an
  emoji fallback like budgets).
- `note` — optional free text ("3 months of expenses").
- `startingAmount` — optional amount already saved at creation (so users
  migrating an existing pot don't start at 0).
- `trackingMode` — **`manual`** (own contribution ledger) or **`account`**
  (mirrors a linked account's balance). See §4.3.
- `linkedAccountId` — set only when `trackingMode === 'account'`.
- `status` — `active` | `completed` | `archived`.
- `sortOrder`, soft-delete `deletedAt`, timestamps (same conventions as every
  other table).

**`savedAmount` is derived, never stored** — computed from contributions (or
the linked account balance). This is the same freeze-vs-derive discipline used
across the codebase; storing a running total invites drift.

### 4.2 Contributions & withdrawals (`manual` mode)

A **contribution** is a signed entry against a goal:

- `goalId`, `amount` (positive = deposit, negative = withdrawal),
  `currency`, `date`, optional `note`.
- **Frozen FX snapshot** (`reportingCurrency` / `reportingAmount` / `fxRate`)
  captured at write time, identical to transactions — so a goal's total in the
  reporting currency never drifts when rates move.
- Optional `linkedTransactionId` (see §4.4).

`savedAmount = sum(contribution.reportingAmount) + startingAmount`, clamped so
the UI never shows negative progress (though the ledger may net negative if a
user over-withdraws — surface that as "$0 saved" with a note).

Contributions have their own tiny ledger on the goal detail screen (newest
first), each row editable/deletable. This is the "contribute somehow" the
request asks for, and it keeps goals usable in **simple mode with zero
accounts**.

### 4.3 Account-linked goals (`account` mode)

For power users who already keep a real savings account:

- Progress is read live from `accountBalances` for `linkedAccountId`, converted
  to the goal's currency at the latest cached rate.
- `savedAmount = linkedAccount.convertedBalance` (optionally minus a
  `baselineAmount` captured when the goal was created, so a goal can represent
  "grow this account by $5k from where it is today" rather than "reach a $5k
  total balance"). **Decision: default to _balance since baseline_**; expose a
  toggle "count existing balance" for the "reach total balance" variant.
- Contribution ledger is **read-only / hidden** in this mode — the account's
  own transactions are the source of truth. The goal detail screen instead
  shows recent transfers into that account.
- Switching a goal from `account` → `manual` snapshots the current progress as
  a `startingAmount` and starts a fresh ledger (no data loss, no retro-editing
  of account history).

> **Why support both?** Simple-mode users have no accounts, so manual is the
> only option that works for them. Power users find manual double-entry
> annoying when the money already lives in a tracked account. Supporting both
> mirrors how Items are standalone while Budgets read real transactions.

### 4.4 Optional: contribute by moving real money (power mode)

When a manual-mode goal is created in power mode, offer a checkbox on the
contribute sheet: **"Also record a transfer"**. If checked, contributing $200
also creates a real `transfer` transaction from a chosen source account to a
chosen savings account, and stores its id as `linkedTransactionId`. Deleting
the contribution offers to delete the linked transfer too.

This bridges the two worlds without forcing it: the ledger stays the source of
truth for the _goal_, but the money actually moves in the _accounts_. Off by
default; remembered per goal.

### 4.5 Progress, pace & forecast

The goal card and detail screen show:

- **Progress bar** + `savedAmount / targetAmount` and **% complete**.
- **Remaining** = `max(0, targetAmount − savedAmount)`.
- **Time framing (the differentiator):** in time display mode, remaining and
  saved are shown in **work-hours** via the existing true-hourly-rate engine
  (`getTrueHourlyRateForDate`). e.g. "**74h of work to go**", "you've banked
  **26h** so far". Respects the global money/time toggle and per-value tap-to-
  flip where the app already supports it.
- **Pace** = average contribution per week over a trailing window (default 4
  weeks; falls back to since-creation if younger). Manual mode uses the
  contribution ledger; account mode uses net inflow to the linked account.
- **Forecast completion date** = `today + remaining / weeklyPace`. Shown as
  "On track for ~Nov 2026".
- **Deadline status** (when a deadline is set): ahead / behind, and the
  **required rate to hit the deadline** ("$155/week to finish by Mar 1"). Card
  shows a subtle amber state when behind pace.
- **Completion**: when `savedAmount ≥ targetAmount`, the goal flips to
  `completed` — confetti + haptic `success`, a review-prompt opportunity, and
  the card moves to a "Completed" section. Over-saving is allowed and shown
  ("108% — $240 over").

### 4.6 States & lifecycle

- **Active** goals are the default list.
- **Completed** goals persist in a collapsed "Completed" section; can be
  reopened (raise the target) or archived.
- **Archived** goals are hidden from the main list but restorable (soft-delete
  is reserved for true deletion). Archive vs delete distinction matches user
  expectation that "I finished this, don't nag me" ≠ "erase it".
- **Delete** is a soft-delete (`deletedAt`), cascading to contributions;
  linked transfers are **not** auto-deleted (they're real money movements) —
  we only offer to remove them per-contribution.

### 4.7 Pro gating

New `PRO_LIMITS.FREE_MAX_GOALS = 1` (sits alongside `FREE_MAX_ALBUMS: 3`,
`FREE_MAX_BUDGET_TEMPLATES: 1`). Gate creation with `useProGate()` exactly like
albums/items/budgets — free users can keep 1 active goal; creating a 2nd opens
the `ProPaywall`.

Pro-only enhancements:
- **Unlimited goals.**
- **Milestone notifications** (25/50/75/100%) and deadline reminders, layered
  onto the existing `notifications` service + `NotificationPreferences`.
- **Auto-contribute rule** (fast follow): a recurring "$X every payday into
  this goal" that runs through the same `runDueTransactions` pass as recurring
  rules.

---

## 5. UX / surface area

### 5.1 Where it lives (navigation)

Following the budgeting precedent (budgets ended up as **root-stack screens +
an embedded Insights page**, not settings), goals should be **discoverable and
first-class**, not buried in settings:

- **Primary surface:** an embedded **"Goals" section in Insights** (selectable
  from the insights type menu, like the budget pager), showing goal cards with
  progress rings.
- **Root-stack screens** (`navigation/rootStack.ts`):
  - `Goals` — the full list (active + completed + archived sections), reached
    from the Insights section header ("See all") and from a Settings tile.
  - `GoalDetail` — progress hero, pace/forecast, contribution ledger, edit.
  - `GoalEditor` — create/edit (name, target, deadline, currency, cover,
    tracking mode, linked account).
  - `AddContribution` — the numpad contribute/withdraw sheet.
- **Settings tile:** a "Savings goals" row under the same section as Recurring
  / Categories for users who look there.
- **Optional home nudge:** the nearest-to-completion or most-behind goal can
  surface as a card on the calendar/home surface (behind a preference), but
  this is optional for v1.

> **Open question for design review:** should Goals get its own Insights entry
> _and_ a standalone list screen (proposed), or should the standalone `Goals`
> screen be the primary surface with only a compact teaser in Insights? Leaning
> toward the budget model (Insights-embedded primary + standalone for depth).

### 5.2 Goal card (list + Insights)

- Cover photo or emoji + name.
- Circular or linear progress with % and `saved / target`.
- Secondary line: money mode → "$1,800 of $3,000"; time mode → "18h of 30h
  worked". A small toggle/tap flips it, consistent with the rest of the app.
- Deadline chip when set ("Mar 1 · on track" / "12 days behind").
- Tap → `GoalDetail`; prominent **+ Contribute** affordance.

### 5.3 Goal detail

- **Hero**: big progress ring, saved/target, remaining in money **and** time,
  forecast/deadline status.
- **Pace strip**: "~$150/week · on track for Nov 2026".
- **Contribute / Withdraw** buttons → `AddContribution`.
- **Contribution history** (manual mode): dated rows, edit/delete, note; each
  row can show its work-hour equivalent. In account mode, show recent inflows
  to the linked account instead.
- **Milestones row**: 25/50/75/100% pips that light up as reached.
- Overflow: Edit, Mark complete, Archive, Delete.

### 5.4 Empty & onboarding

- Empty state (reuse `EmptyState` + `Mascot`): "Set your first savings goal"
  with a one-tap starter ("Emergency fund"). A `news` feature announcement +
  `*Showcase` introduces it on release.

### 5.5 Contribute sheet

- Numpad-first (reuse the transaction editor numpad patterns), currency
  selector (defaults to goal currency), date (defaults today), optional note,
  and — power mode manual goals — the "Also record a transfer" toggle (§4.4).
- Haptic `success` + progress animation on save; confetti at 100%.

---

## 6. Data model & technical plan

> Grounded in this repo's conventions. Latest migration on disk is **042**;
> the goals migration would be **043** (see `.claude/skills/add-db-migration`).
> The append-only migration runner and `schema.ts`/`mappers.ts`/`types`
> workflow must be followed so existing users' data survives.

### 6.1 New tables (both soft-deleted, like every domain table)

**`goalsTable`**

| Column | Notes |
| --- | --- |
| `id` | `newId()` |
| `name` | required |
| `targetAmount` | required, in `currency` |
| `currency` | goal currency |
| `startingAmount` | default 0 |
| `deadline` | `YYYY-MM-DD`, nullable |
| `coverPhotoUri` | nullable (reuse album cover storage) |
| `emoji` | nullable |
| `note` | nullable |
| `trackingMode` | `'manual' \| 'account'` |
| `linkedAccountId` | nullable, FK-ish to accounts |
| `countExistingBalance` | bool, account mode only (§4.3) |
| `baselineAmount` | nullable, account mode baseline snapshot |
| `status` | `'active' \| 'completed' \| 'archived'` |
| `completedAt` | nullable |
| `sortOrder` | ordering |
| `createdAt` / `updatedAt` / `deletedAt` | standard |

**`goalContributionsTable`**

| Column | Notes |
| --- | --- |
| `id` | `newId()` |
| `goalId` | parent goal |
| `amount` | signed (deposit +, withdrawal −), in `currency` |
| `currency` | contribution currency |
| `reportingCurrency` / `reportingAmount` / `fxRate` | **frozen FX snapshot** at write time (mirrors transactions) |
| `date` | `YYYY-MM-DD` |
| `note` | nullable |
| `linkedTransactionId` | nullable (§4.4) |
| `createdAt` / `updatedAt` / `deletedAt` | standard |

### 6.2 Repository & mappers

- `lib/repositories/goalsRepository.ts` and
  `goalContributionsRepository.ts`, plus row→domain mappers in `mappers.ts`.
- Types in `types/index.ts`: `Goal`, `GoalContribution`, `GoalStats`
  (`savedAmount`, `remainingAmount`, `percentComplete`, `weeklyPace`,
  `forecastDate`, `requiredWeeklyRate`, `deadlineStatus`, work-hour
  equivalents), `GoalWithStats`, `GoalTrackingMode`, `GoalStatus`.

### 6.3 Context / state (`AppContext`)

Goals are **not** high-frequency transaction-derived state, so they live on
**`useApp()`** (like albums/budgets/items), not `TransactionsContext`. Add:

- State: `goals`, plus a `getGoalStats(goalId)` selector (identity-stable, and
  when it reads transactions for account-mode/linked transfers it must key on
  `useTransactions().transactions` per the memo rule in CLAUDE.md).
- Ops: `createGoal`, `updateGoal`, `deleteGoal`, `archiveGoal`,
  `reorderGoals`, `addContribution`, `updateContribution`,
  `deleteContribution`, `getGoalContributions`.
- **Scoped refresh**: a new `refreshGoals()` passed to `runMutation`'s
  `options.refresh`. Include `refreshTransactions()` **only** when a
  contribution also writes/deletes a linked transfer (§4.4) — otherwise goal
  writes must not re-render transaction consumers.

### 6.4 Money↔time integration

Reuse `getTrueHourlyRateForDate` / the wage engine and `formatHours` to render
work-hour equivalents. Reuse `convert` / `buildRateTable` from
`~/utils/currency` for cross-currency goals; **never** recompute historical
contribution totals from live rates — use the frozen snapshot.

### 6.5 Notifications (Pro)

Extend `NotificationPreferences` + the `notifications` service with
`goalMilestones` (per-goal opt-in) and deadline reminders, scheduled through
the existing `syncScheduledNotifications` path. No new native module.

### 6.6 Simple vs power mode

- Simple mode: manual tracking only; account/link UI hidden; "record a
  transfer" hidden (there's one implicit wallet). Fully usable with zero setup.
- Power mode: account-linked and transfer-linked options available.

### 6.7 Testing (Jest + ts-jest, node env)

Add suites mirroring existing coverage (utils/repositories/services):

- Goal stats math: `savedAmount`, `percentComplete`, over-save, clamping.
- Pace & forecast: weekly pace window, forecast date, required-rate-for-
  deadline, ahead/behind classification (feed fixed timestamps — `Date.now()`
  is unavailable in some contexts; inject the clock).
- FX snapshot: contributions in a foreign currency roll up correctly and don't
  drift when the live rate changes.
- Account-mode: `savedAmount` from linked balance ± baseline.
- Repository CRUD + soft-delete cascade (goal delete hides its contributions).
- **i18n parity** (`__tests__/i18n/localeParity.test.ts`): every new `en.ts`
  string added to all 23 locales (use `.claude/skills/add-i18n-string`).

### 6.8 Analytics

New `AnalyticsEvents` for goal_created, contribution_added, goal_completed,
goal_milestone_reached, paywall_hit_goal_limit — for funnel + Pro-conversion
measurement.

---

## 7. Edge cases & decisions

| Case | Resolution |
| --- | --- |
| Over-contributing past target | Allowed; shows >100% and "$X over"; goal auto-completes at ≥100%. |
| Withdrawals below 0 net | Ledger may net negative; progress clamps to $0 with a note; never shows negative %. |
| No wage configured | Time-mode work-hours hidden gracefully (same as Items' `dailyWorkHours: null`); money framing still shown. |
| Deadline in the past, not met | Card shows "past due" amber; still contributable; no destructive action. |
| Foreign-currency goal, no FX rate | Fall back to entered amount; flag "rate unavailable" like account `convertedBalance: null`. |
| Deleting a goal with linked transfers | Contributions soft-deleted; linked transfers left intact (real money) — offered per-row only. |
| Account-mode linked account deleted | Goal reverts to manual, snapshotting last known progress as `startingAmount`. |
| Free user at 1-goal limit | 2nd creation opens `ProPaywall`; existing goal untouched. |
| Editing target amount | Allowed anytime; recomputes % and forecast; never rewrites contribution history. |

---

## 8. Rollout

1. **Migration 043** (`goalsTable`, `goalContributionsTable`) — append-only,
   backfill-safe (new tables, nothing to backfill).
2. Repositories + mappers + types + context ops (behind no flag; feature is
   additive and Pro-gated).
3. UI: editor → detail → contribute sheet → list → Insights section.
4. Money↔time + FX + pace/forecast math (with tests first — TDD skill).
5. Pro gating + paywall wiring + analytics.
6. Notifications (Pro milestones/deadlines).
7. `news` feature announcement + `*Showcase` (release-time follow-up, like
   budgets).
8. Home-screen widget + auto-contribute recurring rule — **fast follow**, not
   v1.

---

## 9. Success metrics

- **Adoption:** % of active users who create ≥1 goal within 14 days.
- **Engagement:** median contributions per goal per month; D30 retention delta
  for goal-creators vs non-creators.
- **Completion:** % of goals that reach 100% (health of the forecast/nudges).
- **Monetization:** paywall view→purchase rate attributed to the goal limit;
  share of new Pro conversions touching a goal surface.
- **Differentiator usage:** share of goal views in **time** display mode
  (validates the work-hours framing).

---

## 10. Open questions for review

1. **Primary surface:** Insights-embedded (budget model) vs standalone list
   screen as home. Proposed: Insights-embedded primary + standalone `Goals`.
2. **Free limit:** 1 goal (proposed, matches budgets) vs 2.
3. **Account-mode default:** "balance since baseline" (proposed) vs "reach
   total balance."
4. **Debt-payoff sibling:** in scope later, or explicitly never?
5. **Home surfacing:** show the top goal on the calendar/home surface in v1, or
   defer with the widget?
