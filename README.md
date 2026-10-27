# money2time

A React Native expense tracker that lets you view spending as **money or as time** — every dollar reframed as hours of your life at your hourly rate. Local-first, offline, on-device.

This file is the only documentation in the repo. Everything about how the
project works is here; agent-specific instructions are in
[AGENTS.md](AGENTS.md).

Paths in `code` are relative to the app, `apps/mobile`, unless they start with
`apps/` or `.github/`, or a section says otherwise.

---

## Contents

- [Repo layout](#repo-layout)
- [Getting set up](#getting-set-up)
- [Architecture](#architecture)
- [Notification review](#notification-review)
- [Pro and purchases](#pro-and-purchases)
- [Analytics](#analytics)
- [App icons](#app-icons)
- [App size and native-only assets](#app-size-and-native-only-assets)
- [Cloudflare](#cloudflare)
- [CI and deploy](#ci-and-deploy)
- [Testing](#testing)
- [Conventions](#conventions)

---

## Repo layout

```
apps/mobile      Expo / React Native app: its own npm project (package.json,
                 package-lock.json, patches/, eas.json)
apps/cloudflare  workers/ and d1/: one npm project per Worker, one schema
                 directory per D1 database, and the R2 tutorial-media notes
.github          CI workflows, and the screenshots and evidence PRs embed
                 (.github/pr-assets/)
```

The root holds only what is shared: CI, agent config (`.claude/`, `.agents/`,
`.codex/`), `.easignore` (EAS reads it from the repository root, not from the
app, because it archives the whole repository), `.prettierrc`, `.editorconfig`
and this file. There is no root `package.json`: each app installs and runs on
its own, and app commands run from `apps/mobile`.

Inside the mobile app:

```text
apps/mobile/
├── App.tsx                     # Root navigator + MainShellScreen (tab orchestrator)
├── index.ts                    # Expo entrypoint
├── app.json / app.config.ts    # Expo config
├── eas.json                    # EAS build & submit profiles
├── assets/                     # Icons, splash, brand
├── bootstrap/                  # App init hooks
├── components/
│   ├── ui/                     # Button, Card, Input, Text, Toggle, Select, pickers…
│   ├── feedback/               # EmptyState, AppErrorBoundary, Mascot
│   ├── icons/                  # Lucide NavIcons, social/cloud-provider icons
│   ├── layout/                 # TabletContentContainer, ContentFrame, AdaptiveFrames (iPhone Duo)
│   ├── datePicker/             # Date/month pickers
│   ├── widget-preview/         # Home-screen widget previews
│   └── navigation/             # BottomNav, SideNavRail, NavChrome, AddFab, MonthControlsHeader, InOutHeader
├── features/
│   ├── calendar/               # Calendar tab (month grid, day pager) — the home view
│   ├── transactions/           # Activity list, add/edit, quick-add, voice, split-bill, settle-up
│   ├── insights/               # Charts: trends, breakdowns, sentiment
│   ├── budget/                 # Weekly, monthly and yearly expense budgets from reusable templates
│   ├── review/                 # Week / month / year recap of completed periods
│   ├── albums/                 # Trip albums — group transactions, cover, breakdown
│   ├── goals/                  # Savings goals — target, progress, auto-save
│   ├── items/                  # Owned things priced by cost-per-day + the assets tab bar
│   ├── loans/                  # Loan accounts — payoff progress, instalments, interest
│   ├── reimbursements/         # Expenses someone else pays back
│   ├── widgets/                # Widgets hub + the live-earnings Live Activity
│   ├── autoLog/                # Bank and wallet app notifications into automatic transactions
│   ├── settings/               # All settings screens + nested stack
│   ├── onboarding/             # First-run flow (welcome, basics, wage, backup, source, notifications, features)
│   ├── tutorials/              # Searchable how-to guides, mirrored to money2time.com
│   ├── news/                   # In-app feature announcements & showcases
│   └── reviewPrompt/           # In-app store review request
├── context/
│   ├── AppContext.tsx          # Global state — useApp() + useTransactions()
│   ├── ThemeContext.tsx        # Theme color, icon style, light/dark resolution
│   ├── ProContext.tsx          # RevenueCat subscription state
│   ├── ReceiptScanContext.tsx  # Background receipt-OCR jobs
│   └── SplitBillSession.tsx    # Hands the split draft to the pushed editor
├── navigation/                 # rootStack, settingsStack, stackOptions, swipeBackHaptics
├── hooks/                      # Cross-screen hooks (month paging, scroll-to-top, theme vars…)
├── services/                   # Device/integration services (see below)
├── lib/
│   ├── db/                     # SQLite client, schema, 67 migrations, currency/icon normalizers
│   ├── i18n/                   # i18n-js setup, 24 locales
│   └── repositories/           # Drizzle data-access layer
├── constants/                  # appDefaults, designSystem, motion, pager, proLimits, icons, accountLogos
├── utils/                      # Pure helpers (formatters, IDs, date keys, currency, error utils)
├── types/                      # Shared domain types
├── plugins/                    # Expo config plugins (widgets, auto-log, payment capture, alternate icons)
├── scripts/                    # Icon/logo/tutorial generation pipelines
└── __tests__/                  # Jest tests (184 suites: utils, repositories, services, navigation, db, features, i18n)
```

## Getting set up

### Tech stack

- **Expo SDK 58** + React Native 0.88 + React 19.3 (New Architecture, the only one React Native supports)
- **TypeScript** strict mode, path alias `~/*` → the app root (`apps/mobile`)
- **SQLite** via `expo-sqlite` + **Drizzle ORM** (67 migrations)
- **NativeWind 4** (Tailwind for React Native) — class-based dark mode, 8 theme colors
- **React Navigation** native stack (root + nested settings stack)
- **react-native-reanimated 4** + Skia + gifted-charts for animation and visualizations
- **PostHog** (product analytics, error tracking, session replay, feature flags, AI observability) + **Google Analytics 4**, **RevenueCat** subscriptions, **expo-notifications**
- **expo-speech-recognition** for voice quick-entry
- **react-native-cloud-storage** + Google Sign-In for iCloud / Google Drive backup

### Prerequisites

- Node.js 22+ and npm 10+ (CI runs Node 22; Wrangler 4 needs it)
- Xcode (iOS) / Android Studio or the Android command-line tools (Android) for simulator and emulator builds
- `ANDROID_HOME` (the Android SDK, e.g. `$HOME/Library/Android/sdk`) and `JAVA_HOME` (JDK 17) exported in the shell that runs `npx expo start`, `expo run:android` or a local EAS build. Expo Device Hub reads them to list and boot emulators; without them it shows only iOS simulators.

**Expo Device Hub** (`expo-device-hub`, a dev dependency) adds a live device dashboard to every `npx expo start`: stream, tap and type into simulators and emulators, and boot, shut down or create them, at `http://localhost:8081/_expo/plugins/expo-device-hub`. It is a dev-server plugin only and adds nothing to the app. Test on one dedicated device per platform: the "Money2Time iPhone 18 Pro" simulator and the `Money2Time_Pixel_10` emulator (Pixel 10, Android 16).

### Setup

The app lives in `apps/mobile` and the Cloudflare Workers in `apps/cloudflare`
(see [Repo layout](#repo-layout)). Each is its own npm project; app commands
run from `apps/mobile`.

```bash
cd apps/mobile
npm install
cp .env.example .env  # fill in RevenueCat keys (optional in dev)

# Dev with the dev client (use --localhost; tunnel mode no longer needed)
npx expo start --localhost

# Native run (syncs adaptive icons first)
npm run ios
npm run android
```

`.env.example` lists the keys the app reads at build time:

```
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=
EXPO_PUBLIC_REVENUECAT_OFFERING_ID=
EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER=
EXPO_PUBLIC_MONEY2TIME_WORKERS_LIVE_EARNINGS=
EXPO_PUBLIC_MONEY2TIME_WORKERS_WEB_DASHBOARD=
EXPO_PUBLIC_REQUEST_SIGNING_KEY=
EXPO_PUBLIC_BRANDFETCH_CLIENT_ID=
BRANDFETCH_API_KEY=
```

The three Worker URLs point at the receipt-scan
([receipt-scanner](#receipt-scanner-worker)), live-earnings-push
([live-earnings](#live-earnings-worker)) and Web Dashboard relay
([web-dashboard](#web-dashboard-worker)) Cloudflare Workers. Their
provider secrets (OpenRouter, APNs) live only in the Workers — never in the
app; the relay has none.
In CI, PR builds override the receipt-scan URL with the branch's Worker
**preview URL** so each branch talks to its own Worker.

Native GA4 uses the Firebase client configs committed at the app root (`apps/mobile`):
`google-services.json`, `GoogleService-Info.plist`, and
`GoogleService-Info.dev.plist`. They contain Firebase project identifiers, not
service-account credentials. GA4 is enabled for the complete population without
an in-app prompt and receives every event. PostHog also receives every user,
but only the curated install, activation, daily engagement, adoption and Pro
purchase events, plus errors, sampled masked session replays and feature flags.
Its public project token is checked in (`constants/posthog.ts`), and development
builds send nothing unless `EXPO_PUBLIC_POSTHOG_DEV=1`; see
[Analytics](#analytics) for the tracking plan, event routing and budget.

For Pro purchase identity, Google Play restore behavior, and cross-device QA,
see [Purchase identity and restore](#purchase-identity-and-restore).

### Scripts

Run from `apps/mobile`:

| Script                 | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm start`            | `expo start`                                       |
| `npm run ios`          | Sync icons → `expo run:ios`                        |
| `npm run android`      | Sync icons → `expo run:android`                    |
| `npm run web`          | `expo start --web`                                 |
| `npm run typecheck`    | `tsc --noEmit`                                     |
| `npm run lint`         | `expo lint`                                        |
| `npm run lint:fix`     | `expo lint --fix`                                  |
| `npm run format`       | Prettier write (the app, root `*.md`, `.github/`)  |
| `npm run format:check` | Prettier check (the app, root `*.md`, `.github/`)  |
| `npm run check`        | typecheck + lint + format check                    |
| `npm test`             | Jest (`__tests__/**/*.test.ts`, ts-jest, node env) |
| `npm run sync:icons`   | Copy adaptive-icon assets into native folders      |

`scripts/` also holds the asset-generation pipelines that are run by hand and
whose output is committed: category, clay, item and app icons; account and
subscription logos; the emoji catalog; the offline cities DB; and the tutorial
annotate → registry → website sync (see [Key patterns](#key-patterns) for each).
The tutorial pipeline, in order:

```bash
node scripts/annotate-tutorials.mjs        # captures -> committed frames
node scripts/generate-tutorial-images.mjs  # frames -> registry
node scripts/sync-tutorials-web.mjs        # catalog -> ../money2time-web
```

## Architecture

### Navigation

`App.tsx` is the root. It contains a single `RootStack` (NativeStack) with `MainShellScreen` as the base screen. `MainShellScreen` renders a `BottomNav` overlaying a tab-based content area (on iPhone Duo, a `SideNavRail` beside it; see [iPhone Duo](#key-patterns) under Key patterns). The app is **calendar-first**: the default tabs are **calendar, accounts, insights, albums, settings**. The `calendar` tab is the home/base view and renders `CalendarScreen` (which surfaces the month grid, day pager, and transaction list). All tabs are available to every user.

**The bottom bar is the user's to arrange** (Settings > Display > Bottom bar, `BottomBarScreen`, settings route `BottomBar`). `TabName` and the rules live in `components/navigation/navTabs.ts`: two to five pages, with `settings` (where the bar is edited) pinned but movable and the rest chosen from calendar, accounts, insights, albums, goals, recurring, reimbursements, receipts and Who owes you (`settleUp`). **The first page is the home page** (`homeNavTab`, tagged Home on the editor): the app opens on it, and when Calendar is not in the bar the + button moves to it, so adding an entry is always on the first screen. The bar is stored as a JSON array in `settings.nav_tabs_json` (migration `069`); null means the default five, so defaults can change later without overwriting anyone's choice, and an unknown or invalid stored bar falls back to the default rather than breaking navigation. `BottomNav` renders whatever `parseNavTabs` returns, and `NAV_TAB_META` (in `components/navigation/NavChrome.tsx`, shared with the iPhone Duo side rail) holds each page's clay icon and label. Every page has a `MountedTab` slot in `App.tsx`, rendered only while the page is in the bar or on screen (`hostsTab`), so a removed page unmounts; only pages in the bar are preloaded. A page outside the bar still opens when something asks for it (Settings > Albums, the over-account-limit prompt, `requestOpenTab`), with no bar item highlighted; tapping any tab leaves it. The added pages are screens that normally sit behind a push, so in the bar they take no `onBack` (the settings header then shows no back button) and reach their own settings through `requestOpenTab('settings')` + `requestOpenSettingsScreen`. Goals is wrapped in `GoalsTabScreen` for a header of its own, since the goals pane usually lives under the Accounts tab's header. Modal/push screens (editors, drilldowns, flows) are registered at the root stack level.

**Root stack screens** (defined in `navigation/rootStack.ts`):
`Main`, `AddTransaction`, `AddTransactionDetailed`, `EditTransaction`, `SettleUp`, `SettleUpSettings`, `SettleUpPerson`, `SettleUpTransaction`, `SplitBill`, `ReceiptSplit`, `AccountDetail`, `AccountEditor`, `GoalEditor`, `GoalDetail`, `AccountLogoPicker`, `CardDesignPicker`, `SubscriptionLogoPicker`, `PayCreditCard`, `AccountGroupEditor`, `CategoryEditor`, `InsightsDrilldown`, `RecurringEditor`, `SettingsRecurring`, `SettingsAccounts`, `SettingsHourlyValue`, `SettingsLiveEarnings`, `SettingsTimeDisplay`, `AddWageMonth`, `SettingsQuickEntry`, `SettingsMultiCurrency`, `SettingsAutoBackup`, `SettingsWageCalculator`, `ShareAndEarn`, `ProPaywall`, `CreateAlbum`, `AlbumDetail`, `EditAlbumTransactions`, `AddAlbumTransactions`, `EditAlbumDetails`, `ItemEditor`, `ItemIconPicker`, `CategoryIconPicker`, `BudgetTemplateEditor`, `BudgetPeriodEditor`, `BudgetCategoryAllocation`, `SettingsBudgetTemplates`, `Tutorials`, `TutorialDetail`, `PaymentAlertsSetup`.

**Settings has its own nested stack** (`navigation/settingsStack.ts`):
`SettingsHome`, `DisplaySettings`, `AppIcon`, `BottomBar`, `HourlyValue`, `HourlyValueSettings`, `AccountSettings`, `Accounts`, `Items`, `ExchangeRates`, `Categories`, `Recurring`, `Notifications`, `NotificationDetail`, `DataManagement`, `News`, `AutoBackupSettings`, `StatementImport`, `StatementImportList`, `ProManagement`, `ShareAndEarn`, `QuickEntrySettings`, `AutoLogSettings`, `AutoLogTutorial`, `AppLock`, `Receipts`, `ReceiptSettings`, `Reimbursements`, `ReimbursementSettings`, `Widgets`, `LiveEarnings`, `WidgetPreviews`, `PaymentAlerts`, `PaymentAlertSource`.

Stack options live in `navigation/stackOptions.ts` (headerShown: false, slide animations, gesture-enabled back).

### State management

Global state lives in `context/AppContext.tsx` via the `useApp()` hook. This is the single source of truth for all DB data — wallets, transactions, categories, settings, recurring rules, monthly wages, account balances, albums, and the multi-currency exchange-rate table. All CRUD operations are methods on this context. There is no Redux, Zustand, or other state library.

**Two contexts, by update frequency.** The volatile transaction-derived state — `transactions`, `filteredTransactions`, `accountBalances`, `transactionFilters`, `activeAccountFilter` — lives in a separate `TransactionsContext`, read via **`useTransactions()`**. Everything else (settings, accounts, categories, albums, FX, wages, prefs) plus all action functions stay on `useApp()`. This matters because transaction CRUD updates `transactions` optimistically/granularly (not via the full `refreshAll()` reload), so isolating it keeps the app's most frequent mutation from re-rendering every settings/account/album consumer. **Rule of thumb:** if a component needs live transaction data use `useTransactions()`; otherwise use `useApp()` and it won't re-render on transaction churn. Functions on `useApp()` that touch transactions (`getTransactionsByAccount`, `queryTransactions`, the breakdown queries, the bulk mutations, `getDisplayValueForTransaction`) are **identity-stable across transaction churn** (they read render-synced refs) — a memo that caches their results must also key on `useTransactions().transactions`.

**Scoped mutation refreshes.** Non-transaction mutations refresh only the state slice they touch (`refreshAccountsAndGroups`, `refreshCategories`, `refreshAlbums`, `refreshWages`, `refreshSettings` — passed to `runMutation` via `options.refresh`). The full `refreshAll()` is reserved for load/retry, restores/imports/resets, and recurring-rule edits (which rely on its `runDueTransactions` pass). When adding a mutation, pick the narrowest refresh; include `refreshTransactions()` only if the write changes transaction rows or their denormalized relation names (account/category renames, reassignment, redenomination).

**Tab visibility.** The five main tabs stay mounted for the app's lifetime (`MountedTab` in `App.tsx`), so hidden tabs would otherwise re-render and recompute on every write. `MountedTab` wraps each tab in `TransactionsWhileVisible` (`context/AppContext.tsx`): inside a hidden tab, `useTransactions()` keeps returning the snapshot from when the tab was last visible, so a write re-renders only the tab on screen and a hidden tab catches up in a single render when shown. Screens therefore read `useTransactions()` directly, with no hold of their own; the flip side is that code running in a hidden tab sees that snapshot, so anything that must act on live transactions belongs outside the tabs (`AppContext`, the shell around them, or a root-stack screen). Root-stack screens (editors, drilldowns) sit outside the tabs and always see live data.

Key properties from `useApp()`:

- **State** (on `useApp()`): `isLoading`, `settings`, `currentMonthWage`, `accounts`, `accountGroups`, `categories`, `monthlyWages`, `recurringRules`
- **State** (on `useTransactions()`): `transactions`, `filteredTransactions`, `accountBalances`, `transactionFilters`, `activeAccountFilter`
- **Account ops**: `createAccount`, `updateAccount`, `deleteAccount`, `reorderAccounts`, `createAccountGroup`, `renameAccountGroup`, `deleteAccountGroup`, `reorderAccountGroups`
- **Transaction ops**: `createTransaction`, `updateTransaction`, `deleteTransaction`, `updateTransactionsBulk`, `deleteTransactionsBulk`
- **Category ops**: `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`
- **Recurring ops**: `createRecurringRule`, `updateRecurringRule`, `deleteRecurringRule`
- **Settings ops**: `updateSettings`, `updateWageConfig`, `updateWageConfigForMonth`, `deleteWageConfigForMonth`, `toggleDisplayMode`, `canUseTimeDisplayMode`
- **Queries**: `getAccountById`, `getCategoryById`, `getTransactionsByAccount`, `queryTransactions`, `getCashflowSummary`, `getExpenseBreakdownByCategory`, `getExpenseBreakdownBySubcategory`, `getIncomeBreakdown`, `getTransfersBetweenAccounts`, `getTrueHourlyRateForDate`, `getDisplayValueForTransaction`
- **Data management**: `resetTransactionsOnly`, `resetAllData`, `importMoneyManagerBackup`
- **Onboarding**: `completeOnboarding({ seedDefaultAccounts })` completes setup and optionally seeds accounts.
- **Album ops**: `albums`, `activeAlbumId`, `createAlbum`, `updateAlbum`, `deleteAlbum`, `reorderAlbums`, `setActiveAlbum`, `addTransactionsToAlbum`, `removeTransactionsFromAlbum`, `getAlbumTransactionIds`, `getAlbumTransactions`, `getAlbumStats` (trip albums — group transactions with a cover, date range, and breakdown; Pro-limited to `FREE_MAX_ALBUMS`)
- **Budget ops**: `budgetTemplates`, `periodBudgets`, `createBudgetTemplate`, `updateBudgetTemplate`, `deleteBudgetTemplate`, `setDefaultBudgetTemplate`, `getBudgetKeysEverExisted`, `createPeriodBudget`, `createCustomPeriodBudget`, `updatePeriodBudget`, `deletePeriodBudget` (weekly, monthly and yearly expense-only budgets built from reusable templates; Pro-limited to `FREE_MAX_BUDGET_TEMPLATES` across all periods)
- **Multi-currency / FX ops**: `listExchangeRates`, `refreshExchangeRates`, `setManualExchangeRate` (reporting-currency rate table; transactions snapshot `reportingCurrency`/`reportingAmount`/`fxRate` at write time so historical aggregates never drift)
- **Preferences**: `insightsPreferencesJson`, `updateInsightsPreferencesJson`, `notificationPrefs`, `updateNotificationPrefs`, `quickEntryPrefs`, `updateQuickEntryPrefs`, `calendarPrefs`

Other contexts:

- `context/ThemeContext.tsx` — theme management: `resolvedTheme`, `themeColor`, `useResolvedTheme()`, `useThemeColor()`
- `context/ProContext.tsx` — RevenueCat subscription state via `usePro()`: `isPro`, `isLoading`, `isStatusKnown` (a status read settled for the current user), `customerState`, `offering`, `purchasePackage`, `restorePurchases`, `refresh`. `useIsPro()` reads just the flag from its own context, so a caller does not re-render while the subscription status refreshes (at launch and on every return to the app)
- Payment-alert preferences (`settings.auto_log_prefs_json`) live on `useApp()`: `paymentAlertPrefs`, `updatePaymentAlertPrefs`. Each Android source has one explicitly selected account; iOS actions select Account in Shortcuts.

### Database

SQLite via `expo-sqlite` + Drizzle ORM. Schema is in `lib/db/schema.ts`. The DB client is initialized in `lib/db/client.ts` (database file: `money2time.db`, migrations in `lib/db/migrations/` numbered `001`–`071`). `lib/db/normalizeCurrencies.ts` collapses legacy single-currency rows on restore/upgrade.

**Migration runner contract** (`lib/db/migrations/runner.ts`, wired up by `index.ts`'s `require.context` loader):

- Each migration runs in **its own transaction**, with the `PRAGMA user_version` bump inside it. Progress is durable per migration: a throw (or an OS kill mid-batch) costs only the failing migration, and the next launch resumes from exactly where it stopped. Do **not** reintroduce a single end-of-batch version bump — that is what used to leave installs half-migrated and permanently bricked.
- **Every migration must still be idempotent.** Installs upgraded under the old all-or-nothing runner can already be sitting half-applied and will replay. Use `addColumnIfMissing` / `addColumnsIfMissing` / `hasColumn` from `lib/db/migrations/helpers.ts` rather than a bare `ALTER TABLE ... ADD COLUMN`, which throws `duplicate column name` on replay.
- A DB whose `user_version` is **newer** than this build (store rollback, sideloaded older APK) is left completely untouched and reported to PostHog error tracking as `db_downgrade`. It must never be reset to baseline — that path used to `DROP` every table and destroy all user data.
- Failures surface through `refreshAll`'s catch in `context/AppContext.tsx`, which reports to PostHog error tracking (`scope: 'app_load'`) and renders the retry card. Keep that `reportError` call: it is the only visibility into migration failures, since the users worst affected never reach a working app.

**Offline places DB (`lib/db/citiesDb.ts`).** A second, **read-only** SQLite connection holds GeoNames cities (used by `CityPickerSheet` to attach a location to an album). The prebuilt asset lives at `assets/db/cities.db` (bundled via the `db` entry added to metro `assetExts`; gitignore-negated since `*.db` is otherwise ignored) and is copied into the SQLite dir once on first run, guarded by `CITIES_DB_VERSION`. Regenerate it with `node scripts/build-cities-db.mjs` (downloads GeoNames `cities15000`; `--empty` writes a schema-only placeholder). **Never** run the money2time migration runner against `cities.db` — it is pure reference data: not migrated, not backed up, not reset. The loader degrades to empty results if the asset is missing/corrupt. `searchCities` is **fuzzy**: the FTS5 index covers city, admin1/state and country names so a query can resolve by any of them (e.g. `japan`, `california`), and results are ordered by match tier (city-name match > state > country) then population. Each table carries an `ascii_name` column for the diacritic-free LIKE checks that drive that tiering.

**Album location map (`features/albums/`).** Albums with a location render on a full-page map, reached from the map FAB on `AlbumsScreen` → `AlbumLocations` root screen (`AlbumLocationsScreen` — full-bleed map, floating back button, no header). The map (`components/AlbumMapView.tsx`) is **MapLibre** (`@maplibre/maplibre-react-native`, open-source, no API key): photo `Marker`s showing each album's name + total spend (`AlbumMapMarker`) over a sleek, theme-tinted vector basemap (`buildThemedMapStyle` paints MapLibre's no-key demotiles vector source in the active `ColorPalette`), plus a "fit all" camera button. The path to full street-level/offline detail is a Protomaps PMTiles archive (`assets/map/style.json` is a bundled OSM-raster fallback). **MapLibre is a native module:** its Expo config plugin is registered in `app.json`, so adding/upgrading it needs a **dev-client / prebuild rebuild** (no Expo Go). `AlbumMapView` is `React.lazy`-loaded so the rest of the app works on a dev client that hasn't been rebuilt yet — only opening the location screen's map touches the native module. Pins come from `AlbumPin[]` (built from `locatedAlbums` + `getAlbumStats`); `locatedAlbums` is a selector on `useApp()`.

**Tables** (all use soft-deletes via `deletedAt`, except `exchange_rates` which is a cache):

| Table                           | Key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountsTable`                 | id, name, sortOrder, type (debit/credit/goal/loan), accountGroup, logoId, creditStatementDay, creditDueDay, currency, startingBalance, includeInTotals, **goalTargetAmount, goalTargetDate, goalEmoji, goalAchievedAt, goalArchivedAt** (savings-goal fields, null on non-goal accounts), **loanOriginalPrincipal, loanMonthlyPayment, loanPaymentDay, loanInterestRate, loanTermMonths, loanTotalRepayable, loanStartDate, loanPaidOffAt, loanArchivedAt, loanCountAsExpense, loanPaymentCategoryId, loanInterestModel, loanLedgerAnchorDate, loanRateChangesJson** (loan fields, null on non-loan accounts)                                                                                                                                                                                                                                                               |
| `accountGroupsTable`            | id, name, sortOrder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `categoriesTable`               | id, name, sortOrder, type (expense/income), parentId, icon (tagged icon value, see Key Patterns), isDefault                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `transactionsTable`             | id, type (expense/income/transfer/balance_adjustment), amount, currency, **reportingCurrency, reportingAmount, fxRate** (frozen FX snapshot), **toAmount, accountAmount** (cross-currency), date, accountId, fromAccountId, toAccountId, categoryId, note, **details** (longer free-text note, migration `068`; searched with `note` via `transactionSearchText`), receiptUri, recurrence fields, sentiment, **reimbursable, reimbursedAt, reimbursementAccountId, reimbursementTransactionId, reimbursementOfId** (reimbursement link), countsAsExpense, **dayOrder** (drag position among same-time rows; null = by createdAt, so edits never reorder)                                                                                                                                                                                                                    |
| `transactionSplitsTable`        | id, transactionId, personName, amount, isSelf, paybackAccountId, paidAt, paidTransactionId, sortOrder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `receiptSplitsTable`            | id, transactionId, currency, merchant, receiptDate, itemsSubtotal, taxAmount, serviceAmount, discountAmount, adjustmentAmount, totalAmount, source (scan/manual), receiptImageUri (itemized receipt-split header; one live row per transaction via partial unique index)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `receiptSplitItemsTable`        | id, receiptSplitId, name, quantity, lineTotal, sortOrder (line items on an itemized receipt split)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `receiptSplitItemSharesTable`   | id, receiptSplitId, itemId, personName, isSelf, weight (item × person portion weights)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `recurringRulesTable`           | id, name, type, amount, currency, toAmount, accountId, fromAccountId, toAccountId, categoryId, note, logoId, recurrencePattern, recurrenceInterval, nextRunDate, endDate, isActive, countsAsExpense                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `settingsTable`                 | id, appUserId, locale, currencyCode, currencySymbol, displayMode, workdayDisplayEnabled, workingHoursPerDay, hapticsEnabled, themeMode, themeColor, iconStyle, appIcon, accountLogoCountry, subscriptionLogoCountry, profileName, profileAvatarUri, insights/notification/quickEntry/calendar PrefsJson, onboardingCompleted, userMode, weekStartsOn, firstDayOfMonth, firstDayOverridesJson, biometricLockEnabled, biometricLockDelaySeconds, autoBackup fields, autoFxRefreshEnabled, lastRateFetchAt/Error, fxCurrenciesJson, firstAppOpen, paymentQrUri, defaultPaybackAccountId, reimbursementsCountAsExpense, showTransactionAccount, **showAccountPickerBalances** (account pickers show balances; the eye on the picker title, migration `069`), **navTabsJson** (bottom bar pages, see Navigation), autoLogPrefsJson (payment-alert sources and selected accounts) |
| `exchangeRatesTable`            | id, baseCurrency, quoteCurrency, rate, asOfDate, source (api/manual), updatedAt (FX rate cache, no soft-delete)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `albumsTable`                   | id, name, coverPhotoUri, isActive, startDate, endDate, sortOrder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `albumTransactionsTable`        | id, albumId, transactionId, sortOrder (join table)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `itemsTable`                    | id, name, iconId, purchasePrice, currency, purchaseDate, endDate, salePrice, note, sortOrder (owned things, for cost-per-day)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `monthlyWageSettingsTable`      | id, month (YYYY-MM), wageType, wageAmount, hoursWorkedPerWeek, workdaysPerWeek, commuteMinutesPerWorkday, baseHourlyRate, trueHourlyRate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `budgetTemplatesTable`          | id, name, emoji, totalAmount, isDefault, countUnbudgeted, sortOrder (reusable budget template; exactly one live default)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `budgetTemplateCategoriesTable` | id, templateId, categoryId, amount, sortOrder (per-root-category allocation on a template)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `monthlyBudgetsTable`           | id, month (YYYY-MM), templateId, templateName, templateEmoji, totalAmount, countUnbudgeted (frozen at creation; one live row per month via partial unique index, soft-deleted rows are tombstones)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `monthlyBudgetCategoriesTable`  | id, budgetId, categoryId, amount, sortOrder (frozen budget line for a month)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `autoLogCapturesTable`          | id, channel (android_notification/ios_alert/paste/share_text/apple_pay), sourceKey, sourceLabel, capturedAt, nativeKey, title, body (raw text, nulled by the retention sweep), status (pending/logged/dismissed/ignored/duplicate/failed), reason, resolutionJson (what the pipeline read and bound), parserVersion, transactionId, duplicateOf, dedupeKey (internal payment-alert duplicate bookkeeping; `auto_log_captures`)                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Data access goes through repositories in `lib/repositories/`: `accountsRepository`, `accountGroupsRepository`, `categoriesRepository`, `transactionsRepository`, `transactionSplitsRepository`, `receiptSplitsRepository`, `recurringRulesRepository`, `settingsRepository`, `monthlyWageRepository`, `albumsRepository`, `exchangeRatesRepository`, `budgetTemplatesRepository`, `monthlyBudgetsRepository`, `itemsRepository`, `paymentAlertCapturesRepository`, plus `mappers.ts` for DB row → domain type transformations.

### Feature structure

Features live under `features/` in domain folders. Each has `screens/` and sometimes `components/`, `services/`, `constants/`.

| Feature           | Purpose                                                                                                                                                                     | Key screens / components                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transactions/`   | Transaction CRUD, month-paged activity list, search, bulk edit, voice quick-entry, split-bill, settle-up                                                                    | `AddTransactionScreen`, `EditTransactionScreen`, `QuickAddScreen`, `QuickAddSheet`, `VoiceQuickAddOverlay`, `VoiceCaptureOverlay`, `VoicePreviewSheet`, `TransactionEditorScreen`, `SettleUpScreen`, `SettleUpPersonScreen`, `SettleUpTransactionScreen`, `SplitReceiptCard`, `SplitReceiptShareModal`, `InlineReceiptCamera`/`ReceiptCameraSheet` (+ `transactions/lib/settleUp.ts`)                                              |
| `calendar/`       | Calendar tab (app home) — three-level zoom (year/month/day), month grid of daily totals, day pager, search overlay                                                          | `CalendarScreen`, `CalendarMonthGrid`, `CalendarMonthPage` (+ `calendar/lib/`)                                                                                                                                                                                                                                                                                                                                                     |
| `albums/`         | Trip albums — group transactions with a cover photo, date range, breakdown drill-down, active auto-add                                                                      | `AlbumsScreen`, `AlbumDetailScreen`, `CreateAlbumScreen`, album editor screens (+ `albums/utils.ts`)                                                                                                                                                                                                                                                                                                                               |
| `insights/`       | Analytics charts — expense trends, category breakdown, sentiment                                                                                                            | `InsightsScreen`, `InsightsDrilldownScreen` (+ `insights/breakdownPieLayout.ts`)                                                                                                                                                                                                                                                                                                                                                   |
| `budget/`         | Weekly, monthly and yearly expense budgets from reusable templates — per-category depletion, period pagers, widgets (embedded in Insights)                                  | `BudgetScreen`/`BudgetPagerView`, `BudgetTemplatesScreen`, `BudgetTemplateEditorScreen`, `PeriodBudgetEditorScreen`, `CategoryAllocationScreen` (+ `budget/lib/budgetMath.ts`, `budget/lib/budgetPeriods.ts`, `budget/lib/categoryAllocationBridge.ts`)                                                                                                                                                                            |
| `settings/`       | All configuration, account/category management, data import/export, auto-backup, multi-currency, App Lock                                                                   | `SettingsScreen`, `DisplaySettingsScreen`, `HourlyValueScreen`, `AccountsScreen`, `ExchangeRatesScreen`, `CategoriesScreen`, `RecurringScreen`, `NotificationsScreen`, `DataManagementScreen`, `AutoBackupScreen`, `WebDashboardScreen`, `StatementImportScreen`, `QuickEntrySettingsScreen`, `AppLockScreen`, `WidgetPreviewsScreen`, `ProManagementScreen`, `ProPaywallScreen`, `WageCalculatorFlowScreen`, `ShareAndEarnScreen` |
| `news/`           | In-app feature announcements & showcases (changelog-style)                                                                                                                  | `NewsScreen`, `FeatureAnnouncementModal`, per-feature `*Showcase` components, `announcements/` (numbered entries), `featureAnnouncements.ts`                                                                                                                                                                                                                                                                                       |
| `onboarding/`     | First-time setup flow: welcome, basics + tracking-mode choice, wage (time-mode only), backup, acquisition source, notifications, feature highlights. No skip escape hatch.  | `OnboardingFlow` + step screens (`OnboardingValuePropStep`, `OnboardingPreferencesStep`, `OnboardingWageStep`, `OnboardingBackupStep`, `OnboardingSourceStep`, `OnboardingNotificationsStep`, `OnboardingFeaturesStep`)                                                                                                                                                                                                            |
| `reviewPrompt/`   | In-app App Store / Play review request prompt                                                                                                                               | review prompt components (paired with `services/reviewPrompt.ts`)                                                                                                                                                                                                                                                                                                                                                                  |
| `tutorials/`      | Searchable how-to guides, built from annotated simulator screenshots; mirrored to money2time.com                                                                            | `TutorialsScreen`, `TutorialDetailScreen`, `TutorialRow`, `content/` (the catalog), `links.ts`                                                                                                                                                                                                                                                                                                                                     |
| `goals/`          | Savings goals — an account with a target, progress and auto-save; a sub-tab of the assets page                                                                              | `GoalsScreen`, `GoalDetailScreen`, `GoalEditorScreen`, `GoalCard`, `GoalCelebrationOverlay` (+ `goals/lib/goalMath.ts`, `goals/useGoals.ts`)                                                                                                                                                                                                                                                                                       |
| `items/`          | Owned things priced by cost-per-day, and the Accounts / Goals / Items tab bar over the assets page                                                                          | `ItemsScreen`, `ItemEditorScreen`, `AssetsTab`, `AssetsTabBar` (+ `items/utils.ts`)                                                                                                                                                                                                                                                                                                                                                |
| `loans/`          | Loan accounts — payoff progress, remaining instalments, interest disclosure                                                                                                 | `LoanPayoffOverlay`, `LoanQuoteDisclosure` (+ `loans/lib/loanMath.ts`); the screens are the account ones                                                                                                                                                                                                                                                                                                                           |
| `reimbursements/` | Expenses someone else pays back — flag, track, settle. Optionally (`settings.reimbursementsCountAsExpense`) dropped from spending **analytics**; balances always count them | `ReimbursementsScreen`, `ReimbursementSettingsScreen`, `ReimbursementTileBadge` (+ `reimbursements/lib/reimbursementMath.ts`)                                                                                                                                                                                                                                                                                                      |
| `review/`         | Week / month / year recap of completed periods, embedded as an Insights page                                                                                                | `ReviewScreen`/`ReviewPagerView`, `ReviewFilterSheet` (+ `review/lib/reviewMath.ts`, `reviewPeriods.ts`, `reviewFormat.ts`, `reviewFilters.ts`)                                                                                                                                                                                                                                                                                    |
| `widgets/`        | Widgets settings hub plus the live-earnings Live Activity (Lock Screen / Dynamic Island)                                                                                    | `WidgetsScreen` (hub), `LiveEarningsScreen`, `LiveEarningsPreview`, `useLiveEarningsActivity` (+ `widgets/lib/liveEarnings.ts`)                                                                                                                                                                                                                                                                                                    |
| `autoLog/`        | Completed notification income/expenses via text scanning, explicit selected accounts, and separate Apple Pay card logging                                                   | `PaymentAlertsSetupScreen`, `PaymentAlertsSettingsScreen`, `PaymentAlertSourceScreen`, `PaymentAlertSync` (+ `autoLog/lib/`: `notification`, `text`, `binding`, `categorize`, `dedupe`, `decide`, `pipeline`, `captureQueue`, `prefs`)                                                                                                                                                                                             |

Shared UI primitives in `components/ui/`: `button`, `fat-button`, `card`, `input`, `select`, `settings`, `text`, `textInputStyles`, `theme-modal`, `time-value-inline`, `toggle`, plus the cross-feature sheets `AccountPickerSheet`, `CategoryPickerSheet`, `CurrencyPickerSheet`, `AccountLogoPickerSheet`, and icon/logo helpers `CategoryEmoji`, `ClayIcon`, `SentimentIcons`, `AccountLogo`.

Other shared components: `components/feedback/` (EmptyState, AppErrorBoundary, Mascot, LoadingDots, ImportingOverlay), `components/navigation/` (BottomNav, SideNavRail, NavChrome, BottomNavMinimize, AddFab, TodayJumpFab, EdgeSwipeBackContainer, MonthControlsHeader, InOutHeader, FilterIconButton, `floatingNav`, `liquidGlass`), `components/icons/` (SocialIcons, CloudProviderIcons via Lucide), `components/datePicker/` (DatePickerModal, InlineDatePicker, MonthYearWheelPicker), `components/layout/` (TabletContentContainer), `components/widget-preview/` (home-screen widget previews).

### Services

| Service                                                                                                                                                                                                | Purpose                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                                          | GA4 gets every event; PostHog gets every user but only `POSTHOG_EVENTS` (funnels, daily engagement, milestones), no automatic events: `trackEvent`, `recordLoggedTransaction`, `recordDailyAppOpen`, `identifyUser`, `setInstallDate`, `setCurrentScreen`, `flushAnalytics` |
| `errorReporting.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                                     | PostHog error tracking: `reportError` (used by `AppErrorBoundary`), `addErrorStep`; `.shared` holds the pure `$exception` scrub + dedupe/cap hook. Symbol upload needs `POSTHOG_CLI_API_KEY` at build time (see [Error tracking](#error-tracking))                          |
| `notifications.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                                      | Expo Notifications: `scheduleDailyCheckin`, `scheduleWeeklySummary`, `fireRecurringTransactionNotification`, `syncScheduledNotifications`                                                                                                                                   |
| `haptics.ts`                                                                                                                                                                                           | `triggerHaptic('medium' \| 'selection' \| 'success' \| 'warning')`                                                                                                                                                                                                          |
| `revenueCat.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                                         | RevenueCat SDK: subscription state, purchase, restore                                                                                                                                                                                                                       |
| `speechRecognition.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                                  | On-device speech-to-text for voice quick-entry (`expo-speech-recognition`)                                                                                                                                                                                                  |
| `autoBackup.ts` (+ `.native.ts`, `.shared.ts`) + `autoBackupProviders/`                                                                                                                                | Daily auto-backup: `runAutoBackupIfDue`, `listAllBackups`, `restoreFromBackup`, `previewBackup`, `deleteBackup`, `isTargetAvailable`, Google Sign-In helpers                                                                                                                |
| `webDashboard.ts` (+ `.native.ts`, `.shared.ts`), `webDashboardLink.ts`, `webDashboardCrypto.ts`, `webDashboardPatch.ts`, `webDashboardEdits.ts` + `webDashboardEditModules/`, `webDashboardNative.ts` | Web Dashboard: QR linking to a browser, live end-to-end encrypted transfer through a relay that stores nothing, patches, and checking and planning edits from a linked browser (see the Web-dashboard Worker)                                                               |
| `autoBackupTaskRegistration.ts`                                                                                                                                                                        | Registers the `expo-background-task` task for periodic backup runs                                                                                                                                                                                                          |
| `mmbakImportService.ts` + `mmbakImport/`                                                                                                                                                               | Money Manager `.mmbackup` file import                                                                                                                                                                                                                                       |
| `dataManagementService.ts`                                                                                                                                                                             | Export, JSON backup/restore                                                                                                                                                                                                                                                 |
| `excelExportService.ts`                                                                                                                                                                                | Excel (`.xlsx`) export: transactions / accounts / categories / recurring sheets, built with the dependency-free writer in `utils/xlsx.ts`                                                                                                                                   |
| `biometricAuth.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                                      | App Lock — Face ID / Touch ID / device-credential gate (`expo-local-authentication`)                                                                                                                                                                                        |
| `exchangeRates.ts`                                                                                                                                                                                     | Multi-currency FX: Frankfurter **v2** daily fetch (multi-provider blend; v1 is frozen and ECB-only), `refreshRatesNow`, `runRateRefreshIfDue`, staleness guard, offline-safe cache, manual overrides, historical rates                                                      |
| `reviewPrompt.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                                       | In-app App Store / Play review request (`expo-store-review`)                                                                                                                                                                                                                |
| `widgetSnapshot.ts` (+ `.shared.ts`) + `widgetRegistry.ts`                                                                                                                                             | Home-screen widget data snapshots and registry                                                                                                                                                                                                                              |
| `liveActivity.ts`                                                                                                                                                                                      | ActivityKit bridge for the live-earnings Live Activity (start / update / end / read the running one). iOS only                                                                                                                                                              |
| `liveEarningsPush.ts`                                                                                                                                                                                  | Registers a running live-earnings session with the push Worker, so the card's amount keeps moving while the phone is locked                                                                                                                                                 |
| `liveEarningsWidget.ts`                                                                                                                                                                                | Writes the live-earnings widget's precomputed timeline to its own App Group key                                                                                                                                                                                             |
| `paymentCapture.ts`                                                                                                                                                                                    | Payment-alert capture bridge: reads and clears the Android listener's file queue and the iOS alert queue, notification-access state, the listener config, the setup test alert                                                                                              |
| `paymentAlertsBridge.ts`, `paymentAlertsNavigation.ts`                                                                                                                                                 | Setup test results and drain requests; opening Android payment-alert setup from settings                                                                                                                                                                                    |
| `appIcon.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                                            | Alternate home-screen app icons: read the current one, switch, re-apply on load                                                                                                                                                                                             |
| `receiptScan.ts` (+ `.native.ts`, `.shared.ts`) + `receiptImage.*`, `receiptPicker.ts`                                                                                                                 | Receipt OCR against the Cloudflare Worker, plus the photo pick and the downscale that keeps one small stored copy                                                                                                                                                           |
| `autoLog.ts`                                                                                                                                                                                           | Bridge to the auto-log App Group store that Shortcuts writes into                                                                                                                                                                                                           |
| `userAssetGc.ts`                                                                                                                                                                                       | Sweeps orphaned user-asset images. **Any new column holding an asset path must be added to `collectReferencedAssetPaths`**                                                                                                                                                  |
| `cloudBackupPrompt.ts` (+ `.shared.ts`), `globalPromptCoordinator.ts`, `settleUpQrPromptState.ts`                                                                                                      | One-shot nudges: cloud-backup opt-in, the coordinator that stops two overlays landing at once, and the payment-QR prompt                                                                                                                                                    |
| `voiceCaptureBridge.ts`                                                                                                                                                                                | Publishes the live voice-capture session so the + sheet can draw the listening UI inside itself                                                                                                                                                                             |
| `featureAnnouncementState.ts`                                                                                                                                                                          | Tracks which `news` feature announcements have been seen                                                                                                                                                                                                                    |
| `deepLinks.ts`                                                                                                                                                                                         | Deep-link / URL routing into the app                                                                                                                                                                                                                                        |
| `userAssets.ts`                                                                                                                                                                                        | Profile avatar / user-supplied image asset handling                                                                                                                                                                                                                         |
| `*Navigation.ts` (calendar, insights, tab, settings, review, reviewPrompt, hourlyValue, paywall, transactions, addAction, liveEarnings, receiptSplit, scanCamera, scanReview)                          | Imperative navigation helpers (route into a tab/screen from anywhere)                                                                                                                                                                                                       |

Platform-split services (`.native.ts` / `.shared.ts`) use the `.native.ts` implementation on iOS/Android and `.shared.ts` as web/test fallback.

### Custom hooks

| Hook                        | Purpose                                         |
| --------------------------- | ----------------------------------------------- |
| `useMonthPager`             | Month paging with scroll callbacks              |
| `useIndexedScrollToTopRefs` | Track multiple scrollable refs                  |
| `useThemeVars`              | Access theme color scheme CSS variables         |
| `useThemeColors`            | Get theme-specific color values                 |
| `useEdgeSwipeBack`          | Handle edge-swipe back gestures                 |
| `useProGate`                | Gate features behind Pro subscription           |
| `useDeviceLayout`           | Tablet vs phone, iPhone Duo rail and panes      |
| `usePersistedJsonSnapshot`  | Persist/restore JSON state via AsyncStorage     |
| `usePressScale`             | Animated press scaling effect                   |
| `useKeyboardHeight`         | Track the live keyboard inset                   |
| `usePagerTabSync`           | Keep a pager and its tab bar in step            |
| `useStableSafeAreaInsets`   | Safe-area insets correct on the first frame     |
| `useSheetColumnStyle`       | Centre a bottom sheet on the open iPhone Duo    |
| `usePagerWidthResnap`       | Keep a pager on its page when its width changes |

### Styling

NativeWind (Tailwind CSS for React Native). Custom colors and theming defined in `tailwind.config.js`. Eight theme color palettes: sage, ocean, terracotta, slate, amber, indigo, emerald, rosewood (defined in `constants/designSystem.ts`). Class-based dark mode. Import path alias `~/` maps to the repo root.

### Types

All shared types are in `types/index.ts`:

- **Display**: `DisplayMode` ('money' | 'time'), `ThemeMode` ('system' | 'light' | 'dark'), `ThemeColor` (8 options), `WageType` ('hourly' | 'monthly' | 'yearly'), `BackupTarget` ('local' | 'icloud' | 'googleDrive'), `WeekStartsOn` (0–6)
- **Domain**: `Account`, `AccountGroup`, `Category`, `Transaction`, `TransactionWithRelations`, `TransactionSplit`, `TransactionSplitsSummary`, `RecurringTransactionRule`, `ProcessedRecurringRule`, `MonthlyWageSettings`, `WageConfig`, `UserSettings`, `QuickEntryPrefs`, `Album`, `AlbumStats`, `AlbumWithStats`
- **Multi-currency**: `ExchangeRateSource` ('api' | 'manual'), `ExchangeRate`, `RateTable`, `RateRefreshResult`
- **Enums**: `TransactionSentiment` ('happy' | 'neutral' | 'sad'), `AccountType` ('debit' | 'credit' | 'goal' | 'loan'), `TransactionType` ('expense' | 'income' | 'transfer' | 'balance_adjustment'), `RecurringTransactionType` (TransactionType minus balance_adjustment), `CategoryType` ('expense' | 'income'), `RecurrencePattern` ('none' | 'daily' | 'weekly' | 'monthly' | 'yearly')
- **Queries / state**: `TransactionFilters`, `AccountBalance`, `CashflowSummary`, `BreakdownItem`, `DateRange`, `NotificationPreferences`, `AppState`

### Constants

| File                                            | Contents                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `constants/appDefaults.ts`                      | Default wage config, transaction filters, currency defaults, account templates, category emojis |
| `constants/designSystem.ts`                     | Color palettes for all 8 themes, spacing, typography, theme-specific styles                     |
| `constants/motion.ts`                           | Animation timings and easing curves                                                             |
| `constants/pager.ts`                            | Pagination constants                                                                            |
| `constants/proLimits.ts`                        | Free-tier limits (`PRO_LIMITS`, `FREE_MAX_ALBUMS`, `PRO_TREND_TYPES`)                           |
| `constants/categoryIcons.ts`, `utilityIcons.ts` | Category / utility icon maps                                                                    |
| `constants/accountLogos.ts` (+ `.generated.ts`) | Bank/brand account logo catalog                                                                 |

### i18n

`I18n.t('key')` via i18n-js. Setup in `lib/i18n/index.ts` with device locale detection. **24 locales** are fully implemented in `lib/i18n/locales/` (da, de, en, es, fil, fr, hi, id, it, ja, ko, ms, nb, nl, pl, pt, ru, sv, th, tr, uk, vi, zh, zh-Hant). English (`en.ts`) is the source of truth; falls back to English for unsupported locales. `__tests__/i18n/localeParity.test.ts` enforces that every locale has the same key set as `en.ts` — when you add a string to `en.ts`, add it to all locales or the parity test fails.

Traditional Chinese is `zh-Hant`. Device tags for Taiwan, Hong Kong, and Macau select it automatically; generic `zh` and Simplified Chinese tags keep the existing `zh` catalog.

**Copywriting rule:** Never use long dashes (em `—` or en `–`) in user-facing copy, in `en.ts` or any translated locale. Use commas, periods, parentheses, or a colon instead. (Regular hyphens in hyphenated words like "Auto-categorize" are fine.)

### Key patterns

- **Retired simple mode**: All users have accounts, transfers, and the full app. Migration `063_retire_simple_mode` converts legacy settings to power while preserving every financial row and the former wallet's ID. It keeps that wallet as the Quick Entry default. `retireSimpleMode` also runs inside backup-restore transactions because old JSON backups can restore settings after migration 063 already ran. The `user_mode` SQLite column remains for backup compatibility; it is absent from the domain model and cannot be selected in the UI.
- **Date keys**: Use `dayKeyFromDateLocal()`, `monthKeyFromDateLocal()`, `monthKeyFromDateIso()` etc. from `~/utils/formatters` — do not roll custom date logic.
- **Financial month (the month cycle)**: a "month" can start on a day other than the 1st (payday cycles), and **not necessarily the same day every month**. The shape is a `MonthCycle` (`types/index.ts`): a `defaultDay` (1..31) every month follows, plus `overrides` keyed `YYYY-MM` for the months the user pinned somewhere else. It is stored as two columns, `settings.first_day_of_month` (the default) and `settings.first_day_overrides_json` (migration `060`), and read as one object with **`monthCycleOf(settings)`** — never off the raw columns.

  For any **user-facing monthly** grouping/range/anchor, use the helpers in `~/utils/financialMonth` (`financialMonthKeyForIso`, `financialMonthRange`, `financialMonthAnchorForToday`, `addFinancialMonths`, `financialMonthDayKeys`, `financialMonthOffsetForDayKey`) passing that cycle — never re-derive month boundaries inline. Every helper also takes a bare `number` (that is the "same day every month" cycle, and what their defaults and the tests use), and reduces **exactly** to the calendar-month `~/utils/formatters` behaviour at a plain `1`, so default users are unaffected. Because a number is assignable to `MonthCycleInput`, the compiler will **not** catch a call site still passing `settings.firstDayOfMonth` — it silently ignores the per-month exceptions, so grep for that field rather than trusting `tsc`. The two places that legitimately still read the scalar are the monthly-review notification trigger and its copy: an OS monthly trigger repeats on a fixed day and cannot follow an overridden month.

  A financial month is labelled by the calendar month it **starts** in, and ends the day before the NEXT month's cycle starts, so a pinned month simply lends or borrows days from its neighbour. A start day is 1..31 and is **resolved against the month it lands in**: a day past the end of a short month becomes that month's last day, so a default of 31 means "the last day" and February moves with the leap year on its own (`daysInMonth`, `firstDayForMonthKey`). That resolution is what guarantees each cycle starts inside its own calendar month, and therefore that the cycles tile the calendar with no gap and no overlap however the days are mixed. The per-month picker offers exactly the days that month has; the default picker offers all 31. `monthCycleOf` interns its result by value, so memos keyed on the cycle survive an unrelated settings write; keep it that way. The UI is `MonthCycleScreen` (settings route `MonthCycle`, reached from Display settings). Naming a cycle after its start month misleads on a late start day (on the 31st, 31 Aug to 29 Sep is "August"), so Review Spending shows the dates of any month period that is not exactly a calendar month (`isCalendarMonthPeriod` in `review/lib/reviewPeriods.ts`) on its pill and title, and ends its rail with the running period (`currentPeriod`): a muted, non-selectable pill labelled like its neighbours and marked with an hourglass, so the user can see what is still in progress and when the next review lands. (Credit-card **statement** cycles are a separate per-account thing in `~/utils/statementPeriods`.)

- **Currency/hour formatting**: `formatAmount(value, settings, { showSign })` and `formatHours(value)`.
- **Haptics**: `void triggerHaptic('medium' | 'selection' | 'success' | 'warning')`.
- **Settings updates**: `updateSettings({ field: value })` from `useApp()`.
- **i18n**: `I18n.t('key')` — strings defined in `lib/i18n/locales/en.ts`.
- **Analytics**: Use `trackEvent(AnalyticsEvents.X, props)` from `~/services/analytics`. The authoritative event, property, source and volume tables are in [Analytics](#analytics); update them alongside every tracking change. GA4 receives every custom event. PostHog receives every user but only `POSTHOG_EVENTS`; frequent per-use actions belong in `GA4_ONLY_EVENTS`, qualifying uses are recorded through `FEATURE_BY_EVENT` (first use ever and daily `Feature Used`), and a new PostHog event needs a [budget](#posthog-event-budget) estimate. Keep PostHog's automatic events off, never sample users/events, and pass an explicit source at every paywall entry point. Read feature flags only through `services/featureFlags`. Profile state, event context and milestone eligibility follow the canonical tables. Setup details are in [How tracking is wired](#how-tracking-is-wired).
- **Font scaling**: Disabled globally in `App.tsx` for both `Text` and `TextInput`.
- **Pro gating**: Use the `useProGate()` hook, or `useIsPro()` when only the flag is needed. Paywall via `ProPaywall` screen.
- **Platform-split services**: `.native.ts` for iOS/Android, `.shared.ts` for web fallback (analytics, notifications, revenueCat).
- **IDs**: Use `newId()` from `~/utils/id` for generating unique identifiers (UUID-based).
- **Error handling**: Use `getErrorMessage()` from `~/utils/errorHandling` to safely extract error messages.
- **Tablet layout**: Use `useDeviceLayout()` hook and `TabletContentContainer` for responsive layouts.
- **iPhone Duo (foldable)**: the closed outer display (466x678 pt) reserves an 84 pt strip on its right for the clock, camera and system bars, and the open inner display (951x669 pt, landscape; it rotates the app whatever the portrait lock says) folds down the middle. `resolveAdaptiveLayout` in `utils/adaptiveLayout.ts` (tested) turns window size and safe-area insets into the layout, exposed on `useDeviceLayout()` as `navPlacement`, `navEdge`, `navRailInset`, `isTwoPane` and `panes`. It recognises the Duo by the space it gives the app, never by model: only an iPhone (not iPad, not Android) with a horizontal safe-area strip, or an iPhone window wider than 800 pt and wider than tall, gets the side layout, so every other device keeps the bottom bar and an identical layout. On the Duo:
  - **Tabs** run down the side strip in a vertical pill (`SideNavRail`) with the + at its foot (`AddFab` positions itself into `SIDE_RAIL_FAB_SLOT`), where iOS puts its own vertical tab bar. `components/navigation/NavChrome.tsx` holds the items and the glass surface both bars use. Tab pages get only the home indicator as bottom clearance (`getFloatingNavReservedInset(safeBottom, 'side')`).
  - **Widths come from the content frame, not the window.** `ContentFrameProvider` / `useContentFrame()` (`components/layout/ContentFrame.tsx`) give the area a screen is laid out in: the shell less the rail (`ShellContentFrame`), a tab slot, or a pane. Anything sized to the screen (pager pages, charts, grids) reads `useContentFrame()`, and `useDeviceLayout().contentWidth` follows it. A window-level `Modal` or popover keeps the window size. Without a provider the frame is the window.
  - **Full-screen routes** (root stack via `screenLayout`, onboarding and the intro paywall) are wrapped in `SideStripSafeArea` (`components/layout/AdaptiveFrames.tsx`), which keeps them out of the side strip; transparent modals draw their own sheet and are left alone.
  - **Open display (two panes)**: Home splits on the fold (`panes`, each side of the window centre): header, totals and a live month grid in the left pane, the transaction list in the right. Tapping a day scrolls the list to it; zooming out goes list → year, since the month is already showing. Insights splits the same way: the header and chart on the left, the breakdown rows or the month's transactions on the right. A pane marks its two halves with `InsightPaneSplit` (`features/insights/components/`), and the page draws it once per pane; stacked it is the same single column as before. Budget, Review, locked Pro previews and empty states stay single-column. Every other tab page and every pushed route sits in a centred 600 pt column (`readableColumn`). Folding, unfolding and rotating only change styles and insets, never the component tree, so pages keep their state; month pagers re-snap to their page before paint when their width changes (`usePagerWidthResnap`, used by `useMonthPager` and Insights).
  - **Bottom sheets** centre their panel in the same column on the open display, as iOS does there: `useSheetColumnStyle()` on the panel (`{ onTablet: true }` for the two sheets that already centred on tablets). New sheets should use it. Native page sheets centre themselves.
  - **First-frame insets**: `useStableSafeAreaInsets()` returns the launch insets until the live ones are measured, then always the live ones, so headers do not flash against the top and still follow the window when the Duo folds (the old `Math.max(live, initialWindowMetrics)` kept the launch top inset after a fold and pushed headers down).
  - Not yet adapted: the reserved-region and hinge APIs (iOS 27.1) need a native module, so the book pose is not detected (it is laid out like flat). Test on the `Money2Time iPhone Duo` simulator (iOS 27.1): Argent `fold` (`closed` / `half-open` / `open`); on the inner panel Argent's `rotate` names are offset, so landscape is `PortraitUpsideDown` (rotate from the Home Screen, then launch the app) and screenshots need `rotation: LandscapeLeft`.
- **Single-line text inside long-range pagers**: the month/period pagers (`LONG_RANGE_PAGER_TOTAL_SLOTS` in `constants/pager.ts`: calendar, accounts, insights, album month picker) render their pages ~2400 page widths from the origin, about a million points out. Yoga snaps node edges to the pixel grid and stores them in float32, which that far out only resolves 1/16 to 1/8pt. Where the pixel grid is not a power-of-two fraction of a point (3x iPhones, most Android densities; 2x screens such as the iPhone SE and iPads are unaffected), a `numberOfLines={1}` text whose box hugs its content can come out a sliver narrower than its own measurement and get ellipsized although it fits: the calendar grid drew `300` as `3…`. Give such text a box wider than the text (stretch it across its cell and center it with `textAlign`) instead of sizing the box to the text. When something must sit right after the text (the reimbursable badge on `TransactionItem`'s title), size the slot from an invisible copy of the text and draw the visible one absolutely over it, a few points wider; label the slot (`collapsable={false}`) or the row's VoiceOver summary reads the title twice. The tell on device is a paragraph view whose width sits on a 1/16 or 1/8pt step rather than the pixel grid (e.g. `16.3125` on a 3x screen, where the grid is 1/3pt). Reproduce on a 3x simulator; a 2x one never shows it.
- **Swipeable pagers (`react-native-pager-view`)**: Since 8.0, pager-view renders iOS pages in a SwiftUI page-style `TabView` (a `UICollectionView` whose page controllers SwiftUI owns) instead of a `UIPageViewController`. The 6.x crash from unmounting a pager mid-swipe (closing `AddActionSheet` from a tile, leaving the transaction editor: "No view controller managing visible view", Sentry MONEY2TIME-S, MONEY2TIME-2F, MONEY2TIME-1A) therefore cannot happen on 9.x, and its patch was dropped in the Expo SDK 58 upgrade. The SwiftUI pager has its own teardown hazard: React unmounts pages one at a time, `.id(children.count)` rebuilds the `TabView` on every change in page count, and the pager's scroll delegate could adopt itself as its own forwarding target and overflow the stack (upstream #1146). Some callbacks also dereference a missing Fabric event emitter (#1113). `patches/react-native-pager-view+9.0.7.patch` ports upstream PR #1147 and adds the emitter nil checks; drop the delegate part once #1147 ships. `__tests__/patches/pagerViewSwiftUITeardown.test.ts` fails if an upgrade drops the patch or brings back a `UIPageViewController`. `usePagerTabSync`'s settle guards stay for Android (MONEY2TIME-1Y). On iOS `settleNow` no longer cancels a fling, which is harmless now that the crash class is gone.
- **Multi-currency**: Each transaction stores its entered `currency` plus a frozen reporting-currency snapshot (`reportingCurrency`/`reportingAmount`/`fxRate`) taken at write time so historical aggregates never drift when FX rates move. Use `convert`/`buildRateTable` from `~/utils/currency`; never recompute historical totals from live rates. FX rates come from `services/exchangeRates.ts`.
- **Albums**: Trip albums are a Pro-limited feature (`FREE_MAX_ALBUMS`). One album can be "active" (`activeAlbumId`) so new transactions auto-add. Manage via `useApp()` album ops.
- **Icons (categories, goals, budget templates)**: The four icon columns (`categories.icon`, `accounts.goal_emoji`, `budget_templates.emoji`, `monthly_budgets.template_emoji`) store one tagged string, documented in `constants/categoryIcons.ts`: a bare kebab id (`meal`) is a bundled clay PNG, `emoji:X` is a Unicode emoji the user picked, `custom:category-icons/<uuid>.png` is an uploaded image, and `''`/null is none. Classify with `classifyCategoryIcon`; render with `CategoryEmoji`, which handles all three forms. **Never re-derive an icon from an emoji at render time** — that indirection is gone. Older rows stored a bare glyph that was mapped through a table at render; migration `048_normalize_icon_values` backfilled them, and the frozen `LEGACY_EMOJI_TO_ICON` in `lib/db/normalizeIcons.ts` survives **only** at data ingress (the migration, backup restore, `.mmbak` import) because old backups can be restored at any time. `normalizeIconValue` is a fixpoint, which is what makes a replayed migration safe. **The free `default` pack IS the Clay artwork** — the separate `clay` pack was folded into it, so its 110 ids are bare (`meal`, not `clay/meal`) and every pre-existing row keeps rendering without a rewrite. Rows that had explicitly picked a Clay icon are remapped `clay/x` → `x` by `RETIRED_ICON_PACK_PREFIXES` in `lib/db/normalizeIcons.ts`, run by migration `050_retire_clay_icon_pack` and, like the legacy-emoji table, frozen there for the backups and `.mmbak` files that still carry qualified ids. The pack keeps the folder name `default` on purpose (renaming it would re-qualify every id and break every row); the label users see comes from `category_icon.pack_default`, which reads "Clay". Surfaces that can only render a string (native widgets via `widgetSnapshot.shared.ts`, the Shortcuts catalog via `autoLogCatalog.ts`, the Excel export) go through `categoryIconToEmoji`. The bundled set is generated by `scripts/generate-category-icons.mjs` and grouped/searchable via the hand-maintained `constants/categoryIconGroups.ts` (a test fails if a PNG has no grouping). One shared `CategoryIconPickerSheet` (root route `CategoryIconPicker`, handed its session by `categoryIconPickerBridge`) serves all three editors, with Icons / Emoji / My uploads tabs; the emoji tab lazy-imports the ~1,900-entry `constants/emojiCatalog.generated.ts`. Uploads are **Pro-only** (`useProGate().requirePro`), stored under the `category-icons` user-asset kind. **Any new column holding one of these values must be added to `collectReferencedAssetPaths` in `services/userAssetGc.ts`, or the orphan sweep will delete live images.** Non-default packs are **Pro-only**: a free user can browse them (with a banner, and a PRO badge in the pack list) but selecting an icon calls `useProGate().requirePro('icon_packs')` and opens the paywall instead. **EAS Update caps an update at 1000 assets and Metro resolves ~1380 here, so `expo.updates.assetPatternsToBeBundled` in `app.json` keeps `assets/account-logos` (528 files) out of updates, riding in the native binary instead; that leaves 949 of the 1000 in the current export (measured 2026-10-19; 74 of them are the card designs in `assets/card-designs`). (This governs the internal-only OTA builds — store builds ship with updates disabled, see CI / Deploy.) The list is an allow-list, not a deny-list, so it must also carry `node_modules/**/\*`— without it a JS-only update that bumps a dependency shipping assets (the Work Sans faces,`@react-navigation/elements`' chrome PNGs) references asset hashes that are in neither the update nor the installed binary. Adding artwork anywhere else eats that headroom, so re-check with `npx expo export --dump-assetmap` afterwards.\*\*
- **Clay UI icons (`assets/clay-icons/`)**: 160 soft-clay illustrations for the app's own _chrome_ — a separate namespace from the user-selectable category packs. Eight sets: `nav/` (bottom-tab glyphs as resting/active pairs, plus the + FAB), `settings/` (one per SettingsGridTile, plus the profile and CTA art), `entry/` (editor, quick-add, voice, receipt-scan affordances), `money-time/`, `ui/`, `status/` (empty-state and warning art), `insights/` (the insight-type illustrations, reached through `constants/utilityIcons.ts`) and `sentiment/` (the three faces behind `SentimentIcons`). Render with `<ClayIcon name="nav/home" size={26} />`; the registry is generated by `scripts/generate-clay-icons.mjs` into `constants/clayIcons.generated.ts`, so adding a PNG and re-running is the whole workflow. **Two rules the artwork depends on:** clay is never tinted (not per theme, not for an active state — an active tab is a different _file_, a resting one is dimmed with `opacity`), and clay is never wrapped in a tinted plate (`bg-primary/10` behind it reads as a second, competing container; the surrounding card or tile is the container). Clay needs room, so it is for anything naming a _thing_ at 18px and up; small chrome that must stay crisp at 15–16px (chevrons, close and back buttons, numpad keys, header search/filter) stays on Lucide line icons.
- **Icon style (clay vs flat)**: `settings.iconStyle` (`'clay' | 'flat'`, default clay, migration `051_add_icon_style`, toggled on `DisplaySettingsScreen`) lets the user put the pre-clay flat line icons back. It rides on `ThemeContext` alongside the theme colour, read with **`useIconStyle()` / `useIsFlatIcons()`** (defaulting to clay outside the provider, so an error boundary above `ThemeGate` still renders). `ClayIcon` is the choke point: in flat mode it draws the Lucide icon from `FLAT_ICON_FOR_CLAY` in `constants/flatIcons.ts` — a total `Record<ClayIconName, …>`, so a new clay icon does not typecheck until it has a flat counterpart — centred in the same `size` box so no layout shifts. A call site whose _pre-clay icon differed_ from that shared entry passes `flat={{ icon: X }}`; sizes come from `flatSize` (flat line art reads at roughly 60-75% of clay, and the ratio differed per surface, so the historical value is passed explicitly and `DEFAULT_FLAT_SIZE_RATIO` only catches the rest). **The two clay rules above invert in flat mode**, so a site whose _container_ also changed branches on `useIsFlatIcons()` rather than going through `ClayIcon`: `SettingsGridTile` and `AddActionSheet`'s tiles put their tinted plate back, `AddFab`/`AddIconButton` put the filled primary disc and white `+` back, `BottomNav` swaps to the tinted-and-filled SVG pairs in `components/icons/NavIcons.tsx`, `SentimentIcons` swaps to the emoji SVGs in `assets/icons/`, `InOutHeader` swaps the wallet art for its tone dot, and `SettingsScreen`'s avatar and Pro/Share CTAs get their discs back. **Deliberately out of scope:** category icons, the insight-type art (`constants/utilityIcons.ts`) and the mascots render the same in both styles.
- **Mascots**: 33 poses of the coin-purse chick in `assets/mascots/`, rendered by `components/feedback/Mascot.tsx`. Moods (`happy`, `waving`, `excited`, `love`, `thumbs-up`, `sad`, `shocked`, `confused`, `thinking`, `sleeping`, `cheering`, `celebrating`), actions (`receipt`, `writing`, `searching`, `presenting`, `phone-check`, `cards`, `laptop`, `atm`, `relaxing`), the three Pro plan placards (`premium-monthly`, `premium-yearly`, `premium-lifetime`), and nine sequence frames. `MOOD_TO_NAME` maps the looser `mood` prop `EmptyState` passes. The poses are cropped from the four 3x3 artwork sheets, background removed and de-matted so the anti-aliased rim carries no white halo on dark mode, then quantized to a 255-colour palette (512x512, ~25KB each). The de-matte is followed by a **despeckle** pass that drops any blob never reaching near-opaque: the sheets are not perfectly flat white, so pixels a shade off it survived the flood fill, picked up a little alpha in the rim band, and left a dusty halo of ~130 disconnected specks per pose, invisible on cream and obvious on dark. Real artwork always goes near-opaque somewhere, so confetti, sparkles and the dot over a question mark all survive it.
  **Animated sequences.** `<Mascot sequence="scan" />` plays a three-frame flipbook instead of a single pose: `scan` (snap a receipt, hold it up, get the tick), `save` (coin over the piggy bank, coin in, happy hug) and `grow` (small bars, the trend takes off, cheer). The last frame of each is the resting pose and is held longer; frames are stacked and cross-faded by opacity rather than swapped into one `<Image>`, because swapping the source flashes an empty box on the first paint of an uncached pose. A sequence suppresses the idle bob, since the frames carry their own motion. Every frame is also a valid `MascotName`, so `save-3` works as a static "saved" pose, and a sequence with `animate={false}` shows its resting frame rather than the lead-in. In use: `save` on `GoalCelebrationOverlay`, `scan` on `StatementImportScreen` while an import runs, `grow` on `ProTrendPreviewOverlay`.
  **Warmup.** `MascotWarmup` mounts once at boot but decodes only the `WARMUP` shortlist (the poses on first-run and empty-state paths), not the whole catalogue: each warmed pose costs a full-size decoded bitmap in memory, and 33 of them is not worth it. Everything else loads from the bundle on first render.
- **App icon and splash**: Both are the same chick. The launcher icon crops to its **head** (`assets/app-icons/<variant>/`, one folder per variant, cream `#FDF0D8` in light and midnight `#17212E` in dark) because a full body turns to mush at 40px; the splash keeps the whole character on transparency. Everywhere else the app shows its logo, it is the shipped headshot from `assets/app-icons/classic/` with the brand name rendered as text beside it: native widgets and their locked states, the in-app widget previews (`WidgetWordmark`), the What's New widget showcase and the shared Settle Up receipt. There is no separate logo or wordmark bitmap to drift from the app icon. Nine variants ship, composed from the mascot poses by `node scripts/generate-app-icons.mjs`: `classic` is the shipped icon (its light face is the supplied artwork, byte-for-byte, and must stay that way), the other eight are the Pro-only alternates. `app.json` points `ios.icon` and `android.adaptiveIcon` at `classic` and registers the rest through `expo-alternate-app-icons`. Two rules the art depends on: **the 1024 icons carry no alpha channel** (the App Store rejects one that does), and the framing is **one fixed transform** for every pose rather than a per-pose fit, since a raised wing or a spray of confetti moves a measured bounding box without moving the head. Full detail, including the dark-mode mechanism per platform and how to add a variant, is in [App icons](#app-icons).
- **Transaction details**: besides the one-line `note` (which doubles as the row's title and drives note suggestions), a transaction can carry `details`, a longer free-text note up to 2,000 characters. It is edited from the full editor's options panel (the gear), which on expense, income and transfer leads with a soft Details note area previewing two lines (above Pending reimbursement or the transfer's count-as-spending tick). Tapping it expands the box in place into a multiline field rather than opening a separate editor: the other options step aside, and the drawer rides the keyboard only far enough to sit the box on it, the way the one-line note does, so the rest of the panel and Save tuck behind the keys. The box grows with the text, pushing the amount card up, until it fills the keypad slot and then scrolls inside. Edits apply as they are typed; Done, the keyboard going away or closing the panel folds it back into the preview. Every text search over transactions matches `details` as well as the note, so a word written only there is found like one in the note: home search, the filter search in `AppContext` and the Receipts page through `transactionSearchText` in `utils/transactions.ts`, and the repository's `search` filter with a `LIKE` on each column. A balance adjustment has no options panel, so it never saves details typed before switching to it. Duplicating a transaction copies it; the Excel export has a Details column after Note.
- **Account picker balances**: `AccountPickerSheet` shows each account's balance under its name, in the account's own currency (or hours in time mode), red when it is against you (below zero on an asset, above zero on a card or loan, via `getNetAssetContribution`), falling back to the starting balance for an account with no rows. The eye beside the sheet's title hides them outright rather than masking, so tiles go back to one line, and the choice is saved for every picker (`settings.showAccountPickerBalances`, on by default). Balances are read in the sheet's body, which mounts only while the sheet is open, so screens that keep a picker mounted do not re-render on transaction writes. Like `CategoryPickerSheet` and `CurrencyPickerSheet`, it pads the scrolling list with the bottom safe-area inset rather than the sheet, so a long list runs to the screen edge instead of stopping mid-tile above an empty band, and its last row still scrolls clear of the home indicator.
- **App icon switcher**: Settings > Display > App icon (`AppIconScreen`, settings route `AppIcon`) is a grid over `APP_ICONS` in `constants/appIcons.ts`; a variant carries a **`free`** flag and anything without it goes through `useProGate().requirePro('app_icon')`. Two are free: `classic` and `purse`, the coin-purse character the app wore immediately before the current mascot, lifted back out of git history because putting back the icon a long-time user already had is not a premium feature. The flag exists rather than a `!== DEFAULT_APP_ICON_ID` check precisely because those are different questions, and a test pins both the default being free and the free ones leading the picker. `purse` is also the one variant that is not a mascot pose, so `scripts/generate-app-icons.mjs` reads it from `assets/app-icon-sources/` (whole-tile artwork, stamped through the identity framing) rather than from a mascot sheet; [Whole-tile icon sources](#whole-tile-icon-sources) records which blob it came from and why the cut-out has to be a flood fill from the tile border rather than a colour threshold (the purse's own belly is cream). The era before it, a coin and a clock inside two circular arrows, was offered here as `clock` and has been retired: one retired icon in the picker is the point, two is a museum. The choice persists as `settings.appIcon` (migration `055`) **and** lives in the OS, and the two can diverge, so an AppContext effect re-applies it on load: a restore onto a fresh install brings the choice back in the DB but not on the home screen, and on Android the current icon is read off the activity the app was launched through, so a notification or deep link into `MainActivity` reports the default whichever alias is enabled. Switching goes through the platform-split `services/appIcon`. **Dark icons are the platform's job, not the app's**: each variant registers light/dark/tinted appearances of one icon and iOS picks between them from the home screen's own appearance setting (its **Default** stays light even in system dark mode, so the dark tile is opt-in on the user's side and the picker promises nothing about when it appears). Driving it from `settings.themeMode` instead would fire iOS's modal "you have changed the icon" alert on every theme flip. Android gets `values-night` backdrops and a themed monochrome layer. **`plugins/withAndroidAlternateIcons.js` is load-bearing on Android**: switching there enables an `activity-alias` and disables whatever component the app was launched through, which on the default icon is `MainActivity` itself, and `MainActivity` is where Expo puts the `money2time://` VIEW filters that every home-screen widget and the Shortcuts auto-log open the app with. The plugin copies those filters onto each alias so a deep link keeps resolving (and can no longer land on `MainActivity` while an alias is live). It must be listed **before** `expo-alternate-app-icons` in `app.json`, because Expo runs manifest mods in reverse registration order; listing it after finds no aliases and silently copies nothing. **A disabled `MainActivity` also breaks AppCompat's night mode**: AppCompat decides between telling the activity about a uiMode change and recreating it by reading `configChanges` from the manifest entry named after the activity's class, and it looks that entry up without `MATCH_DISABLED_COMPONENTS`. Behind an alias the lookup throws, so `Appearance.setColorScheme` (nativewind's `setColorScheme` in `ThemeGate`) recreated the activity, and React Native's Modal teardown then crashed against the destroyed window: every launch, for a user with an alternate icon, a forced light/dark theme and the lock screen or an announcement up (Sentry MONEY2TIME-3Y / MONEY2TIME-62). `ThemeGate` therefore asks `canApplyNativeColorScheme()` first and skips the call in an activity launched through an alias. The app's own colours never depended on it (they come from `resolvedTheme` via `vars()`, and the status bar style is explicit); only native system chrome such as alert dialogs follows the system theme there.
- **Subscription logos (recurring rules)**: A recurring rule can carry a brand mark (`recurring_rules.logo_id`, migration `056`), rendered by `SubscriptionLogo` and chosen in `SubscriptionLogoPickerSheet` (root route `SubscriptionLogoPicker`, handed its session by `subscriptionLogoPickerBridge`). It is deliberately the **same UI as the bank-logo picker**: Library/Custom tabs, a 3-column grid, and a bottom search bar whose flag button switches country, so the two read as one mechanism; most of its strings are shared `accounts.logo.*` keys rather than duplicated. The catalog is a **separate namespace** from `accountLogos` (banks on one, streaming/telecom/gym brands on the other) with its own country list, which is why it carries `region` per country and derives its flag map from that instead of hardcoding one. The picker's country tab persists to `settings.subscription_logo_country`, kept apart from `account_logo_country` so browsing Japanese streaming services doesn't move the bank picker off the user's own country. Uploads live under the `subscription-logos` user-asset kind (**added to `collectReferencedAssetPaths` in `services/userAssetGc.ts`**, or the orphan sweep deletes live images). Typing a rule name auto-fills the tile via `suggestSubscriptionLogo`, which matches only on **exact or leading-word** hits: a loose substring would stamp a brand the user never picked onto a rule called "Rent". The suggestion stops applying the moment the user opens the picker (including to clear it).
  **Pipeline.** `scripts/data/subscription-services.json` (country -> services, each with the domain that resolves on the Brandfetch CDN) drives `scripts/fetch-subscription-logos.mjs`, then `scripts/generate-subscription-logos.mjs` emits the registry from the PNGs that actually landed, so a failed download is reported rather than emitting a `require` for a missing asset (a Metro-time crash). Three things the fetcher has to do and the reasons they are not obvious: it pulls **all three** Brandfetch tiers and keeps the **squarest**, because a brand's `icon` is often a wide wordmark that renders as an illegible 52x7 sliver while its `symbol` is the square mark; it **backs off on HTTP 429**, which the CDN returns freely under any parallelism and which otherwise records perfectly good brands as missing; and it writes **192px, 128-colour palette-quantized PNG8** via `scripts/lib/pngQuantize.mjs` (the bank logos' 256px true-colour would be ~3x the bytes for pixels nobody can tell apart at 52pt, which across ~1800 brands is a ~22MB binary rather than a ~12MB one). A fourth thing, added after the first pass shipped visible slivers: when the squarest Brandfetch tier is still wider than 1.6:1, or the brand is absent entirely, the fetcher falls back to the site's own icon (Google's favicon service, then `/apple-touch-icon.png`, then DuckDuckGo) and does **not** autocrop it, because an apple-touch-icon is a designed square tile whose background is part of the mark. `--wide-only` re-runs just the tiles whose bundled art is still a strip. Finally, a mark drawn **dark on transparency** (Amazon, Whoop, Tidal, Kindle Unlimited) is composited onto a white plate by `scripts/lib/logoPlate.mjs`, because bare on the dark-mode surface it renders as an empty tile; the rest of the catalogue is opaque app-icon art, so plating those ~3% makes them consistent rather than special. `--replate` re-applies that step to already-bundled tiles without re-downloading anything. Its **inverse** is `scripts/lib/logoBackground.mjs`, which runs just before it: plenty of tiers arrive as the mark on a flat white card, and the autocrop above trims only the _margin_ around that card, so without this step the white survives as a full-bleed plate and the picker shows a paper square behind every such logo. It floods the flat field in from the border of the **content box** (not the tile's own corners, which a card with rounded corners leaves transparent) and un-mattes the 3px antialiasing rim against it, so the mark keeps a clean edge instead of a pale halo. It refuses three cases, each of which costs real information: a **brand-coloured** field (Netflix red, Spotify green) where the colour is the mark; a mark that fails a **WCAG 2.0 contrast** check against the midnight surface, which is the very thing the plate above exists to prevent (the bar is 2.0 rather than 4.5 because these are shapes, not glyphs, and it has to pass Netflix red at 3.35 while rejecting navy at 1.07 — and the _dominant tone_ is checked separately, or a bright accent vouches for a wordmark that is entirely dark); and a mark that is itself **near-white**, which fuses to a white field so the flood walks into it and tears limbs off (TVB's white 3D mascot). Only that last check reads the cream surface, and only for this reason: cream and the plate are within a hair of each other in lightness, so removing a plate never costs light-mode contrast. `node scripts/strip-subscription-logo-bg.mjs` applies the same step to what is already on disk (`--dry-run` reports the verdicts); it is idempotent, since a stripped tile no longer has a field to find. Like `assets/account-logos`, `assets/subscription-logos` is **kept out of `expo.updates.assetPatternsToBeBundled`** so it rides the native binary instead of eating the 1000-asset OTA cap.
- **Account card designs**: An account's card on the Accounts screen can carry artwork instead of its type colour (`accounts.card_design`, migration `070`). The column holds one tagged string, documented in `constants/cardDesigns.ts`: null is the plain colour card, `<genre>/<name>` is a bundled template, `custom:card-designs/<uuid>.text-<light|dark>.jpg` is a Pro upload, and anything this build cannot resolve (a missing file, a retired id) draws the plain card. It is chosen from the editor's **Card design** row, which opens `CardDesignPickerScreen` (root route `CardDesignPicker`, handed its session by `cardDesignPickerBridge`): a live preview card with the account's own logo and name, genre filter chips, and nothing applied until **Use this design**. Templates are free; uploading is **Pro-only** (`requirePro('custom_card_designs')`), with no free allowance, like uploaded category icons.
  **Templates.** 74 designs in thirteen genres (mascot, minimal, gradient, luxury, texture, marble & stone, pattern, nature, space, abstract art, anime, retro, cute), picked from what card-skin and fintech-card buyers ask for and from the finishes popular bank and neobank cards use (vivid gradients, metal, frosted glass, pearl, wood, leather, classic patterns). The **mascot** genre leads the picker: eight designs starring the coin-purse chick, three repeating patterns (they show the character even in the strip a stacked card peeks) and five scenes with the chick placed below the top row so it never sits under text, generated with two poses from `assets/mascots/` attached as character references so it stays on-model. No franchise or brand characters: they are other people's trademarks and copyright, and the stores reject apps that ship them unlicensed. They were generated with the `codex-imagegen` skill as 1536x1024 PNGs and imported by `scripts/generate-card-designs.mjs --import <dir>` into `assets/card-designs/<genre>/<name>.webp` (centre-cropped to the card's 16:10, 960x600, each fitted to a ~110 KB budget by stepping the WebP quality down from 80 to no lower than 56, about 55 KB on average and 4.1 MB in all). Running the script without `--import` regenerates `constants/cardDesigns.generated.ts`. **Ids are stored on rows, so never rename or delete a shipped file.** The genre order and labels live in `CARD_DESIGN_GENRES` and `accounts.card_design.genre_*`; a new genre needs both.
  **Legibility is measured, not eyeballed.** Text only sits in two places on an artwork card, so only those two are protected, and the rest of the art is left alone. The **top row** (logo, name, balance, chips: the 54 points that peek out of a stack) sits on a band, black under white text or white under dark text, that fades out by 100 points; a closed card's body holds no text, so it shows the art at full strength. An **open card's details** sit on a frosted sheet that fades in with the expansion, so small labels never meet raw art; its opacity is the tone's floor (`sheetOpacity`) or the design's band strength, whichever is higher, so the busiest patterns get a firmer sheet too. The generator sets each template's band strength (`scrim`) from the art's upper half: the least that brings 98% of it, barely blurred, to WCAG AA 4.5:1 against the chosen text, and never below a floor that rises with the art's edge energy (0.2 on calm art, up to 0.72 on the busiest, houndstooth), because contrast alone passes pale-but-busy patterns like terrazzo or gingham that are still hard to read through. Whichever text colour needs the lighter band wins. On top, `cardDesignInk` keeps secondary text near full strength, puts a shadow under white text and a light halo under dark text, backs chips, tiles and buttons with panels, and uses a negative-balance red tuned for the band. Before changing any of this, render every template with the treatment and look at it: the busy Cute, Anime and Abstract designs are where it fails first. An upload has not been measured, so its uploader picks the text colour on a live preview and it gets a fixed band as strong as the busiest template's (`CUSTOM_CARD_DESIGN_SCRIM`). Pickers show bare art (`variant="thumb"`), since swatches carry no text.
  **Framing and crop.** The artwork is cover-fitted and centred in the card, so a closed card shows its middle band and opening it reveals the rest. Uploads skip the system crop (always square on iOS) for `CardDesignCropModal`: drag and pinch inside a window the exact width and shape of a card, with dashed lines marking the band a closed card shows. The photo is re-encoded once to apply EXIF rotation and cap it at 2400 px, then the frame is cut from it (`utils/cardDesignCrop.ts`) and saved at most 1200 px wide under the `card-designs` user-asset kind. The library is shared across accounts and reference-counted by the orphan sweep (`accounts.card_design` is in `collectReferencedAssetPaths`), like account logos: an upload no account wears is reclaimed by the next sweep, so "My uploads" holds the designs in use plus any picked since. Deleting an upload from the picker removes only the file: accounts still holding its id resolve to nothing and draw the plain card, and they redraw at once because `useCardDesignAppearance` subscribes to the upload store's revision (`subscribeCustomAssets`, bumped by every save, delete, sweep and restore). It deliberately does not rewrite those accounts, because an account write refreshes the list, which re-seeds the open account editor (losing its unsaved edits) and runs the orphan sweep over the rest of the library. A closed card shows the dashed band; inside a stack only its top 54 points, the name row, peek out, which the crop hint says.
- **Loans (interest accrual)**: A loan is an account with `type: 'loan'`; the balance is the **principal outstanding**, and repayments are transfers into it. The balance is **not** the sum of its rows: `accountsRepository.getBalances` replaces it with the ledger walk `accrueReducingBalance` (`features/loans/lib/loanMath.ts`), which adds a month's interest at every monthly rest and takes each repayment off after it, so only the part of an instalment that is not interest retires principal. **Both interest models are walked**, flat and reducing alike: a flat contract's instalment carries interest too, and knocking the whole instalment off the principal (what the app did before) read a 5 year flat loan as 15 instalments in after 12 and as settled 7 early. The two models differ only in what the agreement fixes: `flat` fixes the total, so `leftToPay` is total less paid and `interestSaved` is null; `reducing` fixes the rate, so what is left is the live projection and paying ahead saves interest. The walk runs at the **unrounded** rate the agreement's total implies (`loanAccrualRatePercent`, via `contractMonthlyRate`), never the two-decimal `loan_interest_rate` column, because the projection and the walk are both sensitive to that rounding; on a flat loan the stored rate is already the effective one (the flat figure is never stored). It starts at `loanLedgerAnchor`: `loan_ledger_anchor_date` (migration `062`), which the editor sets on a new loan to the date of the last instalment already paid (`LoanQuote.openingBalanceDate`) so every rest falls on the payment day, falling back to `createdAt` for loans saved before the column. A **variable rate** (reducing) loan keeps `loan_rate_changes_json` (`LoanRateChange[]`, read through `loanRateChangesOf`): editing the rate on one that already has interest behind it asks whether the new rate applies **from today** (a base-rate move; the history gains an entry and every rest before it stands) or **from the start** (a correction; the history is cleared). `pendingLoanRateChange` (pure, in `loanMath.ts`) decides, reading a missing rate as 0% so a loan going interest-free is a change like any other; a history left on a loan saved as flat is cleared (`loanRateHistoryIsStale`), since the flat model never asks: its rate is fixed at signing. The editor shows the flat rate's **effective rate** as helper text under the rate field (`accounts.loan.effective_rate_hint`), which is the reducing-balance equivalent regulators quote (Malaysia's BNM moved hire purchase to EIR in 2026).
- **Savings goals**: A goal is an account with `type: 'goal'` plus the `goal*` columns (target amount required, optional target date/emoji, achievement + archive stamps). Deposits/withdrawals are ordinary transfers; auto-save is a recurring transfer rule targeting the goal. Every balance-sign branch tests `type === 'credit'`, so goals inherit debit/asset semantics everywhere. Derived numbers come from the pure `computeGoalProgress`/`monthlyEquivalentRate` in `features/goals/lib/goalMath.ts`, composed by `useGoals()` (`features/goals/useGoals.ts`). Goals are a dedicated sub-tab of the assets page (`AssetsTab`: Accounts | Goals | Items) rendered by `GoalsScreen` (`features/goals/screens/GoalsScreen.tsx`), sharing the shell's balance-visibility toggle; the gated add button is `AddGoalButton`. `GoalDetail`/`GoalEditor` are root routes. Achievement detection is an AppContext effect that stamps `goalAchievedAt` once (celebration via `GoalCelebrationOverlay`); `setGoalArchived` deactivates auto-save rules on archive. Pro-limited to `FREE_MAX_SAVINGS_GOALS` (non-archived count); goal accounts do not count toward `FREE_MAX_ACCOUNTS`. Archived goals are hidden from `AccountPickerSheet`.
- **Budgeting**: Weekly, monthly and yearly **expense-only** budgets built from reusable **budget templates** (`budget_templates`/`budget_template_categories`) — a template sets how often it repeats (`period`: `week`, `month` or `year`), a total plus per-root-category allocations, an optional emoji, and a `count_unbudgeted` toggle (whether spend in categories with no line counts toward the period total). Each week, month or year gets a **frozen** budget row (`monthly_budgets`/`monthly_budget_categories`; the table predates periods and keeps its name) copied from a template at creation; editing a template never rewrites already-created budgets, and soft-deleted rows double as **tombstones** so auto-create never resurrects a period the user deleted. **Periods** (`features/budget/lib/budgetPeriods.ts`): a row's `period` column says which, and its `month` column holds the period key — `YYYY-MM-DD` (the week's first day, per `settings.weekStartsOn`) for a week, `YYYY-MM` (a financial month, per the month cycle) for a month, `YYYY` (January–December, whatever the month cycle) for a year. The shapes never collide, and one live row is allowed per period and key (`idx_monthly_budgets_period_key`, migration `071_budget_periods`, which also gave every existing row and template `period = 'month'`). A week budget always covers its key day and the six after it. One made before the user changed the first day of the week keeps its own seven days: the pager shows it on the week its first day falls in (`budgetSlotKey`, titled with the budget's own dates; if two land on one week, the one keyed on it wins), while auto-create, the dot on the switch, the widgets and Review find the running budget by its days (`budgetCoveringDay`), so no overlapping week is made. Several periods can run at once (say a weekly food budget and a yearly travel budget). **Auto-create**: on every load, and right after a template of that period is saved, `autoCreateCurrentBudgets` in `AppContext` makes the running week's, month's and year's budget from that period's default template (`pickAutoCreateTemplate`) unless the period has or ever had one. Exactly one template **per period** is the default while that period has any (`budgetTemplatesRepository` re-normalizes after every create, update and delete; a template moved to another period leaves its default flag behind, so it becomes that period's default only when the period had none). Back-fill (offered when creating a template) fills the template's own period from the first expense to the last completed period. All screen/widget numbers come from the pure `buildBudgetSummary` in `features/budget/lib/budgetMath.ts`, valuing spend at `reportingAmount ?? amount` (never drifts with FX) and counting only spend inside the budget's own days. **UI**: the budget view is an **embedded Insights page** (`BudgetPagerView` inside `InsightsScreen`, chosen from the insights type menu, not a Settings tile). There is no period switch: the page pages by **month** (`computeBudgetPagerMonths`: from the first budget of any period or expense to 12 months ahead; the header's month capsule opens the month wheel), and each month page (`buildBudgetMonthPage`) shows every budget that touches the month, kept to one answer per item and ranked by size, from the widest period down: the **year** first but smallest, as one slim row (name, spent of total, "65% used", days left, a thin bar), since most people plan by the month; the **month** as the hero card with an accent edge (one big "RM580 left" or "RM40 over", "of RM2,000 · 6 days left", one bar with its percent); the **weeks** in one compact card titled after the weekly budget ("Weekly spending · RM400 a week"), one tile per week with a day in the month (date, small bar, percent, "this week" under the running one, a + on an empty week when a weekly template exists; a week crossing months appears on both); then the shown budget's categories as plain rows (emoji, name, amount left in amber or red only when low or over, a chevron to its transactions), and unbudgeted spending folded into one total row that expands to its categories. The card shows the month's budget, else the running (or first budgeted) week, else the year's, named in its small top line; tapping a week tile or the year row shows that budget instead, with a ‹ month chip back. A month or year with a template of its period but no budget gets a dashed "No budget for …" row; a month nothing touches keeps the classic empty state. Week titles name the years when the week is outside this year or spans two. The template editor's Repeats switch sets the period (with a hint such as "A new budget starts every Monday") and relabels the total, the back-fill and the count-unbudgeted copy; the templates screen groups templates by period, each group with its own default; the template picker on the page offers only templates of the shown period. Template/period/allocation editors are root-stack routes (`BudgetTemplateEditor`, `BudgetPeriodEditor`, `BudgetCategoryAllocation`, `SettingsBudgetTemplates`). Root allocations must sum exactly to the total; a root's subcategory breakdown is optional and may be **partial** (the unassigned rest stays on the parent line, which keeps its full amount and rolled-up spend). Save is blocked only when the subcategories exceed their parent (`childAllocationExceedsParent`). Pro-limited to `FREE_MAX_BUDGET_TEMPLATES` templates across all periods (the page's Create template button checks it too); two home-screen widgets (`budget_ring`, `budget_breakdown`) show the running month's budget, else the week's, else the year's, and count today in their days left, as the page does. Review's pace card compares a week, month or year with the budget of the same period. The Web Dashboard knows monthly budgets only: the phone sends it monthly templates and month budgets alone (`services/webDashboardBudgets.ts`), and its edits can only make or change monthly ones. Manage via `useApp()` budget ops.
- **Split bills & Settle Up**: Splits live on `transactionSplitsTable` (per-transaction). The `SettleUp` screen has two underline tabs — **Person** and **Transactions** — over all positive, non-self splits, with paid shares shown in muted rows and only unpaid shares counted in outstanding totals. By-person rolls up via `aggregateSettleUpByPerson` (grouped by trimmed/case-folded name); by-transaction rolls up via `aggregateSettleUpByTransaction` (one entry per bill, each carrying every person's share). Both live in `features/transactions/lib/settleUp.ts` and total in the reporting currency via each parent's frozen `fxRate`. Tapping a person opens `SettleUpPerson` (itemized bills); tapping a bill opens `SettleUpTransaction` (each person's share). Both full-page root screens keep paid history visible; unpaid shares support editable payback account, mark-paid, delete-request, and share. Share opens `SplitReceiptShareModal`, which previews a fixed-light `SplitReceiptCard` (the shipped app icon beside a Money2Time wordmark in the brand's fixed warm split, big QR, generic `ReceiptContent`: title + optional date subtitle + itemized lines + total, no footer) and captures it to a PNG via Skia's `makeImageFromView` (lazily imported) → `expo-sharing` for a cross-platform image share, falling back to a plain-text `buildReceiptText` receipt if capture fails. Each share writes its PNG under a new name from `receiptShareFileName` (title slug + timestamp) and deletes it afterwards: iOS and the receiving apps cache a shared file by its URL, so one fixed path sent the first person's receipt to everyone shared after them. **That capture does not clip the way the screen does on Android**: it walks the view tree itself (TextureView and SurfaceView children need their own path) instead of drawing the root, so it never reaches `ReactViewGroup.dispatchDraw()` and has to replay the `overflow: hidden` clip by hand. Skia 2.2.12 replayed it by reflecting for `dispatchOverflowDraw`, which React Native dropped in 0.81; the lookup throws, the throw is only logged, and every clipped child drew unclipped, which put the whole category-icon sprite atlas across the shared receipt (the app's own screens were fine, since they draw normally). Skia 2.12.0 fixed it upstream (the app patched 2.2.12 until the Expo SDK 58 upgrade), and `__tests__/patches/skiaOverflowClip.test.ts` reads the installed module so a version that loses the fix fails loudly rather than silently shipping the wrong pixels. **Anything new put on this card that relies on a clip (an atlas cell, a rounded image, a cropped avatar) is only as correct as that fix.** The user attaches their own payment QR (settings `paymentQrUri`, stored via the `payment-qr` `userAssets` kind). `useSettleUpSummary` / `useSettleUpByTransaction` wrap the two aggregations. The split editor (`SplitBillModal`, opened from the transaction editor's numpad toolbar) is a **pushed root screen** (`SplitBill`): the editor publishes its live split draft + callbacks through `context/SplitBillSession.tsx` and `SplitBillScreen` consumes them, mapping Done/Cancel (incl. swipe-back via `beforeRemove`) onto the editor's commit/discard. `SplitBillModal` renders bare in `presentation="page"` mode; it autocompletes friend names from past splits (`recentSplitPersonNames`). Reached from Settings → "Who owes you".
- **Split by Item (itemized receipt split)**: Scan (or hand-enter) a receipt's line items and split them among people. Step 1 is items only (name + amount) plus an **"apply tax/service %"** stepper (defaults to 10%, like Split Bill's adjustment control) whose Apply **multiplies the item amounts in place** — there is no separate tax field; the receipt total is just the sum of items. Step 2 sets **how many people** are splitting (a count stepper; unnamed people auto-label **"Person A", "Person B", …**, a custom name is optional) and assigns each item to its host(s); a shared item splits evenly among its people. Step 3 summarizes per-person totals (no payback-account picker — payback defaults to the settings default). The itemized detail lives on its **own tables** (`receipt_splits` header + `receipt_split_items` + `receipt_split_item_shares`, one live header per transaction; header holds only currency/merchant/date/source/image — item `line_total`s are tax-inclusive) as the source of truth; on save the computed per-person totals are written as ordinary `transactionSplitsTable` **bridge rows** (unnamed people materialized as "Person A"…), so all Settle Up machinery works unchanged. All math is the pure `computeReceiptSplit` in `features/transactions/lib/receiptSplitMath.ts` (integer cents, largest-remainder, odd cents to the self share; groups by an opaque per-person key so two unnamed people never collide; Σ per-person ≡ item subtotal). The 3-step editor (`ReceiptSplitScreen`: Items → Assign → Summary) is a root route launched via the `receiptSplitBridge` module (payload never rides params); entry points: the scan-ready banner's "Split by item" chip (quick scans that parsed ≥2 items), split-intent scans (`startScan('split')` → Worker `mode: 'itemized'` → banner opens the editor directly), the add-action sheet's Split tab ("Scan to split"), the Settle Up empty-state CTA (scan or manual; scanning returns to the home tab so its progress banner shows), and the "Itemized receipt" row on `SettleUpTransaction` — shown **only** for bills that already have itemized detail (a plain Split Bill can't be converted); **paid rows freeze** on re-edit. Manual entry needs no scan/quota and works offline. The Settle Up **share receipt** lists each person's items as bullet points (`receiptSplitShare.personItemNames`). Editing saves via `updateTransactionReceiptSplit` (replace-on-save detail + bridge-row rewrite); deleting the parent cascades; backup round-trips the three tables.
- **App Lock**: Biometric gate via `services/biometricAuth.ts`, configured in `AppLockScreen`; settings `biometricLockEnabled` / `biometricLockDelaySeconds`.
- **Receipt scan**: Background OCR of a snapped/uploaded receipt, orchestrated by `context/ReceiptScanContext.tsx` (`useReceiptScans()` → `startScan`, `scanReceiptImage`, banner `jobs`). `startScan` gates the free-tier receipts limit, then opens the **inline camera** via the `requestOpenScanCamera` bridge. There is no pushed camera route: `ReceiptCameraSheet` is mounted once by the app shell (above the navigator) and raises the viewfinder as a bottom sheet over whatever screen asked for it, so dismissing lands the user exactly where they were. The viewfinder itself is `components/InlineReceiptCamera` — a fixed-height framing box plus a shutter, an album button and a close button — and the transaction editor renders the _same_ component in its numpad slot when the receipt chip is tapped, so framing a shot never covers the amount and note being filled in. A snap is held for Retake / Use photo; an album pick skips that (the picker was the review step); either path downscales the photo (`downscaleReceiptForStorage` in the platform-split `services/receiptImage` — caps the long edge at 1600px and re-encodes JPEG via `expo-image-manipulator` so the one stored copy is small enough for both the attachment view and the base64 upload; `.ts` is a web/test passthrough) then saves it (`saveReceiptImage`) and calls `scanReceiptImage`, which enqueues a background job and hits the Worker (`services/receiptScan`). A single parsed draft becomes a tappable "ready to review" banner (opens a pre-filled editor; a secondary "Split by item" chip appears when the itemized breakdown parsed ≥2 line items); multiple drafts are added directly. `startScan('split')` carries a split intent through the camera so the ready card opens the Split-by-Item editor directly (Worker `mode: 'itemized'`). **`expo-camera` is a native module** (config plugin in `app.json`), so `InlineReceiptCamera` is `React.lazy`-loaded behind an error boundary by both hosts — never import it eagerly — adding/upgrading it needs a **dev-client/prebuild rebuild** (like MapLibre). `patches/expo-camera+58.0.12.patch` makes iOS `takePictureAsync` reject instead of crashing when the preview connection stops mid-capture, and `patches/expo-image-picker+58.0.10.patch` stops a failed read of an Android Photo Picker `content://` uri being masked by a `Uri.toFile()` crash (Sentry MONEY2TIME-26). `__tests__/patches/expoCameraStoppedConnection.test.ts` and `expoImagePickerContentUri.test.ts` fail if an upgrade drops either.
- **Android share-to-log**: Android's Automation page has one entry, sharing a screenshot or receipt photo to the app from the system share sheet, the counterpart of iOS's Back Tap "Log Screenshot". `plugins/withMoney2TimeShareScan.js` generates `ShareScanActivity`, a no-UI share target for `image/*` (SEND and SEND*MULTIPLE) that copies the shared images into `<filesDir>/shared-scans/` and opens the app. It is a **separate activity on purpose**: picking an alternate icon disables `MainActivity` (see the App icon switcher note), and a share filter on a disabled component disappears from the share sheet. The copy happens in the activity because a shared `content://` grant does not outlive it. Each file is written as `<name>.part` and renamed when complete, and the folder listing *is* the queue: `services/autoLog.ts` reads it on Android (`parseSharedScanFileNames` in `features/transactions/lib/autoLog.ts`) in place of the iOS App Group queue, so `ScreenshotScanSync` in `App.tsx` drains both platforms through the same `screenshot` scan intent (silent auto-create, the `autoLogSaveScreenshot` opt-in). Adding the activity needs a **prebuild/native rebuild**. The walkthrough is the `shareScreenshot` topic of `AutoLogTutorialScreen`, with frames in `assets/autolog/ss*\*.png`drawn from`scripts/data/autolog-shots.json` (`TUTORIAL_SPEC=scripts/data/autolog-shots.json TUTORIAL_OUT_DIR=assets/autolog node scripts/annotate-tutorials.mjs`).
- **Tutorials**: `features/tutorials/` is a searchable set of step-by-step guides, reached from Settings > HELP & ABOUT > Tutorials (root routes `Tutorials` and `TutorialDetail`, so `money2time://tutorial?id=<slug>` can open one directly). Three things about it are load-bearing. **The catalog is English prose in `features/tutorials/content/*.ts`, not in `lib/i18n/locales/*`** — it is long-form content, and putting it in the locale files would add hundreds of keys to all 24 of them (and 32 more on the website) and make the parity test police prose; the screen _chrome_ does go through I18n, under `tutorials.*`. **The catalog is also the single source of truth for money2time.com**: `node scripts/sync-tutorials-web.mjs` copies it plus the screenshots into the web repo (`src/lib/tutorials.generated.ts`, `public/tutorials/`), so a tutorial is written once. Re-run it after any content or artwork change, or the two drift. **`assets/tutorials` is deliberately absent from `expo.updates.assetPatternsToBeBundled`** so its ~145 frames ride the native binary instead of eating the 1000-asset OTA cap (see the icon-pack note above).
  **Artwork pipeline.** A raw simulator capture plus a red-marker spec becomes the committed frame: `scripts/data/tutorial-shots.json` names the source and the marks in **normalised [0,1] coordinates**, which is exactly what argent's `describe` reports for an element's frame, so a mark is taken from the accessibility tree rather than eyeballed off a screenshot and survives a recapture on a different device. `node scripts/annotate-tutorials.mjs [id-prefix...]` draws them, downscales to 820px wide and writes a **256-colour indexed PNG** (a flat UI quantizes almost losslessly, and true-colour would be ~3.5x the bytes, which is app download size). Raw captures are not committed (~1MB each, well over a hundred); they live in the gitignored `.tutorial-raw/`, which the spec's `RAW/` prefix resolves against. `node scripts/generate-tutorial-images.mjs` then emits the `require()` registry Metro needs. `__tests__/features/tutorials.test.ts` fails on a step pointing at a missing image, an orphan image nothing references, or an em/en dash in the copy.
- **Live earnings (Live Activity)**: Settings > Widgets > Live earnings. `WidgetsScreen` (route `Widgets`) is a **hub**, not the feature: it lists one row per widget so a second one can be added without taking the page apart, and reads `getCurrentLiveActivity()` on focus purely to show an "On" badge (read-only on purpose, so it never mounts a second controller pushing its own updates). `LiveEarningsScreen` (route `LiveEarnings`) is the feature, offering a Lock Screen / Dynamic Island activity whose money figure counts up at the user's true hourly rate for a chosen 1 to 8 hour session. It needs **no Apple approval and no entitlement**: the app declares `NSSupportsLiveActivities` (added by `plugins/withMoney2TimeWidgets.js`) and that is the whole permission story, though the user can still switch Live Activities off per app in iOS Settings, which `ActivityAuthorizationInfo` reports and the screen surfaces. **The one thing ActivityKit cannot do is repaint on its own.** Only time-derived SwiftUI views (`Text(timerInterval:)`, `ProgressView(timerInterval:)`) redraw without an update, so the card's elapsed clock and progress bar are genuinely live while the **amount** is only as fresh as the last `activity.update()`. **`useLiveEarningsSync`** therefore pushes one on every AppState transition out of `active` (the moment right before the user looks at their Lock Screen) and one on the way back in (to reap a session that expired while the app was away); and a **push Worker** carries it the rest of the way. That is the only thing that moves the figure while the phone is locked, because it is the only one that does not need the app to be running: `apps/cloudflare/workers/live-earnings` holds the session and pushes the current amount once a minute for its whole life. Worth being clear on what an ActivityKit push is, because the name misleads: no banner, no sound, nothing in Notification Center, and **no notification permission** - Live Activity delivery is independent of an app's notification settings, so it works for users who have denied notifications outright. It is a silent data channel to one card. The app requests the activity with `pushType: .token` and registers the token via `services/liveEarningsPush.ts`. **The token is not available when `request()` returns** - it is minted per activity and asynchronously, so it is nil even on an install that has run sessions before; an early version waited for it and only bought a Start button that stalled. Registration is therefore an **upsert keyed by the push token**, done on the first transition out of the foreground, which is the moment before the Lock Screen is looked at anyway. That one path also repairs a registration that failed while offline and picks up a token ActivityKit rotated mid-session. Three more things that cost real debugging time: a Live Activity push token is **not** the 64-hex-character APNs _device_ token every example uses - iOS 26 issues **256** hex characters, and a length bound written for the smaller one silently rejects every real token (registration is best-effort, so the only symptom is a card that never ticks). `ContentState.asOfMillis` is a **Double, not a Date**, because a pushed `content-state` is decoded by a JSONDecoder with _default_ strategies and the default for `Date` is `deferredToDate` - seconds since the 2001 reference date, so a Unix timestamp decodes without complaint and lands 31 years out. And the app must declare **`NSSupportsLiveActivitiesFrequentUpdates`**, or Apple's delivery budget runs out part-way through a shift and the figure freezes again with nothing to say why. That hook is mounted **once in `AppContent`, not on the screen**, and the distinction is load-bearing: a listener owned by `LiveEarningsScreen` dies when the screen is popped, which is precisely what happens right after someone taps "Start the clock" and navigates back, leaving the card frozen at the amount it started with. `useLiveEarningsActivity` owns only the screen's own state (start, stop, and re-reading ActivityKit on focus). The **in-app preview** has no such limit and re-renders four times a second, which is what sells the feature. All math is the pure `features/widgets/lib/liveEarnings.ts`; the 8-hour cap is iOS's own, not a product choice. A hand-started shift is set up **in the act of starting it**: the action bar reads "Start manually" and opens `StartSessionSheet`, which asks the two questions a session needs (how long, and when it began) and then starts it. They used to be rows in a "Session" section on the screen itself, which put the settings for one shift next to the settings for every future one (the schedule) with only a header between them, and left the screen holding draft state for a session that might never begin. The length is still persisted on the schedule blob as `hours` (so the sheet opens on the last shift worked, and still apart from the schedule's own `shiftHours`); the start time deliberately is not, since "I clocked in at nine" is true of one shift only. A session can be **backdated**, and the picker for it is two wheels of **wall-clock time**, not a list of "2h ago" presets: someone who clocked in at half nine knows the time, and making them work out the difference is arithmetic the app can do. The hour column is labelled with `Intl.DateTimeFormat(locale, { hour: 'numeric' })` so the locale picks 12- vs 24-hour, and it carries **instants, not 0-23 numbers**, since a DST fall-back repeats an hour. Both columns only ever offer the window the session allows (the earliest hour starts part-way through, the current one stops at the present minute), so every combination the wheels can land on is a legal start rather than one clamped after the fact, and shortening the duration re-clamps a start the longer window had allowed. The sheet hands back the picked **time** and the screen converts it to an offset at the moment Start is pressed, so minutes spent deciding do not shift the session. Amounts deliberately go through `formatCurrency`, **not** `formatAmount`: in time display mode the latter would divide the earned amount by the very rate that produced it and render the elapsed clock twice. The Swift lives in the config plugin like the rest of the widget code (`ios/` is gitignored) and `Money2TimeEarningsAttributes` is emitted from **one** template string into both the app target and the widget extension, because ActivityKit pairs them by type name and two hand-maintained copies would drift. Two layout rules the card depends on, both learned the hard way on device: a **`Text(timerInterval:)` that is not given the width it reserved renders `1:--` instead of the time**, so the elapsed clock lives on its own footnote-sized row rather than sharing a line with the amount; and the **amount owns its row outright**, because giving the timer `layoutPriority` next to it let the timer claim the whole row and the amount rendered as nothing at all. A `Text(timerInterval:)` also reserves a box for the widest value it could ever show, so **anything placed after it on a row gets shoved to the far side** — which is why the clock sits at the start of the footer row with only a `Spacer` and the end time after it. That reserved box is also why the clock is given a **fixed 72pt frame**: the Lock Screen renders the card narrower than Notification Center does, and without a reservation the timer was handed less than it asked for and drew `3:--` on the Lock Screen while reading correctly everywhere else. The reservation has to be a **finite** one, and this is the sharpest trap in the whole card. `fixedSize(horizontal: true)` is the obvious way to say "take the width you need", and it shipped that way, but it proposes an _unspecified_ width instead of a number; the system's own ideal width for a timer text is not finite under that proposal, and the resulting nan came back out through the sibling progress bar as `view origin is invalid: (nan, 3.0)`, a hard trap in SwiftUI's layout. It does not fail gracefully or locally: it kills `WidgetRenderer_Activities`, the out-of-process renderer that draws **every** presentation of the activity, so the Lock Screen card, Notification Center, and all four Dynamic Island states render as blank black at once while ActivityKit still reports the activity as perfectly alive. That is the signature to recognise: a Live Activity that is running and updating (`liveactivitiesd` logs it, the app's own preview animates, the home-screen widget keeps ticking) but draws nothing anywhere. When it happens, the answer is in `~/Library/Logs/DiagnosticReports/WidgetRenderer_Activities-*.ips` and in `log show --predicate 'process == "WidgetRenderer_Activities"'`, not in anything the app can see. The rule this leaves behind: inside a Live Activity, never hand a time-derived view an unspecified size proposal - give it a number. The card is deliberately spare: four rows (badge + rate, the amount with the session total and the refresh button beside it, the bar, clock + end time), **no wordmark and no captions**, because a Lock Screen card is read at a glance and every label it does not need is one more thing between the user and the number. It carries no artwork for a second reason too — a Live Activity's view is archived and rendered out of process, so an image loaded at runtime with `UIImage(contentsOfFile:)` comes back as a grey placeholder box (the same `loadBundleImage` helper works fine in the home-screen widgets, which render in process, which is what makes that trap easy to walk into). Colour: the app hands the activity **both** the light and dark variants of the user's theme primary as `0xRRGGBB` ints, since the extension cannot read `ThemeContext`, and spends that accent on exactly one element (the amount) with everything else on `.primary`/`.secondary` — the only colours legible both over the Lock Screen and in light contexts. Per the HIG the card is deliberately **uncontained**: no background tint (the system material is what the rest of the iOS 26 Lock Screen is made of) and no filled pill around the "Earning" badge, because everything on the card except the refresh control is read-only and anything else that looks like a button misleads. That **refresh button** is the card's one interactive element, and it exists precisely because the amount cannot repaint itself: `Money2TimeRefreshEarningsIntent` is a `LiveActivityIntent`, which the system runs **in the app's process** (a plain `AppIntent` would run in the extension, where `Activity.update` reaches nothing), so one tap pushes the current figure without unlocking the phone or foregrounding the app. Two things it depends on: the intent must **not** set `isDiscoverable = false` (that keeps the app's copy out of the AppIntents metadata index and the system then routes to the extension's copy, where `Activity.activities` is always empty and the button silently does nothing, which is exactly how it first shipped in testing), and it reads its figure from the widget feed below rather than recomputing one, so the card and the widget can never disagree. The amount animates with `.contentTransition(.numericText(value:))`, which is why `ContentState` carries the raw `earned` double next to the formatted string: the digit roll needs a number to interpolate and cannot get one from a localized currency string.
- **Scheduled auto-start (push-to-start)**: The schedule on `LiveEarningsScreen` raises the card by itself at the start of a shift, and is **Pro-only** (`requirePro('live_earnings_auto_start')`) while starting the clock by hand stays free: what Pro buys is not having to. The gate is checked in `syncLiveEarningsAutoStart` on every pass, not just at the toggle, because a subscription can lapse long after the switch was flipped and the stored schedule would otherwise go on raising cards; the app disarms it the first time a lapsed subscriber opens the app, which is the only moment it gets (the Worker has no idea who is Pro, and a schedule nobody comes back to is dropped by its own staleness sweep). The switch reads off for a free account even when the flag is set, so it never promises a card that is not coming. `Activity.request()` is **foreground-only**, so for its first release the schedule could only be a local notification the user tapped; what removed the tap is a **push-to-start token** (iOS 17.2+), which addresses the activity _type_ on a device rather than any card, outlives every card raised from it, and lets a push start one with the app not running at all. The app reads it with `getLiveActivityPushToStartToken()` and registers the shift (weekdays, local time, length, rate, and the device's IANA zone) with `POST /live-earnings/schedule`; `apps/cloudflare/workers/live-earnings/src/starts.ts` sends the start push at the right local minute. **Both mechanisms still exist and exactly one may be armed**, which is why `features/widgets/lib/syncLiveEarningsAutoStart.ts` owns the decision rather than the two services it drives: with a token it registers the schedule and cancels the reminders, without one (iOS below 17.2) it schedules the reminders and registers nothing, and it disarms both when the schedule is off, has no days, has no wage behind it, or Live Activities are switched off for the app. `syncScheduledNotifications` deliberately no longer touches this one. It runs from `useLiveEarningsSync`, so it re-arms on every foreground: that is what repairs a registration made while offline, follows a user into a new time zone, refreshes the prerendered copy after a change of wage, currency, language or theme, and picks up a rotated token. **Everything the card will show is registered prerendered**, like the widget's timeline, because the Worker has no i18n catalogue and no view of the user's currency - and it can be, because a scheduled shift is fixed in advance. A shift is a start time **and a length**, and the length is its own field: `shiftHours` on the schedule blob, kept apart from the `hours` a hand-started session runs for. The two were one value at first and that was a bug rather than a simplification - clocking in for two hours of overtime on a Saturday silently rewrote every weekday the schedule covered, so Monday's card ended at eleven. `normalizeLiveEarningsSchedule` reads `shiftHours` from `hours` when the stored blob names only the latter, so an install upgrading across the split keeps scheduling exactly what it already was; only a blob naming neither gets the 8-hour default. `scheduleEndClock`, `scheduledSessionTotal`, the registered `durationMinutes` and the reminder's deep link all read `shiftHours`, and `useLiveEarningsSync`'s `scheduleKey` covers it so a change re-registers. A schedule is a **wall clock, not an offset**: `src/schedule.ts` walks local calendar days so 09:00 stays 09:00 across a daylight-saving change, and `next_start_at` is precomputed per row (a range scan, not a sweep of everyone's calendar) and recomputed **strictly forward** from now, so a foreground at 09:00:30 cannot re-arm the 09:00 start that just fired. Three states the pass refuses to start in, because each would put a lie on the Lock Screen: **a card is already up for that account** (started by hand, or a shift still running - it would count the same hours twice), **the start is more than `START_GRACE_MS` late** (the phone that was off all morning gets the push the moment it comes back; `apns-expiration` matches), and **APNs is unconfigured** (rows are left armed rather than rolled past a start that never went out). Two more things the payload depends on. The **attributes travel as millis** - `startedAtMillis`/`endsAtMillis`, with `startedAt`/`endsAt` as computed `Date`s - for exactly the reason `ContentState.asOfMillis` does: a pushed `attributes` dictionary is decoded by a JSONDecoder with default strategies, and the default for a Swift `Date` is seconds since the 2001 reference date, so a Unix timestamp lands 31 years out without throwing. `__tests__/services/liveEarningsStartContract.test.ts` reads the struct out of the config plugin and fails if the Worker's payload stops matching it, because nothing else would notice: APNs returns 200 for a payload the device then discards. And a start push **must carry an `alert`** (Apple's rule, so a card cannot appear entirely unannounced); on iPhone the card is the notice and the alert is what a paired Apple Watch shows, and delivery still needs no notification permission. Once the card is up **iOS wakes the app in the background** so it can read the new activity's _update_ token and register it through the ordinary session path - which is what starts the amount ticking; `refreshLiveEarningsActivity` therefore re-reads a tokenless activity a few times a second apart, since a single empty read would leave the figure frozen until the user next opened the app themselves. If two cards ever do end up running (a start that slipped past the busy check), the module's `activityUpdates` observer ends all but the one that has been **accruing longest**, since a shift already in progress is the one with something to lose; the manual start path, which deliberately ends the old card before requesting a new one, holds the reaper off with a flag while both briefly exist.
- **Live earnings widget (the figure that moves on its own)**: The Live Activity's amount is frozen between updates; the widget's is not, and the difference is the mechanism. A widget is the one iOS surface with a **timeline**: the app hands the system a list of future entries and it renders each at its date with no app process, no network and no push. Money accruing at a fixed rate is entirely predictable, so `features/widgets/lib/liveEarningsWidget.ts` precomputes the whole session into one timeline and the number climbs by itself on the Lock Screen and Home Screen. The schedule is **two-speed on purpose** - a tick a minute for the first hour, then one every five - because a flat grid either runs out mid-shift or moves in visible jumps from the start; 1 + 5 fits a whole 8-hour session in ~145 entries, comfortably under the ~200 WidgetKit tolerates, so the timeline never needs a reload to stay true. The last entry is the session's **final total**, which is what makes running out of timeline safe: the widget is left showing the right answer rather than a stale one. Entries do not consume the 40-70 reloads/day budget (that counts `getTimeline()` calls), so the cost of the whole feature is one write per app foreground. Amounts are formatted **in JS** and travel as strings, like the snapshot widgets' labels, because the extension has no access to the user's currency settings - which is also why the refresh button above reads its figure from here instead of computing one. The feed lives on its **own App Group key** (`live_earnings`), not inside the big widget snapshot: that snapshot is rebuilt from app data on a cadence of its own and a rebuild must never wipe out a running session. `syncLiveEarningsWidget` writes it wherever the activity changes (start, stop, expiry, foreground, and once at launch so the widget is never blank), and stopping by hand clears it while a session that simply ran out keeps its total - one is the user saying they are done, the other is a shift worth reading. Families: `accessoryRectangular` / `accessoryCircular` / `accessoryInline` on the Lock Screen (accessory widgets render in a single vibrant tint, so those views spend their space on hierarchy rather than colour) and `systemSmall` on the Home Screen and StandBy, where the theme accent survives.
- **Xcode 27 / iOS 27 SDK**: UIKit traps apps linked against the iOS 27 SDK that have not adopted the UIScene lifecycle. Expo SDK 58's template adopts it: `SceneDelegate` subclasses `ExpoAppSceneDelegate`, which starts React Native, rebuilds the launch options `Linking.getInitialURL()` reads from the scene's connection options (so the link a widget or Shortcut cold-starts the app with still arrives), and forwards URLs, user activities and quick actions to the AppDelegate. `__tests__/plugins/withXcode27Compat.test.ts` fails if a later Expo stops rebuilding them. `plugins/withXcode27Compat.js` keeps the two fixes Expo does not make: it aligns every pod's deployment target with the app's (Xcode 27 rejects targets below iOS 15) and patches a Swift 6.4 init clash in RevenueCat's `PaywallColor`. Expo CLI 58 opens DeviceHub (Simulator.app is gone in Xcode 27) by itself. Run `pod install` with `LANG=en_US.UTF-8` or CocoaPods fails on a Unicode normalization error.
- **React Native 0.88 removals**: `InteractionManager` is gone (reading it throws in development and is `undefined` in a release build). Use `runAfterInteractions` from `utils/interactions.ts`, which runs the task with `setImmediate`, the timing the app already had because React Native 0.80+ shipped `InteractionManager` switched to that stub. In React Native `setImmediate` is a microtask: the task runs right after the current JavaScript task, before the next frame, not after animations. `StyleSheet.absoluteFillObject` is gone too; use `StyleSheet.absoluteFill`, now a plain object. Core components are function components in the types, so a ref is typed with the exported instance type (`useRef<ScrollViewInstance>`, `TextInputInstance`, `ViewInstance`, `TextInstance`), not the component, and a list's `ListHeaderComponent` / `ListFooterComponent` / `ListEmptyComponent` take `undefined`, not `null`.
- **iOS background tasks**: auto-backup runs as an `expo-background-task` task, executed by `EXTaskService` (expo-task-manager). Upstream drives it from three threads: the main thread at launch, the BGTaskScheduler launch handler (registered with a `nil`, i.e. background, queue), and the module queues behind `registerTaskAsync` (called on every launch) and `notifyTaskFinishedAsync`. A background launch could touch it from two at once and crash with `EXC_BAD_ACCESS` (Sentry MONEY2TIME-3G, MONEY2TIME-5Z, MONEY2TIME-23). SDK 58 locks `EXTaskService`'s own collections, but not the `EXTaskExecutionRequest` that a finishing task completes, so `patches/expo-background-task+58.0.11.patch` and `patches/expo-task-manager+58.0.12.patch` still put every entry point on the main queue. `__tests__/patches/expoTaskServiceMainQueue.test.ts` fails if an upgrade drops either. Upstream still registers on a `nil` queue as of SDK 58.
- **Transaction drag-to-reorder**: In selection mode the transaction list's grips drag rows on the FlashList itself (`features/transactions/components/transactionReorder.tsx`, geometry in `features/transactions/lib/dragReorder.ts`, the save in `reorderTransactionDate.ts`). A lifted copy of the row follows the finger, the rows it passes slide aside through the row's existing press-scale view, and the list scrolls near its edges, all on the UI thread. **Do not use `react-native-sortables` for a long, scrolling list.** It cannot virtualize, and Reanimated re-applies the last animated props of every view it has updated on each commit that is not its own. A scrolling ScrollView commits its offset every frame, so a month of Sortable rows was re-cloned, re-laid-out and re-diffed on every frame (10 to 30 dropped frames a second on the simulator). Sortable is fine for the short settings lists that still use it. The container, not the grip, follows the finger after pick-up, because a grip scrolled far enough away is clipped or recycled by FlashList and its touch is cancelled. **A drop renders in the list before it is saved:** `ActivityTransactionList` applies the drop to its own copy of the transactions (`applyReorderUpdates`) and calls `updateTransactionsBulk` on the next task. Waiting for the app-wide re-render instead kept the drag frozen for hundreds of milliseconds. During that time the lifted row stayed pinned while the list scrolled under it, and grabbing the row again scrolled the list. The render that shows the drop remounts only the rows and headers between the pick-up and drop spots, which sheds their drag styles. Remounting every row took most of that render.
- **Feature announcements**: Add a numbered entry under `features/news/announcements/` and a matching `*Showcase`; seen-state tracked by `services/featureAnnouncementState.ts`. A page `cta` that leaves the app (`openRiceCal`, `openWebDashboard` to app.money2time.com) is handled inside `FeatureAnnouncementModal` and shows the external-link glyph. One that navigates needs a handler in **both** places the modal is mounted: the root auto-popup in `App.tsx` (through `requestOpenTab` + `requestOpenSettingsScreen` for settings-stack routes) and the Settings > News list in `SettingsStack`. A CTA without a handler silently falls back to Next/Done.
- **Notifications (`features/autoLog/`)**: Design: [Notification review](#notification-review). Native Android/iOS capture queues remain compatible. `PaymentAlertSync` stores captures for local review, without AI or network requests. `utils/notificationAmounts.ts` extracts currency-labelled money candidates; the user chooses Income, Expense or Ignore in root `NotificationHistory`, with bulk actions and a leave-warning. Missing or ambiguous amounts/accounts stay editable. All unfinished items persist; completed history is capped at 10. `NotificationReviewBanner` surfaces pending items on launch/foreground/live capture. Explicit review commits the transaction and capture link synchronously using `source: notification_review`; it has no free-tier limit and shares nothing with the Apple Pay allowance. Apple Pay stays automatic with its existing allowance; the catalog's `remaining` uses the same `autoLogAllowance` as the drain (zero for a free account over the account limit), so the intent never notifies "logged" for a tap the app will refuse. Android system access, master and selected apps still apply; iOS uses the action Account. Resets clear/invalidate pending work. Receipt photo/itemized/screenshot AI behavior remains intact; the retired Worker notification mode rejects before inference.

## Notification review

Bank and wallet notifications become local drafts. The app never sends notification text to AI or creates a transaction until the user chooses its type.

### Capture and review

- Android keeps system notification access, the master switch and selected source apps. iOS Log Notification uses the Account supplied by the Shortcut, without an extra in-app opt-in.
- On launch, foreground or live capture, read the native queue and durably persist each notification before acknowledging it. Exact capture IDs prevent queue replay.
- Extract numbers locally without requiring a currency symbol, respecting regional separators, fractional amounts, and three-decimal currencies. Use the selected account's currency when the symbol is ambiguous or absent. Normalize Arabic/Persian/full-width digits and narrow-space grouping. Explicit known currencies still take precedence. Do not infer direction, merchant, completion or relevance.
- Keep all monetary candidates, including balances or offers. One candidate pre-fills the amount; multiple candidates require the user to choose. No candidate requires manual entry. Never use unlabelled OTPs, card numbers or references as money.
- Show an inline review action below the calendar income/expense summary alongside receipt-scan status, with the unfinished count. It appears in the day view outside search. Dismissing it keeps the queue, and opening the app again restores it.
- The full review page shows the original text, source and captured time. Each item has Income, Expense and Ignore. The amount and edit button sit at the top right of compact cards. Cards use the detected currency and configured account without extra controls. Edit opens the full transaction editor; saving creates one transaction and completes the original notification through the same duplicate guard. To review has a spaced red count only when items are pending; Recent has no count. The original rounded toggle highlights the active tab. The centered Notifications settings header has no History action; the icon-only History action is beside the Notifications section title on both platforms’ Automation page. Categories use an explicit same-type preset, then the Apple Pay keyword mapping, then the Quick Entry default or fallback. Keyword matching suggests only categories; direction always comes from the user.
- Income All and Expense All process the displayed pending snapshot with each item's selected amount and account. Invalid items remain unfinished. Ignore All works without an amount or account.
- Back, hardware Back and swipe-back warn that leaving will ignore the unfinished snapshot. Cancel stays on the page. Confirm durably ignores those items before navigating; new arrivals remain pending.

### Persistence and limits

Confirmed reviews are manual actions with no free-tier limit: no inference, scanner credits, automatic-log usage or free account-count gate. They neither count toward nor are blocked by the Apple Pay auto-log allowance, which stays Apple Pay's own. `AutoLogSync` in `App.tsx` waits for `isStatusKnown` (see the purchase rules) before it publishes the Shortcuts catalog or drains queued Apple Pay taps, for at most 10 seconds after launch. A tap that meets the free limit (`AutoLogLimitError`) stays queued, posts after an upgrade, and is not reported as an error. Commit the transaction and capture link together before marking history complete. A failed history write can be repaired from that link without creating another transaction; a failed transaction remains pending.

Retain all unfinished items plus only the 10 newest completed history entries. Unfinished items do not expire. This avoids silently losing drafts when more than 10 notifications arrive. Old expense/income history remains historical; it is never reopened or relogged. Data resets, including main-currency reset, successful backup restores and Money Manager imports clear/invalidate local drafts and native queues to prevent stale saves. Failed backup restores preserve drafts. No schema migration or native contract change is needed.

Notification text, candidates and amounts are local data, excluded from analytics and error-report payloads. Existing drain telemetry records queued/pending counts; successful user decisions emit existing autolog telemetry with `decision: confirm`. Feature first-use and transaction milestones follow actual successful saves.

### Receipt compatibility and release

Receipt photo, itemized and screenshot scanning retain AI, models, prompts, transport and quotas. The app no longer exports a notification scanner client; the Worker rejects retired notification requests before entitlement, quota or AI calls. Cloudflare CI deploys Worker changes on merge. Older app versions cannot process notifications against the retired endpoint until updated; coordinate the app rollout and Worker retirement. No manual production deployment is part of this change.

## Pro and purchases

### Purchase identity and restore

#### Identity and store accounts

Money2Time has no shared Pro sign-in account. `settings.appUserId` is a locally
generated `m2t_<uuid>`, passed to RevenueCat as an **identified** App User ID. It is
different on a fresh second installation. Google Sign-In in the app authorizes
Google Drive backups; it does not sign the user into Google Play or RevenueCat.
Importing a Money2Time data backup deliberately preserves the destination's App
User ID. Do not change that to trust purchase identity from an editable backup.

On Android, Restore Purchases must query the Google Play account that owns the
purchase and submit its purchase tokens for the current RevenueCat App User ID.
On iOS, the corresponding source is the App Store account. Store sign-in and
Drive sign-in are separate. This flow does not provide an iOS-to-Android transfer.

#### Store configuration

As checked in the live Money2Time RevenueCat dashboard (read-only, 2026-09-08):

- Android `m2t_pro_lifetime` is **Non-consumable**, Published, and attached to
  entitlement `pro` and offering `pro`.
- Project restore behavior is **Transfer to new App User ID**. There is no
  separate sandbox override.
- The Google Play application ID is `com.nelsongan.money2time`; credentials are
  marked **Valid credentials**, and Google developer notifications are connected.

#### Rules the purchase code keeps

- Use one explicit `Purchases.restorePurchases()` call on both platforms. Android
  posts it with `isRestore=true`; background `syncPurchasesForResult()` uses the
  SDK's account-sharing policy instead. A sync result must not short-circuit the
  user's explicit store restore. The old comments claiming explicit Android
  restores do not repost tokens were incorrect.
- Serialize identity changes and record the ID actually passed to `logIn`.
  Recheck the desired ID after login completes, including when settings switch
  back to the previously active ID while another login is pending.
- Apply purchase/restore/listener state ahead of older background reads. Do not
  launch another cached customer-info fetch after a successful purchase/restore.
  A failed refresh is not evidence that a paid entitlement disappeared; a
  confirmed inactive entitlement still revokes access, and subscription expiry
  continues to be checked locally.
- `isPro` is a `false` placeholder until the first status read settles (a
  failed read counts) or an authoritative update arrives; `usePro().isStatusKnown`
  says which, for the current `appUserId` only (the first read can run before
  settings name the user, and answers for an anonymous customer). Code that would refuse a Pro user must wait for it. The Apple Pay
  auto-log drain and the catalog it publishes for the App Intent do: drained on
  mount, they rejected Pro users' queued taps as "Auto-log limit reached".
- Authorize access only from `entitlements.active[configuredEntitlement]`.
  Historical entries can contain refunded/revoked lifetime purchases without
  an expiration date and must not unlock Pro.
- Report actual restore failures to PostHog error tracking under `revenueCat.restore`, with the
  platform, and preserve the restore error during already-owned purchase recovery.

#### Verification

Automated regression suites:

```sh
npx jest __tests__/services/revenueCatRestore.test.ts __tests__/services/proCustomerStateRefresh.test.ts --runInBand
npm run check
npm test -- --runInBand
```

The native service tests mock the RevenueCat SDK boundary, exercising Android/iOS
restore, identity ordering/retry, already-owned recovery, empty results,
subscriptions, revoked lifetime access, cancellation, and error reporting. State
refresh tests deliberately resolve asynchronous reads out of order.

##### Required Google Play end-to-end check

Use two Play Store devices and a license tester with a Play-installed test build.
The available local AVD uses the `google_apis` image with `PlayStore.enabled=no`;
it cannot validate restoration of purchases owned by a Google Play account.

1. On device A, buy lifetime Pro with the tester account. Record its App User ID
   from Settings > Display. Repeat separately for an active monthly/annual plan.
2. Install the test build on device B using the same purchasing **Google Play**
   account. Confirm its App User ID differs from A. With multiple Google accounts,
   verify which account installed the app and owns the order.
3. Open the paywall and restore. Confirm success, unlocked Pro, and the expected
   RevenueCat transfer. Background/resume the app, reopen the paywall, and restart
   it; Pro must remain active. Also restore while the initial paywall refresh is
   still pending.
4. On the original device, account for the project's transfer policy: different
   identified App User IDs do not automatically share access simultaneously.
5. With an account that owns nothing, verify no-purchases feedback and locked Pro.
   Repeat offline, then retry online; errors must not claim successful recovery.
6. Revoke/refund the test entitlement and confirm it no longer unlocks Pro once
   RevenueCat reports it inactive. Repeat a normal restore on iOS as a regression
   check.

For a failing real purchase, obtain the current App User ID, the Google Play
order ID (`GPA...`), the exact restore message, app version, and approximate restore
time. Inspect that customer's history and the scoped PostHog exception before assigning
a store-side cause. Do not log receipts, purchase tokens, or Google credentials.

#### Historical consumed purchases

RevenueCat React Native SDK 9+ uses Google Billing Client 8+, which cannot query
already-consumed one-time purchases. Neither restore nor repeated sync calls can
recover those tokens on a new installation. The current lifetime product is
non-consumable; there is no evidence from this inspection that it was previously
consumed. If an affected order was consumed historically, verify ownership and
follow RevenueCat's manual recovery procedure using its order ID. Do not grant
access just because an editable backup contains a previous App User ID.

#### Sources

- [RevenueCat restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior)
- [Android SDK restore/sync implementation](https://github.com/RevenueCat/purchases-android/blob/main/purchases/src/main/kotlin/com/revenuecat/purchases/PurchasesOrchestrator.kt)
- [Google Play non-consumable product setup](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)
- [Consumed purchase limitations in Billing Client 8](https://www.revenuecat.com/docs/known-store-issues/play-billing-library/restore-consumable-purchases-bc8)

### Trial-aware paywall

#### Goal

The paywall must advertise a free trial only when the exact package the user can buy includes one for the current store account. Every trial claim must include the store-provided duration and the price charged after the trial. Turning a trial on or off in App Store Connect, Google Play, or RevenueCat must not require an app release to correct the copy.

#### Product invariants

1. Never infer a trial from a package name, product identifier, campaign, or hardcoded duration.
2. Never show trial copy when eligibility is unknown, the introductory price is greater than zero, or the duration cannot be represented safely.
3. Keep the selected package, CTA, trial duration, and displayed price terms derived from one normalized object so they cannot disagree.
4. Show the full subscription price and interval before the purchase action. Lifetime remains a one-time purchase and never inherits subscription copy.
5. A failed eligibility lookup must not hide a purchasable plan. It removes only the unverified trial promise.
6. Do not promise a reminder before renewal unless a separate reminder feature is shipped and verified.

#### Store behavior and normalization

RevenueCat automatically applies an eligible introductory offer when a package is purchased. On Google Play, package purchase uses the product's default option, which favors the longest eligible free trial and falls back to the base plan. On iOS, introductory eligibility must be checked separately; an unknown result should use ordinary pricing copy. These rules follow RevenueCat's [subscription offer guidance](https://www.revenuecat.com/docs/subscription-guidance/subscription-offers) and the installed React Native SDK contract.

The app normalizes both stores into this paywall-facing shape:

```ts
interface RevenueCatFreeTrial {
  durationIso8601: string;
  durationCount: number;
  durationUnit: 'day' | 'week' | 'month' | 'year';
}
```

| Platform             | Trial source              | Eligibility rule                                                    | Safe fallback                        |
| -------------------- | ------------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| iOS                  | Zero-price `introPrice`   | RevenueCat status must be `ELIGIBLE`                                | Keep plan; set `freeTrial` to `null` |
| Android              | `defaultOption.freePhase` | Google Play has already filtered the available subscription options | Keep plan; set `freeTrial` to `null` |
| Development fallback | Mock annual package       | Explicit one-week trial for visual QA only                          | Mock purchases remain unavailable    |

Multiple billing cycles are multiplied into both the displayed unit count and the normalized total ISO duration used for analytics. Unsupported units, inconsistent store period metadata, and invalid or non-positive durations are rejected rather than rendered as guessed copy.

On Android, a free phase with an indeterminate cycle count or a paid introductory phase after the free phase is not advertised as a trial. This paywall's simple “free, then standard renewal price” contract does not describe a mixed free-plus-discounted schedule; do not make such an option the package default until its complete billing sequence is supported in the UI.

The purchase section keeps the full localized price more prominent than the effective monthly breakdown, states the trial duration and post-trial charge, and provides restore and legal links. These choices follow Apple's [auto-renewable subscription presentation guidance](https://developer.apple.com/app-store/subscriptions/) and [App Review subscription-information rule](https://developer.apple.com/app-store/review/guidelines/).

Google Play's [subscription policy](https://support.google.com/googleplay/android-developer/answer/9900533) asks for an explicit automatic-renewal disclosure on the plan-selection screen. The current product copy uses only the cancellation reassurance under “Choose your plan”; a release compliance review should resolve this gap before enabling subscriptions or trials on Google Play.

#### Copy matrix

| Selected plan state                 | Hero                      | Plan badge        | CTA                | Sticky supporting terms                                   |
| ----------------------------------- | ------------------------- | ----------------- | ------------------ | --------------------------------------------------------- |
| Eligible free trial                 | Existing benefit headline | “{duration} free” | “Start free trial” | “Free for {duration}, then {localized price / interval}.” |
| Monthly or annual without a trial   | Existing benefit headline | None              | “Subscribe”        | Localized price / interval                                |
| Lifetime                            | Existing benefit headline | None              | “Buy Lifetime”     | “{localized price}. Pay once, yours forever.”             |
| Trial eligibility unknown or failed | Existing benefit headline | None              | “Subscribe”        | Ordinary package price                                    |
| Offering still loading              | Existing benefit headline | None              | Disabled action    | No trial promise                                          |

Duration copy supports singular and plural days, weeks, months, and years. The keys exist in every supported locale so future store-side trial changes cannot break locale parity.

#### Interaction and layout

The previous plan rows purchased immediately. The revised section uses a two-step selection model:

1. The default is an annual trial, then any other trial, then annual, then monthly, then the first available package.
2. Tapping a row changes the selected radio state, plan badge, CTA, and terms. The benefit headline stays the same.
3. One primary CTA purchases the selected package.
4. The X and “Maybe later” dismiss directly; there is no second-chance prompt.

The yearly, monthly, and lifetime rows appear first, before the long-scroll comparison. “No commitment. Cancel anytime.” appears once under “Choose your plan” for subscriptions; the sticky area retains only the selected price or trial-to-price statement, CTA, and “Maybe later.” The compact trial spotlight and exit modal have been removed. Restore and privacy links remain in the scroll content, with Apple's standard EULA link on iOS. Onboarding immediately opens this paywall; all announcements already in the catalog are marked seen for the new user, so a feature announcement cannot interrupt signup or appear on the next launch. Future announcements remain eligible.

#### Analytics

Purchase-started and purchase-completed events include:

- `package`
- `has_free_trial`
- `trial_duration` (the store ISO 8601 value, or `null`)

This distinguishes trial starts from direct purchases without creating a second conversion funnel.

#### Verification matrix

Automated coverage must prove:

- eligible iOS zero-price intros produce a trial;
- iOS ineligible, unknown, no-offer, and failed checks suppress trial copy;
- Android reads the free phase from the package's default option;
- paid intros, unknown units, and invalid durations never become free trials;
- singular/plural duration keys cover every supported unit;
- default selection follows the documented preference;
- trial and non-trial presenters keep the benefit headline and choose the correct badge, CTA, and terms;
- all locale key sets and interpolation placeholders remain in parity.

Manual device QA must cover light and dark mode, a phone and tablet layout, trial and non-trial plan selection, direct dismissal, the onboarding transition, loading state, restore, purchase cancellation, and Dynamic Type-independent text clipping. The simulator stays visible on the final tested screen, and the PR embeds reviewer-accessible final screenshots.

#### Trial enablement runbook

Before enabling a production trial:

1. Configure the trial on the store product or Google Play offer attached to the RevenueCat package.
2. On Google Play, confirm the intended offer is the package's default eligible option and is not excluded by an `rc-ignore-offer` tag.
   Keep the default option to a free phase followed directly by standard renewal pricing; a mixed paid intro requires a separate pricing UI.
3. Confirm RevenueCat serves the intended offering to both a new eligible account and an ineligible previously subscribed account.
4. Verify the paywall duration, post-trial price, billing interval, purchase sheet, and entitlement activation on sandbox iOS and Android accounts.
5. Verify every supported locale on representative short and long durations.
6. Confirm analytics records trial starts with the matching package and ISO duration.
7. Re-run `npm run check`, the focused paywall/RevenueCat tests, and the full Jest suite before release.

## Analytics

**This section is the single source of truth for Money2Time analytics.** The tables define the approved event names, destinations, triggers, frequency, properties and adoption milestones. Update this document in the same change as any affected tracking code or product flow. Implementation details belong in [the integration notes](#how-tracking-is-wired); do not maintain a second event inventory there.

Baseline audited against this checkout on **2026-10-12**, when PostHog replaced Mixpanel (product analytics) and Sentry (error tracking). This date records an audit, not a release date. The catalog covers native iOS/Android app tracking; [the web fallback](apps/mobile/services/analytics.ts) sends nothing. Routing means an event is eligible to be sent when the provider is configured; delivery is best-effort. The website's contract lives in the `money2time-web` repository (`docs/analytics.md`) and reports to the same GA4 property and PostHog project.

Two providers, two jobs:

- **GA4** (free, unsampled) receives every custom event: the complete per-use record, plus RevenueCat revenue.
- **PostHog** (project `Money2Time`, id `658608`, US Cloud, free plan) receives the curated events below and everything GA4 cannot do: person-level funnels, retention and paths, error tracking with native crashes, masked session replay, feature flags and AI observability for the receipt scanner.

### Provider coverage

| Coverage                                               | Definitions | Meaning                                                                                                 |
| ------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------- |
| All custom events                                      | 120         | Every event in the custom-event tables goes to GA4.                                                     |
| PostHog + GA4 custom events                            | 52          | Install, activation, daily engagement, adoption milestones, the Pro funnel and low-volume moments.      |
| GA4-only custom events                                 | 68          | Frequent per-use telemetry and data maintenance; PostHog sees these uses only through `Feature Used`.   |
| Feature first-use definitions                          | 17          | One adoption event per qualifying feature on eligible installs.                                         |
| Transaction milestone thresholds                       | 6           | One event at each documented logged-transaction count.                                                  |
| Maximum adoption/milestone events per eligible install | 23          | Feature first uses plus transaction milestones, with working persistent storage; not a total event cap. |

Every native app user is identified in both providers with the same pseudonymous `settings.appUserId`; there is no user or event sampling of custom events. PostHog's automatic lifecycle events, screen events, touch autocapture and rage clicks are disabled. GA4 collects its SDK events after identity/consent configuration; manually emitted `screen_view` is documented below and is additional to the 119 custom definitions. RevenueCat server events are listed separately.

### PostHog event budget

The free tier is **1,000,000 product-analytics events a month** (identified events included), with separate free allowances for the other products. On the free plan nothing is billed: once a product's allowance is used up, PostHog stops ingesting that product's data until the month resets, so staying under budget protects month-end data, not money. The organization (`Money2Time`) is on the free plan with no payment method, so every product's billing limit equals its free allowance and spend is fixed at $0. Adding a card would remove those limits; if that ever happens, set every product's billing limit to $0 in Organization → Billing first. Estimates below were re-baselined on **2026-10-19** from PostHog's first week (2026-10-12 to 2026-10-19, while 1.5.13 rolled out): rates per active user measured on the rollout days, scaled to **~5,000 DAU**, and **~5,000 installs a month** (60 to 220 `First App Open` a day; Mixpanel's 19,000 counted far more). Check them against the [budget insight](#live-posthog-dashboards) as the rollout completes.

| Source                                                                   | Estimated events / month | Basis                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Daily App Open`                                                         | 150,000                  | One per active user per day (5,000 × 30).                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Daily Transaction Logged`                                               | 120,000                  | ~80% of users who open the app log that day (measured).                                                                                                                                                                                                                                                                                                                                                                                                |
| `Feature Used`                                                           | 75,000                   | ~0.5 feature-days per active user per day (measured 0.48).                                                                                                                                                                                                                                                                                                                                                                                             |
| Install and onboarding (11 events)                                       | 45,000                   | ~5K installs × ~7 onboarding events, plus first transactions and wage saves.                                                                                                                                                                                                                                                                                                                                                                           |
| Pro funnel (13 events)                                                   | 40,000                   | `Pro Paywall Viewed` ~0.23 per active user per day; purchase, restore and limit events ~5K.                                                                                                                                                                                                                                                                                                                                                            |
| Adoption milestones                                                      | 10,000                   | `Feature First Used` and `Transaction Milestone Reached`; high while existing users first run this build.                                                                                                                                                                                                                                                                                                                                              |
| Scans, sharing, setup, payoff, data, backup and satisfaction (23 events) | 75,000                   | `Receipt Scan Completed` ~0.34 per active user per day; `Auto Backup Failed` capped by the six-hour retry backoff.                                                                                                                                                                                                                                                                                                                                     |
| `$identify` and `$set`                                                   | 30,000                   | One `$identify` per install; `$set` when a person property changes: four on an install's first sync, then theme and Pro changes. Existing users' first sync is a one-off.                                                                                                                                                                                                                                                                              |
| RevenueCat server events                                                 | 3,000                    | Lifecycle events from RevenueCat's PostHog integration (~530 a week measured).                                                                                                                                                                                                                                                                                                                                                                         |
| Prompt fetches (`$llm_prompt_fetched`)                                   | 7,000                    | Logged by PostHog per Worker prompt fetch: about one per prompt per Cloudflare location per 30 minutes. At 5 minutes it measured ~37,000.                                                                                                                                                                                                                                                                                                              |
| Website (`$pageview`, CTA and Web Dashboard events)                      | 5,000                    | Production host only, Do Not Track respected (~500 a week measured before the Web Dashboard). Marketing pages stay anonymous (the dashboard keeps its PostHog state and GA4 cookie on its own host); a linked dashboard identifies as the phone's `appUserId` (one `$identify` per linked browser, then its events are identified). Dashboard events scale with its use: a page view per page shown, one per transfer, one per edit batch; re-measure. |
| **Total**                                                                | **~560,000 (56%)**       | ~44% headroom for growth.                                                                                                                                                                                                                                                                                                                                                                                                                              |

| Other PostHog product               | Free allowance / month              | Expected use                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error tracking (`$exception`)       | 100,000 exceptions                  | Deduplicated and capped on the device at 25 distinct exceptions per 5 minutes.                                                                                                                                                                                                                                 |
| Session replay                      | 2,500 mobile + 5,000 web recordings | App ~1,500 (15% of first-day launches, 0.4% of later ones) against the mobile allowance; the website's 10% sample against the web one. Recordings under 5 s are dropped.                                                                                                                                       |
| AI observability (`$ai_generation`) | 100,000 events                      | One per OpenRouter call from the receipt scanner: ~60,000. Every app version scans through the Worker, so this already counts all users; screenshot scans (~1,700 a day) dominate. Without the screenshot empty-result retry it measured ~85,000. A scan Claude fails adds one generation for the Qwen backup. |
| Feature flags                       | 1,000,000 requests                  | Zero while no flag is active; then about one request per app launch, plus one when an install is first identified.                                                                                                                                                                                             |

Rules that keep it inside the free tier:

- Anything that fires on every use of a frequent action stays GA4-only; PostHog gets one `Feature Used` per feature per user per day instead.
- Daily caps are claimed on the device (`DailyState` in [analytics.shared.ts](apps/mobile/services/analytics.shared.ts)), so foregrounding the app repeatedly sends one `Daily App Open`.
- Person properties are written only when their value changes, compared against the last write stored on the device (`@m2t/analytics_person/v1`); each write is a billable `$set`.
- No `$screen` events, lifecycle events, touch autocapture or rage clicks; a `before_send` allowlist drops any event that is not an approved app event or `$identify`, `$set`, `$exception`, `$feature_flag_called`.
- A new PostHog event needs an estimate added here before it ships. Never sample custom events to save budget; move them to GA4 instead.

### Custom events

The event name is the exact name PostHog receives when the PostHog column is Yes. GA4 receives the exact GA4 name shown for every row. Extra properties list call-site keys; common properties are documented separately. Empty properties means no extra payload, not an event without context. Links identify the current emitters; use the constant to search if code moves.

#### PostHog and GA4: install, activation and onboarding

| Constant                           | Event name                         | GA4 name                               | PostHog | Trigger and frequency                                                                                                                         | Extra properties                                    | Call sites                                                                                                   |
| ---------------------------------- | ---------------------------------- | -------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `FIRST_APP_OPEN`                   | `First App Open`                   | `m2t_first_app_open`                   | Yes     | A newly initialized installation launches; once per fresh install, including a reinstall.                                                     | `locale`, `currency_code`                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                 |
| `ONBOARDING_STARTED`               | `Onboarding Started`               | `m2t_onboarding_started`               | Yes     | The user advances from the onboarding intro; each time that flow runs.                                                                        | None                                                | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_STEP_COMPLETED`        | `Onboarding Step Completed`        | `m2t_onboarding_step_completed`        | Yes     | A step with no outcome event of its own is continued past: `basics` (language, currency, theme) and `wage`; each time that step is continued. | `step`, `currency_code` (basics), `wage_set` (wage) | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_COMPLETED`             | `Onboarding Completed`             | `m2t_onboarding_completed`             | Yes     | Onboarding completes; can repeat after a full data reset.                                                                                     | None                                                | [App.tsx](apps/mobile/App.tsx)                                                                               |
| `ONBOARDING_SOURCE_SELECTED`       | `Onboarding Source Selected`       | `m2t_onboarding_source_selected`       | Yes     | The acquisition-source selection is submitted; each submission.                                                                               | `source`                                            | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_NOTIFICATIONS_ENABLED` | `Onboarding Notifications Enabled` | `m2t_onboarding_notifications_enabled` | Yes     | The notification permission request returns; each request, including denied or error results.                                                 | `permission`                                        | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_NOTIFICATIONS_SKIPPED` | `Onboarding Notifications Skipped` | `m2t_onboarding_notifications_skipped` | Yes     | The notification step is skipped; each skip.                                                                                                  | None                                                | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_BACKUP_ENABLED`        | `Onboarding Backup Enabled`        | `m2t_onboarding_backup_enabled`        | Yes     | Cloud backup is enabled in onboarding; each successful enable action, including pending iCloud setup.                                         | `target`, `pending`                                 | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_BACKUP_SKIPPED`        | `Onboarding Backup Skipped`        | `m2t_onboarding_backup_skipped`        | Yes     | The backup step is skipped; each skip.                                                                                                        | `target`                                            | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `FIRST_TRANSACTION_CREATED`        | `First Transaction Created`        | `m2t_first_transaction_created`        | Yes     | The first expense/income save in a session whose history has neither; may repeat in a later session after a reset or deleting all entries.    | `type`, `source`                                    | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                 |
| `WAGE_CONFIG_UPDATED`              | `Wage Config Updated`              | `m2t_wage_config_updated`              | Yes     | The main wage configuration is saved; every save, with no lifetime cap.                                                                       | `wage_type`                                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                 |

#### PostHog and GA4: daily engagement and adoption

| Constant                        | Event name                      | GA4 name                            | PostHog | Trigger and frequency                                                                                                                                                                 | Extra properties                        | Call sites                                                                                                                             |
| ------------------------------- | ------------------------------- | ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `DAILY_APP_OPEN`                | `Daily App Open`                | `m2t_daily_app_open`                | Yes     | The app becomes ready at launch or returns to the foreground on a local calendar day with no earlier `Daily App Open`; at most once per install per local day.                        | `active_days`, `days_since_last_active` | [services/analytics.native.ts](apps/mobile/services/analytics.native.ts)                                                               |
| `DAILY_TRANSACTION_LOGGED`      | `Daily Transaction Logged`      | `m2t_daily_transaction_logged`      | Yes     | The first expense/income logged through an app entry path on a local calendar day (the same paths as transaction milestones, on every install); at most once per install per day.     | `logging_days`, `type`, `source`        | [services/analytics.native.ts](apps/mobile/services/analytics.native.ts), [context/AppContext.tsx](apps/mobile/context/AppContext.tsx) |
| `FEATURE_USED`                  | `Feature Used`                  | `m2t_feature_used`                  | Yes     | A qualifying feature use (see the feature table) or an Insights tab visit, the first time that feature is used on a local calendar day; at most once per feature per install per day. | `feature`                               | [services/analytics.native.ts](apps/mobile/services/analytics.native.ts)                                                               |
| `FEATURE_FIRST_USED`            | `Feature First Used`            | `m2t_feature_first_used`            | Yes     | A qualifying feature is first used; at most once per feature on installs tracked from first launch (see feature table).                                                               | `feature`                               | [services/analytics.native.ts](apps/mobile/services/analytics.native.ts)                                                               |
| `TRANSACTION_MILESTONE_REACHED` | `Transaction Milestone Reached` | `m2t_transaction_milestone_reached` | Yes     | Logged expenses/incomes reach a documented milestone; at most once per threshold on installs tracked from first launch.                                                               | `count`                                 | [services/analytics.native.ts](apps/mobile/services/analytics.native.ts)                                                               |

#### PostHog and GA4: RiceCal promotion

| Constant             | Event name           | GA4 name                  | PostHog | Trigger and frequency                                                           | Extra properties      | Call sites                                                                                               |
| -------------------- | -------------------- | ------------------------- | ------- | ------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `RICECAL_AD_CLICKED` | `RiceCal Ad Clicked` | `m2t_rice_cal_ad_clicked` | Yes     | The RiceCal ad tile in Settings is tapped; once per tap, including repeat taps. | `source` = `settings` | [features/settings/screens/SettingsScreen.tsx](apps/mobile/features/settings/screens/SettingsScreen.tsx) |

Explicitly requested tracking measures engagement with the RiceCal promotion: one PostHog event per explicit ad tap, with no lifetime cap, sampling or automatic impression event. Opening Settings, rendering or dismissing the popup, and its store/download CTA do not emit this event. The popup opens without waiting for analytics delivery. This event does not qualify for feature adoption or transaction milestones.

#### PostHog and GA4: Pro purchase and restore

| Constant                          | Event name                        | GA4 name                              | PostHog | Trigger and frequency                                                                                                               | Extra properties                                                                                                                               | Call sites                                                                                                         |
| --------------------------------- | --------------------------------- | ------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PRO_PAYWALL_VIEWED`              | `Pro Paywall Viewed`              | `m2t_pro_paywall_viewed`              | Yes     | The paywall opens (or its source changes); each visit, with no lifetime cap.                                                        | `source`, `variant`                                                                                                                            | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PLANS_UNAVAILABLE`           | `Pro Plans Unavailable`           | `m2t_pro_plans_unavailable`           | Yes     | A paywall offering refresh returns no packages; each unsuccessful load, including a retry.                                          | `source`, `variant`                                                                                                                            | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_STARTED`            | `Pro Purchase Started`            | `m2t_pro_purchase_started`            | Yes     | A purchase attempt starts; each attempt.                                                                                            | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`                         | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_COMPLETED`          | `Pro Purchase Completed`          | `m2t_pro_purchase_completed`          | Yes     | Purchase grants active Pro access; each successful attempt, including trials and the restore fallback for an already-owned product. | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`, `period_type`          | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_PENDING`            | `Pro Purchase Pending`            | `m2t_pro_purchase_pending`            | Yes     | The store returns a pending purchase; each pending attempt.                                                                         | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`                         | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_CANCELLED`          | `Pro Purchase Cancelled`          | `m2t_pro_purchase_cancelled`          | Yes     | The user cancels the store purchase sheet; each cancelled attempt.                                                                  | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`                         | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_FAILED`             | `Pro Purchase Failed`             | `m2t_pro_purchase_failed`             | Yes     | The purchase returns a failure; each failed attempt.                                                                                | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`, `reason`, `error_code` | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_RESTORE_STARTED`             | `Pro Restore Started`             | `m2t_pro_restore_started`             | Yes     | Restore purchases is tapped; each restore attempt.                                                                                  | `source`                                                                                                                                       | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_RESTORE_COMPLETED`           | `Pro Restore Completed`           | `m2t_pro_restore_completed`           | Yes     | Restore returns successfully, whether or not Pro was found; each result.                                                            | `source`, `found`                                                                                                                              | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_RESTORE_FAILED`              | `Pro Restore Failed`              | `m2t_pro_restore_failed`              | Yes     | Restore returns a failure; each failed attempt.                                                                                     | `source`, `reason`, `error_code`                                                                                                               | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_LIMIT_HIT`                   | `Pro Limit Hit`                   | `m2t_pro_limit_hit`                   | Yes     | The account-count limit blocks transaction entry behind an alert, each block, before any paywall visit.                             | `type`, `active_account_count`                                                                                                                 | [App.tsx](apps/mobile/App.tsx)                                                                                     |
| `PRO_CANCEL_SUB_PROMPT_ACTIONED`  | `Pro Cancel Sub Prompt Actioned`  | `m2t_pro_cancel_sub_prompt_actioned`  | Yes     | A subscriber who bought Lifetime chooses cancel or not now in the subscription prompt; each choice.                                 | `choice`                                                                                                                                       | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_REDUNDANT_SUB_CANCEL_TAPPED` | `Pro Redundant Sub Cancel Tapped` | `m2t_pro_redundant_sub_cancel_tapped` | Yes     | A Lifetime owner taps cancel for a still-renewing subscription in Pro management; each tap.                                         | None                                                                                                                                           | [features/settings/screens/ProManagementScreen.tsx](apps/mobile/features/settings/screens/ProManagementScreen.tsx) |

#### PostHog and GA4: AI scans, sharing, setup and payoff moments

| Constant                   | Event name                 | GA4 name                       | PostHog | Trigger and frequency                                                                                                                                                                                                                                                                                                       | Extra properties                | Call sites                                                                                                                             |
| -------------------------- | -------------------------- | ------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `RECEIPT_SCAN_COMPLETED`   | `Receipt Scan Completed`   | `m2t_receipt_scan_completed`   | Yes     | The scan returns receipt drafts; each completed scan.                                                                                                                                                                                                                                                                       | `count`, `mode`, `itemCount`    | [context/ReceiptScanContext.tsx](apps/mobile/context/ReceiptScanContext.tsx)                                                           |
| `RECEIPT_SCAN_FAILED`      | `Receipt Scan Failed`      | `m2t_receipt_scan_failed`      | Yes     | Scanning or saving scanned drafts fails; each failure.                                                                                                                                                                                                                                                                      | `code`                          | [context/ReceiptScanContext.tsx](apps/mobile/context/ReceiptScanContext.tsx)                                                           |
| `RECEIPT_SPLIT_ABANDONED`  | `Receipt Split Abandoned`  | `m2t_receipt_split_abandoned`  | Yes     | The user confirms leaving an unsaved itemized split; each confirmed abandonment.                                                                                                                                                                                                                                            | `step`                          | [features/transactions/screens/ReceiptSplitScreen.tsx](apps/mobile/features/transactions/screens/ReceiptSplitScreen.tsx)               |
| `SETTLE_UP_RECEIPT_SHARED` | `Settle Up Receipt Shared` | `m2t_settle_up_receipt_shared` | Yes     | A settlement receipt is shared as an image or text; each successful share, including text fallback.                                                                                                                                                                                                                         | `itemCount`, `hasQr`, `asImage` | [features/transactions/components/SplitReceiptShareModal.tsx](apps/mobile/features/transactions/components/SplitReceiptShareModal.tsx) |
| `AUTOLOG_ALERTS_SETUP`     | `Autolog Alerts Setup`     | `m2t_autolog_alerts_setup`     | Yes     | Android payment-alert setup reaches a step (disclosure shown, system access screen opened, access granted, apps confirmed, current requested test alert read back with a locally extracted amount and configured account; stale or unsolicited results do not complete setup); once per step reached, each time setup runs. | `step`, `platform`, `count`     | [features/autoLog/screens/PaymentAlertsSetupScreen.tsx](apps/mobile/features/autoLog/screens/PaymentAlertsSetupScreen.tsx)             |
| `GOAL_ACHIEVED`            | `Goal Achieved`            | `m2t_goal_achieved`            | Yes     | A goal is marked achieved; each successful state change.                                                                                                                                                                                                                                                                    | None                            | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                           |
| `LOAN_PAID_OFF`            | `Loan Paid Off`            | `m2t_loan_paid_off`            | Yes     | A loan is marked paid off; each successful state change.                                                                                                                                                                                                                                                                    | None                            | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                           |
| `TUTORIAL_OPENED`          | `Tutorial Opened`          | `m2t_tutorial_opened`          | Yes     | A tutorial opens from its list or a deep link; every open.                                                                                                                                                                                                                                                                  | `tutorial`, `source`            | [App.tsx](apps/mobile/App.tsx), [services/deepLinks.ts](apps/mobile/services/deepLinks.ts)                                             |
| `APP_ICON_CHANGED`         | `App Icon Changed`         | `m2t_app_icon_changed`         | Yes     | An alternate app icon is successfully selected; each change.                                                                                                                                                                                                                                                                | `icon`                          | [features/settings/screens/AppIconScreen.tsx](apps/mobile/features/settings/screens/AppIconScreen.tsx)                                 |

#### PostHog and GA4: data, backup and satisfaction

| Constant                             | Event name                           | GA4 name                                 | PostHog | Trigger and frequency                                                                                                                                                                                                            | Extra properties                                            | Call sites                                                                                                             |
| ------------------------------------ | ------------------------------------ | ---------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DATA_IMPORTED`                      | `Data Imported`                      | `m2t_data_imported`                      | Yes     | A Money Manager backup import completes; each completed import. Replacing the ledger also clears local notification reviews and native automation queues.                                                                        | `accounts`, `categories`, `transactions`                    | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                           |
| `STATEMENT_IMPORT_COMPLETED`         | `Statement Import Completed`         | `m2t_statement_import_completed`         | Yes     | A bank statement import finishes; each completed import.                                                                                                                                                                         | `imported_count`, `currency`, `converted`                   | [features/settings/screens/StatementImportScreen.tsx](apps/mobile/features/settings/screens/StatementImportScreen.tsx) |
| `DATA_RESET`                         | `Data Reset`                         | `m2t_data_reset`                         | Yes     | Data is reset for a currency change, full reset, or transaction-only reset; each reset also clears local notification reviews and native automation queues.                                                                      | `scope`                                                     | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                           |
| `AUTO_BACKUP_FAILED`                 | `Auto Backup Failed`                 | `m2t_auto_backup_failed`                 | Yes     | A due backup attempt records provider errors, even if local fallback succeeds; one event per failed/error-bearing attempt. After an automatic run writes nothing, automatic runs pause for six hours (manual backups still run). | `target`, `error_count`, `error_kind`, `fell_back_to_local` | [services/autoBackup.native.ts](apps/mobile/services/autoBackup.native.ts)                                             |
| `CLOUD_BACKUP_PROMPT_SHOWN`          | `Cloud Backup Prompt Shown`          | `m2t_cloud_backup_prompt_shown`          | Yes     | The eligible cloud-backup prompt is shown; each presentation after its eligibility checks.                                                                                                                                       | `transaction_count`                                         | [App.tsx](apps/mobile/App.tsx)                                                                                         |
| `CLOUD_BACKUP_PROMPT_CTA_TAPPED`     | `Cloud Backup Prompt CTA Tapped`     | `m2t_cloud_backup_prompt_cta_tapped`     | Yes     | The cloud-backup prompt CTA opens backup settings; each tap.                                                                                                                                                                     | None                                                        | [App.tsx](apps/mobile/App.tsx)                                                                                         |
| `CLOUD_BACKUP_PROMPT_DISMISSED`      | `Cloud Backup Prompt Dismissed`      | `m2t_cloud_backup_prompt_dismissed`      | Yes     | The cloud-backup prompt is dismissed; each dismissal.                                                                                                                                                                            | None                                                        | [App.tsx](apps/mobile/App.tsx)                                                                                         |
| `REVIEW_PREPROMPT_SHOWN`             | `Review Preprompt Shown`             | `m2t_review_preprompt_shown`             | Yes     | The review preprompt is presented; each presentation after its eligibility checks.                                                                                                                                               | `trigger`                                                   | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                                         |
| `REVIEW_PREPROMPT_HAPPY`             | `Review Preprompt Happy`             | `m2t_review_preprompt_happy`             | Yes     | The happy response is selected; each response.                                                                                                                                                                                   | `trigger`                                                   | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                                         |
| `REVIEW_PREPROMPT_UNHAPPY`           | `Review Preprompt Unhappy`           | `m2t_review_preprompt_unhappy`           | Yes     | The unhappy response is selected; each response.                                                                                                                                                                                 | `trigger`                                                   | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                                         |
| `REVIEW_PREPROMPT_DISMISSED`         | `Review Preprompt Dismissed`         | `m2t_review_preprompt_dismissed`         | Yes     | The review preprompt is dismissed; each dismissal.                                                                                                                                                                               | `trigger`                                                   | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                                         |
| `REVIEW_PREPROMPT_FEEDBACK_OPENED`   | `Review Preprompt Feedback Opened`   | `m2t_review_preprompt_feedback_opened`   | Yes     | The feedback action is selected; each selection.                                                                                                                                                                                 | `trigger`                                                   | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                                         |
| `REVIEW_PREPROMPT_FEEDBACK_DECLINED` | `Review Preprompt Feedback Declined` | `m2t_review_preprompt_feedback_declined` | Yes     | The feedback action is declined; each selection.                                                                                                                                                                                 | `trigger`                                                   | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                                         |

#### GA4 only: widgets and live earnings

| Constant                | Event name              | GA4 name                    | PostHog | Trigger and frequency                                                                                              | Extra properties                    | Call sites                                                                                             |
| ----------------------- | ----------------------- | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `WIDGET_OPENED`         | `Widget Opened`         | `m2t_widget_opened`         | No      | A supported widget/shortcut deep link opens the app; every open, including scheduled live-earnings reminder links. | `widget`, `type`, `source`, `focus` | [services/deepLinks.ts](apps/mobile/services/deepLinks.ts)                                             |
| `LIVE_EARNINGS_STARTED` | `Live Earnings Started` | `m2t_live_earnings_started` | No      | A Live Activity start succeeds through the app hook; every start recorded by that hook.                            | `hours`, `startedMinutesAgo`        | [features/widgets/useLiveEarningsActivity.ts](apps/mobile/features/widgets/useLiveEarningsActivity.ts) |
| `LIVE_EARNINGS_STOPPED` | `Live Earnings Stopped` | `m2t_live_earnings_stopped` | No      | The running Live Activity is stopped through the app hook; every stop recorded by that hook.                       | None                                | [features/widgets/useLiveEarningsActivity.ts](apps/mobile/features/widgets/useLiveEarningsActivity.ts) |

#### GA4 only: transactions and shortcuts

| Constant                      | Event name                    | GA4 name                          | PostHog | Trigger and frequency                                                                                                                          | Extra properties                                  | Call sites                                                   |
| ----------------------------- | ----------------------------- | --------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `VOICE_TRANSACTION_CREATED`   | `Voice Transaction Created`   | `m2t_voice_transaction_created`   | No      | A transaction from voice entry is persisted; each saved transaction.                                                                           | `type`, `has_category`, `has_note`, `sentiment`   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx) |
| `AUTOLOG_TRANSACTION_CREATED` | `Autolog Transaction Created` | `m2t_autolog_transaction_created` | No      | An Apple Pay tap (Log Card Payment) saves automatically, or a notification review explicitly saves income/expense; each persisted transaction. | `has_category`, `has_note`, `channel`, `decision` | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx) |
| `BACK_TAP_TRIGGERED`          | `Back Tap Triggered`          | `m2t_back_tap_triggered`          | No      | An iOS Back Tap deep link opens an action; every open.                                                                                         | `action`                                          | [services/deepLinks.ts](apps/mobile/services/deepLinks.ts)   |
| `TRANSACTION_DELETED`         | `Transaction Deleted`         | `m2t_transaction_deleted`         | No      | A successful deletion request targets one transaction; each request.                                                                           | `count`                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx) |
| `TRANSACTIONS_BULK_DELETED`   | `Transactions Bulk Deleted`   | `m2t_transactions_bulk_deleted`   | No      | A successful deletion request targets multiple transactions; one event per request, with requested count.                                      | `count`                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx) |

#### GA4 only: payment alerts

Bank and wallet notifications (Android listener) and the Log Notification Shortcuts action (iOS) now create an entirely local review queue. No notification content is sent to AI, receipt scanning, entitlement checks or scanner quotas. Code extracts monetary candidates with or without a currency symbol; unlabelled numbers use the configured account currency without classifying relevance, completion or direction. The user chooses Income, Expense or Ignore, individually or in bulk. Multiple/no amounts require a selection or manual correction before an income/expense can be saved. Explicitly reviewed saves use `source = notification_review` and `decision = confirm`, with a synchronous database commit and capture link; they have no free-tier limit: no automatic-log usage and no free account-count gate. Apple Pay automatic logging keeps its own allowance and behavior, not shared with notifications. A configured iOS shortcut supplies its account directly; Android keeps notification access, the master switch and selected apps. Compact review cards use the configured account and detected currency, without editing controls. The pencil opens the full transaction editor, where users can correct transaction fields; saving completes the original capture through the same durable guard. Categories reuse the Apple Pay keyword mapping after a valid explicit preset and before Quick Entry defaults; this local suggestion emits no event. Missing/deleted accounts cannot save and can be ignored. The inline home action sits below the calendar income/expense summary alongside receipt-scan status, appears in the day view outside search, and shows the pending count on launch/foreground/live capture; dismissing the action keeps items pending. Leaving the root Notification History page warns that unfinished items will be ignored and requires confirmation; cancellation keeps the page open. History retains all pending items plus the latest 10 completed items locally; pending items never expire or silently drop. Data resets clear/invalidate the queue; identity changes cancel old capture/review work. Setup samples stay out of history. Notification text, candidates, amounts and review history never enter telemetry. Only successful user-confirmed saves emit save/activation/adoption/milestone telemetry. Capture IDs and durable links prevent replaying a reviewed capture; independent notifications remain the user's decisions.

| Constant                 | Event name               | GA4 name                     | PostHog | Trigger and frequency                                                                                                                                                                                                                                                                                                                                                                   | Extra properties                                                                       | Call sites                                                                                                       |
| ------------------------ | ------------------------ | ---------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `AUTOLOG_ALERTS_DRAINED` | `Autolog Alerts Drained` | `m2t_autolog_alerts_drained` | No      | A drain stores at least one new or retried queued alert (Android listener or Log Notification); once per drain round, run on foreground and whenever the listener queues an alert while the app is open. Valid captures become pending reviews and never auto-save; disabled Android sources count as ignored. Storage failures remain in the native queue and do not count as handled. | `captured`, `pending`, `logged`, `ignored`, `duplicates`, `account_certain`, `channel` | [features/autoLog/components/PaymentAlertSync.tsx](apps/mobile/features/autoLog/components/PaymentAlertSync.tsx) |

#### GA4 only: receipt scanning and itemized splits

| Constant                 | Event name               | GA4 name                     | PostHog | Trigger and frequency                                                   | Extra properties                                      | Call sites                                                                                                               |
| ------------------------ | ------------------------ | ---------------------------- | ------- | ----------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `RECEIPT_SCAN_STARTED`   | `Receipt Scan Started`   | `m2t_receipt_scan_started`   | No      | A scan is started from camera or picker; each start.                    | `source`, `intent`                                    | [context/ReceiptScanContext.tsx](apps/mobile/context/ReceiptScanContext.tsx)                                             |
| `RECEIPT_SCAN_SAVED`     | `Receipt Scan Saved`     | `m2t_receipt_scan_saved`     | No      | Scanned drafts finish saving as transactions; one event per save batch. | `count`                                               | [context/ReceiptScanContext.tsx](apps/mobile/context/ReceiptScanContext.tsx)                                             |
| `RECEIPT_SPLIT_STARTED`  | `Receipt Split Started`  | `m2t_receipt_split_started`  | No      | The itemized split creation flow mounts; each entry.                    | `entryPoint`, `entryMode`                             | [features/transactions/screens/ReceiptSplitScreen.tsx](apps/mobile/features/transactions/screens/ReceiptSplitScreen.tsx) |
| `RECEIPT_SPLIT_SAVED`    | `Receipt Split Saved`    | `m2t_receipt_split_saved`    | No      | An itemized receipt split is saved; each creation or edit.              | `itemCount`, `personCount`, `sharedItemCount`, `mode` | [features/transactions/screens/ReceiptSplitScreen.tsx](apps/mobile/features/transactions/screens/ReceiptSplitScreen.tsx) |
| `RECEIPT_SPLIT_REOPENED` | `Receipt Split Reopened` | `m2t_receipt_split_reopened` | No      | The itemized split edit flow mounts; each entry.                        | `entryPoint`, `entryMode`                             | [features/transactions/screens/ReceiptSplitScreen.tsx](apps/mobile/features/transactions/screens/ReceiptSplitScreen.tsx) |

#### GA4 only: settlement and reimbursements

| Constant                              | Event name                            | GA4 name                                  | PostHog | Trigger and frequency                                                                                                                                                 | Extra properties                          | Call sites                                                                                                                                     |
| ------------------------------------- | ------------------------------------- | ----------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPLIT_BILL_CREATED`                  | `Split Bill Created`                  | `m2t_split_bill_created`                  | No      | A Pay First transaction gains a non-self share on creation or edit; one event per qualifying mutation.                                                                | `people`                                  | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `SPLIT_MARKED_PAID`                   | `Split Marked Paid`                   | `m2t_split_marked_paid`                   | No      | A split share is settled; each successful settlement.                                                                                                                 | `payback_account_changed`, `same_account` | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `SPLIT_MARKED_UNPAID`                 | `Split Marked Unpaid`                 | `m2t_split_marked_unpaid`                 | No      | A settled split share is reopened; each successful action.                                                                                                            | None                                      | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `SETTLE_UP_QR_SET`                    | `Settle Up Payment QR Set`            | `m2t_settle_up_payment_qr_set`            | No      | The payment QR setting is saved with an image; each save.                                                                                                             | None                                      | [features/transactions/screens/SettleUpSettingsScreen.tsx](apps/mobile/features/transactions/screens/SettleUpSettingsScreen.tsx)               |
| `REIMBURSEMENT_FLAGGED`               | `Reimbursement Flagged`               | `m2t_reimbursement_flagged`               | No      | The transaction editor toggles reimbursable; each toggle, before the transaction is saved. A Web Dashboard edit that sets or clears it reports once its save has run. | `reimbursable`                            | [features/transactions/components/TransactionEditorScreen.tsx](apps/mobile/features/transactions/components/TransactionEditorScreen.tsx)       |
| `REIMBURSEMENT_MARKED_PAID`           | `Reimbursement Marked Paid`           | `m2t_reimbursement_marked_paid`           | No      | A reimbursement is settled; each successful action.                                                                                                                   | `same_account`                            | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `REIMBURSEMENT_REOPENED`              | `Reimbursement Reopened`              | `m2t_reimbursement_reopened`              | No      | A settled reimbursement is reopened; each successful action.                                                                                                          | None                                      | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `REIMBURSEMENT_COUNT_SETTING_CHANGED` | `Reimbursement Count Setting Changed` | `m2t_reimbursement_count_setting_changed` | No      | Whether reimbursements count as expenses is toggled; each change.                                                                                                     | `counts`                                  | [features/reimbursements/screens/ReimbursementSettingsScreen.tsx](apps/mobile/features/reimbursements/screens/ReimbursementSettingsScreen.tsx) |

#### GA4 only: accounts, goals, loans and categories

| Constant                     | Event name                   | GA4 name                         | PostHog | Trigger and frequency                                                                                                                                                     | Extra properties                                                                                                     | Call sites                                                                                                               |
| ---------------------------- | ---------------------------- | -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ACCOUNT_CREATED`            | `Account Created`            | `m2t_account_created`            | No      | An account is created through AppContext; each creation (goal/loan flows can also emit their own event).                                                                  | `type`                                                                                                               | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                             |
| `ACCOUNT_DELETED`            | `Account Deleted`            | `m2t_account_deleted`            | No      | An account is deleted; each successful deletion.                                                                                                                          | None                                                                                                                 | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                             |
| `ACCOUNT_CARD_DESIGN_CHOSEN` | `Account Card Design Chosen` | `m2t_account_card_design_chosen` | No      | The card design picker's apply button is tapped with a choice different from the one it opened with; once per apply (the account itself is saved later, from its editor). | `designKind` (`template`, `custom` or `plain`), `genre` (template genre or `none`), `design` (template id or `none`) | [features/settings/screens/CardDesignPickerScreen.tsx](apps/mobile/features/settings/screens/CardDesignPickerScreen.tsx) |
| `CARD_DESIGN_UPLOADED`       | `Card Design Uploaded`       | `m2t_card_design_uploaded`       | No      | A Pro user saves a cropped photo as a card design; each saved upload.                                                                                                     | `textTone` (`light` or `dark`)                                                                                       | [features/settings/screens/CardDesignPickerScreen.tsx](apps/mobile/features/settings/screens/CardDesignPickerScreen.tsx) |
| `GOAL_CREATED`               | `Goal Created`               | `m2t_goal_created`               | No      | A savings goal is saved from its editor; each creation (also from the Web Dashboard).                                                                                     | `hasTargetDate`, `hasAutoSave`, `hasCover`                                                                           | [features/goals/screens/GoalEditorScreen.tsx](apps/mobile/features/goals/screens/GoalEditorScreen.tsx)                   |
| `GOAL_UPDATED`               | `Goal Updated`               | `m2t_goal_updated`               | No      | A savings goal edit is saved; each update (also from the Web Dashboard).                                                                                                  | None                                                                                                                 | [features/goals/screens/GoalEditorScreen.tsx](apps/mobile/features/goals/screens/GoalEditorScreen.tsx)                   |
| `GOAL_DEPOSIT_OPENED`        | `Goal Deposit Opened`        | `m2t_goal_deposit_opened`        | No      | The goal deposit flow is opened; every open.                                                                                                                              | `source`                                                                                                             | [features/goals/screens/GoalDetailScreen.tsx](apps/mobile/features/goals/screens/GoalDetailScreen.tsx)                   |
| `GOAL_WITHDRAW_OPENED`       | `Goal Withdraw Opened`       | `m2t_goal_withdraw_opened`       | No      | The goal withdrawal flow is opened; every open.                                                                                                                           | `target`                                                                                                             | [features/goals/screens/GoalDetailScreen.tsx](apps/mobile/features/goals/screens/GoalDetailScreen.tsx)                   |
| `GOAL_ARCHIVED`              | `Goal Archived`              | `m2t_goal_archived`              | No      | A goal is archived; each successful action.                                                                                                                               | None                                                                                                                 | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                             |
| `GOAL_UNARCHIVED`            | `Goal Unarchived`            | `m2t_goal_unarchived`            | No      | A goal is restored from archive; each successful action.                                                                                                                  | None                                                                                                                 | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                             |
| `LOAN_CREATED`               | `Loan Created`               | `m2t_loan_created`               | No      | A loan account is saved from account settings; each creation (also from the Web Dashboard).                                                                               | `interestModel`, `hasRate`, `hasCollectAccount`, `countsAsExpense`, `currency`                                       | [features/settings/screens/AccountsScreen.tsx](apps/mobile/features/settings/screens/AccountsScreen.tsx)                 |
| `LOAN_PAYMENT_RECORDED`      | `Loan Payment Recorded`      | `m2t_loan_payment_recorded`      | No      | A manual loan payment is recorded; each successful payment.                                                                                                               | `source`                                                                                                             | [features/settings/screens/AccountsScreen.tsx](apps/mobile/features/settings/screens/AccountsScreen.tsx)                 |
| `LOAN_ARCHIVED`              | `Loan Archived`              | `m2t_loan_archived`              | No      | A loan is archived; each successful action.                                                                                                                               | None                                                                                                                 | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                             |
| `LOAN_UNARCHIVED`            | `Loan Unarchived`            | `m2t_loan_unarchived`            | No      | A loan is restored from archive; each successful action.                                                                                                                  | None                                                                                                                 | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                             |
| `CATEGORY_CREATED`           | `Category Created`           | `m2t_category_created`           | No      | A category is created; each successful creation.                                                                                                                          | `type`                                                                                                               | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                             |
| `CATEGORY_DELETED`           | `Category Deleted`           | `m2t_category_deleted`           | No      | A category is deleted, optionally reassigning its transactions; each successful deletion.                                                                                 | `reassigned`                                                                                                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                             |

#### GA4 only: albums, budgets, items and recurring rules

| Constant                  | Event name                | GA4 name                      | PostHog | Trigger and frequency                                                                                                                                                      | Extra properties                       | Call sites                                                                                               |
| ------------------------- | ------------------------- | ----------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ALBUM_CREATED`           | `Album Created`           | `m2t_album_created`           | No      | An album is created; each successful creation.                                                                                                                             | `transactionCount`                     | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ALBUM_UPDATED`           | `Album Updated`           | `m2t_album_updated`           | No      | Album details are updated; each successful update.                                                                                                                         | None                                   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ALBUM_DELETED`           | `Album Deleted`           | `m2t_album_deleted`           | No      | An album is deleted; each successful deletion.                                                                                                                             | None                                   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ALBUM_LOCATION_SET`      | `Album Location Set`      | `m2t_album_location_set`      | No      | An album location is set or cleared; each successful change.                                                                                                               | `cleared`                              | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ALBUM_LOCATIONS_OPENED`  | `Album Locations Opened`  | `m2t_album_locations_opened`  | No      | The album map panel opens; each panel mount.                                                                                                                               | `count`                                | [features/albums/components/AlbumMapPanel.tsx](apps/mobile/features/albums/components/AlbumMapPanel.tsx) |
| `BUDGET_TEMPLATE_CREATED` | `Budget Template Created` | `m2t_budget_template_created` | No      | A reusable budget template is created; each successful creation.                                                                                                           | `categories`, `backPopulate`, `period` | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_TEMPLATE_UPDATED` | `Budget Template Updated` | `m2t_budget_template_updated` | No      | A reusable budget template is updated; each successful update.                                                                                                             | `categories`, `period`                 | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_TEMPLATE_DELETED` | `Budget Template Deleted` | `m2t_budget_template_deleted` | No      | A budget template is deleted; each successful deletion.                                                                                                                    | None                                   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_DEFAULT_CHANGED`  | `Budget Default Changed`  | `m2t_budget_default_changed`  | No      | A period's default budget template is changed; each successful action.                                                                                                     | None                                   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_MONTH_CREATED`    | `Budget Month Created`    | `m2t_budget_month_created`    | No      | A week's, month's or year's budget is created automatically (one event per period made), manually, custom, or by backfill; backfill is one aggregate event with the count. | `source`, `period`, `months`           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_MONTH_UPDATED`    | `Budget Month Updated`    | `m2t_budget_month_updated`    | No      | A week's, month's or year's budget is updated; each successful update.                                                                                                     | `categories`, `period`                 | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_MONTH_DELETED`    | `Budget Month Deleted`    | `m2t_budget_month_deleted`    | No      | A week's, month's or year's budget is deleted; each successful deletion.                                                                                                   | `period`                               | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ITEM_CREATED`            | `Item Created`            | `m2t_item_created`            | No      | An owned item is created; each successful creation.                                                                                                                        | None                                   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `RECURRING_RULE_CREATED`  | `Recurring Rule Created`  | `m2t_recurring_rule_created`  | No      | A recurring rule is created; each successful creation.                                                                                                                     | `type`, `pattern`                      | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `RECURRING_RULE_UPDATED`  | `Recurring Rule Updated`  | `m2t_recurring_rule_updated`  | No      | A recurring rule is updated; each successful update.                                                                                                                       | None                                   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `RECURRING_RULE_DELETED`  | `Recurring Rule Deleted`  | `m2t_recurring_rule_deleted`  | No      | A recurring rule is deleted; each successful deletion.                                                                                                                     | None                                   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |

#### GA4 only: tutorials, settings, backup and review

| Constant                      | Event name                    | GA4 name                          | PostHog | Trigger and frequency                                                                                                                  | Extra properties              | Call sites                                                                                                   |
| ----------------------------- | ----------------------------- | --------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `TUTORIAL_LIST_OPENED`        | `Tutorial List Opened`        | `m2t_tutorial_list_opened`        | No      | The tutorial list opens from settings or a deep link; every open.                                                                      | `source`                      | [App.tsx](apps/mobile/App.tsx), [services/deepLinks.ts](apps/mobile/services/deepLinks.ts)                   |
| `DISPLAY_MODE_TOGGLED`        | `Display Mode Toggled`        | `m2t_display_mode_toggled`        | No      | Display switches between money and time; each toggle.                                                                                  | `mode`                        | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                 |
| `NAV_TABS_CHANGED`            | `Nav Tabs Changed`            | `m2t_nav_tabs_changed`            | No      | A page is added to, removed from or reordered in the bottom bar, or the bar is reset, in Settings > Display > Bottom bar; each change. | `change`, `tabs`, `tab_count` | [features/settings/screens/BottomBarScreen.tsx](apps/mobile/features/settings/screens/BottomBarScreen.tsx)   |
| `AUTO_BACKUP_RESTORED`        | `Auto Backup Restored`        | `m2t_auto_backup_restored`        | No      | An auto-backup is restored; each successful restore.                                                                                   | `target`                      | [services/autoBackup.native.ts](apps/mobile/services/autoBackup.native.ts)                                   |
| `AUTO_BACKUP_DELETED`         | `Auto Backup Deleted`         | `m2t_auto_backup_deleted`         | No      | An auto-backup is deleted; each successful deletion.                                                                                   | `target`                      | [services/autoBackup.native.ts](apps/mobile/services/autoBackup.native.ts)                                   |
| `AUTO_BACKUP_SETTING_TOGGLED` | `Auto Backup Setting Toggled` | `m2t_auto_backup_setting_toggled` | No      | Auto-backup is enabled or disabled in settings; each toggle.                                                                           | `enabled`                     | [features/settings/screens/AutoBackupScreen.tsx](apps/mobile/features/settings/screens/AutoBackupScreen.tsx) |
| `AUTO_BACKUP_TARGET_CHANGED`  | `Auto Backup Target Changed`  | `m2t_auto_backup_target_changed`  | No      | The auto-backup target is selected in settings; each change.                                                                           | `target`                      | [features/settings/screens/AutoBackupScreen.tsx](apps/mobile/features/settings/screens/AutoBackupScreen.tsx) |
| `REVIEW_PROMPT_MANUAL_OPENED` | `Review Prompt Manual Opened` | `m2t_review_prompt_manual_opened` | No      | The manual review entry point is used; every use.                                                                                      | None                          | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                               |

#### GA4 only: Web Dashboard

| Constant                    | Event name                  | GA4 name                        | PostHog | Trigger and frequency                                                                                                                           | Extra properties          | Call sites                                                                                                       |
| --------------------------- | --------------------------- | ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `WEB_DASHBOARD_LINKED`      | `Web Dashboard Linked`      | `m2t_web_dashboard_linked`      | No      | A browser link is confirmed on the phone and then on the browser (after scanning its QR code or opening a `money2time://pair` link); each link. | None                      | [services/webDashboard.native.ts](apps/mobile/services/webDashboard.native.ts)                                   |
| `WEB_DASHBOARD_UNLINKED`    | `Web Dashboard Unlinked`    | `m2t_web_dashboard_unlinked`    | No      | A linked browser is unlinked from this phone's Web Dashboard screen; each unlink (not when the browser unlinks itself).                         | None                      | [services/webDashboard.native.ts](apps/mobile/services/webDashboard.native.ts)                                   |
| `WEB_DASHBOARD_SENT`        | `Web Dashboard Sent`        | `m2t_web_dashboard_sent`        | No      | Data reaches a linked browser and opens there; each transfer (when the browser asks on opening, on Refresh, on Send now, or after an edit).     | `trigger`, `payload`      | [services/webDashboard.native.ts](apps/mobile/services/webDashboard.native.ts)                                   |
| `WEB_DASHBOARD_SEND_FAILED` | `Web Dashboard Send Failed` | `m2t_web_dashboard_send_failed` | No      | A transfer to a linked browser fails; each failed attempt.                                                                                      | `reason`                  | [services/webDashboard.native.ts](apps/mobile/services/webDashboard.native.ts)                                   |
| `WEB_DASHBOARD_EDITED`      | `Web Dashboard Edited`      | `m2t_web_dashboard_edited`      | No      | A batch of changes from a linked browser is saved or refused (including `busy`, past 4 waiting); each batch.                                    | `result`, `kind`, `count` | [services/webDashboard.native.ts](apps/mobile/services/webDashboard.native.ts)                                   |
| `WEB_DASHBOARD_OPENED`      | `Web Dashboard Opened`      | `m2t_web_dashboard_opened`      | No      | Open app.money2time.com is tapped in Web Dashboard settings; each tap.                                                                          | None                      | [features/settings/screens/WebDashboardScreen.tsx](apps/mobile/features/settings/screens/WebDashboardScreen.tsx) |

`First Transaction Created` captures history before the first expense/income attempt in each session and claims the event only after persistence succeeds. Failed saves leave the next successful save eligible; overlapping saves claim it once. It can repeat in a later session after a reset or deleting all entries. Use unique-user funnels rather than treating it as a durable once-per-install event. The guard lives in [firstTransactionSignal](apps/mobile/utils/firstTransactionSignal.ts).

### Common event context

| Property                      | PostHog                                                              | GA4                                                            | Source and condition                                                                                                |
| ----------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `current_screen`              | Event property                                                       | Event parameter                                                | Visible React Navigation screen at the action, when known. Milestones preserve the originating screen.              |
| `days_since_install`          | Event property                                                       | Event parameter                                                | Whole 24-hour periods from `settings.firstAppOpen`, when readable; minimum 0.                                       |
| Stable settings and Pro state | Super properties on events, mirrored to the person                   | User properties, not automatically copied into custom payloads | See the user-state table.                                                                                           |
| `app_variant`                 | Super property on every event                                        | None                                                           | `production`, `preview` or `development` from the EAS build profile; the test-account filter excludes the last two. |
| SDK context                   | `$app_version`, `$os`, `$device_model`, `$session_id`, GeoIP country | SDK-managed                                                    | Added by each SDK. PostHog discards the IP address after GeoIP lookup (project setting).                            |
| `debug_mode`                  | Not added                                                            | Default parameter `1` in development                           | Set during Firebase configuration; production explicitly clears the persisted key with `{ debug_mode: null }`.      |

The central GA4 converter normalizes property names to snake case, so `itemCount` becomes `item_count`, `startedMinutesAgo` becomes `started_minutes_ago`, and `hasQr` becomes `has_qr`. It drops null/undefined and non-finite numbers, converts booleans to 1/0 for event parameters, limits event parameters to 25, caps names at 40 characters and string values at 100. GA4 user properties are strings with name/value caps of 24/36 characters and at most 25 properties per call. PostHog receives the original property keys and values, minus undefined ones. Event names use `m2t_` snake case in GA4; tests reject collisions or truncation.

No transaction amounts, balances, notes, merchant text, receipt images, person names, account/category names, email addresses or advertising IDs are explicitly sent in these payloads. `price` is the store's subscription price; `currency` in purchase events is its currency. Usage payloads contain counts, flags and controlled identifiers. SDK-added metadata is outside these explicit payload tables.

### Property values

| Field / events                                                | Values and meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding acquisition `source`                               | `xiaohongshu`, `reddit`, `instagram`, `facebook`, `tiktok`, `app_store`, `google_play`, `threads`, `friends_family`, `other`. Also written to `acquisition_source`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| First transaction `type`, `source`                            | Expense/income; `manual`, `voice`, `receipt`, `autolog`, `notification_review`, `split`, `receipt_split`, `statement_import` or `web_dashboard` (added in a linked browser) when that creation path emits it. Bulk statement/backup import code does not itself emit this event.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Notification `permission`                                     | The permission result, including `granted`, `denied`, `undetermined` or `error`. Enabled names the attempted action, not guaranteed permission.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Backup `target`, `pending`                                    | `local`, `icloud`, `googleDrive` where supported; onboarding uses the platform cloud target. `pending` means enabled before the cloud is ready.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Paywall `variant`                                             | `plans`, `lifetime_upgrade`, `already_pro`; captured at open. Filter free-to-Pro conversion on `plans`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Purchase base properties                                      | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`; `plan_selection` is `default` or `changed` when a choice exists; `upgrade_from` appears for an existing subscriber. Nullable values are omitted in GA4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Purchase `period_type`                                        | Store-granted period: `trial`, `intro`, `normal`, `prepaid` when available. `has_free_trial` says a trial was offered; `period_type: trial` confirms one started.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Purchase/restore `reason`, `error_code`                       | Action status and RevenueCat's readable error name when present; no raw error message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Pro limit `type`                                              | Currently `accounts_transaction` only; gates opening the paywall directly use its view event instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Subscription prompt `choice`                                  | `cancel` or `not_now`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Widget `widget`, `source`                                     | `quick_add`, `budget`, `live_earnings` or the parsed supported widget action. `source: schedule` is the reminder path and is excluded from widget adoption. `type` and `focus` are conditional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Auto-log `channel`, `decision`                                | `channel`: `apple_pay` (Log Card Payment), `android_notification`, or `ios_alert` (Log Notification). `decision`: `auto` for Apple Pay or `confirm` for an explicit notification Income/Expense decision. Notifications never save on capture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Alert setup `step`, `platform`, `count`                       | `disclosure_viewed`, `settings_opened`, `access_granted`, `source_added`, `test_passed`. `platform` is `android`; iOS setup is the Shortcuts tutorial. `count` (watched apps) only on `source_added`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Alerts drained counts, `channel`                              | Per-round counts of durably handled captures, logged, ignored and duplicate alerts; `account_certain` counts explicitly selected accounts. `channel` is the round's first alert. Failed storage is left queued for automatic retry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Budget-month `source`, `period`, `months`                     | `source`: `auto`, `manual`, `custom`, `backfill`. `period` (also on template and budget update/delete events): `week`, `month` or `year`. `months` is present for aggregate backfill and counts the periods made, whatever their length (the name predates weekly and yearly budgets).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Tutorial `source`                                             | List: `settings` or `link`; detail: `list` or `link`. `tutorial` is the registry ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Bottom bar `change`, `tabs`, `tab_count`                      | `change`: `add`, `remove`, `reorder` or `reset`. `tabs`: the bar after the change, comma-separated tab names in order (`calendar`, `accounts`, `insights`, `albums`, `settings`, `goals`, `recurring`, `reimbursements`, `receipts`, `settleUp`). `tab_count`: 2 to 5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Data reset `scope`                                            | `all`, `transactions_only`, `currency_change`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Onboarding step `step`, `wage_set`                            | `basics` (with the chosen `currency_code`) or `wage` (with whether a wage is set). The backup, source and notification steps have their own outcome events.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Daily `active_days`, `days_since_last_active`                 | Lifetime count of days with a `Daily App Open` on this install, including today; whole calendar days since the previous one, null on the first. Counted from this release, not from install.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Daily `logging_days`, `type`, `source`                        | Lifetime count of days with a `Daily Transaction Logged`; the first logged entry's type and entry path, as in `First Transaction Created`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Feature Used `feature`                                        | A product feature from the feature table, or `insights` for an Insights tab visit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Review `trigger`                                              | `transaction_milestone`, `insights_view`, `pro_purchase`, `manual`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Web Dashboard `trigger`, `payload`, `result`, `kind`, `count` | Sent `trigger`: `browser_opened`, `refresh` (also a browser asking for everything after a patch it could not apply), `manual` (Send now) or `edit` (after a saved or partly saved edit, a refused stale or conflicting one, or a change to this browser's permission); Sent `payload`: `full` (the whole export) or `patch` (only what changed since the copy the browser holds). Edited `result`: `applied`, `stale`, `conflict`, `amount_locked`, `pro_required`, `off`, `invalid`, `failed`, `busy` or `unknown`; on `applied` only, `kind` is the entity and operation (`transaction_update`, `account_create`, `group_delete`, `category_update`, `recurring_create`, and for modules `goal_archive`, `loan_update`, `budget_template_create`, `split_settle`, `reimbursement_mark`, `wage_create`, `currency_add`, `reorder_accounts`, …) or `mixed`, and `count` the entries changed. Entries a browser adds, split bills included, report `source: web_dashboard` in `First Transaction Created` and `Daily Transaction Logged`. Send Failed `reason`: a `WebDashboardErrorCode` (`timeout`, `offline`, `closed`, `rejected`, `too_large`, `failed`, …; `services/webDashboard.shared.ts`). |

### Feature adoption

A qualifying per-use event goes to GA4 (and to PostHog when its own row says so). The first use each local day sends `Feature Used` to both providers. The first qualifying use ever adds the feature to the PostHog person's `features_used` list on every install. Only installs tracked since `First App Open` additionally send `Feature First Used` to both providers. An Insights tab visit counts as the `insights` feature for `Feature Used` only; it is not a first-use feature. The JSON columns specify positive and excluded contexts for the sync test; `{}` means no extra condition and `[]` means no exclusions.

| Feature           | Trigger constant              | Qualifying properties   | Excluded properties           | Use being counted                                                        |
| ----------------- | ----------------------------- | ----------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `receipt_scan`    | `RECEIPT_SCAN_COMPLETED`      | `{}`                    | `[]`                          | Receipt scan returned drafts.                                            |
| `voice_entry`     | `VOICE_TRANSACTION_CREATED`   | `{}`                    | `[]`                          | Voice transaction saved.                                                 |
| `autolog`         | `AUTOLOG_TRANSACTION_CREATED` | `{}`                    | `[]`                          | Apple Pay automatic save or an explicitly confirmed notification review. |
| `back_tap`        | `BACK_TAP_TRIGGERED`          | `{}`                    | `[]`                          | Back Tap opened an app action.                                           |
| `widget`          | `WIDGET_OPENED`               | `{}`                    | `[{"source":"schedule"}]`     | Widget/shortcut opened the app, excluding the scheduled reminder.        |
| `live_earnings`   | `LIVE_EARNINGS_STARTED`       | `{}`                    | `[]`                          | App hook started a Live Activity.                                        |
| `time_display`    | `DISPLAY_MODE_TOGGLED`        | `{"mode":"time"}`       | `[{"mode":"money"},{}]`       | Switched to time display.                                                |
| `split_bill`      | `SPLIT_BILL_CREATED`          | `{}`                    | `[]`                          | Added a share owed by another person.                                    |
| `split_by_item`   | `RECEIPT_SPLIT_SAVED`         | `{}`                    | `[]`                          | Itemized receipt split saved.                                            |
| `settle_up_share` | `SETTLE_UP_RECEIPT_SHARED`    | `{}`                    | `[]`                          | Settlement receipt shared.                                               |
| `reimbursements`  | `REIMBURSEMENT_FLAGGED`       | `{"reimbursable":true}` | `[{"reimbursable":false},{}]` | Expense flagged reimbursable in the editor.                              |
| `recurring`       | `RECURRING_RULE_CREATED`      | `{}`                    | `[]`                          | Recurring rule created.                                                  |
| `goals`           | `GOAL_CREATED`                | `{}`                    | `[]`                          | Goal created.                                                            |
| `loans`           | `LOAN_CREATED`                | `{}`                    | `[]`                          | Loan created.                                                            |
| `budgets`         | `BUDGET_TEMPLATE_CREATED`     | `{}`                    | `[]`                          | Budget template created.                                                 |
| `albums`          | `ALBUM_CREATED`               | `{}`                    | `[]`                          | Album created.                                                           |
| `items`           | `ITEM_CREATED`                | `{}`                    | `[]`                          | Owned item created.                                                      |

Usage state lives in AsyncStorage at `@m2t/analytics_usage/v1` and daily state at `@m2t/analytics_daily/v1`; both survive in-app data resets. Reinstalling starts a new install. With unreadable state, the app suppresses first-use/milestone claims; failed persistence can allow duplicate firsts after relaunch.

### Transaction milestones

Count only expenses/incomes logged through app entry paths (the same paths feed `Daily Transaction Logged` on every install): manual, voice, receipt, auto-log (Apple Pay taps and automatically logged payment alerts), split and itemized split. Transfers, balance adjustments, recurring-rule-generated rows, statement/backup imports and restores do not increment this counter. Deleting or resetting financial data does not decrement it.

| Count | Maximum events per eligible install at this threshold |
| ----- | ----------------------------------------------------- |
| 10    | 1                                                     |
| 50    | 1                                                     |
| 100   | 1                                                     |
| 250   | 1                                                     |
| 500   | 1                                                     |
| 1000  | 1                                                     |

### User state and identity

These are person/user-property operations, not custom-event rows. PostHog super properties attach to subsequent PostHog events locally and cost nothing; person properties are written with `$set` only when they change. Their GA4 mirrors are user properties.

| Property / identity      | PostHog destination                                              | GA4 destination                           | Update rule                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appUserId`              | Distinct ID through `identify` (one `$identify` per install)     | User ID                                   | Pseudonymous `m2t_<UUID>`; shared with RevenueCat, preserved on reset/restore, rotated on reinstall. Sent to linked Web Dashboard browsers (`meta.analyticsId`), which identify as the same person and user (one `$identify` per linked browser). |
| `$firebaseAppInstanceId` | RevenueCat subscriber attribute, not a PostHog property          | Actual Firebase Analytics installation ID | Written after RevenueCat login and analytics readiness; acknowledged by the attributes endpoint before purchases/restores; production only; missing/failed writes retry.                                                                          |
| `$posthogUserId`         | RevenueCat subscriber attribute matching the PostHog distinct ID | None                                      | Stable `appUserId`, uploaded with the explicit attributes request; RevenueCat falls back to the same app user ID when absent.                                                                                                                     |
| `platform`               | Person (`identify`)                                              | User property                             | `ios` or `android`.                                                                                                                                                                                                                               |
| `first_app_open`         | Person (`$set_once`)                                             | None explicitly; GA4 has SDK `first_open` | From `settings.firstAppOpen`, including older installs.                                                                                                                                                                                           |
| `features_used`          | Person (full list, written when it grows)                        | None explicitly                           | Every qualifying feature observed on this install; covers old and new installs.                                                                                                                                                                   |
| `acquisition_source`     | Person                                                           | User property                             | On onboarding source submission.                                                                                                                                                                                                                  |
| `is_pro`                 | Person + super property                                          | User property                             | Current Pro flag.                                                                                                                                                                                                                                 |
| `pro_plan`               | Person + super property                                          | User property                             | `free`, `monthly`, `annual`, `lifetime`, `other`; current state.                                                                                                                                                                                  |
| `pro_period_type`        | Person + super property                                          | User property                             | `trial`, `intro`, `normal`, `prepaid`, `none`, `unknown`; current state.                                                                                                                                                                          |
| `pro_renewing`           | Person                                                           | User property                             | Current renewing-subscription flag, including false.                                                                                                                                                                                              |
| `pro_product_id`         | Person                                                           | User property                             | Set when known; retains last known value after lapse.                                                                                                                                                                                             |
| `pro_since`              | Person                                                           | User property                             | Activation timestamp when known; retains history.                                                                                                                                                                                                 |
| `pro_expires_at`         | Person                                                           | User property                             | Expiry timestamp when known; retains history.                                                                                                                                                                                                     |
| `currency_code`          | Super property + person                                          | User property                             | Settings sync; also explicitly in `First App Open`.                                                                                                                                                                                               |
| `locale`                 | Super property + person                                          | User property                             | Settings sync; also explicitly in `First App Open`.                                                                                                                                                                                               |
| `theme_mode`             | Super property + person                                          | User property                             | Settings sync.                                                                                                                                                                                                                                    |
| `theme_color`            | Super property + person                                          | User property                             | Settings sync.                                                                                                                                                                                                                                    |
| `display_mode`           | Super property + person                                          | User property                             | Settings sync: `money` or `time`.                                                                                                                                                                                                                 |
| `app_variant`            | Super property                                                   | None                                      | Registered when the client starts.                                                                                                                                                                                                                |
| `rc_subscription_status` | RevenueCat-managed person property                               | None                                      | Updated by each RevenueCat server event: `active`, `trial`, `cancelled`, `grace_period`, `expired`, `paused`.                                                                                                                                     |

Sources: [native analytics](apps/mobile/services/analytics.native.ts), [shared Pro profile builder](apps/mobile/services/analytics.shared.ts), [app context](apps/mobile/context/AppContext.tsx), [Pro context](apps/mobile/context/ProContext.tsx) and [onboarding](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx).

### Provider configuration and delivery

| Operation / configuration    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Source                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostHog client               | One client, created by `initPostHog()` in App.tsx before anything renders so error autocapture covers startup. Project token and host are checked in ([constants/posthog.ts](apps/mobile/constants/posthog.ts)); the token is a public write-only key. Development builds send nothing unless `EXPO_PUBLIC_POSTHOG_DEV=1`.                                                                                                                                                                                                                                                                  | [PostHog client](apps/mobile/services/posthog.native.ts)                                                                                                                                                                                               |
| PostHog startup identity     | Events, person properties and daily claims wait until `identifyUser` has configured GA4 and identified PostHog. Identify sends `$identify` only when the distinct ID changes; the SDK persists identity across launches.                                                                                                                                                                                                                                                                                                                                                                    | [Native analytics](apps/mobile/services/analytics.native.ts)                                                                                                                                                                                           |
| Custom-event delivery        | GA4 and PostHog sends start independently after startup configuration; a failed PostHog capture does not block GA4. PostHog batches 20 events or 30 s, persists its queue on disk across launches and drops the oldest event beyond 1,000. `flushAnalytics` flushes it (used after a full data reset).                                                                                                                                                                                                                                                                                      | [Native analytics](apps/mobile/services/analytics.native.ts)                                                                                                                                                                                           |
| Pro profile sync             | Deduplicate unchanged state per user ID in memory (ProContext) and on disk (person-property diff); failed, interrupted or stale syncs clear the signature so a later refresh can retry. Writes name their expected user and stop after customer/state changes. Revenue attribute uploads run independently of profile writes.                                                                                                                                                                                                                                                               | [Pro context](apps/mobile/context/ProContext.tsx), [native analytics](apps/mobile/services/analytics.native.ts)                                                                                                                                        |
| Event allowlist              | A `before_send` hook drops every event that is neither in `POSTHOG_EVENTS` nor `$identify`, `$set`, `$exception` or `$feature_flag_called`, so an SDK default cannot spend the budget unnoticed.                                                                                                                                                                                                                                                                                                                                                                                            | [PostHog client](apps/mobile/services/posthog.native.ts)                                                                                                                                                                                               |
| PostHog project settings     | `Money2Time` (658608), timezone `Asia/Kuala_Lumpur`, IPs discarded after GeoIP, web autocapture off, exception autocapture on, console-log and performance capture off, session recording on (web sample 10%, minimum 5 s, inputs masked, no network payloads), surveys and heatmaps off. Authorized URLs (`app_urls`): `https://www.money2time.com`, `https://money2time.com`; recording domains are left unrestricted because mobile replays have no domain. Test-account filter (default on): the internal cohort, `app_variant` not `development`/`preview`, and `$host` not localhost. | PostHog project settings                                                                                                                                                                                                                               |
| Firebase app selection       | Android and production/preview iOS use `com.nelsongan.money2time`; development iOS uses `com.nelsongan.money2time.dev`. Expo selects the matching Firebase client configuration.                                                                                                                                                                                                                                                                                                                                                                                                            | [Expo config](apps/mobile/app.config.ts), [base config](apps/mobile/app.json)                                                                                                                                                                          |
| Firebase iOS crash hardening | Require GoogleUtilities `~> 8.1.4` in every iOS build. Its dictionary guards ignore nil keys from malformed analytics configuration instead of crashing on a background queue, as in MONEY2TIME-5P during the September 29, 2026 incident.                                                                                                                                                                                                                                                                                                                                                  | [Base config](apps/mobile/app.json), [GoogleUtilities 8.1.4](https://github.com/google/GoogleUtilities/releases/tag/8.1.4), [Firebase incident report](https://firebase.blog/posts/2026/10/firebase-analytics-outage)                                  |
| Firebase startup collection  | Auto-collection is disabled until JavaScript sets consent and the app user ID, then enables product analytics. Serialize customer configuration, reopen readiness for customer switches and retry failed configuration on the next event or identification for the same user. Manual screen reporting replaces automatic native screen reporting.                                                                                                                                                                                                                                           | [Firebase config](apps/mobile/firebase.json), [native analytics](apps/mobile/services/analytics.native.ts)                                                                                                                                             |
| Advertising collection       | Deny ad storage, ad user data and ad personalization; disable Android advertising-ID collection/permissions and iOS Analytics advertising-ID support. PostHog collects no advertising identifiers.                                                                                                                                                                                                                                                                                                                                                                                          | [Firebase config](apps/mobile/firebase.json), [base config](apps/mobile/app.json), [native analytics](apps/mobile/services/analytics.native.ts)                                                                                                        |
| Firebase default parameters  | Development sets `debug_mode = 1`; production clears it with null. Firebase identity configuration clears `revenuecat_revenue_enabled`; an HTTP 200 acknowledgement from RevenueCat’s attributes endpoint sets it to `1`. Serialize marker writes with Firebase configuration so an old customer cannot overwrite the new customer’s defaults.                                                                                                                                                                                                                                              | [Native analytics](apps/mobile/services/analytics.native.ts), [RevenueCat service](apps/mobile/services/revenueCat.native.ts), [Firebase defaults](https://firebase.google.com/docs/reference/android/com/google/firebase/analytics/FirebaseAnalytics) |

### Screens and SDK events

| Event / operation                                                                                                  | PostHog                                                                                             | GA4                                                               | Trigger and frequency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `screen_view`                                                                                                      | No `$screen` events (budget); Insights visits feed `Feature Used`; each screen is an exception step | Explicit screen event with `screen_name` and `screen_class`       | Visible screen changes through `setCurrentScreen`; duplicate current/last screen is suppressed. No `m2t_` prefix. The Notifications settings and source screens (internally `PaymentAlerts*`) are entered from Android only. `NotificationHistory` and `NotificationReviewEditor` produce GA4 screen views only; saving uses the confirmed-review transaction events. A page added to the bottom bar reports its tab name (`goals`, `recurring`, `reimbursements`, `receipts`, `settleUp`) while it is the visible tab. |
| SDK `first_open`, `session_start`, engagement/attribution events                                                   | None                                                                                                | SDK-managed after collection is enabled                           | Outside the custom-event inventory and its 119-definition count. Actual SDK event set depends on the configured native SDK.                                                                                                                                                                                                                                                                                                                                                                                             |
| `Application Installed`, `Application Opened`, `Application Backgrounded`, `$screen`, `$autocapture`, `$rageclick` | Disabled (and dropped by the allowlist)                                                             | Not applicable                                                    | `First App Open` and `Daily App Open` replace them at a fraction of the volume.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `$identify`, `$set`                                                                                                | Sent                                                                                                | Not applicable                                                    | Once per install and on person-property changes; see the budget.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Store trial conversions, renewals, cancellations, billing issues and refunds                                       | RevenueCat server lifecycle events below                                                            | RevenueCat server lifecycle events below plus legacy SDK coverage | External producer, outside the 119 app custom definitions. SDK store events become `m2t_store_revenue_observed` in GA4 only when the new client marks RevenueCat identity ready.                                                                                                                                                                                                                                                                                                                                        |

### Error tracking

PostHog error tracking replaced Sentry on 2026-10-12. The native app sends every exception as a `$exception` event (billed against the separate 100K-exception allowance, not the product-analytics budget), attributed to the identified `m2t_<uuid>` user and linked to the session replay when one is recording.

| Source                       | Captured by                                                                                                     | Notes                                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uncaught JavaScript errors   | `errorTracking.autocapture.uncaughtExceptions`                                                                  | Fatal errors are handed to the native SDK, which persists them before the process dies.                                                                           |
| Unhandled promise rejections | `errorTracking.autocapture.unhandledRejections`                                                                 |                                                                                                                                                                   |
| Native crashes               | `nativeCrashes` (iOS signals and Mach exceptions; Android Java/Kotlin), `androidNdkCrashes` (Android 12+ C/C++) | Through `@posthog/react-native-plugin`. An NDK crash is reported on the next launch.                                                                              |
| Render errors                | [AppErrorBoundary](apps/mobile/components/feedback/AppErrorBoundary.tsx) → `reportError`                        | The boundary shows the fallback, so it reports with `component_stack`.                                                                                            |
| Caught errors                | `reportError(error, context)` from [errorReporting](apps/mobile/services/errorReporting.native.ts)              | Existing call sites keep their `scope` context (`app_load`, `notifications`, `revenueCat.restore`, …). Context keys are snake-cased; only scalar values are kept. |
| Breadcrumbs                  | `addErrorStep` on every visible-screen change                                                                   | Local only; attached to the next exception as `$exception_steps`.                                                                                                 |

Hardening ([errorReporting.shared.ts](apps/mobile/services/errorReporting.shared.ts)): identical exceptions are deduplicated and at most 25 distinct exceptions are sent per rolling 5 minutes, so a render loop cannot exhaust the allowance; context is reduced to PostHog `$` fields, `component_stack` and short scalars. Console output is not captured. The website captures its own uncaught errors with `capture_exceptions`.

Readable stacks need uploaded symbols. `metro.config.js` uses `getPostHogExpoConfig`, which injects debug IDs into every bundle. The `posthog-react-native/expo` config plugin (Hermes source maps, iOS dSYMs, Android R8 mappings and NDK symbols) is applied by [app.config.ts](apps/mobile/app.config.ts) **only when `POSTHOG_CLI_API_KEY` is set** at build time, and `eas-build-post-install` installs `@posthog/cli` under the same condition. Without the key, builds are unchanged and stacks stay minified. The key lives in EAS as the production environment variable `POSTHOG_CLI_API_KEY` (a PostHog personal API key scoped to _error tracking: write_ and _organization: read_), with `POSTHOG_CLI_PROJECT_ID=658608` beside it. Both were created on 2026-10-12 (PostHog key "EAS symbol upload"). The key must use **sensitive** visibility, like `SENTRY_AUTH_TOKEN` before it: production builds run `eas build --local` on GitHub Actions, and EAS **secret** variables are not readable during config resolution in local builds. Preview and development builds have no key and skip uploads. Store builds have OTA updates disabled, so every production bundle comes from a build that uploaded its map. To check a build, look for `Upload summary` and `dSYM upload complete` in its log; a local equivalent is `npx eas-cli env:exec production '<build command>'`, which supplies the key without printing it.

### Session replay

Recordings come from `@posthog/react-native-plugin` (native screenshots, not a DOM), so they need a native build. The app decides once per launch whether to record, after the install date is known: **15%** of launches on an install's first day (onboarding and first transactions, where replays teach the most) and **0.4%** of later launches, about 1,500 recordings a month against the free tier's separate 2,500 mobile recordings ([constants/posthog.ts](apps/mobile/constants/posthog.ts)). Recordings shorter than 5 seconds are discarded by the project setting.

Privacy settings, all enforced in the client config ([posthog.native.ts](apps/mobile/services/posthog.native.ts)). The rule is that the user's information is masked and the app around it is not:

- every text and input is masked (`maskAllTextInputs`): amounts, notes, account and goal names are text, and on iOS the flag covers every label as well as every input field, so it cannot be narrowed to "inputs only". Fixed app copy that can never hold user data opts back in with a `ph-no-mask` `testID` (iOS honours it; Android keeps it masked). `FatButton` labels do, since every one is app copy plus at most a selection count; anything that renders an amount or a name must not carry it;
- images are shown (`maskAllImages: false`), so category icons, bank and subscription logos, the mascot and illustrations stay readable;
- pictures the user supplied are masked one by one with `REPLAY_PRIVATE` ([components/ui/replayPrivacy.ts](apps/mobile/components/ui/replayPrivacy.ts), a `ph-no-capture` `testID`, which the recorder reads from the iOS accessibility identifier and the Android view tag, so screen readers never announce it): receipts (card, viewer, crop editor, captured photo), the receipt camera, the profile photo, album and goal covers, album map pins and the album map itself (location history), uploaded account, subscription, category and item images, payment QR codes, and the installed-app icons in the payment alerts picker (which payment apps someone has);
- charts are masked whole with the same marker, because their shapes are the user's money: the category pie (Insights, its drilldown and album detail, which also carries uploaded category icons inside the chart), the spending trend and sentiment bars, and the asset history line;
- text drawn as SVG or on a canvas is not a native label, so `maskAllTextInputs` misses it; the charts' labels are covered by the chart marker, and `GradientPercent` (the savings rate on Insights and the widget preview) carries the marker itself. A new view that shows a user's picture, charts their data or draws their numbers outside a `Text` must spread `REPLAY_PRIVATE` too;
- system pickers are masked (`maskAllSandboxedViews`);
- touches are recorded (`captureTouches: true`), because taps are what PostHog counts as activity on mobile: without them every recording is all inactivity, which the player skips straight through and replay analysis refuses. The app's number pads are custom views whose tap positions would reveal amounts, so recording pauses while one can be tapped (`usePauseSessionReplay` in [components/ui/replayPrivacy.ts](apps/mobile/components/ui/replayPrivacy.ts): the transaction editor's `NumpadPanel`, Split Bill's `MiniNumpad` and onboarding's try-it converter) and resumes in the same session when it goes. A pad that stays mounted while hidden passes `onScreen` (the editor's collapsed drawer, the try-it keypad under the wage calculator), and one whose screen loses navigation focus stops pausing by itself; a modal opened over a visible pad (the Pro paywall) is not recorded. On iOS each resume starts the 5-second minimum again, so a segment shorter than that between two pads is dropped. A new view that takes digits on custom keys must call the hook too. System keyboards draw in their own window, which neither recorder captures;
- Android Logcat and iOS network telemetry are off (`captureLog`, `captureNetworkTelemetry`), so log lines and request URLs never enter a recording.

Replays answer "what did the user see and do" next to an exception or a funnel drop-off; they are linked automatically through `$session_id`.

### Feature flags

[services/featureFlags.ts](apps/mobile/services/featureFlags.ts) wraps PostHog flags for future rollouts and experiments: register each key in `FEATURE_FLAGS`, read it with `useFeatureFlag(key)` in components or `getFeatureFlag(key)` elsewhere, and treat `undefined` (not loaded, disabled, web, development) as off. Flags load at launch and on identify; person-property writes never trigger a reload. Each read sends `$feature_flag_called` once per flag per session for experiment exposure (pass `{ sendEvent: false }` for plain rollouts); add those events to the budget when a flag ships. Flag requests are only billed while at least one flag is active; archive a flag once its rollout is complete. The website never evaluates flags.

### AI observability

The [receipt-scanner Worker](#receipt-scanner-worker) sends one `$ai_generation` event per OpenRouter call to the same PostHog project (100K free events a month, separate from product analytics). Events share `$ai_trace_id` (the request's `reqId`), so each scan shows as one trace with its failover and, for photo scans, the empty-result retry (screenshot scans answer from one pass), and use the app's `m2t_<uuid>` as distinct ID, so a trace sits next to that person's `Receipt Scan Completed` / `Receipt Scan Failed`.

| Property                                                                                                  | Value                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$ai_model`, `$ai_provider`, `$ai_base_url`                                                               | The OpenRouter model tried, `openrouter`, `https://openrouter.ai/api/v1`.                                                                                                                                                                                            |
| `$ai_span_name`                                                                                           | `receipt_scan_quick`, `receipt_scan_itemized` or `receipt_scan_screenshot`.                                                                                                                                                                                          |
| `$ai_input_tokens`, `$ai_output_tokens`, `$ai_cache_read_input_tokens`, `$ai_cache_creation_input_tokens` | From OpenRouter's `usage`. On Claude, the cache pair is the prompt text read from or written to Anthropic's prompt cache; other models can report implicit cache reads of their own.                                                                                 |
| `$ai_total_cost_usd`, `$ai_cost_passthrough`                                                              | What the call cost, passed through rather than re-priced: OpenRouter's charge (`usage.cost`), plus, when our own Anthropic key paid, what Anthropic bills directly (`usage.cost_details.upstream_inference_cost`), since under BYOK `cost` is only OpenRouter's fee. |
| `byok`                                                                                                    | `usage.is_byok`: `true` when our Anthropic key paid. An `anthropic/` generation with `false` means OpenRouter credits were spent on it, which the Worker's routing forbids (see [Config](#config)).                                                                  |
| `$ai_latency`, `$ai_http_status`, `$ai_is_error`, `$ai_error`                                             | Seconds, status, and a 200-character error message on failure.                                                                                                                                                                                                       |
| `$ai_temperature`, `$ai_max_tokens`                                                                       | The attempt's settings (temperature rises on the empty-result retry). Claude is sent no temperature, so its generations carry none.                                                                                                                                  |
| `scan_mode`, `is_pro`, `is_backup_model`, `attempt`, `parsed_transactions`, `parsed_items`                | Request context and the parsed outcome of that attempt. `is_backup_model` is the `BACKUP_MODEL` slot, true even when Claude was skipped (an image it cannot read) and nothing ran first.                                                                             |
| `$ai_prompt_name`, `$ai_prompt_version`, `prompt_source`                                                  | The hosted prompt the call used (below); version is absent and `prompt_source` is `bundled` when the fallback served it.                                                                                                                                             |
| `prompt_cache`                                                                                            | Claude only: `shared` when the prompt went in the 1-hour cache every user shares, `per_user` when its template has no shared part and was cached whole for that user. `per_user` with a hosted version means `production` is on a pre-split template.                |
| `$geoip_disable`                                                                                          | Always `true`: the request comes from Cloudflare's network, whose location would otherwise overwrite the person's.                                                                                                                                                   |
| `$session_id`, `$ai_session_id`                                                                           | The app's PostHog session, from the `X-POSTHOG-SESSION-ID` header the SDK adds to scan requests (`addTracingHeaders`), so a trace links to that session's events and replay. Only a UUID-shaped value is accepted.                                                   |

`$ai_input` and `$ai_output_choices` carry fixed placeholders: the receipt image, the prompt (which includes the user's category and account names) and the model's answer never leave the Worker. Capture runs in `ctx.waitUntil` after the response and never fails a scan. The project token is a plain `[vars]` entry in `wrangler.toml` (public, write-only); removing it stops capture.

#### Hosted prompts

The four receipt-scan prompts live in PostHog prompt management (AI observability → Prompts): `receipt-scan-quick`, `receipt-scan-itemized`, `receipt-scan-screenshot` and `receipt-scan-screenshot-accounts` (the account-matching section inserted into the screenshot prompt when the app sends account names). Variables use `{{currency_code}}`, `{{allowed_categories}}`, `{{accounts_section}}` and `{{allowed_accounts}}`, filled in one pass so a category or account name containing `{{…}}` stays literal text.

- The Worker ([src/prompts.ts](apps/cloudflare/workers/receipt-scanner/src/prompts.ts)) serves the version the `production` label points at, cached for 30 minutes in the Cloudflare location's cache (shared by every isolate there) and in the isolate (each fetch is a billable `$llm_prompt_fetched` event; at 5 minutes they measured ~37,000 a month), served stale for a minute while a refresh fails, with a 2-second fetch timeout. The location cache exists because isolates are so short-lived that an isolate-only cache missed on almost every scan (743 fetches for 744 model calls on the first day). Without a usable PostHog answer it uses its bundled copies, which match the version the `production` label should point at (version 2 of the three receipt prompts, which moved the user's settings to the end; version 1 of `receipt-scan-screenshot-accounts`).
- Reads use `POSTHOG_PROMPTS_API_KEY`, a Worker secret holding a personal API key ("Receipt prompts read") scoped to `llm_prompt:read` only. Unset, the Worker serves the bundled copies.
- To check which prompt production uses, filter `$ai_generation` by `prompt_source`: `posthog` with a `$ai_prompt_version` means the hosted prompt was served; `bundled` means the key is missing or PostHog was unreachable. Each fetch also appears as a `$llm_prompt_fetched` event (see the budget).
- To change a prompt: edit it in PostHog (each save is a new immutable version), compare its generations, then move the `production` label; the Worker picks it up within 30 minutes (an isolate that reads the location cache's copy expires it 30 minutes after that copy was fetched, not after the read). Roll back by moving the label back. Copy a change that should survive a PostHog outage into `BUNDLED_PROMPTS` too.
- Keep the JSON output contracts intact: the Worker's parsers (`parseTransactions`, `normalizeReceiptDetail`) still expect the schemas the prompts describe.

### Revenue measurement

RevenueCat remains the financial source of truth. App funnel success (`Pro Purchase Completed`) is separate from collected revenue.

| Producer / concern                   | Current contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Accuracy / rollout limit                                                                                                                                                                                                                                                                                                                | Evidence                                                                                                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App purchase completion              | `m2t_pro_purchase_completed` / `Pro Purchase Completed` carries advertised package `price`, `currency` and granted `period_type`; can include a trial or already-owned restore fallback.                                                                                                                                                                                                                                                                                                                                                                                   | Funnel only. No app `purchase`, `in_app_purchase`, `logTransaction`, PostHog revenue property or person revenue increment. Never sum package prices as revenue.                                                                                                                                                                         | [Paywall](apps/mobile/features/settings/screens/ProPaywallScreen.tsx), [purchase service](apps/mobile/services/revenueCat.native.ts)                                                                                                                                              |
| RevenueCat → GA4                     | Production iOS stream `15759015760`, Firebase app `1:229377044166:ios:248d6777e3482dfe5cb1c7`; Android stream `15759032739`, app `1:229377044166:android:2efbd8e2ee9255355cb1c7`. Dedicated `RevenueCat Production iOS` / `RevenueCat Production Android` secrets exist only in GA4 and RevenueCat. Gross USD, purchased-currency option off, sandbox off, hashed email off. Web credentials and Firebase Extension webhook empty.                                                                                                                                         | Requires the real `$firebaseAppInstanceId`. Development iOS and the website are excluded. Client startup/foreground and purchase/restore sync the ID; missing or failed writes retry without denying Pro.                                                                                                                               | [Live Firebase integration](https://app.revenuecat.com/projects/03387b56/integrations/firebase), [native analytics](apps/mobile/services/analytics.native.ts), [official setup](https://www.revenuecat.com/docs/integrations/third-party-integrations/firebase-integration)       |
| RevenueCat attribute acknowledgement | Keep the SDK’s local reserved attributes and POST `$firebaseAppInstanceId` and `$posthogUserId` to `https://api.revenuecat.com/v1/subscribers/{app_user_id}/attributes`, using the existing public platform SDK key and an encoded customer ID. Only HTTP 200 confirms this upload.                                                                                                                                                                                                                                                                                        | Abort and return after five seconds; failures retry without denying Pro. Customer-status reads start this work in the background and never fetch offerings. Purchase/restore waits for the bounded attempt. The SDK’s `syncAttributesAndOfferingsIfNeeded` can skip uploads or hide attribute errors and must not authorize the marker. | [Native RevenueCat service](apps/mobile/services/revenueCat.native.ts), [official attributes endpoint](https://www.revenuecat.com/docs/api-v1/customers#update-customer-attributes), [public-key attribute writes](https://www.revenuecat.com/docs/customers/customer-attributes) |
| RevenueCat → PostHog                 | RevenueCat's native PostHog integration: US region, gross USD, default `rc_*` event names, subscriber attributes not sent as person properties (each would be a billable `$set`), paywall and web-funnel events off, no sandbox key. Distinct ID is `$posthogUserId` or the RevenueCat app user ID, both `m2t_<uuid>`. Each event updates the `rc_subscription_status` person property; events with revenue carry `revenue` (USD) and `currency`. Its API key is the public project token from PostHog → Settings → Project (`phc_zDp6…`, also in `constants/posthog.ts`). | Configured 2026-10-12 and confirmed the same day when a real App Store trial start arrived as `rc_trial_started_event`. A disabled "RevenueCat webhook" source in PostHog is a superseded first attempt; never enable it alongside the integration, or every event arrives twice. RevenueCat cannot backfill earlier charges.           | [Integration docs](https://www.revenuecat.com/docs/integrations/third-party-integrations/posthog)                                                                                                                                                                                 |
| PostHog revenue analytics            | Configured with the four RevenueCat charge events (`rc_initial_purchase_event`, `rc_renewal_event`, `rc_trial_converted_event`, `rc_non_subscription_purchase_event`), `revenue` in USD and `product_id` as the product, test accounts filtered.                                                                                                                                                                                                                                                                                                                           | Shows only what RevenueCat's integration delivers; trials and cancellations are not revenue.                                                                                                                                                                                                                                            | PostHog → Revenue analytics                                                                                                                                                                                                                                                       |
| RevenueCat → Mixpanel (retired)      | Deleted on 2026-10-12.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Historical Mixpanel revenue stays in project `4000816` and is not migrated.                                                                                                                                                                                                                                                             | None                                                                                                                                                                                                                                                                              |
| GA4 duplicate control                | Two saved modifications on each production app stream: `RevenueCat source - in app purchase` matches `event_name = in_app_purchase`; `RevenueCat source - store lifecycle` matches names starting `app_store_`. Both also require `revenuecat_revenue_enabled = 1`. Copy `event_name` to `legacy_event_name`, then rename to `m2t_store_revenue_observed`.                                                                                                                                                                                                                 | SDK observations remain inspectable without contributing standard purchase/subscription revenue. Marker is set only after an HTTP 200 acknowledgement of the Firebase attribute upload. Rules may take an hour or more to reach clients. Measurement Protocol events are unaffected by client rules.                                    | [Native marker](apps/mobile/services/analytics.native.ts), [GA4 modification contract](https://support.google.com/analytics/answer/10085872?hl=en)                                                                                                                                |
| Legacy SDK / Google Play             | Existing versions retain SDK store events until they acquire the marker; GA4 Play link remains absent. No new Play revenue producer or manual StoreKit 2 transaction logger is added.                                                                                                                                                                                                                                                                                                                                                                                      | Historical/default In-app purchases reports continue to differ from RevenueCat. RevenueCat is the chosen paid-event producer; do not add a Play link or manual monetary logging without rechecking duplicate control.                                                                                                                   | [Live Play links](https://analytics.google.com/analytics/web/#/a350740029p553783025/admin/integrations/play), [StoreKit guidance](https://firebase.google.com/docs/analytics/ios/measure-in-app-purchases)                                                                        |
| GA4 reporting                        | Use `purchase` / Ecommerce purchases for the RevenueCat paid stream, limited to the two production native streams. Trials use `rc_trial_start`; restores do not create a new charge.                                                                                                                                                                                                                                                                                                                                                                                       | App-stream transaction IDs are not deduplicated by GA4. During rollout, unfiltered Total revenue includes legacy SDK coverage; use the RevenueCat paid-event report when reconciling.                                                                                                                                                   | [Google app-stream deduplication limit](https://support.google.com/analytics/answer/12313107?hl=en), [metric definitions](https://support.google.com/analytics/answer/13428834?hl=en)                                                                                             |
| Currency and dates                   | RevenueCat sends gross USD before store deductions to both providers. GA4 property reports MYR; PostHog's timezone is `Asia/Kuala_Lumpur`; RevenueCat charts use UTC.                                                                                                                                                                                                                                                                                                                                                                                                      | Compare the same currency and date boundaries, production stores and gross/net/tax definition.                                                                                                                                                                                                                                          | [RevenueCat chart definitions](https://www.revenuecat.com/docs/dashboard-and-metrics/charts/revenue-chart), [chart time zones](https://www.revenuecat.com/docs/dashboard-and-metrics/charts)                                                                                      |
| Refunds and history                  | RevenueCat's GA4 integration does not send negative revenue; refund-adjusted totals come from RevenueCat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Neither provider is a refund-adjusted financial ledger.                                                                                                                                                                                                                                                                                 | [GA4 integration limitations](https://www.revenuecat.com/docs/integrations/third-party-integrations/firebase-integration)                                                                                                                                                         |

#### RevenueCat server event inventory

These are external events, not entries in `AnalyticsEvents`; PostHog receives them from RevenueCat's PostHog integration. Enabled PostHog names add product-analytics volume per lifecycle occurrence (included in the budget); renewals have no per-install cap. They must remain distinct from app paywall completion.

| Lifecycle occurrence               | PostHog event                        | GA4 event                    | Monetary meaning                                              |
| ---------------------------------- | ------------------------------------ | ---------------------------- | ------------------------------------------------------------- |
| Initial paid subscription          | `rc_initial_purchase_event`          | `purchase`                   | Actual charge                                                 |
| Free trial starts                  | `rc_trial_started_event`             | `rc_trial_start`             | Zero collected                                                |
| Trial converts to paid             | `rc_trial_converted_event`           | `purchase`                   | Actual charge                                                 |
| Trial cancelled                    | `rc_trial_cancelled_event`           | `rc_cancellation`            | No new charge                                                 |
| Renewal / resubscription           | `rc_renewal_event`                   | `purchase`                   | Actual charge                                                 |
| Paid cancellation / refund         | `rc_cancellation_event`              | `rc_cancellation`            | No new charge                                                 |
| Auto-renew re-enabled              | `rc_uncancellation_event`            | `rc_uncancellation`          | No new charge                                                 |
| One-time / lifetime purchase       | `rc_non_subscription_purchase_event` | `purchase`                   | Actual charge                                                 |
| Subscription paused                | `rc_subscription_paused_event`       | `rc_subscription_paused`     | No new charge                                                 |
| Subscription expires               | `rc_expiration_event`                | `rc_expiration`              | No new charge                                                 |
| Billing failure                    | `rc_billing_issue_event`             | `rc_billing_issue`           | Failed charge                                                 |
| Product changed                    | `rc_product_change_event`            | `rc_product_change`          | Change notice, not proof of a charge                          |
| Customer transfer                  | Not sent                             | `rc_transfer_event`          | Two attribution notices, not two charges                      |
| SDK store observation after marker | Not sent                             | `m2t_store_revenue_observed` | Supplemental only; `legacy_event_name` preserves the SDK name |

### Paywall sources

Every paywall entry point must pass its own source. Sources segment `Pro Paywall Viewed`, unavailable plans, purchase outcomes and restore outcomes.

| Source                                                                                                                                                                                           | Entry point                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `onboarding`                                                                                                                                                                                     | Paywall after onboarding.                                         |
| `settings_banner`                                                                                                                                                                                | Settings upgrade card.                                            |
| `settings_subscription`                                                                                                                                                                          | Settings subscription tile for free users.                        |
| `app_lock`                                                                                                                                                                                       | Settings App Lock tile for free users.                            |
| `pro_management`                                                                                                                                                                                 | Lifetime upgrade or upgrade after lapse.                          |
| `news`, `news_list`                                                                                                                                                                              | Announcement modal or Settings news list CTA.                     |
| `insights_trend`                                                                                                                                                                                 | Pro trend in Insights.                                            |
| `accounts_transaction`                                                                                                                                                                           | Upgrade action on the transaction-entry account limit.            |
| `accounts`, `categories`, `recurring`, `wage_entries`, `custom_logos`, `custom_item_images`, `subcurrencies`, `albums`, `items`, `budget_templates`, `receipts`, `split_bills`, `goals`, `loans` | Count-based free-tier gates in `useProGate`.                      |
| `receipt_scan`, `voice`                                                                                                                                                                          | Receipt-scan or voice-use limits.                                 |
| `app_icon`, `custom_card_designs`, `custom_category_icons`, `custom_subscription_logos`, `icon_packs`, `live_earnings_auto_start`, `reimbursements`                                              | Pro-only feature gates.                                           |
| `widget_<kind>`, `widget`                                                                                                                                                                        | Widget Pro CTA; iOS can specify kind, Android uses widget.        |
| `unknown`                                                                                                                                                                                        | Fallback for a missing source; investigate as an attribution bug. |

### Product reports and interpretation

Use the tables above to select events, then apply the product's actual send conditions before interpreting a funnel or total. A delivered custom event is a product signal; it is not proof of a store charge, a completed external action or every transaction in the database.

| Product question                         | Tracking to use                                                                                                                                                            | Interpretation                                                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How many people use the app?             | `Daily App Open` unique users (DAU/WAU/MAU), stickiness                                                                                                                    | One event per user per local day, so counts are users, not sessions. PostHog's `$session_id` covers session analysis within the events that are sent.                               |
| Do new users activate?                   | `First App Open` → `Onboarding Started` → `Onboarding Step Completed` (basics, wage) → `Onboarding Source Selected` → `Onboarding Completed` → `First Transaction Created` | Use unique users and the documented qualifying saves. Restore/import/reset paths must not manufacture first-use claims. Repeated onboarding actions are not new installs.           |
| Do they come back, and keep logging?     | Retention from `First App Open` to `Daily App Open`; from `First Transaction Created` to `Daily Transaction Logged`; `days_since_last_active` for resurrection             | The logging-habit curve is the core retention metric for a tracker. Daily counters start at this release, not at install.                                                           |
| Which capabilities get adopted and kept? | `Feature Used` by `feature` (daily reach and retention); `Feature First Used`; `features_used` person property                                                             | First-use events describe eligible fresh installs only. `Feature Used` covers every install from this release on.                                                                   |
| How often are features used?             | GA4-only per-use rows and explicit `screen_view`                                                                                                                           | PostHog intentionally omits repeat usage within a day. Screens measure visible navigation, not successful feature use.                                                              |
| Which paywalls lead to purchase intent?  | Pro paywall, plan, purchase-started and purchase-completed events by source                                                                                                | Follow the exact optional conditions in the event table. `Pro Purchase Completed` is a client entitlement/funnel result; free trials and restored entitlements are not new revenue. |
| How much revenue was collected?          | RevenueCat paid initial/trial-converted/renewal/non-subscription charge events in PostHog or GA4 `purchase`                                                                | Align dates, currency, store, environment and gross/net definitions. Keep trials, ordinary cancellations and legacy SDK diagnostics out of charge totals.                           |
| Why did they drop off or crash?          | Session replays linked from a funnel step or an exception; `$exception` by issue                                                                                           | Replays are sampled (see Session replay); absence of a replay is not absence of the problem.                                                                                        |
| Is the AI receipt scanner healthy?       | `Receipt Scan Completed` / `Failed` by `code`; `$ai_generation` cost, latency and error rate by model                                                                      | One scan can produce several generations (failover, and the empty-result retry on photo scans); compare scans with traces, not generations.                                         |
| Is PostHog volume as expected?           | "Product-analytics event volume by event (budget)" on the Quality dashboard against the budget table                                                                       | A new or fast-growing event is a routing decision to revisit, not a reason to sample.                                                                                               |

### Live PostHog dashboards

Created on **2026-10-12** in project `Money2Time` (658608) through the PostHog API, with the test-account filter on in every insight and a 30-day default range (retention uses 8 weeks). They read the event names in this section, so they show PostHog's sample data until the new app version reports. "App: Activation & Retention" is the project's home dashboard.

| Dashboard                                                                                     | Insights | Main question                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [App: Activation & Retention](https://us.posthog.com/project/658608/dashboard/2198846)        | 10       | DAU/WAU/MAU, installs, the onboarding funnel, install and logging-habit retention, logging rate, acquisition source, resurrection.                                                                                                                                                                                                |
| [App: Feature Adoption & Engagement](https://us.posthog.com/project/658608/dashboard/2198847) | 12       | Daily users and reach per feature, first uses, milestones, Insights and time mode, receipt scans, sharing, alert setup, satisfaction, resets and imports.                                                                                                                                                                         |
| [App: Pro Conversion & Revenue](https://us.posthog.com/project/658608/dashboard/2198848)      | 10       | Paywall funnels overall and by source, purchase outcomes and plans, onboarding paywall, install → Pro, RevenueCat revenue and trials, limits.                                                                                                                                                                                     |
| [Quality: Errors, AI & Budget](https://us.posthog.com/project/658608/dashboard/2198851)       | 12       | Exceptions by platform and affected users; AI generations, cost and latency, monthly AI volume against its 100K allowance, screenshot scans that find nothing, prompt fetches; product-analytics volume against the free tier (AI and exceptions excluded); backup failures by target and error kind; daily users by app version. |
| [Website](https://us.posthog.com/project/658608/dashboard/2198852)                            | 8        | Page views, visitors, download clicks by placement and store, visit → download, tutorials, direct `/download` visits, UTM sources.                                                                                                                                                                                                |

Update the affected insights in the same change when an event name, property, filter or funnel step they use changes.

Reviewed against the first week of data on **2026-10-19**. Two traps found then: React Native `$exception` events carry `$os_name`, not `$os`, so platform breakdowns use `coalesce(properties.$os, properties.$os_name)`; and a breakdown on the event name must be the HogQL expression `event`, because an event-property breakdown named `event` reads a property that does not exist.

### Retired tracking

**Mixpanel and Sentry (retired 2026-10-12).** The app, the website and RevenueCat moved from Mixpanel to PostHog, and crash reporting from Sentry to PostHog error tracking. Nothing was migrated: historical data stays in Mixpanel project `4000816` (with its three boards and 32 saved reports) and Sentry project `nelsons-project/money2time`, for comparison until it ages out. Releases before this one keep sending to Mixpanel and Sentry until users update; the `EXPO_PUBLIC_MIXPANEL_TOKEN`, `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN` EAS variables (and the website's `NEXT_PUBLIC_MIXPANEL_TOKEN` on Vercel) were deleted on 2026-10-12, which does not affect shipped binaries but means a build or OTA update made from code that still has Mixpanel or Sentry sends nothing to either. A temporary `SENTRY_DISABLE_AUTO_UPLOAD` EAS variable that kept builds of the old code working was deleted once this migration reached `main`. The RevenueCat Mixpanel integration was deleted on 2026-10-12. Sentry issue IDs (`MONEY2TIME-…`) in code comments remain valid references to that history. Mixpanel numbers are not comparable one-to-one: PostHog adds daily engagement events, Mixpanel had no active-user events at all.

Earlier retirements still matter for historical reports:

| Retired name / behavior                                                      | Current replacement                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 50% cohort and `sample_rate`                                                 | Every user; do not apply old ×2 weighting to unsampled data.                            |
| `$ae_first_open`, `$ae_session`, `$ae_updated`                               | `First App Open`, `Daily App Open`.                                                     |
| `Settings Updated`                                                           | Settings super properties, person properties and GA4 user properties.                   |
| `Pro Lifetime Upgrade Viewed`                                                | Paywall view with `variant = lifetime_upgrade`.                                         |
| `Pro Lifetime Upgrade Tapped`                                                | Paywall view with `source = pro_management`.                                            |
| `Pro Lifetime Upgrade Completed`, `Pro Cancel Sub Prompt Viewed`             | Purchase completed with `plan = lifetime` and `upgrade_from`.                           |
| `Pro Redundant Sub Warning Viewed`                                           | Person `pro_plan = lifetime` and `pro_renewing = true`.                                 |
| Generic `source = settings` on paywalls                                      | The explicit settings sources above.                                                    |
| Gate-level limit event immediately followed by paywall                       | The paywall view with the gate source; retain the account alert's separate limit event. |
| `Settle Up Opened`, `Reimbursements Opened`, `Insights Drilldown Opened`     | GA4 `screen_view`; Insights visits also count as `Feature Used` (`insights`).           |
| `Map Pin Tapped`, `Review Prompt Skipped`                                    | Removed without a current custom-event replacement.                                     |
| Unshipped payment-alert review, binding-learning and Smart categories events | Removed when payment alerts became a local review queue.                                |

### Maintenance contract

For every product or code change, assess whether analytics is affected. If an event, property, trigger, frequency, source, screen, destination, person property, first-use rule, daily cap, milestone, provider configuration or external producer changes, update the affected tables and implementation **in the same change**. Remove retired events from the active table and record their replacement in Retired tracking. Add a budget estimate before any new PostHog (Yes) row, and update the affected dashboard insights.

Run `npm test -- --runInBand __tests__/services/analyticsTrackingPlan.test.ts __tests__/services/analyticsEvents.test.ts __tests__/services/analyticsNative.test.ts __tests__/services/errorReporting.test.ts __tests__/services/revenueCatRestore.test.ts __tests__/utils/firstTransactionSignal.test.ts`. The tracking-table test checks custom-event completeness, exact provider names/routing, summary counts, documented adoption triggers/exclusions and transaction thresholds. The native and activation tests cover ordering, daily caps, person-property diffs, async failures, profile retries and successful-save claims. Trigger prose, property payloads, screen/source inventories, the budget and provider configuration still require review against the changed call sites; passing the tests does not verify those automatically. CI already runs these tests through `npm test`.

Follow [the analytics maintenance skill](.agents/skills/maintain-analytics-tracking/SKILL.md) (also mirrored for Claude). Treat any mismatch as unfinished work: reconcile the table and implementation before completing the change or opening a PR.

### How tracking is wired

The tables above own every event, destination and payload. This part covers the integration, native setup and verification.

#### Implementation map

- `services/analytics.shared.ts` defines the typed custom events, destination groups, GA4 converters, feature-use rules, daily caps, transaction thresholds and Pro profile builder.
- `services/analytics.native.ts` identifies/configures both providers, queues work until identity is ready, routes events, records daily engagement, first uses and transaction milestones, syncs person properties, samples session replay and logs visible screens.
- `services/posthog.native.ts` creates the single PostHog client (analytics, error tracking, replay, flags) and its `before_send` allowlist; `constants/posthog.ts` holds the project token and replay rates.
- `services/errorReporting.native.ts` reports caught errors and breadcrumbs; `services/featureFlags.ts` reads flags.
- `services/analytics.ts`, `services/posthog.ts` and `services/errorReporting.ts` are the web/unsupported-platform no-op fallbacks.
- `context/AppContext.tsx` and `context/ProContext.tsx` sync installation identity, settings and subscription state. Features emit tracking through the shared analytics API.
- The native layer remembers adoption state, daily state and the last person-property write in AsyncStorage.

#### GA4 integration

Use `@react-native-firebase/app` and `@react-native-firebase/analytics`. Expo's
Firebase JavaScript SDK cannot provide native mobile Analytics. The app already
uses development builds and native modules, so React Native Firebase fits the
existing build model.

Native configuration:

- Android app id: `com.nelsongan.money2time`
- production/preview iOS bundle id: `com.nelsongan.money2time`
- development iOS bundle id: `com.nelsongan.money2time.dev`
- native Analytics auto-collection disabled until the JavaScript layer has the
  pseudonymous app-user identity, explicitly grants analytics storage, denies
  all advertising consent, and then enables collection for every user;
- automatic native screen reporting disabled because React Native navigation
  runs in a single native activity/view controller;
- iOS Analytics built without advertising-ID support so analytics alone does
  not introduce an App Tracking Transparency requirement.
- Android Advertising ID collection and its merged Advertising ID permissions
  are disabled; ad storage, ad user data, and ad personalization default off
  while product measurement and attribution remain available;
- iOS uses static frameworks and CocoaPods for React Native Firebase
  (`disableSPM: true`), which is compatible with ExpoModulesCore's static
  native dependencies.

Provider behavior:

- `identifyUser` configures GA4 consent and identity, then identifies PostHog,
  using the same non-PII `appUserId` in both; events tracked earlier are held
  until identification finishes. GA4 event sends remain independent of PostHog
  captures;
- no analytics prompt or preference is shown; product measurement is enabled
  by default while financial records remain excluded from event properties;
- development builds set the GA4 `debug_mode` default event parameter so the
  property-level Developer Traffic filter can keep QA data out of reports.
  Production explicitly clears the persisted key with `{ debug_mode: null }`;
- GA4 event and property names are deterministic lowercase `snake_case`
  versions of the event display names, prefixed `m2t_`, that preserve
  camelCase word boundaries, and are validated to start with a letter and stay
  within the provider limits (a test fails if an event name would be cut to fit
  GA4's 40 characters);
- null/undefined parameters are dropped, booleans are encoded as `1`/`0`, and
  strings are capped at GA4's standard 100-character event-parameter limit;
- `setCurrentScreen` logs a GA4 `screen_view` with matching `screen_name` and
  `screen_class`, and becomes the `current_screen` of later events;
- stable app traits and Pro state are mirrored to GA4 user properties. Screen
  name remains event context rather than a user property;
- GA4 batching is left to the native SDK. `flushAnalytics` flushes PostHog,
  which is the only provider exposing an explicit flush operation.

Identity contract:

- `settings.appUserId` is the canonical pseudonymous identifier shared by GA4,
  PostHog, and RevenueCat;
- it is generated locally as `m2t_<random UUID>`, contains no name, email,
  advertising identifier, or financial data, and is never exported in backups;
- in-app data resets and backup restores preserve the current installation's ID
  so analytics and subscription history do not fragment;
- uninstalling the app removes the database and therefore rotates the ID on the
  next install, which is also what makes that launch a `First App Open`. Store
  purchase restoration remains the recovery path because Money2Time has no
  login account that could provide a cross-device identity.

#### PostHog integration

- Packages: `posthog-react-native` (JavaScript SDK, with `expo-application`,
  `expo-device`, `expo-file-system` and `expo-localization` as its Expo
  dependencies) and `@posthog/react-native-plugin` (native session replay and
  native crash capture, iOS pod `PostHog`). Both need a native build; Expo Go is
  not supported.
- The client uses file persistence, so queued events and identity survive
  restarts. `personProfiles: 'identified_only'`; nothing is captured before
  identify.
- Push-notification registration and `$push_notification_opened` capture are
  off; surveys are off.
- `app.config.ts` exposes `extra.appVariant` (from `APP_VARIANT`) for the
  `app_variant` super property.

#### Configuration and credentials

The Firebase project must be linked to a GA4 property. The repository then
needs the Firebase client configuration files for each registered app:

- `google-services.json` for Android;
- `GoogleService-Info.plist` for production/preview iOS;
- `GoogleService-Info.dev.plist` for the development iOS bundle.

These files contain client/project identifiers, not service-account private
keys. The Expo config chooses the appropriate iOS file from `APP_VARIANT`.

PostHog needs no app environment variable: the public project token is checked
into `constants/posthog.ts` (override with `EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN`).
Set `EXPO_PUBLIC_POSTHOG_DEV=1` to send from a development build; those events
carry `app_variant = development` and are excluded by the test-account filter.
The app's only PostHog secret is the build-time `POSTHOG_CLI_API_KEY` for
symbol uploads (see Error tracking); the receipt Worker has its own
`POSTHOG_PROMPTS_API_KEY` (see Hosted prompts).

The checked-in client configuration targets `money2time-expo` and matches all
three native app identifiers. GA4 property `Money2Time` (property ID
`553783025`) in Analytics account `350740029` has a data stream for each native
app and the website.

#### Verification

Automated checks:

- `analyticsTrackingPlan.test.ts`: the canonical table and implementation agree on every custom event, exact provider names/routing, coverage counts, feature adoption triggers/exclusions and transaction thresholds;
- `analyticsEvents.test.ts`: every event is in exactly one routing group, the
  purchase funnel, daily engagement and milestones go to PostHog while frequent
  per-use events stay GA4-only, no event name starts with `$`, the daily-cap
  arithmetic, the `days_since_install` arithmetic, which events and screens
  count as a feature use, reading stored usage and daily records, and GA4
  naming (never truncated) and parameter limits;
- `analyticsNative.test.ts`: PostHog identified once, GA4-only events kept out
  of PostHog, early events held until identify completes, independent GA4
  sends, capture failures contained, person properties written only on change
  (across launches), daily events capped per day, replay sampling, first uses
  and transaction milestones reported once per new install and remembered
  across launches, while older installs only fill in `features_used`;
- `errorReporting.test.ts`: exception dedupe, volume cap, window reset and
  context scrubbing;
- `firstTransactionSignal.test.ts`: failed and overlapping saves do not lose or
  duplicate activation, and existing expense/income history suppresses it;
- `newInstallSignal.test.ts`: `isNewInstall` is true exactly once per install;
- `paywallAnalytics.test.ts`: paywall variants and the purchase properties;
- `proAnalyticsProfile.test.ts` and `revenueCatRestore.test.ts`: the trial
  period type, the readable error code and the `$posthogUserId` attribute;
- typecheck, lint, formatting, and the full Jest suite.

On a device, start Metro with `EXPO_PUBLIC_POSTHOG_DEV=1` and check PostHog's
Activity view (filter `app_variant = development`) for `$identify`,
`Daily App Open` and the events exercised; trigger an error for Error tracking;
force a replay from the debugger with `getPostHog().startSessionRecording()`
(the launch's sampling decision is made once, so calling
`startSessionReplayForLaunch` again does nothing) and confirm masking in the
recording.

#### Reporting and rollout

The PostHog switch needs a native build and store release (new native module).
Until users update, older releases keep reporting to Mixpanel and Sentry, so
expect PostHog DAU to ramp with adoption. RevenueCat revenue reaches PostHog
through RevenueCat's integration for every customer, updated or not; GA4
revenue measurement is unchanged. The canonical [revenue tables](#revenue-measurement) own the exact
server names, external settings and duplicate-control rules.

## App icons

One folder per icon variant, composed by `node scripts/generate-app-icons.mjs`
from purpose-built whole-tile artwork in `assets/app-icon-sources/`. The user
picks between them in Settings > Display > App icon. `classic` and `purse` are
free; the rest are Pro, which the catalogue records as a `free` flag per variant
rather than deriving from the default.

| File                | Size      | Notes                                                      |
| ------------------- | --------- | ---------------------------------------------------------- |
| `icon-light.png`    | 1024x1024 | Cream backdrop `#FDF0D8`. **No alpha channel** (see below) |
| `icon-dark.png`     | 1024x1024 | Midnight backdrop `#17212E`. No alpha channel              |
| `icon-tinted.png`   | 1024x1024 | Greyscale on black, for iOS 18's tinted mode. No alpha     |
| `foreground.png`    | 432x432   | Transparent. Android's adaptive foreground layer           |
| `monochrome.png`    | 432x432   | Transparent silhouette. Android's themed-icon layer        |
| `preview-light.png` | 256x256   | What the in-app picker renders in light mode               |
| `preview-dark.png`  | 256x256   | What the in-app picker renders in dark mode                |

The backdrop is deliberately the same in every variant: cream in light,
midnight in dark. A variant changes the **pose**, never the colour, so the icon
still reads as the same app whichever one is picked. `purse` is the one variant
that is not a pose at all (see below), and it keeps the shared backdrop for
exactly that reason: it is already a different era of artwork, and letting it
carry its own field too would leave it looking like a foreign tile in the picker
rather than an older one. That costs nothing here, since the cream it was drawn
on turns out to be the same cream.

The folder name is the variant **id**, which is the app's own and not the
mascot's: an id ends up in a DB row (`settings.app_icon`), in the iOS
alternate-icon name and in the Android activity-alias, so it has to survive the
artwork behind it being redrawn. `scripts/generate-app-icons.mjs` owns the id ->
mascot mapping, and `constants/appIcons.ts` owns the picker order and labels.

### Dark mode

Each platform's own mechanism, rather than the app driving it:

- **iOS 18+** registers `icon-light`, `icon-dark` and `icon-tinted` as
  appearances of one icon, and the system picks between them from the home
  screen's own appearance setting (long-press > Edit > Customize; Dark can be
  set to Always or Auto, and Tinted is offered there too). Note that the
  **Default** setting stays on the light face even with the system in dark mode,
  so the dark tile is opt-in on the user's side and the picker deliberately
  promises nothing about when it appears. Doing it
  from the app instead would mean calling `setAlternateIconName` on every theme
  change, and iOS shows a modal alert on every successful call: a user on the
  automatic theme would get one at dusk. Older iOS falls back to the light face.
- **Android** has no light/dark launcher icons. `plugins/withAndroidAlternateIcons.js`
  overrides each icon's background colour in `values-night`, which launchers
  that re-resolve resources in dark mode will pick up (many cache the bitmap
  until the next app update, so treat this as a bonus). The reliable Android
  story is the themed icon, which is what `monochrome.png` is for. That same
  plugin also carries the deep-link fix that keeps widgets working after an icon
  change; its header explains why.

### The pre-mascot icon

`purse` is the coin-purse character the app wore immediately before the current
mascot. It is offered free rather than as a Pro alternate, because it is the icon
a long-time user already had and putting it back is not a premium feature. Its
source is a transparent cut-out in `assets/app-icon-sources/`, whose history is recorded under
[Whole-tile icon sources](#whole-tile-icon-sources). From the generator's point
of view it is ordinary: artwork already composed at tile scale, stamped through
the identity framing, given the same seven faces as everything else.

The icon before _that_ one, a coin and a clock inside two circular arrows, was
offered here for a while under the id `clock` and has been retired: two eras of
retired artwork in one picker is one more than the feature is worth, and the
purse is the one people actually remember having. It is still in history if it is
ever wanted back, along with the archaeology its restoration needed, at
`35c0de74`.

Its artwork is gone but its **alias is not**, and that asymmetry is deliberate.
Retiring an alternate icon outright breaks Android in a way the user cannot undo:
switching icons there enables an `activity-alias` and disables whatever component
the app was launched through, which on the default icon is `MainActivity`. That
disabled state survives the update, so an install sitting on a retired icon comes
back up with `MainActivity` disabled and no alias to replace it — no launcher
entry, and no way in to fix it. So `Clock` stays registered in `app.json`,
pointed at `classic`'s artwork, and `RETIRED_ALTERNATE_NAMES` in
`constants/appIcons.ts` records why. `AppContext`'s icon-sync effect is what
moves such a device back to the primary icon, and it is the only thing that
re-enables `MainActivity`.

### Adding or changing a variant

Edit `GENERATED` (or `RESTORED`, for historical whole-tile artwork) in
`scripts/generate-app-icons.mjs`, re-run it, then mirror the
change in three places: `APP_ICONS` in `constants/appIcons.ts` (id, PascalCase
`alternateName`, label key, `free`), the `expo-alternate-app-icons` and
`withAppIconNightBackgrounds` entries in `app.json`, and the `app_icon.*` labels
in all 24 locales. `__tests__/constants/appIcons.test.ts` fails if the catalogue
and app.json disagree, or if a face is missing from disk: none of that wiring is
exercised until `expo prebuild` runs on an EAS build, which is long after CI has
gone green.

A pose only earns a slot if it survives a squircle mask at 40px. That is a harsh
filter: most of the mascot sheet (`receipt`, `laptop`, `writing`, `scan-*`)
collapses into the default because its prop is below the neck, and poses that
differ only in how the chick is turned (`cheering`, `waving`) read as
duplicates. Selected poses are redrawn for the icon canvas rather than cropped
directly from the illustration sheet.

### The shipped icon

`classic` is what every existing install already has. Its `icon-light.png` is the
supplied artwork out of `assets/ios/AppIcon~ios-marketing.png`, passed through
pixel-for-pixel (re-encoded, never recropped) and it must stay that way; the other faces are composed from a cut-out of it, which
lands in exactly the same place because the framing landmarks in the generator
were measured off that tile. `app.json` points `ios.icon` and
`android.adaptiveIcon` straight at this folder.

**The App Store rejects an icon that carries an alpha channel**, so the 1024
tiles are written as 3-channel PNGs. `__tests__/constants/appIcons.test.ts`
checks the IHDR colour-type byte of every one.

`assets/android/` is gone. It held a `res/` mipmap set left over from the
pre-switcher pipeline plus the 512 tile that `android.icon` and the web favicon
pointed at. Nothing regenerated that tile, so redrawing the mascot updated every
icon except those two and left them on the old chick with nothing to catch it.
Both now read `classic/icon-light.png` like everything else, and a test pins them
there. The Play Console listing wants exactly 512x512, which is one resize away:

```bash
sips -z 512 512 assets/app-icons/classic/icon-light.png --out play_store_512.png
```

Dropping `res/` also removes a trap. Its `ic_launcher_foreground.png` had the
cream backdrop baked in, so anything that copied it back would draw a cream card
inside the launcher's own mask, which is the bug adaptive icons exist to avoid.
`npm run sync:icons` deletes those three filenames out of the prebuilt native
`res/` for that reason.

`assets/ios/` now holds only `AppIcon~ios-marketing.png`, the source of
`classic`. The rest of the legacy icon set was deleted (it is in git history):
prebuild renders every size from `ios.icon`, and `npm run sync:icons` no longer
copies that folder into the native project, because doing so would overwrite the
appearance-aware `Contents.json` prebuild writes and drop the dark and tinted
faces.

### Framing

Purpose-built sources occupy the complete tile and therefore use the identity
transform. Their composition is solved in the artwork itself: the head fills
roughly 85% of the tile like Original, the face stays at the visual centre, and
at most one pose-defining prop sits tightly against it.

- **Android** composes for the middle **72 of 108** dp. An adaptive layer is
  108dp but the system only ever shows that inner 72dp square, reserving the
  outer 18dp on each side for the launcher's parallax and pulse effects, and it
  applies the mask inside what is left. The pose is left to run out into the
  reserved margin rather than stopping at it, and the background layer is the
  same colour, so there is no seam wherever the mask lands.
- **Decoration.** Detached background marks do not survive the crop: no
  sparkles, hearts, confetti, rays, or floating symbols. A variant keeps only
  the nearby facial gesture or prop that makes it recognisable.

The splash is the exception, and is not generated here: it keeps the **whole**
character, centred on its alpha centroid, at 56% of the canvas. It has the room,
and it is not competing with a 40px launcher tile.

Native widgets on iOS and Android, their locked states, and the in-app widget
previews use `classic/icon-light.png` directly. The brand name is rendered as text
beside the headshot, so there is no separate widget bitmap to drift from the app
logo. The shared Settle Up receipt does the same with the 256px
`classic/preview-light.png`, whatever alternate icon the user has picked.

### Whole-tile icon sources

In `assets/app-icon-sources/`. Transparent artwork already composed at app-icon scale (1024x1024). These
sources are stamped through the generator's identity transform and then given
the same seven platform faces as every other variant.

| File            | Variant     | Origin                                                     |
| --------------- | ----------- | ---------------------------------------------------------- |
| `purse.png`     | `purse`     | The icon worn just before the current mascot, from history |
| `party.png`     | `party`     | ChatGPT Image redraw of the celebrating pose               |
| `love.png`      | `love`      | ChatGPT Image redraw of the love pose                      |
| `nice.png`      | `nice`      | ChatGPT Image redraw of the thumbs-up pose                 |
| `detective.png` | `detective` | ChatGPT Image redraw of the searching pose                 |
| `chill.png`     | `chill`     | ChatGPT Image redraw of the relaxing pose                  |
| `sleepy.png`    | `sleepy`    | ChatGPT Image redraw of the sleeping pose                  |
| `piggy.png`     | `piggy`     | ChatGPT Image redraw of the saving pose                    |
| `cards.png`     | `cards`     | ChatGPT Image redraw of the cards pose                     |

#### Mascot redraws

The alternate mascot icons used to be generated by applying one aggressive
head crop to the 512px illustration sheets in `assets/mascots/`. That preserved
the rig position, but poses with a prop or side gesture looked visibly
off-centre and several read as accidental crops rather than finished icons.

The eight redraws above were generated from two references: the former variant
tile for pose and prop identity, and the Original icon for the soft 3D finish,
facial construction, close-up scale, and visual weight. Every source uses the
same face-dominant crop as Original; at most one identifying prop stays tucked
against the face. Detached background decoration (sparkles, hearts, confetti,
rays, and floating symbols) is deliberately absent. The generated checkerboard
backdrop was removed into a real alpha channel before these files were added.

#### How `purse.png` was restored

The coin-purse character the app wore from `6f8d4312` (#58) until the chick
mascot landed at `8acb252a` (#420) survives in history as
`6f8d4312:assets/ios/AppIcon~ios-marketing.png`: the full 1024 tile, artwork
sitting on a flat backdrop with no drop shadow.

That backdrop is `#FDF0D8`, **exactly** the cream every variant is composed on
today, which is a coincidence worth stating because it is what makes the
restoration a one-liner rather than the archaeology the icon before it needed.
The tile went through the same `cutOutFromBackdrop` the generator uses on the
shipped icon: the backdrop is the near-cream region reachable from the tile
border, not every near-cream pixel. That distinction is load-bearing here too,
because **the purse's own belly is cream** and a colour threshold would punch a
hole straight through the character's face; the orange body encloses it, so a
flood fill from the border never reaches it.

The 432px `ic_launcher_foreground.png` at the same commit is a clean
artist-authored cut-out and looks like the easier source, but it is 4.7x too
small for a 1024 tile and was left alone.

Re-deriving it is one call, so there is no committed script; the check is that
the cut-out carries no cream fringe on the midnight face and that the belly and
the sparkle are both still there.

## App size and native-only assets

An October 2026 pass cut the Android release APK by about 10% (316.67 MB to 283.34 MB) and the Hermes bundle by about 9%. The measurements are in [.github/pr-assets/app-size/](.github/pr-assets/app-size/measurements.json). What follows is what still applies.

### What contributes to size

The largest reachable asset groups before optimization were category atlases
(24.76 MB), subscription logos (13.92 MB), tutorial captures (12.37 MB), item
icons (7.88 MB), automation illustrations (5.39 MB), the offline cities database
(5.26 MB), bank logos (4.55 MB), and interface illustrations (4.29 MB). Metro
asset hashes deduplicate identical files; an unlisted duplicate is not proof
that an asset is unused.

Across all four APK architectures, native libraries occupy 189.34 MB. The
largest are Skia (40.07 MB), MapLibre (39.54 MB), React Native (22.52 MB), and the
barcode scanner (20.22 MB). They support existing charts, maps and scanning.
Native library bytes and architecture support remain unchanged.

Every runtime dependency has an application import, native/config plugin,
or required peer relationship. No runtime package was removed. In particular,
Skia, worklets and the development client cannot be classified by direct
application imports alone. Source icon packs, artwork sheets and launcher
artwork are generator inputs and were retained.

### What keeps the savings

- Resolve named Lucide imports to individual modules, including aliases. The
  production dependency graph now includes 155 Lucide icon/helper modules,
  down from 1,672. Type and namespace imports retain their normal behavior.
- Bundle only six used Work Sans faces on Android, rather than all 18 faces
  pulled in by the package barrel. iOS retains its existing system typography
  and now bundles none of those unused font assets.
- Remove 74 unused interface illustrations and their generated/flat registry
  entries (2.02 MB). All 1,905 selectable category icons, their stored IDs,
  and all six packs remain intact.
- Compress PNGs, saving 12.84 MB. Lossless candidates must preserve exact visible pixels.
  Quantization is restricted to true-color atlases, interface illustrations,
  and automation captures. Already indexed artwork is not quantized again.
- Quantized candidates preserve fully transparent pixels and must have maximum
  RGB RMSE no greater than 3/255 on both black and white backgrounds. Atlases
  are checked per 128 px icon cell at 52 px display width, rather than averaging
  errors across the whole sheet. PNG dimensions remain unchanged.
- Replace the small news goal-cover photograph with a 1024 × 512 JPEG at
  quality 85, saving 1.99 MB; its in-app cover was visually checked.
- Enable Android release code and resource shrinking. Compressed APK Java code
  drops from 23.49 MB to 8.83 MB. The AAB includes shrinker metadata, which is
  why its total reduction differs from the APK reduction.
- **Shrinking only honours keep rules a native module hands to the app.** A
  module's `proguard-rules.pro` reaches R8 only through `consumerProguardFiles`
  in its Gradle build, and expo-notifications and expo-task-manager shipped
  theirs without it until Expo SDK 58. R8 then stripped the private `writeObject` that
  expo-notifications' `NotificationContent` uses to save its `data` as a string,
  so every reminder carrying `data` (the weekly and monthly reviews) failed to
  schedule on Android 1.5.12 with "Failed to schedule the notification.
  org.json.JSONObject" (Sentry MONEY2TIME-R, ~3,700 events in five days, which
  used up the Sentry error quota). Both modules' rules are still copied into
  `extraProguardRules` in `app.json` as a backstop (expo-task-manager's package
  is `expo.modules.taskmanager` since its Kotlin rewrite, and the copy has to
  match it), and `__tests__/build/androidKeepRules.test.ts`
  fails if any installed module ships rules that are neither consumed nor
  copied. Check that test after adding a native dependency.
- **R8 also renames classes that native code finds by name.** expo-blur 15's
  Android `ExpoBlurView` scoped its blur to the nearest view whose class name is
  `com.swmansion.rnscreens.Screen`, and fell back to the whole content view.
  R8 renamed that class, so in store builds the bottom bar's
  `dimezisBlurView` redrew the entire window (root stack and pushed screens
  included) on every frame. It crashed with a `NullPointerException` in
  `ViewGroup.dispatchDraw` under `ScreenStack.performDraw` while RecurringEditor
  or Tutorials covered the tabs (PostHog 01a14e87, 01a15667, 01a15708; 1.5.13).
  Debug dev clients keep class names, so they never showed it.
  `-keepnames class com.swmansion.rnscreens.Screen` in `extraProguardRules`
  fixed it, and the keep-rules test reads class names from expo-blur's source.
  expo-blur 58 no longer looks anything up: on Android it blurs only inside an
  explicit `BlurTargetView` and otherwise draws just its tint, so the tab bar
  (`NavSurface` in `NavChrome.tsx`) skips the blur on Android and uses its solid 80% surface. The keep rule stays
  as a backstop.
- Include a shared native-image revision in internal update runtimes. A renamed
  or recompressed image excluded from OTA uploads now requires a matching
  rebuilt development/preview app. Production configuration is unchanged.
- Pin image tooling as development dependencies and integrate the same quality
  gate into category-atlas generation so regeneration preserves the savings.

### Internal preview rebuild

Internal development and preview builds have a runtime version that includes the app version, the Expo SDK major (`1.6.1-sdk58-assets-…`, so a dev client built on an older SDK never loads a bundle for a newer one) and a shared content hash of bank logos,
subscription logos, tutorials, and news images. These directories are excluded
from OTA uploads, so their filenames and bytes must match the native build.
Both internal variants use the same revision so a development client can still
load PR previews. Later changes to those images also invalidate old internal
builds; images eligible for OTA retain the existing update flow.

Store builds disable OTA and keep the plain app-version runtime. See [Expo asset selection](https://docs.expo.dev/eas-update/asset-selection/).

### Measuring size

Run both baseline and candidate builds with the same environment and SDK:

```sh
CI=1 APP_VARIANT=production npx expo export --platform ios --platform android --dump-assetmap --source-maps --output-dir /tmp/money2time-size-export --max-workers 4
APP_VARIANT=production npx expo prebuild --platform android --no-install
cd android
APP_VARIANT=production ./gradlew :app:assembleRelease :app:bundleRelease --max-workers=4
```

Set `JAVA_HOME` to JDK 17 and the Android SDK variables to the installed SDK.
When rebuilding after changing an asset, clear these generated directories:

- `android/app/build/generated/res/createBundleReleaseJsAndAssets`
- `android/app/build/generated/assets/createBundleReleaseJsAndAssets`
- `android/app/build/generated/assets/createReleaseUpdatesResources`

Do this first, so obsolete resources and embedded update metadata cannot affect the
comparison. The update-resource task does not track imported image changes
in its incremental inputs.

Review further image candidates without writing, or apply accepted savings:

```sh
python3 scripts/measure-app-size.py android/app/build/outputs/apk/release/app-release.apk android/app/build/outputs/bundle/release/app-release.aab
node scripts/optimize-assets.mjs
npm run optimize:assets
node scripts/generate-category-icons.mjs
```

The optimizer reports per-file bytes, mode and quality error. A repeat pass on
already-optimized assets reports zero savings, and regenerating the category
atlases produces byte-identical images.

## Cloudflare

Everything server-side is on Cloudflare, under `apps/cloudflare`: one directory
per Worker in `workers/` (each its own npm project with its own `wrangler.toml`
and `tsconfig.json`), one schema directory per D1 database in `d1/`, and the
public tutorial-media bucket. None of it is part of the app bundle: it sits
outside the app's project, Metro blocks it, and `.easignore` leaves it out of
the EAS archive. [`cloudflare.yml`](.github/workflows/cloudflare.yml)
typechecks every Worker on a PR and, on merge to `main`, re-applies each D1
schema and deploys.

Inside a Worker's section, paths are relative to that Worker's directory.

### Receipt-scanner Worker

Cloudflare Worker that proxies receipt-scan requests to **OpenRouter**. It keeps
the OpenRouter API key server-side, verifies the
caller's **RevenueCat** entitlement, and meters usage so OpenRouter spend
can't be abused from the no-login app.

State (entitlement cache + rate-limit counters) lives in **D1**
(`money2time-d1-receipt-scanner`, bound as `MONEY2TIME_D1_RECEIPT_SCANNER`) —
schema in `apps/cloudflare/d1/receipt-scanner/schema.sql`.

Served at **`https://workers-receipt-scanner.money2time.com/scan`**.

Lives in `apps/cloudflare/workers/receipt-scanner`. Its contract tests run in the
app's suite, under `apps/mobile/__tests__/cloudflare/`.

#### Endpoint

`POST /scan`

```jsonc
// request
{
  "appUserId": "m2t_…", // settings.appUserId from the app
  "image": "<base64>", // no data: prefix
  "mime": "image/jpeg",
  "currency": "USD", // user's reporting currency
  "categories": ["Food", "…"], // user's expense category names
  "mode": "quick", // "quick" (default) | "itemized" | "screenshot"
  "accounts": ["Visa", "…"], // screenshot mode only, matched against the payment source
}
```

`mode` picks the prompt (hosted in PostHog, see [Hosted prompts](#hosted-prompts)) and the response shape (see `src/scanModes/`): `quick` reads
the total only, `itemized` adds a line-item breakdown for Split by Item, and
`screenshot` also matches the payment source against `accounts`.

```jsonc
// 200
{
  "transactions": [
    /* ScannedTransaction[] */
  ],
  "quota": { "used": 3, "limit": 10, "isPro": false, "interval": "month" },
}
// 402 { "error": "limit_reached", "isPro": false, "limit": 10, "used": 10, "interval": "month" }
// 429 { "error": "capacity" }                       // upstream saturated (retryable)
// 400 { "error": "missing_image" | "invalid_mime" | … }
// 502 { "error": "inference_failed", "detail": "…" }
```

Quota is consumed **only when the parse yields at least one transaction**, so
failed scans and unreadable receipts (`transactions: []`) don't burn a user's
allowance.

#### Config

`wrangler.toml` `[vars]`: `MODEL`, `ENTITLEMENT_ID`, and the per-tier quota:

| Var             | Default   | Meaning                                                         |
| --------------- | --------- | --------------------------------------------------------------- |
| `FREE_LIMIT`    | `20`      | Free scans allowed per window                                   |
| `FREE_INTERVAL` | `100year` | Free metering cadence (a 100-year window ≈ lifetime)            |
| `PRO_LIMIT`     | `500`     | Pro scans allowed per window (fair-use; paywall says unlimited) |
| `PRO_INTERVAL`  | `month`   | Pro metering cadence                                            |

The rate limiter is interval-agnostic (`src/interval.ts`): a `*_INTERVAL` is a
unit (`day`/`week`/`month`/`year`) with an optional count prefix, so changing a
tier's cadence — including a "lifetime" tier via a huge window like `100year` —
needs **no code or schema change**. A `scan_usage` row is keyed by
`(interval_unit, window_start)` where `interval_unit` is the base unit
(`100year` rows store `year`), so switching cadence just opens fresh rows under
the new key. Single-count windows are UTC and calendar-aligned (weeks start
Monday); multi-count windows are anchored at the Unix epoch (`100year` =
1970–2070). Adding another base unit (e.g. `quarter`) is a single case in
`interval.ts` plus its value in the schema's `interval_unit` CHECK. If you
change an interval, update the app's paywall/limit copy to match (free copy
currently says "in total"; Pro is advertised as unlimited).

Switch models by changing `MODEL` — no app change needed. Model IDs use
OpenRouter's naming. Any multimodal model on OpenRouter that accepts image
input works.

If the primary `MODEL` errors or times out (provider down or overloaded), the
Worker automatically retries the request once with `BACKUP_MODEL`
(`google/gemma-3-4b-it` when unset). Set `BACKUP_MODEL` to the same value as
`MODEL` to disable failover. The primary times out early enough to leave the
backup 25 seconds of the 70-second scan budget (`BACKUP_RESERVE_MS`, or half
of what is left when less), so a hung primary cannot starve it.

**`MODEL` is Claude Haiku 5.5 on our own Anthropic key, and `BACKUP_MODEL` is
`qwen/qwen3.7-flash` on OpenRouter credits.** Claude must never run on credits,
and three things hold that line:

- Every request for an `anthropic/` (or `~anthropic/` alias) model, in either
  slot, names
  `provider: { only: ['anthropic'], allow_fallbacks: false }` (`ANTHROPIC_ONLY`
  in `src/index.ts`). OpenRouter also serves Claude from Bedrock, Vertex, Azure
  and Claude Platform on AWS, on its own accounts, which it bills to credits.
- The Anthropic key in OpenRouter (Settings → Integrations) must be set never to
  use shared capacity. Without that, a key that is rate limited or failing runs
  the call on OpenRouter's own Anthropic account instead of answering with an
  error. No request field can say this; it lives only in that setting.
- Every Claude answer's `usage.is_byok` is checked. A `false` logs
  `byok_billed_to_credits` and drops Anthropic models from the rest of that
  isolate's scans, and PostHog records it as `byok: false` on the generation.
  An answer with no `is_byok` at all logs `byok_unverified`.

Each receipt prompt ends with a `## This user's settings` section holding the
user's currency, categories and accounts (`USER_SETTINGS_HEADING`), and nothing
above it changes from user to user. Claude is sent the two parts as separate
text blocks ahead of the image, and the shared one is marked for Anthropic's
1-hour prompt cache (`SHARED_PROMPT_CACHE`), so one cached copy serves every
user; a hit costs a tenth of the input price, a write twice it. An hour rather
than 5 minutes because any user's scan keeps it warm: a scan follows another of
its mode within an hour 100% (screenshot), 99% (quick) and 74% (itemized) of
the time, but within 5 minutes only 98%, 75% and 35%. Other models are sent the
same text as one block, as before. A hosted template without the settings
section (anything published before it), or with nothing or a `{{…}}` variable
above it, has no shared part, so the whole prompt is cached per user for 5 minutes (`PER_USER_PROMPT_CACHE`), which is how it
worked before the settings moved: the same user repeats a scan within 5 minutes
36-40% of the time and barely more within an hour, so there 5 minutes is the
cheaper. Keep per-user text out of the part above the heading, or every scan
writes a cache entry nobody else reads. Each Claude generation records which
of the two it got as `prompt_cache`, and the first per-user scan of a hosted
version in an isolate logs `prompt_cache_per_user`: version 1 stayed on the
`production` label for a week after the shared cache shipped, and with nothing
to say so every Claude scan was cached per user, about half of them writes.

The receipt image is most of a scan's input (about 1,400 of a screenshot's
2,450 tokens) and is new every time, so it is never cached. Even with every
scan hitting the shared prompt, cache reads are about a third of Claude's input
tokens (720, 786 and 1,053 tokens of prompt for quick, screenshot and itemized),
well below a text-only workload whose cached system prompt is most of the
request.

Claude is sent no temperature, and an answer from it with no JSON object in it
counts as a failure rather than an empty result, so the backup gets the receipt.
An image whose bytes are not a JPEG, PNG or WebP (HEIC, however it is labelled)
skips Claude, which refuses it every time, and goes straight to the backup;
Claude is sent the type the bytes are rather than the declared one.
The Anthropic organisation's concurrency limit is low: a burst answers 429 and
lands on Qwen rather than failing the scan. To put Qwen back in front, swap the
two values in `wrangler.toml` and deploy.

Requests carry OpenRouter's app attribution headers, `HTTP-Referer:
https://money2time.com` (which identifies the app there) and `X-Title:
Money2Time` (its display name), the same pair RiceCal sends for itself.

`POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` send one `$ai_generation` per
OpenRouter call to PostHog AI observability (model, tokens, OpenRouter's
reported cost, latency, status; never the image, prompt or result), traced per
request and attributed to the app user. The token is the public, write-only
project token, so it is a plain var; remove it to stop sending. Every request
asks OpenRouter for usage accounting (`usage: { include: true }`) so the real
cost is recorded. See [AI observability](#ai-observability) and
`src/posthog.ts`.

#### Storage (D1)

Two time-bounded concerns, both in the `money2time-d1-receipt-scanner` D1
database (schema in `apps/cloudflare/d1/receipt-scanner/schema.sql`):

| Concern           | Table               | Key                                          | Expiry                                    |
| ----------------- | ------------------- | -------------------------------------------- | ----------------------------------------- |
| Usage counter     | `scan_usage`        | `(app_user_id, interval_unit, window_start)` | window end in `expires_at`; cron-pruned   |
| Entitlement cache | `entitlement_cache` | `app_user_id`                                | `expires_at` checked on read; cron-pruned |

D1 has no native TTL, so every row carries an `expires_at` (epoch-ms) and the
daily cron (`scheduled()`) prunes stale rows. `scan_usage` is one row per
`(app_user_id, interval_unit, window_start)` — `interval_unit` is the cadence
(`day`/`week`/`month`/`year`) and `window_start` is the epoch-ms at the window's
UTC start — so a new window starts a fresh row and the counter increment is a
single atomic upsert on that key. A user's counter is shared across a tier change
within the same window (an upgrade keeps the count and raises the ceiling).

**PR previews share this database.** Preview versions keep the bindings from
`wrangler.toml`, so branch previews read/write the production D1. That's
acceptable: the rows are throwaway rate-limit counters and a 60s cache. A PR
that changes the schema is only applied on merge to `main` (the deploy job), so
test destructive schema changes locally first.

#### Deploy

One-time: add the secrets in the Cloudflare dashboard — Workers & Pages →
money2time-workers-receipt-scanner → Settings → Variables and Secrets → add each
as a "Secret" (encrypted): `OPENROUTER_API_KEY`, `REVENUECAT_SECRET_KEY`, and
`MONEY2TIME_REQUEST_SIGNING_KEY` (the same value as the app's
`EXPO_PUBLIC_REQUEST_SIGNING_KEY`; leave unset to accept unsigned requests),
plus the optional `POSTHOG_PROMPTS_API_KEY` (a PostHog personal API key scoped to
`llm_prompt:read` only; unset serves the bundled prompts).
Dashboard secrets survive every deploy, so they only need to be set once.
(Equivalent CLI, if you prefer: `npx wrangler secret put <NAME>`. When the
latest Worker version is an undeployed PR preview, `secret put` refuses; use
`npx wrangler versions secret put <NAME>`, which takes effect on the next deploy.)

```bash
cd apps/cloudflare/workers/receipt-scanner
npm install

# one-time: create the D1 database, paste its id into wrangler.toml
# ([[d1_databases]] → database_id), then apply the schema
npx wrangler d1 create money2time-d1-receipt-scanner
npx wrangler d1 execute money2time-d1-receipt-scanner --remote --file=../../d1/receipt-scanner/schema.sql

# deploy (provisions the workers-receipt-scanner.money2time.com custom domain)
npm run deploy
```

Production deploys normally run through CI (`.github/workflows/cloudflare.yml`
on push to `main` when `apps/cloudflare/**` changes), which re-applies the schema
before every deploy — so additive schema changes ship on merge without a manual
step. Keep the schema idempotent (`IF NOT EXISTS`).

#### Local dev

```bash
# apply the schema to the local dev DB first
npx wrangler d1 execute money2time-d1-receipt-scanner --local --file=../../d1/receipt-scanner/schema.sql

npx wrangler dev
curl -X POST http://localhost:8787/scan \
  -H 'Content-Type: application/json' \
  -d "{\"appUserId\":\"m2t_test\",\"image\":\"$(base64 -w0 sample-receipt.jpg)\",\"mime\":\"image/jpeg\",\"currency\":\"USD\",\"categories\":[\"Food\",\"Groceries\",\"Other\"]}"
```

#### Notification review

Notifications are handled entirely on-device. They do not call this Worker,
OpenRouter, RevenueCat entitlement verification or receipt-scan quotas.
The retired `mode: "notification"` endpoint returns HTTP 400 with
`notification_scanning_removed` before any entitlement, quota or inference call.
Receipt photo, itemized and payment screenshot modes retain their prompts,
transport, model failover and quotas.

Run the root receipt client/image regression suites and this Worker's typecheck
when modifying this endpoint. CI deploys Worker changes on merge: coordinate
the app rollout with endpoint retirement. Older clients cannot process
notifications against the retired endpoint until they update.

### Web-dashboard Worker

The Web Dashboard. A phone sends its data live to a browser it linked by QR
code, and [app.money2time.com](https://app.money2time.com) shows it on a
computer, where entries can also be added, edited and deleted while the phone
is connected. Nothing is stored online: this Worker is a relay with no
database, no bucket, no account and no secrets. Served at
`workers-web-dashboard.money2time.com`.

- **Rooms:** `GET /v1/room?role=phone|browser` upgrades to a WebSocket into a
  Durable Object room (hibernation API) with at most one phone and one browser.
  The room's token travels in `Sec-WebSocket-Protocol: m2t-v1, <token>`, never
  in the URL, and the room is named after its SHA-256, so request logs and the
  Durable Object id never show a token. Each message from one side goes
  straight to the other; the room makes no storage calls and keeps nothing
  after forwarding. It tells each side when the other arrives or leaves, drops
  any `peer` notice a client tries to forge, and a newer connection for a seat
  replaces the old one (close code `4000`, shown as "open in another tab").
  Only the dashboard's origin may take the browser seat (this keeps other web
  pages out, not scripts, which can claim any origin: the room token is the
  access control), and connections are rate limited per address (per /64 for
  IPv6). Each connection has a byte budget while the room is awake (300 MB
  from the phone, 24 MB from the browser), so a busy visit is not cut off but
  a socket cannot be used as a free pipe. Invocation logs are off. CI redeploys this Worker only when its own
  files change: a new version restarts the rooms and drops every connection.
- **Phone UI:** Settings → Web Dashboard shows a **Link a device** button,
  with each linked browser below it as one row (status and last-sync age), a
  sync button beside the section title, and Allow changes / Make view only and
  Unlink under the row's menu. The camera opens inline only after that button
  is tapped, with a Cancel under it, and closes again once the attempt is over
  (linked, cancelled or failed; a code that is not a pairing code leaves it up
  for another try) and when the screen loses focus, so the screen never holds
  the camera while it is only being used to sync. In the background it only
  pauses: Android reports its camera permission dialog as the app going to the
  background, so closing there would close the camera just allowed. A scanned
  `money2time://pair` link opens the same screen and links without the camera.
  The Link prompt waits until the app lock is unlocked (a link still waiting
  when the screen closes is cancelled) and says the browser can change entries
  while the screen is open. A line above the list says allowed browsers can
  edit while it is open, a view-only browser says so on its row, and a saved
  batch shows a short notice.
- **Linking:** the browser shows `money2time://pair?r=…&pk=…&s=…`: a one-off
  room token, a P-256 public key and a 16-byte secret. The phone scans it,
  sends its own public key through that room, and both derive, with ECDH →
  HKDF-SHA256 salted with the QR secret, the link key, a private room token
  for later visits and a six-digit code. The secret only travels through the
  camera, so the relay cannot stand in for either side. Both screens show the
  code, and the link needs a tap on each: the phone first, then the browser
  (`services/webDashboardLink.ts`). A second phone answering the same QR makes
  the browser show a new one.
- **Transfer:** whenever the phone's Web Dashboard screen is open and a
  linked browser is too, the browser asks with a fresh nonce and the phone
  builds the Export Database JSON (with logos, icons and covers, never
  receipts, payment QR codes, the avatar or uploaded card photos), gzips it and sends it in 256 KB chunks, each
  sealed with AES-256-GCM under a per-transfer key and bound to its index and
  count, with an ack window of 8. The per-transfer key travels inside the
  sealed `begin`. The browser decrypts each chunk as it arrives, then keeps the
  encrypted chunks and a non-extractable WebCrypto key in IndexedDB until it
  is unlinked. Every message is sealed with the link key and its direction,
  and a transfer must echo the nonce of a request the phone has not answered
  before, so the relay sees only ciphertext and cannot reflect or replay one.
  Transfers are capped at 128 MB. Both sides ping every 25 s; the room answers
  without waking. A reload or a new tab takes the browser's seat: the phone
  drops the old request and any transfer to it, and answers the new tab's
  request. A request the phone cannot prepare (too large, an export error) is
  answered with `unchanged`, so the browser stops waiting. The sealed `begin`'s
  `meta` also carries the phone's app version, time zone, Pro state and
  `analyticsId` (the pseudonymous `settings.appUserId`), which the dashboard
  uses to report its own events as the same PostHog person and GA4 user;
  older apps send none, and their browsers stay anonymous.
- **Patches:** a browser whose copy the phone still has gets only what
  changed (`services/webDashboardPatch.ts`; the web applies it with the same
  rules in `src/lib/cloud/patch.ts`), so deleting one entry comes back as a
  few hundred bytes instead of the whole export. Each `want` names the copy
  it holds (`have`); the answer is an ordinary transfer with `meta.base` set
  to that copy's id. The phone finds the copy in memory (its last 3
  transfers while the screen is open, `WebDashboardConnections.snapshots`,
  each row as JSON by id) or on disk: the copy each browser last accepted is
  kept across visits and relaunches in `web-dashboard-copies/` in the cache
  directory (one file per browser, named after its room token's SHA-256) as
  row ids and a 64-bit hash per row and photo, with no amounts, notes or
  names; unlinking deletes it, and a missing or cleared file only means the
  whole export. Tables whose rows all have a unique `id` change row by row
  (`put`, `del`); other tables are sent whole when changed (`all`, `null`
  when gone); logos and covers change by path. A copy from before an app
  update that changed the backup's top-level fields gets the whole export
  (`sameFormat`). The whole export is built from the same row strings
  (`exportJson`), so every row is serialized once per transfer either way.
  The browser shows the patched data, then gzips and seals it under its own
  key in the same chunk format, so its cache and `have` stay in step. A
  browser that cannot apply a patch asks again with `repair` and gets the
  whole export at once, past every limit, once per patch. Older browsers send
  no `have` and older apps ignore it, so either side can update first. Logos,
  icons and covers are re-read only when a file's size or modification time
  changes, and folders the dashboard never shows are not listed
  (`collectUserAssetsForBackup`'s cache and `include`).
- **Skipped requests:** whole exports are rate limited. A browser that opens
  or reconnects and may not edit gets at most one copy a minute. Refresh and
  Send now rebuild at most every 10 s. The same data is not sent again within
  10 s to a browser holding a token for it. A browser whose `have` the phone
  can patch skips the first two limits. A skipped request is answered with a
  sealed `unchanged`, so the page stops showing data on its way; it carries
  `current` when the browser holds the copy last sent to it, so its edit
  token is still good and it can take changes again without waiting for
  data. Each decision is about one request (`WantRequest.nonce`): a newer
  request replaces it and is answered in its own turn.
- **Editing:** the web has the app's create, edit and delete flows, and they
  run only while the phone is connected (its Web Dashboard screen is open and
  the app is in the foreground), so the browser never edits a copy that has
  drifted from the phone, and only from a browser the person allowed:
  confirming a link allows it, and the row's ⋯ menu turns it on or off
  (`LinkRecord.edits`; a stored link without the flag is view only).
  Covered: transactions (every editor type and setting, split bills and
  settling up, claiming back reimbursements, and the selection bar's bulk
  actions), accounts and groups, goals, loans, categories (subcategories,
  default-pack and emoji icons, delete with reassign), recurring rules, budget
  templates and monthly budgets (the web is not sent weekly or yearly
  ones), items, albums, hourly-value wage months, added
  currencies and manual rates, and the order of accounts, groups and
  categories. App-only by design: image uploads (receipts, covers, custom
  logos and icons, card photos), the Pro icon packs, changing the main
  currency, and online rate refreshes.
  - **Protocol:** the browser sends a sealed `edit` with a batch of ops; the
    phone answers with a sealed `edited` and offers every open browser the
    changed data. Built-in entities (`transaction`, `account`, `group`,
    `category`, `recurring`) are read and planned in
    `services/webDashboardEdits.ts`; the rest are modules in
    `services/webDashboardEditModules/` (`module:goal`, `module:loan`,
    `module:budget`, `module:item`, `module:album`, `module:split`,
    `module:reimbursement`, `module:wage`, `module:currency`,
    `module:reorder`), each with a saver in
    `features/settings/lib/webDashboardApply/`. A batch holds at most 50 ops
    and 500 rows, and must fit the room's 64K-character text frame (the
    browser checks the rows and size before sending). The `edited` answer goes
    out on whichever connection is open when the save ends, so a reconnect
    meanwhile does not lose it.
  - **Checks:** the phone checks the whole batch before saving any of it: each
    op is read strictly (known keys only, own properties only), then planned
    with the rules of the app's editor for it (the payload per transaction
    type, what a free plan allows, what a loan or goal lets change, two-level
    categories of one type, an uploaded logo only kept, never set). Every
    update and delete names the row's `updated_at` from the browser's copy,
    and a row changed or gone on the phone refuses the batch (`conflict`). A
    batch names each row once (`invalid` otherwise): a split share, a goal's
    auto-save or a loan's repayment rule, the active album and a template a
    month is made from all count as their parent row. Later ops see what
    earlier ones did: an account or category deleted cannot be used, a group
    created can, and a group renamed or deleted moves its accounts with it (so
    the browser's `updated_at` for them no longer matches). An update of many
    transactions changes only what a bulk edit changes (day, note, category,
    and the account of expenses and income, into one of each row's
    currency). Balances, the unpaid split-bill count and the expense months
    the budget pager offers are read when an edit arrives, never from the
    hidden Settings tab's held `useTransactions()`, and a module's data is
    read only when the batch names it.
  - **Saving:** through the AppContext calls the app's own screens make
    (`features/settings/lib/useWebDashboardEditor.ts`), then
    `afterDeferredWrites`, then a check that new, updated and deleted
    transactions landed and that a reimbursement was marked or unmarked (the
    app's deferred writes swallow a failure, and skip an expense they cannot
    find without a word). Saving is step by step, not atomic: a step failing partway answers
    `unknown` (some may be saved), and fresh data follows. At most 4 edits wait
    at once (`busy` past that).
  - **Freshness:** each transfer carries a per-browser, single-use `editToken`
    in its sealed `begin` and the phone's data version (`meta.version`, read
    when the export starts). A saved batch raises the version before it saves
    (spending every browser's token) and again once its writes have landed,
    and answers with the second; the browser allows no further change until it
    has data at that version. A token is kept only for data at the current
    version (one handed out while the writes were landing is spent once they
    have), a browser mid-transfer is offered fresh data when that send ends,
    and the same data is not re-sent to a browser holding a token for it within
    10 s (so a reconnect loop or stale retries cannot make the phone export in
    a loop). Changes made on the phone itself meanwhile (recurring runs,
    auto-log) do not spend tokens; the per-row `updated_at` checks protect
    those rows. An app that predates this sends no token, and the web stays
    read only for it.
- **Pro:** the phone says whether it has Pro with each transfer (`meta.pro`).
  The web opens its one paywall (`paywall.tsx`) for the 12M, YTD, Year and
  All periods, each free-plan limit, and a `pro_required` refusal. Pro is
  bought in the app.
- **Unlinking:** either side sends a sealed `unlink` and keeps a tombstone
  until the other confirms, so an unlink made while the other side is closed
  is delivered the next time both are open (the phone keeps its tombstones for
  180 days). The browser then deletes its key and copy. Link keys live in the
  phone's keychain (at most eight).

No secrets. Vars in `wrangler.toml`: `ALLOWED_ORIGINS`. The app reads the base
URL from `EXPO_PUBLIC_MONEY2TIME_WORKERS_WEB_DASHBOARD` (defaults to
production). Local development: `npm run dev` with a `.dev.vars` setting local
`ALLOWED_ORIGINS`.

### Live-earnings Worker

Raises the app's live-earnings Live Activity at the start of a scheduled shift,
then pushes the money figure to it once a minute for the life of the session.

#### Why this exists

A Live Activity repaints only its **time-derived** views on its own: the elapsed
clock and the progress bar are drawn by iOS from two dates and move with no help
from anyone. The money figure is a plain string, frozen at whatever the last
update carried. On the Lock Screen the app is suspended and cannot run code, so
the only thing left that can move that string is an ActivityKit push.

The same constraint, one step earlier, is why the Worker also **starts** the
card. `Activity.request()` is foreground-only: an app cannot put a Live Activity
on the Lock Screen at 9am by itself, however it is scheduled, so the auto-start
schedule used to be a notification the user had to tap. A **push-to-start**
token (iOS 17.2+) removes the tap. It addresses the activity _type_ on a device
rather than any card, it outlives every card raised from it, and a push to it
starts one with the app not running at all.

That is the whole feature. Everything below is plumbing for it.

An ActivityKit push is **not a notification**: no banner, no sound, nothing in
Notification Center, and — the part that makes this acceptable to ship — it
requires **no notification permission at all**. Live Activity delivery is
independent of an app's notification settings, so this works for users who have
denied notifications outright.

#### Shape

```
POST /live-earnings/register        { appUserId, pushToken, environment, startedAt, endsAt, hourlyRate, currencySymbol }
POST /live-earnings/unregister      { appUserId, pushToken? }
POST /live-earnings/schedule        { appUserId, pushToStartToken, environment, timeZone, days, hour, minute, durationMinutes, hourlyRate, currencySymbol, ...prerendered copy }
POST /live-earnings/schedule/clear  { appUserId, pushToStartToken? }
GET  /health                        { ok, configured }
cron * * * * *                      start what is due, push every running session, prune the rest
```

`register` is an upsert keyed by the push token, so the app can call it freely:
that one call covers first registration, repair after being offline, and a token
ActivityKit rotated mid-session.

In practice the first call happens on the app's **first transition out of the
foreground**, not when the clock starts. ActivityKit mints the token per
activity and asynchronously, so `Activity.request()` returns before it exists -
measured on a simulator it is still nil seconds later, on an install that has
run sessions before. An early version waited for it and bought nothing but a
Start button that stalled. Leaving the app is the moment before the Lock Screen
is looked at anyway, so nothing is lost.

`unregister` without a token drops every card for the account, which is what a
sign-out wants.

`schedule` is the same shape of upsert, keyed by the **push-to-start** token and
called on every app foreground. It carries the shift (weekdays, local time,
length), the rate, the device's IANA zone, and every string the card will show,
already rendered - see below. The app names the token when it clears one, so
turning auto-start off on one phone never disarms another.

#### Starting a shift

`next_start_at` is precomputed per row, so the cron's question each minute is a
range scan rather than a sweep of everyone's calendar. It is recomputed on every
register and after every pass, always **strictly forward** from now, which is
what stops a foreground at 09:00:30 from re-arming the 09:00 start that has just
fired.

A schedule is a **wall clock**, not an offset: 09:00 stays 09:00 across a
daylight-saving change, which is why the zone is registered and the arithmetic
walks local calendar days (`src/schedule.ts`). Someone who travels keeps firing
on the zone they left until the app next opens, which is what an alarm clock
does too.

Three states the pass refuses to start in, because the cost of getting them
wrong is a Lock Screen that lies:

- **A card is already up for that account.** The user clocked in by hand this
  morning, or a long shift is still running. A second card would count the same
  hours twice. The schedule rolls on to tomorrow rather than retrying.
- **The start is more than `START_GRACE_MS` late.** A phone that was off all
  morning gets the push the moment it comes back, and a card claiming a shift
  began at breakfast is worse than no card. APNs is given a matching
  `apns-expiration`.
- **APNs is not configured.** Rows are left armed rather than rolled forward
  past a start that never went out.

A start push carries the whole activity: `attributes-type`, the full
`attributes`, an opening `content-state` of zero, and an `alert` (Apple requires
one so a card cannot appear entirely unannounced; on iPhone the card _is_ the
notice, and the alert is what a paired Apple Watch shows). The two session times
travel as **millis**, never as dates - a Swift `Date` decodes under
JSONDecoder's default strategy as seconds since the 2001 reference date, so a
Unix timestamp would land the shift 31 years out without throwing.

Once the card is up the app is woken in the background, reads the new activity's
**update** token and registers it through `register` above - which is what makes
the amount start ticking. Until then the card's clock and progress bar are live
(iOS draws those itself) and the figure sits at zero.

#### What the cron does

For each row still running it computes the amount from `(started_at,
hourly_rate)` — money accrues linearly, so the figure at any instant is
arithmetic — and pushes it, unless the formatted figure is identical to the last
one pushed. That skip matters: late in a long session at a modest rate the
amount only changes every few minutes, and each push not sent is one left in
Apple's delivery budget.

A session past its end gets one final `end` event and its row is dropped. A
token APNs rejects as dead (`Unregistered`, `BadDeviceToken`) is dropped
immediately; anything transient (429, 5xx, a rejected provider token) leaves the
row for the next minute.

**The amount is formatted here, not sent from the app.** It has to be, because
the app is asleep — but it also has to match, because the app formats the figure
it pushes on foreground and a user must never see the number change shape
depending on which one got there last. `src/earnings.ts` is a deliberate port of
the app's own helpers, and `apps/mobile/__tests__/services/liveEarningsPushContract.test.ts`
in the app imports both sides and fails if they drift.

#### Cost, and what bounds it

The cron fires every minute forever, whether or not anyone is tracking. That is
cheap and deliberately so:

- **Invocations.** ~43,800 a month, against 10M included on the paid plan.
- **CPU.** Workers bill CPU time, not wall clock. A window sleeps ~50 seconds
  between ticks and sleeping is not CPU, so a long window costs nothing extra.
  This is worth knowing before the 60-second window looks alarming.
- **D1 when idle.** A minute with nothing running or due is two reads and, nine
  minutes in ten, nothing else — both sweeps are throttled to one minute in ten
  precisely so an idle deployment is not doing ~43,000 pointless deletes a
  month.
- **D1 when busy.** One read per window and one write per session that actually
  moved, because the ticks share an in-memory view rather than re-reading and
  re-writing per tick.
- **APNs.** One push per session per tick, skipped entirely when the formatted
  figure has not changed.

Four things bound the blast radius, all of them tested:

1. **A schedule cannot outlive its install.** The app re-registers on every
   foreground, so a row that has gone quiet for `SCHEDULE_STALE_MS` belongs to
   an install that is gone and is swept. Most are dropped sooner, by APNs
   reporting the token dead.
2. **A session cannot outlive its own end.** Registration rejects anything
   longer than the 8 hours iOS itself allows, and the reaper drops the row once
   `ends_at` has passed. There is no path to a row that is pushed forever.
3. **A window cannot exceed its subrequest budget.** External subrequests are
   capped per invocation (10,000 paid, **50** free). Rather than assume the
   ceiling, the window scales to it: the tick rate falls as concurrent sessions
   rise, every session keeps its one guaranteed metered push a minute, and both
   the degradation and the point where sessions would be dropped entirely are
   logged. A free-plan deployment must lower `MAX_PUSHES_PER_WINDOW`.
4. **A window cannot overlap the next one.** It stops starting ticks at
   `WINDOW_DEADLINE_MS`, so a slow APNs round trip costs resolution rather than
   doubling every push.

#### Security model

Be clear about what the request signature is: a shared secret shipped inside
the app bundle (`EXPO_PUBLIC_REQUEST_SIGNING_KEY`), so it is extractable by
anyone who unpacks the IPA. It raises the cost of casual abuse. It is not
authentication, and nothing here should be designed as though it were.

What that leaves, and why it is acceptable:

- **Registering someone else's card.** Needs a valid ActivityKit push token for
  this app's topic, which cannot be forged and is only ever issued to a real
  install of this app.
- **Registering junk to make the cron work.** Bounded on both axes: rows expire
  with the session (8 hours, hard), and an account keeps at most
  `MAX_SESSIONS_PER_USER` of them. A fabricated token also self-heals in one
  window - APNs answers `BadDeviceToken` and the row is dropped.
- **Unregistering someone else's session.** Possible if their `appUserId` is
  known; it is a v4 UUID that never leaves the device except in these calls.
  The cost is one stopped card, recovered on their next app foreground.
- **Starting someone else's card.** Same shape as registering one: it needs a
  real push-to-start token for this app's topic, which only a genuine install is
  ever issued. Schedules are capped per account like sessions.
- **What is stored.** Push token, app user id, session window, currency symbol,
  and the user's **hourly rate** - which is salary-derived and the most
  sensitive field here. It is required to compute the figure, it is never
  logged, and it lives at most 8 hours. Nothing else about the user is stored,
  and no transaction data ever reaches this Worker.

Tokens are never written to logs. A dropped token is reported by APNs reason
only.

#### Configuration

`APNS_BUNDLE_ID` is a plain var in `wrangler.toml` (the Worker appends the
`.push-type.liveactivity` topic suffix itself). The rest are **secrets**, added
in the dashboard under Settings → Variables and Secrets:

| Secret                           | Where it comes from                                       |
| -------------------------------- | --------------------------------------------------------- |
| `APNS_KEY_ID`                    | Key ID of the APNs auth key (Apple Developer → Keys)      |
| `APNS_TEAM_ID`                   | Apple Developer Team ID                                   |
| `APNS_PRIVATE_KEY`               | Contents of the `.p8`, PEM, BEGIN/END lines included      |
| `MONEY2TIME_REQUEST_SIGNING_KEY` | Same value as the app's `EXPO_PUBLIC_REQUEST_SIGNING_KEY` |

The APNs key must be enabled for **Apple Push Notifications service**; one key
serves every app on the team, and the same key works for both gateways.

Until those are set the Worker still accepts registrations and simply does not
push — `GET /health` reports `configured: false`, and each cron tick logs that it
skipped. That is deliberate: a half-configured deploy leaves cards frozen (which
is the old behaviour) rather than dropping sessions on the floor.

#### Sandbox vs production

A push token minted by a development build is rejected outright by the
production gateway, and vice versa. The app states which kind of build it is at
registration (`environment`) rather than leaving the Worker to guess or to try
both — so a debug build on a device pushes through `api.sandbox.push.apple.com`
and a TestFlight/App Store build through `api.push.apple.com`.

#### Local

```bash
npm run dev        # wrangler dev
npm run typecheck
```

The interesting logic is covered by the **app's** test suite rather than a
runner here — `apps/mobile/__tests__/services/liveEarnings{PushContract,StartContract,Apns,Cron,Starts}.test.ts`
import these modules directly, including a real P-256 key to verify the ES256
provider token end to end. `StartContract` is the one to know about: it reads the
Swift `ActivityAttributes` struct out of the app's config plugin and fails if the
start payload here stops matching it, because nothing else would notice — APNs
returns 200 for a payload the device then discards.

### Tutorial media (R2)

The `money2time-assets` R2 bucket serves published tutorial media at
`https://media.money2time.com`. It belongs to the same Cloudflare account and
`money2time.com` zone as the app's Workers. The custom domain is enabled with
minimum TLS 1.2; the development `r2.dev` URL stays disabled.

This bucket contains public app assets. User data and backups belong elsewhere.
The app opens videos through the top-right video link in each automation
tutorial, using the URLs in `constants/autoLogIntents.ts`. Notifications uses
the same **Watch video** button as the other automation tutorials.

#### Published video

- Object: `tutorials/ios/notifications/setup-2026-10-07.mp4`
- URL: <https://media.money2time.com/tutorials/ios/notifications/setup-2026-10-07.mp4>
- Recording: iPhone 18 Pro simulator, iOS 27, real Shortcuts editor with Wallet
  and synthetic Money2Time accounts, recorded after the feature was renamed to
  Notifications. The Log Notification action binds Message to Notification Body
  and selects Account. Includes instructional captions and Argent touch markers.
- Editing: idle time removed per step, then played at 2.5x with a short hold on
  each caption, so the whole setup runs in about 32 seconds (the previous 2x cut
  ran 54 seconds).
- Encoding: H.264 MP4, 900 × 2120, approximately 32 seconds.
- Size: 2,610,503 bytes.
- SHA-256: `3de482a147d2a9dd4ac8fa1897f96a950367484b9efe5e2caa292aeee3c4da5e`.
- Local file: `Money2Time-iOS-Notifications-Setup-2026-10-07.mp4` in Downloads.

Earlier versions stay in the bucket and are no longer linked:
`tutorials/ios/app-notifications/setup-2026-10-05.mp4` (1x) and
`setup-2026-10-05-2x.mp4` (2x), both showing the old Log Payment Alert name.

#### iOS 27 automation walkthroughs

Built from screenshots taken on an iPhone 15 Pro Max running iOS 27.0.1 (light
mode), one step per caption, with a pulsing yellow ring on each control to tap.
The shortcut-list frame has the owner's own shortcut names painted out. H.264
MP4, 900 × 1952, 15 fps. The app links them only on iOS 27 and later; earlier
iOS keeps the YouTube walkthroughs.

| Object                                                  | Length | Bytes   | SHA-256                                                            |
| ------------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------ |
| `tutorials/ios27/log-card-payment/setup-2026-10-09.mp4` | 29.7 s | 686,563 | `88a92bf9e1efa090beff9d661dc74ba82650a7d9e7e86920fceceb1824c13dfa` |
| `tutorials/ios27/new-transaction/setup-2026-10-09.mp4`  | 13.9 s | 360,351 | `73faf792377a27773357e69355d5c1b1e06d1f8021633c3a48ab006d25ca7aa4` |
| `tutorials/ios27/log-screenshot/setup-2026-10-09.mp4`   | 13.9 s | 358,103 | `5268219e4112f4317be95d1d29663533cc0a4788c4d7743b4d2a8c88a184d722` |

Each public URL returned the same hash, `video/mp4`, and `206` for a byte-range
request after upload.

#### Upload a new version

Use a new dated object key when a tutorial changes, then update its URL in
`constants/autoLogIntents.ts`. Existing versions use a one-year immutable cache
header and must not be overwritten. The local recording remains in Downloads;
videos are not bundled into the app or committed to Git.

From the repository root, using the existing Wrangler installation and login:

```bash
apps/cloudflare/workers/receipt-scanner/node_modules/.bin/wrangler r2 object put \
  money2time-assets/tutorials/ios/notifications/setup-2026-10-07.mp4 \
  --remote \
  --file "$HOME/Downloads/Money2Time-iOS-Notifications-Setup-2026-10-07.mp4" \
  --content-type video/mp4 \
  --content-disposition inline \
  --cache-control 'public, max-age=31536000, immutable'
```

After uploading, verify that the public URL returns the expected MP4, that a
byte-range request returns `206 Partial Content`, and that the tutorial's Video
link opens and plays it on iOS. Record the new object's size and hash in the
table above. No Worker deployment or app native rebuild is required.

## CI and deploy

App CI/CD is [.github/workflows/deploy.yml](.github/workflows/deploy.yml), gated `changes → test → plan → deploy`:

- **Changes** — runs first on every event and classifies the diff (`git diff` of the PR merge commit's base parent, or the push's `before..after`) into three flags every other job keys off: `app` (anything that can reach the mobile binary, i.e. everything except `apps/cloudflare/**`, `.github/**`, `.claude/**`, `.agents/**`, `.codex/**`, `.vscode/**`, any `*.md`, `LICENSE`), `worker` (non-markdown `apps/cloudflare/**`), and `checks` (anything outside `apps/cloudflare/**`). **Fail open:** an unresolvable diff or an unrecognized path sets every flag true, so a new directory builds the app rather than silently skipping the release.
- **Test** — `npm ci`, `npm run check` (typecheck + lint + format), `npm test`. Runs in `apps/mobile`. Skipped when `checks` is false, because eslint and tsconfig only see the app, prettier sees the app plus the root `*.md` and `.github/`, and jest only reads `__tests__/` — there is literally nothing for it to check on a Worker-only change. A failure blocks everything downstream.
- **PR preview** (`preview-pending` → `worker-preview` → `pr-update`) — pull requests only, and only when `app` or `worker` is set (docs-only PRs publish nothing). `worker-preview` uploads a per-PR aliased receipt-scanner Worker version **only** when `worker` is set; when it is skipped, `pr-update` points the EAS update at the production Worker URL instead.
- **Plan** — manual dispatch, or push-to-main **when `app` is set**. A Worker-only or docs-only merge to `main` therefore never cuts a store build. Resolves the build matrix (push = both iOS+Android production; dispatch = the chosen single platform/profile).
- **Deploy** — from `apps/mobile`, `eas build --local` on the matched runner (macos-15 for iOS, ubuntu-latest for Android), then `eas submit`. `fail-fast: false` so a single-platform failure doesn't kill the other build.

Cloudflare has its own workflow, [.github/workflows/cloudflare.yml](.github/workflows/cloudflare.yml) (typecheck and a `wrangler deploy --dry-run` bundle on PRs; on push to `main`, for each Worker whose own files or schema changed since the last successful production deploy, the D1 schema apply where it has a database, then `wrangler deploy`), path-filtered to non-markdown `apps/cloudflare/**` so an app-only change never redeploys the Worker and vice versa. Both directions of that split are deliberate: **gate jobs with `if:`, not workflow-level `paths:`** — a job skipped by `if:` reports success to branch protection, while a whole workflow skipped by a path filter leaves its required checks pending forever.

**Over-the-air updates are internal-only.** `app.config.ts` sets `updates.enabled` from `APP_VARIANT`: on for `development` / `preview` (so the PR-preview `eas update` QR flow works), **off for store builds**. Nothing is ever published to the `production` channel — releases go out as store binaries. A store build therefore launches straight from its embedded bundle and skips the expo-updates launcher entirely; when that launcher failed to resolve an update's launch asset, React Native never received a bundle and the user was stuck on the native splash until their next store update changed the runtime version (hundreds of users across 1.3.3–1.4.3 in Sentry, `Expo Updates emergency launch`). If you ever want production OTA back, that failure mode comes back with it.

Concurrency group `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` — a new push to `main` cancels the in-flight run; new commits to a PR cancel previous test runs. Requires repo secret `EXPO_TOKEN`. Push to `main` auto-submits to TestFlight (iOS) + Play **production** (`production` track, Android); promote to App Store manually.

### At a glance

Two workflows, split so an app-only change never redeploys the Workers and vice versa.

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) — the app:

| Job                                                | Runs on                                       | What it does                                                                                                |
| -------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `changes`                                          | every event                                   | Classifies the diff into `app` / `worker` / `checks` flags. Fails open: an unresolvable diff sets all three |
| `test`                                             | when `checks` is set                          | `npm ci` → `npm run check` (typecheck + lint + format) → `npm test`                                         |
| `preview-pending` → `worker-preview` → `pr-update` | pull requests, when `app` or `worker` is set  | Publishes an `eas update` preview, pointed at a per-PR Worker version when one was built                    |
| `plan`                                             | push to `main` when `app` is set, or dispatch | Resolves the build matrix (push = both platforms production; dispatch = the chosen one)                     |
| `deploy`                                           | after `plan`                                  | `eas build --local` on macos-15 (iOS) / ubuntu-latest (Android), then `eas submit`                          |

[.github/workflows/cloudflare.yml](.github/workflows/cloudflare.yml) — the Workers: typecheck and dry-run bundle on PRs; on push to `main`, only the Workers changed since the last successful deploy get their D1 schema applied (where they have one) and `wrangler deploy`, so a run cancelled while queued or failed is caught up by the next. A deploy that has started is never cancelled by a newer push.

A failing test blocks everything downstream. Concurrency cancels in-flight runs when a newer commit lands on the same ref. Requires repo secret `EXPO_TOKEN`. Pushes to `main` auto-submit to TestFlight (iOS) and the Play **production** track (Android); the App Store release is promoted by hand.

Over-the-air updates are **internal-only** — `updates.enabled` is on for the development and preview profiles (so the PR preview flow works) and off for store builds, which launch straight from their embedded bundle.

## Testing

```bash
cd apps/mobile
npm test
```

Jest with `ts-jest` over `__tests__/` (184 suites, node env). Modules with native deps are mocked via `__tests__/__mocks__/` (i18n, haptics, DB client, drizzle, expo-localization, image assets). Coverage skews to pure utilities, feature math, repository mappers, and navigation helpers — no React Native render tests.

### Receipt-scanner regression images

In `__tests__/fixtures/receipts/scanner-regression/`.

These images contain only synthetic merchants, amounts and account names. They
exercise the existing image modes after adding notification text scanning.

| Image                    | Mode         | Request context                                        | Expected result                                                                                           |
| ------------------------ | ------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `receipt.png`            | `quick`      | Currency MYR; categories Food, Other                   | One MYR16 expense; ignore subtotal 15, tendered 20 and change 4                                           |
| `receipt.png`            | `itemized`   | Currency USD; categories Food, Other                   | One USD16 expense; receipt currency MYR; Coffee quantity 2 / line total 12, Tea quantity 1 / line total 3 |
| `payment-screenshot.png` | `screenshot` | Currency MYR; accounts Everyday Account, Travel Wallet | One MYR16 expense from Everyday Account; ignore balance 999                                               |
| `multiple-receipts.png`  | `quick`      | Currency MYR; categories Food, Other                   | Two expenses: MYR16 and MYR7.50; consume one image scan                                                   |

POST each image as base64 with its MIME (`image/png`), mode, request context and
synthetic `appUserId` to an authenticated scanner preview's `/scan` endpoint.
Run the four cases on the configured primary, then on a preview that forces the
backup by configuring an unavailable primary. Do not deploy that configuration.
The itemized currency assertion preserves the existing distinction between the
requested transaction currency and the currency detected on the receipt itself.

The 2026-10-08 evaluation passed all eight cases on the primary and forced backup.
Amounts, item quantities/currencies and account detection were checked; merchant
wording was allowed to vary. Once the printed date is more than 30 days old,
responses should use today's date, following the Worker's existing date clamp.
Recorded responses and limits are in
[receipt regression evidence](.github/pr-assets/notification-text-scanning/receipt-regression-results.json).

### Performance measurement

Scripts in `scripts/perf/`.

Scripts for timing cold start and transaction entry on a simulator or
emulator with a large data set. They read the `[m2t-perf]` lines that
`utils/perfTrace.ts` logs, which only exist in a build bundled with
`EXPO_PUBLIC_PERF_TRACE=1`; every other build compiles the probes away.

1. Build a release app with the probes on, e.g.
   `EXPO_PUBLIC_PERF_TRACE=1 ./gradlew assembleRelease` in `android/`, or
   `EXPO_PUBLIC_PERF_TRACE=1 xcodebuild -configuration Release -sdk iphonesimulator ...`
   in `ios/`. Measure the build you compare against the same way.
2. Load the data set once (restore a backup in the app), then save a snapshot
   so every run starts from the same state:
   - iOS: copy `Documents/SQLite` and `Documents/user-assets` out of the app's
     data container and pass that folder as `--golden`.
   - Android: tar `files/SQLite` and `files/user-assets` to
     `/data/local/tmp/golden.tar` on the device (the scripts restore it as root).
3. Run the scripts, several times per build, and compare medians:
   - `measure-startup.mjs <ios|android> --device <id> --runs 10 --golden <dir|any>`
     times launch to first screen, the data load, and the frame gaps in the
     five seconds after the splash lifts. `--backup-due` marks the daily
     auto-backup as due, as on the first launch of a day.
   - `measure-save-android.mjs` times a quick-add save.
   - `measure-launch-tap-android.mjs` times a tap on + shortly after launch.

On Android, compile the app ahead of time before measuring (`adb shell cmd
package compile -m speed -f <package>`) so both builds run the same way. On a
Mac, keep the emulator's window in front or run it with `-no-window`: macOS
demotes the emulator's threads to background priority while its window is
hidden, which slows it down several times over mid-run.

## Conventions

- ESLint via `expo lint`; import sorting enforced (`simple-import-sort`).
- Prettier for formatting; run `npm run lint:fix && npm run format` before opening a PR.
- `console.log` disallowed (use `console.warn`/`console.error`).
- `import type` required for type-only imports.
- React hooks exhaustive-deps is an error.
- Comment complex logic only — skip comments on self-documenting code.

### ESLint rules worth knowing

- Import sorting enforced via `simple-import-sort` (run `lint:fix` to auto-fix).
- `console.log` is disallowed; use `console.warn` or `console.error`.
- Type imports must use `import type`.
- React hooks exhaustive deps is an error.
- Variable shadowing is an error. typescript-eslint 8.72 also reports
  `const Row = memo(function Row() {})`, so the inner function takes an `Impl`
  suffix (`memo(function RowImpl() {})`).
- eslint-config-expo's React Compiler rules (`react-hooks/refs`,
  `set-state-in-effect`, `immutability`, `preserve-manual-memoization`,
  `purity`, `static-components`, `use-memo`) are off: the app does not enable
  React Compiler. Turn them on in the change that does.
- No-build-path restrictions on moved modules (`~/lib/*` → `~/*`, `~/types/*`, `~/services/*`, `~/hooks/*`, `~/constants/*`).
