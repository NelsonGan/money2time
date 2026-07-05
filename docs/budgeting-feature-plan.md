# Budgeting — Design & Implementation Plan

Status: **Planned** · Branch: `claude/budgeting-feature-plan-sez16k`

Monthly, expense-only budgets built from reusable **budget templates**. A
template defines a total budget and how it is allocated across expense
categories; each calendar month gets its own **frozen budget row** created from
a template (automatically for the current month, manually or via back-populate
for others). A budget view with a month pager shows per-category depletion and
a month summary; two home-screen widgets surface budget usage at a glance.

Income is ignored everywhere. Only `type === 'expense'` transactions count
against a budget.

---

## 1. Product behavior (requirements, resolved)

### Templates

- A user can create budget templates. **Free: 1 template. Pro: unlimited**
  (new `PRO_LIMITS.FREE_MAX_BUDGET_TEMPLATES = 1`, gated with `useProGate()`
  like albums/items).
- Creating a template is a two-step flow: **first set the total budget
  amount**, then allocate it across expense categories. The editor shows a
  live "allocated / remaining" tracker and **cannot save until the category
  amounts sum exactly to the total**.
- Allocations are at **root (top-level) expense category** granularity;
  spending in a subcategory rolls up into its parent's budget line.
- Templates can be **edited** at any time. Editing a template never rewrites
  months that were already created from it (monthly budgets are frozen
  copies — same principle as the FX reporting snapshot).
- When creating a new template the user can **duplicate an existing one** and
  edit from there.
- Exactly **one template is always the default**. The first template ever
  created becomes the default automatically; the user can pick a different
  default from the template list; deleting the default promotes the next
  template (by sort order). The default can never be "none" while at least one
  template exists.

### Monthly budget rows

- A monthly budget is a **frozen copy** of a template taken at creation time:
  `month (YYYY-MM)`, total amount, and one line per category with its amount.
  It remembers which template it came from (`templateId`) for display only.
- **Auto-create on month rollover:** when the app loads and the current month
  has no budget row (and never had one — a user-deleted month is a tombstone
  and is *not* resurrected), and at least one template exists, a budget for the
  current month is created from the **default template**. This runs in the
  same load path as `runDueTransactions` (see §4.3).
- If the month already has a budget (auto- or user-created), rollover does
  nothing.
- **Back-populate at template creation:** the create-template flow offers an
  optional "also create budgets for past months" toggle. The range is **from
  the month of the user's earliest expense transaction up to last month**,
  shown explicitly in the UI (e.g. "Will create budgets for Mar 2025 – Jun
  2026, 16 months"). Months that already have a live budget are skipped;
  explicitly back-populating *does* recreate over tombstones (deliberate user
  action beats the no-resurrect rule).

### Budget view

- Entry point: a **Budget tile in Settings → Money section** (next to Items /
  Categories), navigating to a `Budget` screen in the settings stack.
- The screen is a **horizontal month pager** (swipe left/right), one page per
  month, using the existing `useMonthPager` + month-controls-header pattern.
  Pager range: earliest of (first budget month, first expense-transaction
  month) → **current month + 1**, so the user can swipe forward once and
  prepare next month early.
- A month **with** a budget shows:
  - **Summary card**: total budget, total spent (budgeted + unbudgeted),
    remaining or **exceeded by X** (over-budget state highlighted),
    **unbudgeted spend** (expenses in categories not in the budget, plus
    uncategorized expenses), progress bar, and which template the month was
    created from.
  - **Per-category rows**: category emoji + name, spent / budgeted, remaining,
    progress bar that turns warning/over colors as it depletes; over-budget
    rows sorted with a visual flag. Subcategory spend rolls up to the parent
    line.
  - An **Unbudgeted section** listing categories with spend but no budget
    line (each with its spent amount), so the summary's unbudgeted number is
    explorable.
- A month **without** a budget shows an empty state: "No budget for July
  2026" + a **Create budget** button. One template → create immediately from
  it; multiple templates → a template picker sheet (default pre-selected).
  No templates at all → button routes to template creation.
- Spent amounts use the frozen reporting-currency value
  (`reportingAmount ?? amount`), the same rule every aggregate in the app
  uses, so budgets are consistent with Insights and never drift with FX.

### Category deletion

- `deleteCategory` cascades: the category's allocation rows are soft-deleted
  from **all templates and all monthly budgets**. The freed amount simply
  becomes unallocated (templates may then sum to less than their total; the
  editor surfaces this as "unallocated" the next time the template is opened
  and asks the user to re-balance before saving). Historical months just show
  fewer lines; their spend moves to "unbudgeted" if transactions were
  reassigned to a non-budgeted category.

### Widgets

Two new home-screen widgets (see §6 for design): a **small "Budget Ring"**
and a **large "Budget Breakdown"**.

### Non-goals (v1)

- No per-month manual editing of an existing budget row (delete + recreate
  from a template covers it; direct month editing can come later).
- No weekly/custom-period budgets, no income targets, no rollover of unspent
  amounts between months.
- Budget amounts are entered and stored in the reporting currency; changing
  the reporting currency does **not** rescale budget amounts (they are user
  targets, not transaction facts). Documented limitation.
- Time-display mode: v1 shows budgets in money. (A `formatAmount`-based
  screen makes a later time-mode pass cheap; noted as follow-up.)

---

## 2. Data model

Migration `040_budgets.ts` (append-only, next after `039`), four tables, all
with the standard `created_at / updated_at / deleted_at` soft-delete columns:

```sql
CREATE TABLE budget_templates (
  id            TEXT PRIMARY KEY NOT NULL,
  name          TEXT NOT NULL,
  total_amount  REAL NOT NULL DEFAULT 0,
  is_default    INTEGER NOT NULL DEFAULT 0,   -- exactly one live row = 1
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE budget_template_categories (
  id           TEXT PRIMARY KEY NOT NULL,
  template_id  TEXT NOT NULL,
  category_id  TEXT NOT NULL,                 -- root expense category
  amount       REAL NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE monthly_budgets (
  id            TEXT PRIMARY KEY NOT NULL,
  month         TEXT NOT NULL,                -- 'YYYY-MM' (monthKey format)
  template_id   TEXT,                         -- provenance only; may dangle
  template_name TEXT,                         -- denormalized for display
  total_amount  REAL NOT NULL DEFAULT 0,      -- frozen at creation
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
-- one live budget per month
CREATE UNIQUE INDEX idx_monthly_budgets_month
  ON monthly_budgets(month) WHERE deleted_at IS NULL;

CREATE TABLE monthly_budget_categories (
  id          TEXT PRIMARY KEY NOT NULL,
  budget_id   TEXT NOT NULL,
  category_id TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,        -- frozen at creation
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX idx_monthly_budget_categories_budget
  ON monthly_budget_categories(budget_id) WHERE deleted_at IS NULL;
```

Design notes:

- **Soft-deleted `monthly_budgets` rows double as tombstones** for the
  auto-create rule: "has this month ever had a budget?" =
  `EXISTS (… WHERE month = ? )` *including* deleted rows.
- `template_name` is denormalized onto the month row so "Created from
  ‹Everyday›" still renders after the template is renamed or deleted —
  same denormalization pattern the transaction list uses for relation names.
- No FK constraints (matches the rest of the schema); referential cleanup is
  the repository's job (category-delete cascade, template-delete keeps months).
- Schema additions in `lib/db/schema.ts` (`budgetTemplatesTable`, …Row types),
  row → domain mapping in `lib/repositories/mappers.ts`.

Follow the `add-db-migration` skill when implementing (migration file +
`index.ts` registration + schema + mappers + types in one pass).

---

## 3. Types (`types/index.ts`)

```ts
export interface BudgetTemplateAllocation {
  id: string;
  categoryId: string;
  amount: number;
  sortOrder: number;
}

export interface BudgetTemplate {
  id: string;
  name: string;
  totalAmount: number;
  isDefault: boolean;
  sortOrder: number;
  allocations: BudgetTemplateAllocation[];
  createdAt: string; updatedAt: string; deletedAt: string | null;
}

export interface MonthlyBudgetLine {
  id: string;
  categoryId: string;
  amount: number;
  sortOrder: number;
}

export interface MonthlyBudget {
  id: string;
  month: string;               // 'YYYY-MM'
  templateId: string | null;
  templateName: string | null;
  totalAmount: number;
  lines: MonthlyBudgetLine[];
  createdAt: string; updatedAt: string; deletedAt: string | null;
}

/** Pure computation output for one month's budget page (see §4.4). */
export interface BudgetMonthSummary {
  month: string;
  totalBudget: number;
  totalSpent: number;          // budgeted + unbudgeted expense spend
  budgetedSpent: number;
  unbudgetedSpent: number;     // categories w/o a line + uncategorized
  remaining: number;           // totalBudget - totalSpent (can be negative)
  exceededBy: number;          // max(0, -remaining)
  usageRatio: number;          // totalSpent / totalBudget, 0 when no budget
  categories: BudgetCategoryProgress[];   // one per budget line
  unbudgeted: UnbudgetedCategorySpend[];  // spend with no line
}

export interface BudgetCategoryProgress {
  categoryId: string;
  budgeted: number;
  spent: number;               // includes subcategory roll-up
  remaining: number;
  usageRatio: number;
  isOver: boolean;
}

export interface UnbudgetedCategorySpend {
  categoryId: string | null;   // null = uncategorized
  spent: number;
}
```

---

## 4. Domain layer

### 4.1 Repositories (`lib/repositories/`)

`budgetTemplatesRepository.ts`:

- `list()` — live templates with allocations, ordered by `sortOrder`.
- `create({ name, totalAmount, allocations, makeDefault })` — first live
  template is forced default.
- `update(id, { name, totalAmount, allocations })` — replaces allocation rows
  (soft-delete old, insert new), like the split-bill repository does.
- `setDefault(id)` — single transaction: clear `is_default` on all, set on one.
- `softDelete(id)` — and if it was default, **promote the next live template
  by sortOrder** in the same transaction (invariant: a default always exists
  while any template exists).
- `removeCategoryFromAllTemplates(categoryId)` — cascade for category delete.
- `reorder(ids)`.

`monthlyBudgetsRepository.ts`:

- `list()` — live monthly budgets with lines.
- `hasEverExisted(month)` — includes soft-deleted (tombstone check).
- `existingLiveMonths()` — for back-populate skipping.
- `createFromTemplate(month, template)` — freezes name/total/allocations.
- `createManyFromTemplate(months[], template)` — back-populate, one tx.
- `softDelete(id)`.
- `removeCategoryFromAllBudgets(categoryId)` — cascade for category delete.

Both are thin Drizzle wrappers in the style of `albumsRepository` /
`transactionSplitsRepository`, unit-tested with the mocked DB client.

### 4.2 AppContext (`context/AppContext.tsx`)

New state on **`useApp()`** (budgets are low-churn; per-month *spend* is
computed in the screen from `useTransactions().transactions`, so budget state
must not live in `TransactionsContext`):

- State: `budgetTemplates: BudgetTemplate[]`, `monthlyBudgets: MonthlyBudget[]`.
- Ops: `createBudgetTemplate` (with optional
  `{ duplicateFromTemplateId, backPopulate }`), `updateBudgetTemplate`,
  `deleteBudgetTemplate`, `setDefaultBudgetTemplate`,
  `reorderBudgetTemplates`, `createMonthlyBudget(month, templateId)`,
  `deleteMonthlyBudget(id)`.
- Scoped refresh: **`refreshBudgets`** (loads both tables), passed to
  `runMutation` via `options.refresh` — never `refreshAll()`. Category
  deletion adds `refreshBudgets()` to its existing
  `refreshCategories + refreshTransactions` refresh.
- `deleteCategory` gains the cascade:
  `budgetTemplatesRepository.removeCategoryFromAllTemplates(id)` +
  `monthlyBudgetsRepository.removeCategoryFromAllBudgets(id)`.
- Analytics: `BUDGET_TEMPLATE_CREATED / UPDATED / DELETED`,
  `BUDGET_MONTH_CREATED` (`{ source: 'auto' | 'manual' | 'backfill' }`),
  `BUDGET_DEFAULT_CHANGED` events in `services/analytics`.

### 4.3 Month-rollover auto-create

A pure helper `ensureCurrentMonthBudget({ monthKey, templates, hasEverExisted })`
decides create-or-skip; AppContext calls it in the **same load path that runs
`runDueTransactions`** (initial `refreshAll` / load), so it fires on every cold
start and on the restore/import/reset paths that already funnel through
`refreshAll`. Rules:

1. Current month has a live budget → no-op.
2. Current month has a tombstone (user deleted it) → no-op.
3. No templates → no-op.
4. Otherwise create from the default template, `source: 'auto'`.

Because it is idempotent and cheap (one indexed lookup), running it on every
load is safe — no "last run" bookkeeping needed.

### 4.4 Pure summary computation (`features/budget/lib/budgetMath.ts`)

All screen/widget numbers come from one pure, unit-tested function:

```ts
buildBudgetMonthSummary({
  month,                        // 'YYYY-MM'
  budget,                       // MonthlyBudget | null
  transactions,                 // TransactionWithRelations[]
  categories,                   // for parentId → root roll-up
}): BudgetMonthSummary | null
```

- Filters to live `expense` transactions in the month
  (`monthKeyFromIsoLocal`), values them at `reportingAmount ?? amount`.
- Rolls subcategory spend up to the root via a `rootById` map (same approach
  as `buildSavingsIncludePredicate` in `widgetSnapshot.shared.ts`).
- Buckets spend into budget lines vs. unbudgeted (incl. `categoryId: null`).

Also here: `computeBackPopulateRange(transactions, existingLiveMonths, now)`
→ `{ months: string[], firstMonthKey, lastMonthKey } | null` used by both the
template-editor UI copy and the actual back-populate write.

The Budget screen holds its inputs with `useValueWhileTabVisible()` is **not**
needed (it's a settings-stack screen, always "visible" when mounted), but the
summary is memoized keyed on `useTransactions().transactions` +
`monthlyBudgets`, per the identity-stability rule in CLAUDE.md.

---

## 5. UI

### 5.1 Navigation & entry points

- **Settings tile**: `SettingsGridTile` in the Money section of
  `SettingsScreen` (icon: Lucide `PiggyBank` or `Target`), label
  `settings.budget` → navigates within the settings stack (same wiring as
  Items).
- **Settings stack** (`navigation/settingsStack.ts`): `Budget: undefined`
  (month view) and `BudgetTemplates: undefined` (template list).
- **Root stack** (`navigation/rootStack.ts`): `BudgetTemplateEditor:
  { templateId?: string; duplicateFromId?: string } | undefined` — full-screen
  editor reachable from anywhere (template list, empty states), like
  `ItemEditor`.
- Feature folder: `features/budget/` with `screens/`, `components/`, `lib/`.

### 5.2 `BudgetScreen` (month view, settings stack)

- Header: month label + chevrons, plus a small "Templates" affordance
  (gear/list icon) → `BudgetTemplates`.
- Body: horizontal pager (`useMonthPager`) over the month range from §1.
- **Month page with budget**: `BudgetSummaryCard` (totals, progress,
  remaining / "Exceeded by X", unbudgeted spend, "from ‹template›" caption,
  overflow menu with *Delete budget*), then `BudgetCategoryRow[]`
  (emoji + name via `CategoryEmoji`, `spent / budgeted`, right-aligned
  remaining, progress bar: theme primary → amber ≥ 80% → red when over), then
  an **Unbudgeted** section of `UnbudgetedRow[]`.
- **Month page without budget**: `EmptyState` (existing feedback component)
  with the create CTA. One template → `createMonthlyBudget` directly;
  several → `BudgetTemplatePickerSheet` (bottom sheet, default pre-selected);
  none → route to `BudgetTemplateEditor`.
- Haptics on create/delete (`triggerHaptic('success' | 'warning')`).

### 5.3 `BudgetTemplatesScreen` (settings stack)

- List of templates: name, total, allocation count, **Default** radio/badge —
  tapping a non-default row's radio calls `setDefaultBudgetTemplate`.
- Row actions (swipe or overflow): Edit, Duplicate (→ editor prefilled with
  `duplicateFromId`), Delete (confirm; explain default promotion when
  deleting the default).
- "New template" button: gated by `useProGate().checkLimit` against
  `FREE_MAX_BUDGET_TEMPLATES` → `ProPaywall` (`source:
  'budget_templates_limit'`, new `pro.limit_budget_templates` string).

### 5.4 `BudgetTemplateEditorScreen` (root stack)

Two-phase single screen (matches the "total first, then allocate" requirement):

1. **Total**: name field + total budget amount (numeric input, existing
   `input` primitives / amount-entry patterns from the transaction editor).
2. **Allocation**: list of root expense categories (from
   `useApp().categories`), each with an amount field; a pinned header shows
   `Allocated X of Y — Z left`, turning red when over-allocated. An
   "auto-fill remainder" affordance on the last touched row keeps the
   sum-must-equal-total rule from being tedious. **Save stays disabled until
   remaining === 0** (exact match, using `normalizeMoneyAmount` to dodge
   float dust).
3. **Back-populate (create mode only)**: toggle + explanatory caption
   computed by `computeBackPopulateRange`, e.g. *"Create budgets for Mar 2025
   – Jun 2026 (16 months). Months that already have a budget are skipped."*
   Hidden when there are no past expense months or no missing months.
4. Edit mode: same screen, prefilled; if allocations no longer sum to total
   (e.g. a category was deleted since), the header shows the unallocated gap
   and save is blocked until re-balanced.

### 5.5 i18n & announcements

- All new strings under a `budget.*` namespace in `en.ts`, propagated to all
  23 locales via the `add-i18n-string` skill (parity test enforces).
- A `features/news/announcements/` entry + `BudgetShowcase` component for the
  feature announcement (existing pattern).

---

## 6. Widgets

Follows the existing pipeline end-to-end: `widgetRegistry.ts` definition →
snapshot builder in `widgetSnapshot.shared.ts` (pure, unit-testable) →
snapshot written to the shared app group → native rendering embedded in
`plugins/withMoney2TimeWidgets.js` (SwiftUI + Compose/RemoteViews) → RN
preview component in `components/widget-preview/` for
`WidgetPreviewsScreen`. Native changes ⇒ **prebuild/dev-client rebuild**.

### 6.1 Small — "Budget Ring" (`budget_ring`, free)

A single glanceable dial answering "am I okay this month?":

- **Center**: remaining amount (compact, e.g. `$418`), caption `left of
  $2.4K` — or, when over, the exceeded amount in red with caption `over
  budget`.
- **Ring**: budget-used arc in the theme palette, shifting amber past 80% and
  red past 100% (the over-spill draws as a second, desaturated lap so 130%
  reads differently from 95%).
- **Pacing tick**: a small notch on the ring at `dayOfMonth / daysInMonth`,
  so users see "ahead of pace / behind pace" without any text — the ring vs.
  the tick tells the story.
- Footer微copy: `12 days left`.
- Tap → `money2time://budget` deep link (new route in `services/deepLinks.ts`
  → settings-stack Budget screen).
- **No-budget state**: mascot + "Set a budget" CTA deep-linking into the app
  (never blank, per the sample-snapshot convention).

### 6.2 Large — "Budget Breakdown" (`budget_breakdown`, pro)

The month page in miniature:

- **Header row**: `July budget` · used/total bar with the same pacing tick ·
  `$1,982 / $2,400` and `Δ remaining` (or `over by $x` in red).
- **Body**: top 5 budget lines by usage ratio (over-budget lines always float
  to the top), each: category emoji, name, slim progress bar, `spent/budget`
  compact labels.
- **Footer**: `+$214 unbudgeted` (when non-zero) and `n more categories`.
- Pro-locked rendering + unlock deep link exactly like `savings_history`
  (`access: 'pro'`, `proSource: 'widget_budget_breakdown'`,
  `buildWidgetProUrl`).

### 6.3 Snapshot & plumbing changes

- `WIDGET_IDS` + two `WidgetDefinition`s in `widgetRegistry.ts`.
- New `BudgetRingSnapshot` / `BudgetBreakdownSnapshot` interfaces and
  builders in `widgetSnapshot.shared.ts`, fed by `buildBudgetMonthSummary`
  (§4.4) — all labels preformatted JS-side (compact currency, i18n) so native
  code stays dumb, per the existing snapshot style. Snapshot inputs gain
  `monthlyBudgets` (and reuse `categories`); `schemaVersion` bumps to 2 with
  native code tolerating missing keys (fallback to no-budget state) so a
  stale snapshot from an un-updated app never crashes the widget.
- Sample data for the widget gallery / previews: a plausible mid-month budget
  (~78% used, one category over) added to `buildSampleWidgetSnapshot` and the
  plugin's baked-in `buildSampleSnapshotJson`.
- Native: SwiftUI ring (`Canvas`/`ArcShape`) + rows view, and Android
  RemoteViews/Compose equivalents, added to `withMoney2TimeWidgets.js`; new
  widget kinds registered in both galleries.
- RN previews: `BudgetRingWidgetContent` / `BudgetBreakdownWidgetContent` in
  `components/widget-preview/`, listed in `WidgetPreviewsScreen`.
- Snapshot rewrite triggers already exist (app launch / data change); budget
  mutations must also call the snapshot refresh (they will, via the same
  post-mutation hook transaction writes use).

---

## 7. Edge cases & rules worth writing down

- **Exactly-one-default invariant** lives in the repository (transactional),
  not the UI: create-first ⇒ default; `setDefault` swaps atomically; deleting
  the default promotes by sortOrder; deleting the last template leaves zero
  templates and zero defaults (auto-create then no-ops).
- **Tombstones**: auto-create checks "ever existed"; manual create and
  back-populate only check "live exists" (user intent overrides).
- **Duplicate months are impossible** at the DB level (partial unique index on
  live rows) — a double-tap on Create can't race into two budgets.
- **Float safety**: allocation sum comparison uses `normalizeMoneyAmount`
  (existing util) so `799.99 + 0.01 === 800` holds.
- **Deleted category mid-flight**: summary computation drops lines whose
  category no longer resolves (defensive, in addition to the cascade).
- **Simple mode**: budgets work identically (categories exist in both modes);
  the tile shows in both.
- **Reporting-currency change**: budget amounts are *not* rescaled; the
  Exchange-Rates flow's existing "history re-snapshots" note gains a line
  about budgets keeping their entered numbers.
- **Month with budget but zero transactions**: valid, renders 0% everywhere.
- **Future month (current+1)**: manual create allowed; pacing tick clamps to
  0 for future months in widgets/summary.

---

## 8. Testing

Per the `tdd` skill (node env, native deps mocked):

- `__tests__/features/budget/budgetMath.test.ts` — summary math: roll-up to
  root categories, unbudgeted bucketing (incl. uncategorized), reporting
  amounts, over-budget, empty months, deleted-category lines,
  `computeBackPopulateRange` (no transactions / gaps / already-covered / first
  transaction this month ⇒ empty range).
- `__tests__/repositories/budgetTemplatesRepository.test.ts` — default
  invariant (first-create, setDefault swap, delete-promotes), allocation
  replacement, category cascade.
- `__tests__/repositories/monthlyBudgetsRepository.test.ts` — freeze
  semantics, tombstone checks, unique-month behavior, bulk back-populate.
- `ensureCurrentMonthBudget` unit tests (all four rules of §4.3).
- Widget snapshot builder tests alongside the existing snapshot tests.
- i18n parity is enforced automatically by the existing test.

---

## 9. Delivery phases

Each phase leaves `npm run check && npm test` green and is a mergeable PR.

1. **Data + domain** — migration 040, schema/mappers/types, both
   repositories, AppContext state/ops/`refreshBudgets`, category-delete
   cascade, `ensureCurrentMonthBudget` in the load path, `budgetMath.ts`,
   full test coverage. (No UI yet; safe to merge.)
2. **Core UI** — settings tile, `BudgetScreen` with month pager + summary +
   category rows + empty/create states, `BudgetTemplatesScreen`,
   `BudgetTemplateEditorScreen` (total → allocate → back-populate,
   duplicate-from), template picker sheet, Pro gating + paywall string,
   i18n across 23 locales, analytics events.
3. **Widgets** — registry + snapshots + sample data, native SwiftUI/Compose
   in the config plugin, RN previews, deep link, prebuild bump.
4. **Polish** — news announcement + showcase, review of over-budget
   color semantics in all 8 palettes/dark mode (`frontend-design` skill),
   optional time-display-mode follow-up.

Rough size: phase 1 ≈ the albums data layer; phase 2 is the bulk (3 screens +
sheet); phase 3 is mostly native plugin work (the only part needing a
dev-client rebuild).
