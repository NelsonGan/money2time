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
- [Model evals](#model-evals)
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
apps/evals       local model evals, one npm project each (never deployed)
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
│   ├── layout/                 # TabletContentContainer
│   ├── datePicker/             # Date/month pickers
│   ├── widget-preview/         # Home-screen widget previews
│   └── navigation/             # BottomNav, AddFab, MonthControlsHeader, InOutHeader
├── features/
│   ├── calendar/               # Calendar tab (month grid, day pager) — the home view
│   ├── transactions/           # Activity list, add/edit, quick-add, voice, split-bill, settle-up
│   ├── insights/               # Charts: trends, breakdowns, sentiment
│   ├── budget/                 # Monthly expense budgets from reusable templates
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

- **Expo SDK 54** + React Native 0.81.5 + React 19 (New Architecture enabled)
- **TypeScript** strict mode, path alias `~/*` → the app root (`apps/mobile`)
- **SQLite** via `expo-sqlite` + **Drizzle ORM** (67 migrations)
- **NativeWind 4** (Tailwind for React Native) — class-based dark mode, 8 theme colors
- **React Navigation** native stack (root + nested settings stack)
- **react-native-reanimated 4** + Skia + gifted-charts for animation and visualizations
- **Mixpanel + Google Analytics 4** analytics, **RevenueCat** subscriptions, **expo-notifications**
- **expo-speech-recognition** for voice quick-entry
- **react-native-cloud-storage** + Google Sign-In for iCloud / Google Drive backup

### Prerequisites

- Node.js 22+ and npm 10+ (CI runs Node 22; Wrangler 4 needs it)
- Xcode (iOS) / Android Studio (Android) for simulator builds
- For local EAS builds: `ANDROID_HOME=$HOME/Library/Android/sdk` exported

### Setup

The app lives in `apps/mobile` and the Cloudflare Workers in `apps/cloudflare`
(see [Repo layout](#repo-layout)). Each is its own npm project; app commands
run from `apps/mobile`.

```bash
cd apps/mobile
npm install
cp .env.example .env  # fill in RevenueCat/Mixpanel keys (optional in dev)

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
EXPO_PUBLIC_MIXPANEL_TOKEN=
EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER=
EXPO_PUBLIC_MONEY2TIME_WORKERS_LIVE_EARNINGS=
EXPO_PUBLIC_REQUEST_SIGNING_KEY=
EXPO_PUBLIC_BRANDFETCH_CLIENT_ID=
BRANDFETCH_API_KEY=
```

The two Worker URLs point at the receipt-scan
([receipt-scanner](#receipt-scanner-worker)) and live-earnings-push
([live-earnings](#live-earnings-worker)) Cloudflare Workers. Their
provider secrets (OpenRouter, APNs) live only in the Workers — never in the app.
In CI, PR builds override the receipt-scan URL with the branch's Worker
**preview URL** so each branch talks to its own Worker.

Native GA4 uses the Firebase client configs committed at the app root (`apps/mobile`):
`google-services.json`, `GoogleService-Info.plist`, and
`GoogleService-Info.dev.plist`. They contain Firebase project identifiers, not
service-account credentials. GA4 is enabled for the complete population without
an in-app prompt and receives every event. Mixpanel also receives every user,
but only the install, activation and Pro purchase funnel events, plus product
usage as milestones (each feature's first use, transaction counts); see
[Analytics](#analytics) for the tracking plan and event routing.

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

`App.tsx` is the root. It contains a single `RootStack` (NativeStack) with `MainShellScreen` as the base screen. `MainShellScreen` renders a `BottomNav` overlaying a tab-based content area. The app is **calendar-first**: the 5 tabs are **calendar, accounts, insights, albums, settings** (`TabName` in `components/navigation/BottomNav.tsx`). The `calendar` tab is the home/base view and renders `CalendarScreen` (which surfaces the month grid, day pager, and transaction list). All five tabs are available to every user. Modal/push screens (editors, drilldowns, flows) are registered at the root stack level.

**Root stack screens** (defined in `navigation/rootStack.ts`):
`Main`, `AddTransaction`, `AddTransactionDetailed`, `EditTransaction`, `SettleUp`, `SettleUpSettings`, `SettleUpPerson`, `SettleUpTransaction`, `SplitBill`, `ReceiptSplit`, `AccountDetail`, `AccountEditor`, `GoalEditor`, `GoalDetail`, `AccountLogoPicker`, `SubscriptionLogoPicker`, `PayCreditCard`, `AccountGroupEditor`, `CategoryEditor`, `InsightsDrilldown`, `RecurringEditor`, `SettingsRecurring`, `SettingsAccounts`, `SettingsHourlyValue`, `SettingsLiveEarnings`, `SettingsTimeDisplay`, `AddWageMonth`, `SettingsQuickEntry`, `SettingsMultiCurrency`, `SettingsAutoBackup`, `SettingsWageCalculator`, `ShareAndEarn`, `ProPaywall`, `CreateAlbum`, `AlbumDetail`, `EditAlbumTransactions`, `AddAlbumTransactions`, `EditAlbumDetails`, `ItemEditor`, `ItemIconPicker`, `CategoryIconPicker`, `BudgetTemplateEditor`, `BudgetMonthEditor`, `BudgetCategoryAllocation`, `SettingsBudgetTemplates`, `Tutorials`, `TutorialDetail`, `PaymentAlertsSetup`.

**Settings has its own nested stack** (`navigation/settingsStack.ts`):
`SettingsHome`, `DisplaySettings`, `AppIcon`, `HourlyValue`, `HourlyValueSettings`, `AccountSettings`, `Accounts`, `Items`, `ExchangeRates`, `Categories`, `Recurring`, `Notifications`, `NotificationDetail`, `DataManagement`, `News`, `AutoBackupSettings`, `StatementImport`, `StatementImportList`, `ProManagement`, `ShareAndEarn`, `QuickEntrySettings`, `AutoLogSettings`, `AutoLogTutorial`, `AppLock`, `Receipts`, `ReceiptSettings`, `Reimbursements`, `ReimbursementSettings`, `Widgets`, `LiveEarnings`, `WidgetPreviews`, `PaymentAlerts`, `PaymentAlertSource`.

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
- **Budget ops**: `budgetTemplates`, `monthlyBudgets`, `createBudgetTemplate`, `updateBudgetTemplate`, `deleteBudgetTemplate`, `setDefaultBudgetTemplate`, `createMonthlyBudget`, `createCustomMonthlyBudget`, `updateMonthlyBudget`, `deleteMonthlyBudget` (monthly, expense-only budgets built from reusable templates; Pro-limited to `FREE_MAX_BUDGET_TEMPLATES`)
- **Multi-currency / FX ops**: `listExchangeRates`, `refreshExchangeRates`, `setManualExchangeRate` (reporting-currency rate table; transactions snapshot `reportingCurrency`/`reportingAmount`/`fxRate` at write time so historical aggregates never drift)
- **Preferences**: `insightsPreferencesJson`, `updateInsightsPreferencesJson`, `notificationPrefs`, `updateNotificationPrefs`, `quickEntryPrefs`, `updateQuickEntryPrefs`, `calendarPrefs`

Other contexts:

- `context/ThemeContext.tsx` — theme management: `resolvedTheme`, `themeColor`, `useResolvedTheme()`, `useThemeColor()`
- `context/ProContext.tsx` — RevenueCat subscription state via `usePro()`: `isPro`, `isLoading`, `customerState`, `offering`, `purchasePackage`, `restorePurchases`, `refresh`. `useIsPro()` reads just the flag from its own context, so a caller does not re-render while the subscription status refreshes (at launch and on every return to the app)
- Payment-alert preferences (`settings.auto_log_prefs_json`) live on `useApp()`: `paymentAlertPrefs`, `updatePaymentAlertPrefs`. Each Android source has one explicitly selected account; iOS actions select Account in Shortcuts.

### Database

SQLite via `expo-sqlite` + Drizzle ORM. Schema is in `lib/db/schema.ts`. The DB client is initialized in `lib/db/client.ts` (database file: `money2time.db`, migrations in `lib/db/migrations/` numbered `001`–`067`). `lib/db/normalizeCurrencies.ts` collapses legacy single-currency rows on restore/upgrade.

**Migration runner contract** (`lib/db/migrations/runner.ts`, wired up by `index.ts`'s `require.context` loader):

- Each migration runs in **its own transaction**, with the `PRAGMA user_version` bump inside it. Progress is durable per migration: a throw (or an OS kill mid-batch) costs only the failing migration, and the next launch resumes from exactly where it stopped. Do **not** reintroduce a single end-of-batch version bump — that is what used to leave installs half-migrated and permanently bricked.
- **Every migration must still be idempotent.** Installs upgraded under the old all-or-nothing runner can already be sitting half-applied and will replay. Use `addColumnIfMissing` / `addColumnsIfMissing` / `hasColumn` from `lib/db/migrations/helpers.ts` rather than a bare `ALTER TABLE ... ADD COLUMN`, which throws `duplicate column name` on replay.
- A DB whose `user_version` is **newer** than this build (store rollback, sideloaded older APK) is left completely untouched and reported to Sentry as `db_downgrade`. It must never be reset to baseline — that path used to `DROP` every table and destroy all user data.
- Failures surface through `refreshAll`'s catch in `context/AppContext.tsx`, which reports to Sentry (`scope: 'app_load'`) and renders the retry card. Keep that `reportError` call: it is the only visibility into migration failures, since the users worst affected never reach a working app.

**Offline places DB (`lib/db/citiesDb.ts`).** A second, **read-only** SQLite connection holds GeoNames cities (used by `CityPickerSheet` to attach a location to an album). The prebuilt asset lives at `assets/db/cities.db` (bundled via the `db` entry added to metro `assetExts`; gitignore-negated since `*.db` is otherwise ignored) and is copied into the SQLite dir once on first run, guarded by `CITIES_DB_VERSION`. Regenerate it with `node scripts/build-cities-db.mjs` (downloads GeoNames `cities15000`; `--empty` writes a schema-only placeholder). **Never** run the money2time migration runner against `cities.db` — it is pure reference data: not migrated, not backed up, not reset. The loader degrades to empty results if the asset is missing/corrupt. `searchCities` is **fuzzy**: the FTS5 index covers city, admin1/state and country names so a query can resolve by any of them (e.g. `japan`, `california`), and results are ordered by match tier (city-name match > state > country) then population. Each table carries an `ascii_name` column for the diacritic-free LIKE checks that drive that tiering.

**Album location map (`features/albums/`).** Albums with a location render on a full-page map, reached from the map FAB on `AlbumsScreen` → `AlbumLocations` root screen (`AlbumLocationsScreen` — full-bleed map, floating back button, no header). The map (`components/AlbumMapView.tsx`) is **MapLibre** (`@maplibre/maplibre-react-native`, open-source, no API key): photo `Marker`s showing each album's name + total spend (`AlbumMapMarker`) over a sleek, theme-tinted vector basemap (`buildThemedMapStyle` paints MapLibre's no-key demotiles vector source in the active `ColorPalette`), plus a "fit all" camera button. The path to full street-level/offline detail is a Protomaps PMTiles archive (`assets/map/style.json` is a bundled OSM-raster fallback). **MapLibre is a native module:** its Expo config plugin is registered in `app.json`, so adding/upgrading it needs a **dev-client / prebuild rebuild** (no Expo Go). `AlbumMapView` is `React.lazy`-loaded so the rest of the app works on a dev client that hasn't been rebuilt yet — only opening the location screen's map touches the native module. Pins come from `AlbumPin[]` (built from `locatedAlbums` + `getAlbumStats`); `locatedAlbums` is a selector on `useApp()`.

**Tables** (all use soft-deletes via `deletedAt`, except `exchange_rates` which is a cache):

| Table                           | Key columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountsTable`                 | id, name, sortOrder, type (debit/credit/goal/loan), accountGroup, logoId, creditStatementDay, creditDueDay, currency, startingBalance, includeInTotals, **goalTargetAmount, goalTargetDate, goalEmoji, goalAchievedAt, goalArchivedAt** (savings-goal fields, null on non-goal accounts), **loanOriginalPrincipal, loanMonthlyPayment, loanPaymentDay, loanInterestRate, loanTermMonths, loanTotalRepayable, loanStartDate, loanPaidOffAt, loanArchivedAt, loanCountAsExpense, loanPaymentCategoryId, loanInterestModel, loanLedgerAnchorDate, loanRateChangesJson** (loan fields, null on non-loan accounts)                                                                                              |
| `accountGroupsTable`            | id, name, sortOrder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `categoriesTable`               | id, name, sortOrder, type (expense/income), parentId, icon (tagged icon value, see Key Patterns), isDefault                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `transactionsTable`             | id, type (expense/income/transfer/balance_adjustment), amount, currency, **reportingCurrency, reportingAmount, fxRate** (frozen FX snapshot), **toAmount, accountAmount** (cross-currency), date, accountId, fromAccountId, toAccountId, categoryId, note, receiptUri, recurrence fields, sentiment, **reimbursable, reimbursedAt, reimbursementAccountId, reimbursementTransactionId, reimbursementOfId** (reimbursement link), countsAsExpense, **dayOrder** (drag position among same-time rows; null = by createdAt, so edits never reorder)                                                                                                                                                           |
| `transactionSplitsTable`        | id, transactionId, personName, amount, isSelf, paybackAccountId, paidAt, paidTransactionId, sortOrder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `receiptSplitsTable`            | id, transactionId, currency, merchant, receiptDate, itemsSubtotal, taxAmount, serviceAmount, discountAmount, adjustmentAmount, totalAmount, source (scan/manual), receiptImageUri (itemized receipt-split header; one live row per transaction via partial unique index)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `receiptSplitItemsTable`        | id, receiptSplitId, name, quantity, lineTotal, sortOrder (line items on an itemized receipt split)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `receiptSplitItemSharesTable`   | id, receiptSplitId, itemId, personName, isSelf, weight (item × person portion weights)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `recurringRulesTable`           | id, name, type, amount, currency, toAmount, accountId, fromAccountId, toAccountId, categoryId, note, logoId, recurrencePattern, recurrenceInterval, nextRunDate, endDate, isActive, countsAsExpense                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `settingsTable`                 | id, appUserId, locale, currencyCode, currencySymbol, displayMode, workdayDisplayEnabled, workingHoursPerDay, hapticsEnabled, themeMode, themeColor, iconStyle, appIcon, accountLogoCountry, subscriptionLogoCountry, profileName, profileAvatarUri, insights/notification/quickEntry/calendar PrefsJson, onboardingCompleted, userMode, weekStartsOn, firstDayOfMonth, firstDayOverridesJson, biometricLockEnabled, biometricLockDelaySeconds, autoBackup fields, autoFxRefreshEnabled, lastRateFetchAt/Error, fxCurrenciesJson, firstAppOpen, paymentQrUri, defaultPaybackAccountId, reimbursementsCountAsExpense, showTransactionAccount, autoLogPrefsJson (payment-alert sources and selected accounts) |
| `exchangeRatesTable`            | id, baseCurrency, quoteCurrency, rate, asOfDate, source (api/manual), updatedAt (FX rate cache, no soft-delete)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `albumsTable`                   | id, name, coverPhotoUri, isActive, startDate, endDate, sortOrder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `albumTransactionsTable`        | id, albumId, transactionId, sortOrder (join table)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `itemsTable`                    | id, name, iconId, purchasePrice, currency, purchaseDate, endDate, salePrice, note, sortOrder (owned things, for cost-per-day)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `monthlyWageSettingsTable`      | id, month (YYYY-MM), wageType, wageAmount, hoursWorkedPerWeek, workdaysPerWeek, commuteMinutesPerWorkday, baseHourlyRate, trueHourlyRate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `budgetTemplatesTable`          | id, name, emoji, totalAmount, isDefault, countUnbudgeted, sortOrder (reusable budget template; exactly one live default)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `budgetTemplateCategoriesTable` | id, templateId, categoryId, amount, sortOrder (per-root-category allocation on a template)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `monthlyBudgetsTable`           | id, month (YYYY-MM), templateId, templateName, templateEmoji, totalAmount, countUnbudgeted (frozen at creation; one live row per month via partial unique index, soft-deleted rows are tombstones)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `monthlyBudgetCategoriesTable`  | id, budgetId, categoryId, amount, sortOrder (frozen budget line for a month)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `autoLogCapturesTable`          | id, channel (android_notification/ios_alert/paste/share_text/apple_pay), sourceKey, sourceLabel, capturedAt, nativeKey, title, body (raw text, nulled by the retention sweep), status (pending/logged/dismissed/ignored/duplicate/failed), reason, resolutionJson (what the pipeline read and bound), parserVersion, transactionId, duplicateOf, dedupeKey (internal payment-alert duplicate bookkeeping; `auto_log_captures`)                                                                                                                                                                                                                                                                             |

Data access goes through repositories in `lib/repositories/`: `accountsRepository`, `accountGroupsRepository`, `categoriesRepository`, `transactionsRepository`, `transactionSplitsRepository`, `receiptSplitsRepository`, `recurringRulesRepository`, `settingsRepository`, `monthlyWageRepository`, `albumsRepository`, `exchangeRatesRepository`, `budgetTemplatesRepository`, `monthlyBudgetsRepository`, `itemsRepository`, `paymentAlertCapturesRepository`, plus `mappers.ts` for DB row → domain type transformations.

### Feature structure

Features live under `features/` in domain folders. Each has `screens/` and sometimes `components/`, `services/`, `constants/`.

| Feature           | Purpose                                                                                                                                                                     | Key screens / components                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transactions/`   | Transaction CRUD, month-paged activity list, search, bulk edit, voice quick-entry, split-bill, settle-up                                                                    | `AddTransactionScreen`, `EditTransactionScreen`, `QuickAddScreen`, `QuickAddSheet`, `VoiceQuickAddOverlay`, `VoiceCaptureOverlay`, `VoicePreviewSheet`, `TransactionEditorScreen`, `SettleUpScreen`, `SettleUpPersonScreen`, `SettleUpTransactionScreen`, `SplitReceiptCard`, `SplitReceiptShareModal`, `InlineReceiptCamera`/`ReceiptCameraSheet` (+ `transactions/lib/settleUp.ts`)                        |
| `calendar/`       | Calendar tab (app home) — three-level zoom (year/month/day), month grid of daily totals, day pager, search overlay                                                          | `CalendarScreen`, `CalendarMonthGrid`, `CalendarMonthPage` (+ `calendar/lib/`)                                                                                                                                                                                                                                                                                                                               |
| `albums/`         | Trip albums — group transactions with a cover photo, date range, breakdown drill-down, active auto-add                                                                      | `AlbumsScreen`, `AlbumDetailScreen`, `CreateAlbumScreen`, album editor screens (+ `albums/utils.ts`)                                                                                                                                                                                                                                                                                                         |
| `insights/`       | Analytics charts — expense trends, category breakdown, sentiment                                                                                                            | `InsightsScreen`, `InsightsDrilldownScreen` (+ `insights/breakdownPieLayout.ts`)                                                                                                                                                                                                                                                                                                                             |
| `budget/`         | Monthly expense budgets from reusable templates — per-category depletion, month pager, widgets (embedded in Insights)                                                       | `BudgetScreen`/`BudgetPagerView`, `BudgetTemplatesScreen`, `BudgetTemplateEditorScreen`, `MonthlyBudgetEditorScreen`, `CategoryAllocationScreen` (+ `budget/lib/budgetMath.ts`, `budget/lib/categoryAllocationBridge.ts`)                                                                                                                                                                                    |
| `settings/`       | All configuration, account/category management, data import/export, auto-backup, multi-currency, App Lock                                                                   | `SettingsScreen`, `DisplaySettingsScreen`, `HourlyValueScreen`, `AccountsScreen`, `ExchangeRatesScreen`, `CategoriesScreen`, `RecurringScreen`, `NotificationsScreen`, `DataManagementScreen`, `AutoBackupScreen`, `StatementImportScreen`, `QuickEntrySettingsScreen`, `AppLockScreen`, `WidgetPreviewsScreen`, `ProManagementScreen`, `ProPaywallScreen`, `WageCalculatorFlowScreen`, `ShareAndEarnScreen` |
| `news/`           | In-app feature announcements & showcases (changelog-style)                                                                                                                  | `NewsScreen`, `FeatureAnnouncementModal`, per-feature `*Showcase` components, `announcements/` (numbered entries), `featureAnnouncements.ts`                                                                                                                                                                                                                                                                 |
| `onboarding/`     | First-time setup flow: welcome, basics + tracking-mode choice, wage (time-mode only), backup, acquisition source, notifications, feature highlights. No skip escape hatch.  | `OnboardingFlow` + step screens (`OnboardingValuePropStep`, `OnboardingPreferencesStep`, `OnboardingWageStep`, `OnboardingBackupStep`, `OnboardingSourceStep`, `OnboardingNotificationsStep`, `OnboardingFeaturesStep`)                                                                                                                                                                                      |
| `reviewPrompt/`   | In-app App Store / Play review request prompt                                                                                                                               | review prompt components (paired with `services/reviewPrompt.ts`)                                                                                                                                                                                                                                                                                                                                            |
| `tutorials/`      | Searchable how-to guides, built from annotated simulator screenshots; mirrored to money2time.com                                                                            | `TutorialsScreen`, `TutorialDetailScreen`, `TutorialRow`, `content/` (the catalog), `links.ts`                                                                                                                                                                                                                                                                                                               |
| `goals/`          | Savings goals — an account with a target, progress and auto-save; a sub-tab of the assets page                                                                              | `GoalsScreen`, `GoalDetailScreen`, `GoalEditorScreen`, `GoalCard`, `GoalCelebrationOverlay` (+ `goals/lib/goalMath.ts`, `goals/useGoals.ts`)                                                                                                                                                                                                                                                                 |
| `items/`          | Owned things priced by cost-per-day, and the Accounts / Goals / Items tab bar over the assets page                                                                          | `ItemsScreen`, `ItemEditorScreen`, `AssetsTab`, `AssetsTabBar` (+ `items/utils.ts`)                                                                                                                                                                                                                                                                                                                          |
| `loans/`          | Loan accounts — payoff progress, remaining instalments, interest disclosure                                                                                                 | `LoanPayoffOverlay`, `LoanQuoteDisclosure` (+ `loans/lib/loanMath.ts`); the screens are the account ones                                                                                                                                                                                                                                                                                                     |
| `reimbursements/` | Expenses someone else pays back — flag, track, settle. Optionally (`settings.reimbursementsCountAsExpense`) dropped from spending **analytics**; balances always count them | `ReimbursementsScreen`, `ReimbursementSettingsScreen`, `ReimbursementTileBadge` (+ `reimbursements/lib/reimbursementMath.ts`)                                                                                                                                                                                                                                                                                |
| `review/`         | Week / month / year recap of completed periods, embedded as an Insights page                                                                                                | `ReviewScreen`/`ReviewPagerView`, `ReviewFilterSheet` (+ `review/lib/reviewMath.ts`, `reviewPeriods.ts`, `reviewFormat.ts`, `reviewFilters.ts`)                                                                                                                                                                                                                                                              |
| `widgets/`        | Widgets settings hub plus the live-earnings Live Activity (Lock Screen / Dynamic Island)                                                                                    | `WidgetsScreen` (hub), `LiveEarningsScreen`, `LiveEarningsPreview`, `useLiveEarningsActivity` (+ `widgets/lib/liveEarnings.ts`)                                                                                                                                                                                                                                                                              |
| `autoLog/`        | Completed notification income/expenses via text scanning, explicit selected accounts, and separate Apple Pay card logging                                                   | `PaymentAlertsSetupScreen`, `PaymentAlertsSettingsScreen`, `PaymentAlertSourceScreen`, `PaymentAlertSync` (+ `autoLog/lib/`: `notification`, `text`, `binding`, `categorize`, `dedupe`, `decide`, `pipeline`, `captureQueue`, `prefs`)                                                                                                                                                                       |

Shared UI primitives in `components/ui/`: `button`, `fat-button`, `card`, `input`, `select`, `settings`, `text`, `textInputStyles`, `theme-modal`, `time-value-inline`, `toggle`, plus the cross-feature sheets `AccountPickerSheet`, `CategoryPickerSheet`, `CurrencyPickerSheet`, `AccountLogoPickerSheet`, and icon/logo helpers `CategoryEmoji`, `ClayIcon`, `SentimentIcons`, `AccountLogo`.

Other shared components: `components/feedback/` (EmptyState, AppErrorBoundary, Mascot, LoadingDots, ImportingOverlay), `components/navigation/` (BottomNav, BottomNavMinimize, AddFab, TodayJumpFab, EdgeSwipeBackContainer, MonthControlsHeader, InOutHeader, FilterIconButton, `floatingNav`, `liquidGlass`), `components/icons/` (SocialIcons, CloudProviderIcons via Lucide), `components/datePicker/` (DatePickerModal, InlineDatePicker, MonthYearWheelPicker), `components/layout/` (TabletContentContainer), `components/widget-preview/` (home-screen widget previews).

### Services

| Service                                                                                                                                                                       | Purpose                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                 | GA4 gets every event; Mixpanel gets every user but only `MIXPANEL_EVENTS` (funnels and usage milestones), no automatic events: `trackEvent`, `recordLoggedTransaction`, `identifyUser`, `setInstallDate`, `setCurrentScreen`, `flushAnalytics`                   |
| `errorReporting.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                            | Sentry crash/error reporting: `reportError` (used by `AppErrorBoundary`), `setErrorUser`; `.shared` holds pure `beforeSend`/`beforeBreadcrumb` PII-scrub + dedupe/cap hooks. DSN via `EXPO_PUBLIC_SENTRY_DSN`; source-map upload needs `SENTRY_AUTH_TOKEN` in CI |
| `notifications.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                             | Expo Notifications: `scheduleDailyCheckin`, `scheduleWeeklySummary`, `fireRecurringTransactionNotification`, `syncScheduledNotifications`                                                                                                                        |
| `haptics.ts`                                                                                                                                                                  | `triggerHaptic('medium' \| 'selection' \| 'success' \| 'warning')`                                                                                                                                                                                               |
| `revenueCat.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                | RevenueCat SDK: subscription state, purchase, restore                                                                                                                                                                                                            |
| `speechRecognition.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                         | On-device speech-to-text for voice quick-entry (`expo-speech-recognition`)                                                                                                                                                                                       |
| `autoBackup.ts` (+ `.native.ts`, `.shared.ts`) + `autoBackupProviders/`                                                                                                       | Daily auto-backup: `runAutoBackupIfDue`, `listAllBackups`, `restoreFromBackup`, `previewBackup`, `deleteBackup`, `isTargetAvailable`, Google Sign-In helpers                                                                                                     |
| `autoBackupTaskRegistration.ts`                                                                                                                                               | Registers the `expo-background-task` task for periodic backup runs                                                                                                                                                                                               |
| `mmbakImportService.ts` + `mmbakImport/`                                                                                                                                      | Money Manager `.mmbackup` file import                                                                                                                                                                                                                            |
| `dataManagementService.ts`                                                                                                                                                    | Export, JSON backup/restore                                                                                                                                                                                                                                      |
| `excelExportService.ts`                                                                                                                                                       | Excel (`.xlsx`) export: transactions / accounts / categories / recurring sheets, built with the dependency-free writer in `utils/xlsx.ts`                                                                                                                        |
| `biometricAuth.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                             | App Lock — Face ID / Touch ID / device-credential gate (`expo-local-authentication`)                                                                                                                                                                             |
| `exchangeRates.ts`                                                                                                                                                            | Multi-currency FX: Frankfurter **v2** daily fetch (multi-provider blend; v1 is frozen and ECB-only), `refreshRatesNow`, `runRateRefreshIfDue`, staleness guard, offline-safe cache, manual overrides, historical rates                                           |
| `reviewPrompt.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                              | In-app App Store / Play review request (`expo-store-review`)                                                                                                                                                                                                     |
| `widgetSnapshot.ts` (+ `.shared.ts`) + `widgetRegistry.ts`                                                                                                                    | Home-screen widget data snapshots and registry                                                                                                                                                                                                                   |
| `liveActivity.ts`                                                                                                                                                             | ActivityKit bridge for the live-earnings Live Activity (start / update / end / read the running one). iOS only                                                                                                                                                   |
| `liveEarningsPush.ts`                                                                                                                                                         | Registers a running live-earnings session with the push Worker, so the card's amount keeps moving while the phone is locked                                                                                                                                      |
| `liveEarningsWidget.ts`                                                                                                                                                       | Writes the live-earnings widget's precomputed timeline to its own App Group key                                                                                                                                                                                  |
| `paymentCapture.ts`                                                                                                                                                           | Payment-alert capture bridge: reads and clears the Android listener's file queue and the iOS alert queue, notification-access state, the listener config, the setup test alert                                                                                   |
| `paymentAlertsBridge.ts`, `paymentAlertsNavigation.ts`                                                                                                                        | Setup test results and drain requests; opening Android payment-alert setup from settings                                                                                                                                                                         |
| `appIcon.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                   | Alternate home-screen app icons: read the current one, switch, re-apply on load                                                                                                                                                                                  |
| `receiptScan.ts` (+ `.native.ts`, `.shared.ts`) + `receiptImage.*`, `receiptPicker.ts`                                                                                        | Receipt OCR against the Cloudflare Worker, plus the photo pick and the downscale that keeps one small stored copy                                                                                                                                                |
| `autoLog.ts`                                                                                                                                                                  | Bridge to the auto-log App Group store that Shortcuts writes into                                                                                                                                                                                                |
| `userAssetGc.ts`                                                                                                                                                              | Sweeps orphaned user-asset images. **Any new column holding an asset path must be added to `collectReferencedAssetPaths`**                                                                                                                                       |
| `cloudBackupPrompt.ts` (+ `.shared.ts`), `globalPromptCoordinator.ts`, `settleUpQrPromptState.ts`                                                                             | One-shot nudges: cloud-backup opt-in, the coordinator that stops two overlays landing at once, and the payment-QR prompt                                                                                                                                         |
| `voiceCaptureBridge.ts`                                                                                                                                                       | Publishes the live voice-capture session so the + sheet can draw the listening UI inside itself                                                                                                                                                                  |
| `featureAnnouncementState.ts`                                                                                                                                                 | Tracks which `news` feature announcements have been seen                                                                                                                                                                                                         |
| `deepLinks.ts`                                                                                                                                                                | Deep-link / URL routing into the app                                                                                                                                                                                                                             |
| `userAssets.ts`                                                                                                                                                               | Profile avatar / user-supplied image asset handling                                                                                                                                                                                                              |
| `*Navigation.ts` (calendar, insights, tab, settings, review, reviewPrompt, hourlyValue, paywall, transactions, addAction, liveEarnings, receiptSplit, scanCamera, scanReview) | Imperative navigation helpers (route into a tab/screen from anywhere)                                                                                                                                                                                            |

Platform-split services (`.native.ts` / `.shared.ts`) use the `.native.ts` implementation on iOS/Android and `.shared.ts` as web/test fallback.

### Custom hooks

| Hook                        | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `useMonthPager`             | Month paging with scroll callbacks          |
| `useIndexedScrollToTopRefs` | Track multiple scrollable refs              |
| `useThemeVars`              | Access theme color scheme CSS variables     |
| `useThemeColors`            | Get theme-specific color values             |
| `useEdgeSwipeBack`          | Handle edge-swipe back gestures             |
| `useProGate`                | Gate features behind Pro subscription       |
| `useDeviceLayout`           | Detect tablet vs phone layout               |
| `usePersistedJsonSnapshot`  | Persist/restore JSON state via AsyncStorage |
| `usePressScale`             | Animated press scaling effect               |
| `useKeyboardHeight`         | Track the live keyboard inset               |
| `usePagerTabSync`           | Keep a pager and its tab bar in step        |

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
- **Financial month (the month cycle)**: a "month" can start on a day other than the 1st (payday cycles), and **not necessarily the same day every month**. The shape is a `MonthCycle` (`types/index.ts`): a `defaultDay` (1..28) every month follows, plus `overrides` keyed `YYYY-MM` for the months the user pinned somewhere else. It is stored as two columns, `settings.first_day_of_month` (the default) and `settings.first_day_overrides_json` (migration `060`), and read as one object with **`monthCycleOf(settings)`** — never off the raw columns.

  For any **user-facing monthly** grouping/range/anchor, use the helpers in `~/utils/financialMonth` (`financialMonthKeyForIso`, `financialMonthRange`, `financialMonthAnchorForToday`, `addFinancialMonths`, `financialMonthDayKeys`, `financialMonthOffsetForDayKey`) passing that cycle — never re-derive month boundaries inline. Every helper also takes a bare `number` (that is the "same day every month" cycle, and what their defaults and the tests use), and reduces **exactly** to the calendar-month `~/utils/formatters` behaviour at a plain `1`, so default users are unaffected. Because a number is assignable to `MonthCycleInput`, the compiler will **not** catch a call site still passing `settings.firstDayOfMonth` — it silently ignores the per-month exceptions, so grep for that field rather than trusting `tsc`. The two places that legitimately still read the scalar are the monthly-review notification trigger and its copy: an OS monthly trigger repeats on a fixed day and cannot follow an overridden month.

  A financial month is labelled by the calendar month it **starts** in, and ends the day before the NEXT month's cycle starts, so a pinned month simply lends or borrows days from its neighbour. A start day is 1..31 and is **resolved against the month it lands in**: a day past the end of a short month becomes that month's last day, so a default of 31 means "the last day" and February moves with the leap year on its own (`daysInMonth`, `firstDayForMonthKey`). That resolution is what guarantees each cycle starts inside its own calendar month, and therefore that the cycles tile the calendar with no gap and no overlap however the days are mixed. The per-month picker offers exactly the days that month has; the default picker offers all 31. `monthCycleOf` interns its result by value, so memos keyed on the cycle survive an unrelated settings write; keep it that way. The UI is `MonthCycleScreen` (settings route `MonthCycle`, reached from Display settings). (Credit-card **statement** cycles are a separate per-account thing in `~/utils/statementPeriods`.)

- **Currency/hour formatting**: `formatAmount(value, settings, { showSign })` and `formatHours(value)`.
- **Haptics**: `void triggerHaptic('medium' | 'selection' | 'success' | 'warning')`.
- **Settings updates**: `updateSettings({ field: value })` from `useApp()`.
- **i18n**: `I18n.t('key')` — strings defined in `lib/i18n/locales/en.ts`.
- **Analytics**: Use `trackEvent(AnalyticsEvents.X, props)` from `~/services/analytics`. The authoritative event, property, source and volume tables are in [Analytics](#analytics); update them alongside every tracking change. GA4 receives every custom event. Mixpanel receives every user but only `MIXPANEL_EVENTS`; frequent per-use actions belong in `GA4_ONLY_EVENTS` and qualifying first uses are recorded through `FEATURE_BY_EVENT`. Keep Mixpanel automatic events off, never sample users/events, and pass an explicit source at every paywall entry point. Profile state, event context and milestone eligibility follow the canonical tables. Setup details are in [How tracking is wired](#how-tracking-is-wired).
- **Font scaling**: Disabled globally in `App.tsx` for both `Text` and `TextInput`.
- **Pro gating**: Use the `useProGate()` hook, or `useIsPro()` when only the flag is needed. Paywall via `ProPaywall` screen.
- **Platform-split services**: `.native.ts` for iOS/Android, `.shared.ts` for web fallback (analytics, notifications, revenueCat).
- **IDs**: Use `newId()` from `~/utils/id` for generating unique identifiers (UUID-based).
- **Error handling**: Use `getErrorMessage()` from `~/utils/errorHandling` to safely extract error messages.
- **Tablet layout**: Use `useDeviceLayout()` hook and `TabletContentContainer` for responsive layouts.
- **Single-line text inside long-range pagers**: the month/period pagers (`LONG_RANGE_PAGER_TOTAL_SLOTS` in `constants/pager.ts`: calendar, accounts, insights, album month picker) render their pages ~2400 page widths from the origin, about a million points out. Yoga snaps node edges to the pixel grid and stores them in float32, which that far out only resolves 1/16 to 1/8pt. Where the pixel grid is not a power-of-two fraction of a point (3x iPhones, most Android densities; 2x screens such as the iPhone SE and iPads are unaffected), a `numberOfLines={1}` text whose box hugs its content can come out a sliver narrower than its own measurement and get ellipsized although it fits: the calendar grid drew `300` as `3…`. Give such text a box wider than the text (stretch it across its cell and center it with `textAlign`) instead of sizing the box to the text. When something must sit right after the text (the reimbursable badge on `TransactionItem`'s title), size the slot from an invisible copy of the text and draw the visible one absolutely over it, a few points wider; label the slot (`collapsable={false}`) or the row's VoiceOver summary reads the title twice. The tell on device is a paragraph view whose width sits on a 1/16 or 1/8pt step rather than the pixel grid (e.g. `16.3125` on a 3x screen, where the grid is 1/3pt). Reproduce on a 3x simulator; a 2x one never shows it.
- **Multi-currency**: Each transaction stores its entered `currency` plus a frozen reporting-currency snapshot (`reportingCurrency`/`reportingAmount`/`fxRate`) taken at write time so historical aggregates never drift when FX rates move. Use `convert`/`buildRateTable` from `~/utils/currency`; never recompute historical totals from live rates. FX rates come from `services/exchangeRates.ts`.
- **Albums**: Trip albums are a Pro-limited feature (`FREE_MAX_ALBUMS`). One album can be "active" (`activeAlbumId`) so new transactions auto-add. Manage via `useApp()` album ops.
- **Icons (categories, goals, budget templates)**: The four icon columns (`categories.icon`, `accounts.goal_emoji`, `budget_templates.emoji`, `monthly_budgets.template_emoji`) store one tagged string, documented in `constants/categoryIcons.ts`: a bare kebab id (`meal`) is a bundled clay PNG, `emoji:X` is a Unicode emoji the user picked, `custom:category-icons/<uuid>.png` is an uploaded image, and `''`/null is none. Classify with `classifyCategoryIcon`; render with `CategoryEmoji`, which handles all three forms. **Never re-derive an icon from an emoji at render time** — that indirection is gone. Older rows stored a bare glyph that was mapped through a table at render; migration `048_normalize_icon_values` backfilled them, and the frozen `LEGACY_EMOJI_TO_ICON` in `lib/db/normalizeIcons.ts` survives **only** at data ingress (the migration, backup restore, `.mmbak` import) because old backups can be restored at any time. `normalizeIconValue` is a fixpoint, which is what makes a replayed migration safe. **The free `default` pack IS the Clay artwork** — the separate `clay` pack was folded into it, so its 110 ids are bare (`meal`, not `clay/meal`) and every pre-existing row keeps rendering without a rewrite. Rows that had explicitly picked a Clay icon are remapped `clay/x` → `x` by `RETIRED_ICON_PACK_PREFIXES` in `lib/db/normalizeIcons.ts`, run by migration `050_retire_clay_icon_pack` and, like the legacy-emoji table, frozen there for the backups and `.mmbak` files that still carry qualified ids. The pack keeps the folder name `default` on purpose (renaming it would re-qualify every id and break every row); the label users see comes from `category_icon.pack_default`, which reads "Clay". Surfaces that can only render a string (native widgets via `widgetSnapshot.shared.ts`, the Shortcuts catalog via `autoLogCatalog.ts`, the Excel export) go through `categoryIconToEmoji`. The bundled set is generated by `scripts/generate-category-icons.mjs` and grouped/searchable via the hand-maintained `constants/categoryIconGroups.ts` (a test fails if a PNG has no grouping). One shared `CategoryIconPickerSheet` (root route `CategoryIconPicker`, handed its session by `categoryIconPickerBridge`) serves all three editors, with Icons / Emoji / My uploads tabs; the emoji tab lazy-imports the ~1,900-entry `constants/emojiCatalog.generated.ts`. Uploads are **Pro-only** (`useProGate().requirePro`), stored under the `category-icons` user-asset kind. **Any new column holding one of these values must be added to `collectReferencedAssetPaths` in `services/userAssetGc.ts`, or the orphan sweep will delete live images.** Non-default packs are **Pro-only**: a free user can browse them (with a banner, and a PRO badge in the pack list) but selecting an icon calls `useProGate().requirePro('icon_packs')` and opens the paywall instead. **EAS Update caps an update at 1000 assets and Metro resolves ~1380 here, so `expo.updates.assetPatternsToBeBundled` in `app.json` keeps `assets/account-logos` (528 files) out of updates, riding in the native binary instead; that leaves 910 of the 1000 in the current export. (This governs the internal-only OTA builds — store builds ship with updates disabled, see CI / Deploy.) The list is an allow-list, not a deny-list, so it must also carry `node_modules/**/\*`— without it a JS-only update that bumps a dependency shipping assets (the Work Sans faces,`@react-navigation/elements`' chrome PNGs) references asset hashes that are in neither the update nor the installed binary. Adding artwork anywhere else eats that headroom, so re-check with `npx expo export --dump-assetmap` afterwards.\*\*
- **Clay UI icons (`assets/clay-icons/`)**: 160 soft-clay illustrations for the app's own _chrome_ — a separate namespace from the user-selectable category packs. Eight sets: `nav/` (bottom-tab glyphs as resting/active pairs, plus the + FAB), `settings/` (one per SettingsGridTile, plus the profile and CTA art), `entry/` (editor, quick-add, voice, receipt-scan affordances), `money-time/`, `ui/`, `status/` (empty-state and warning art), `insights/` (the insight-type illustrations, reached through `constants/utilityIcons.ts`) and `sentiment/` (the three faces behind `SentimentIcons`). Render with `<ClayIcon name="nav/home" size={26} />`; the registry is generated by `scripts/generate-clay-icons.mjs` into `constants/clayIcons.generated.ts`, so adding a PNG and re-running is the whole workflow. **Two rules the artwork depends on:** clay is never tinted (not per theme, not for an active state — an active tab is a different _file_, a resting one is dimmed with `opacity`), and clay is never wrapped in a tinted plate (`bg-primary/10` behind it reads as a second, competing container; the surrounding card or tile is the container). Clay needs room, so it is for anything naming a _thing_ at 18px and up; small chrome that must stay crisp at 15–16px (chevrons, close and back buttons, numpad keys, header search/filter) stays on Lucide line icons.
- **Icon style (clay vs flat)**: `settings.iconStyle` (`'clay' | 'flat'`, default clay, migration `051_add_icon_style`, toggled on `DisplaySettingsScreen`) lets the user put the pre-clay flat line icons back. It rides on `ThemeContext` alongside the theme colour, read with **`useIconStyle()` / `useIsFlatIcons()`** (defaulting to clay outside the provider, so an error boundary above `ThemeGate` still renders). `ClayIcon` is the choke point: in flat mode it draws the Lucide icon from `FLAT_ICON_FOR_CLAY` in `constants/flatIcons.ts` — a total `Record<ClayIconName, …>`, so a new clay icon does not typecheck until it has a flat counterpart — centred in the same `size` box so no layout shifts. A call site whose _pre-clay icon differed_ from that shared entry passes `flat={{ icon: X }}`; sizes come from `flatSize` (flat line art reads at roughly 60-75% of clay, and the ratio differed per surface, so the historical value is passed explicitly and `DEFAULT_FLAT_SIZE_RATIO` only catches the rest). **The two clay rules above invert in flat mode**, so a site whose _container_ also changed branches on `useIsFlatIcons()` rather than going through `ClayIcon`: `SettingsGridTile` and `AddActionSheet`'s tiles put their tinted plate back, `AddFab`/`AddIconButton` put the filled primary disc and white `+` back, `BottomNav` swaps to the tinted-and-filled SVG pairs in `components/icons/NavIcons.tsx`, `SentimentIcons` swaps to the emoji SVGs in `assets/icons/`, `InOutHeader` swaps the wallet art for its tone dot, and `SettingsScreen`'s avatar and Pro/Share CTAs get their discs back. **Deliberately out of scope:** category icons, the insight-type art (`constants/utilityIcons.ts`) and the mascots render the same in both styles.
- **Mascots**: 33 poses of the coin-purse chick in `assets/mascots/`, rendered by `components/feedback/Mascot.tsx`. Moods (`happy`, `waving`, `excited`, `love`, `thumbs-up`, `sad`, `shocked`, `confused`, `thinking`, `sleeping`, `cheering`, `celebrating`), actions (`receipt`, `writing`, `searching`, `presenting`, `phone-check`, `cards`, `laptop`, `atm`, `relaxing`), the three Pro plan placards (`premium-monthly`, `premium-yearly`, `premium-lifetime`), and nine sequence frames. `MOOD_TO_NAME` maps the looser `mood` prop `EmptyState` passes. The poses are cropped from the four 3x3 artwork sheets, background removed and de-matted so the anti-aliased rim carries no white halo on dark mode, then quantized to a 255-colour palette (512x512, ~25KB each). The de-matte is followed by a **despeckle** pass that drops any blob never reaching near-opaque: the sheets are not perfectly flat white, so pixels a shade off it survived the flood fill, picked up a little alpha in the rim band, and left a dusty halo of ~130 disconnected specks per pose, invisible on cream and obvious on dark. Real artwork always goes near-opaque somewhere, so confetti, sparkles and the dot over a question mark all survive it.
  **Animated sequences.** `<Mascot sequence="scan" />` plays a three-frame flipbook instead of a single pose: `scan` (snap a receipt, hold it up, get the tick), `save` (coin over the piggy bank, coin in, happy hug) and `grow` (small bars, the trend takes off, cheer). The last frame of each is the resting pose and is held longer; frames are stacked and cross-faded by opacity rather than swapped into one `<Image>`, because swapping the source flashes an empty box on the first paint of an uncached pose. A sequence suppresses the idle bob, since the frames carry their own motion. Every frame is also a valid `MascotName`, so `save-3` works as a static "saved" pose, and a sequence with `animate={false}` shows its resting frame rather than the lead-in. In use: `save` on `GoalCelebrationOverlay`, `scan` on `StatementImportScreen` while an import runs, `grow` on `ProTrendPreviewOverlay`.
  **Warmup.** `MascotWarmup` mounts once at boot but decodes only the `WARMUP` shortlist (the poses on first-run and empty-state paths), not the whole catalogue: each warmed pose costs a full-size decoded bitmap in memory, and 33 of them is not worth it. Everything else loads from the bundle on first render.
- **App icon, splash and banner**: All three are the same chick. The launcher icon crops to its **head** (`assets/app-icons/<variant>/`, one folder per variant, cream `#FDF0D8` in light and midnight `#17212E` in dark) because a full body turns to mush at 40px; the splash keeps the whole character on transparency, and `assets/banner.png` is the legacy full-body wordmark on a rosewood disc. Native widgets and their in-app previews use the shipped headshot from `assets/app-icons/classic/icon-light.png`, with the brand name rendered as text, including widget locked states. Nine variants ship, composed from the mascot poses by `node scripts/generate-app-icons.mjs`: `classic` is the shipped icon (its light face is the supplied artwork, byte-for-byte, and must stay that way), the other eight are the Pro-only alternates. `app.json` points `ios.icon` and `android.adaptiveIcon` at `classic` and registers the rest through `expo-alternate-app-icons`. Two rules the art depends on: **the 1024 icons carry no alpha channel** (the App Store rejects one that does), and the framing is **one fixed transform** for every pose rather than a per-pose fit, since a raised wing or a spray of confetti moves a measured bounding box without moving the head. Full detail, including the dark-mode mechanism per platform and how to add a variant, is in [App icons](#app-icons).
- **App icon switcher**: Settings > Display > App icon (`AppIconScreen`, settings route `AppIcon`) is a grid over `APP_ICONS` in `constants/appIcons.ts`; a variant carries a **`free`** flag and anything without it goes through `useProGate().requirePro('app_icon')`. Two are free: `classic` and `purse`, the coin-purse character the app wore immediately before the current mascot, lifted back out of git history because putting back the icon a long-time user already had is not a premium feature. The flag exists rather than a `!== DEFAULT_APP_ICON_ID` check precisely because those are different questions, and a test pins both the default being free and the free ones leading the picker. `purse` is also the one variant that is not a mascot pose, so `scripts/generate-app-icons.mjs` reads it from `assets/app-icon-sources/` (whole-tile artwork, stamped through the identity framing) rather than from a mascot sheet; [Whole-tile icon sources](#whole-tile-icon-sources) records which blob it came from and why the cut-out has to be a flood fill from the tile border rather than a colour threshold (the purse's own belly is cream). The era before it, a coin and a clock inside two circular arrows, was offered here as `clock` and has been retired: one retired icon in the picker is the point, two is a museum. The choice persists as `settings.appIcon` (migration `055`) **and** lives in the OS, and the two can diverge, so an AppContext effect re-applies it on load: a restore onto a fresh install brings the choice back in the DB but not on the home screen, and on Android the current icon is read off the activity the app was launched through, so a notification or deep link into `MainActivity` reports the default whichever alias is enabled. Switching goes through the platform-split `services/appIcon`. **Dark icons are the platform's job, not the app's**: each variant registers light/dark/tinted appearances of one icon and iOS picks between them from the home screen's own appearance setting (its **Default** stays light even in system dark mode, so the dark tile is opt-in on the user's side and the picker promises nothing about when it appears). Driving it from `settings.themeMode` instead would fire iOS's modal "you have changed the icon" alert on every theme flip. Android gets `values-night` backdrops and a themed monochrome layer. **`plugins/withAndroidAlternateIcons.js` is load-bearing on Android**: switching there enables an `activity-alias` and disables whatever component the app was launched through, which on the default icon is `MainActivity` itself, and `MainActivity` is where Expo puts the `money2time://` VIEW filters that every home-screen widget and the Shortcuts auto-log open the app with. The plugin copies those filters onto each alias so a deep link keeps resolving (and can no longer land on `MainActivity` while an alias is live). It must be listed **before** `expo-alternate-app-icons` in `app.json`, because Expo runs manifest mods in reverse registration order; listing it after finds no aliases and silently copies nothing.
- **Subscription logos (recurring rules)**: A recurring rule can carry a brand mark (`recurring_rules.logo_id`, migration `056`), rendered by `SubscriptionLogo` and chosen in `SubscriptionLogoPickerSheet` (root route `SubscriptionLogoPicker`, handed its session by `subscriptionLogoPickerBridge`). It is deliberately the **same UI as the bank-logo picker**: Library/Custom tabs, a 3-column grid, and a bottom search bar whose flag button switches country, so the two read as one mechanism; most of its strings are shared `accounts.logo.*` keys rather than duplicated. The catalog is a **separate namespace** from `accountLogos` (banks on one, streaming/telecom/gym brands on the other) with its own country list, which is why it carries `region` per country and derives its flag map from that instead of hardcoding one. The picker's country tab persists to `settings.subscription_logo_country`, kept apart from `account_logo_country` so browsing Japanese streaming services doesn't move the bank picker off the user's own country. Uploads live under the `subscription-logos` user-asset kind (**added to `collectReferencedAssetPaths` in `services/userAssetGc.ts`**, or the orphan sweep deletes live images). Typing a rule name auto-fills the tile via `suggestSubscriptionLogo`, which matches only on **exact or leading-word** hits: a loose substring would stamp a brand the user never picked onto a rule called "Rent". The suggestion stops applying the moment the user opens the picker (including to clear it).
  **Pipeline.** `scripts/data/subscription-services.json` (country -> services, each with the domain that resolves on the Brandfetch CDN) drives `scripts/fetch-subscription-logos.mjs`, then `scripts/generate-subscription-logos.mjs` emits the registry from the PNGs that actually landed, so a failed download is reported rather than emitting a `require` for a missing asset (a Metro-time crash). Three things the fetcher has to do and the reasons they are not obvious: it pulls **all three** Brandfetch tiers and keeps the **squarest**, because a brand's `icon` is often a wide wordmark that renders as an illegible 52x7 sliver while its `symbol` is the square mark; it **backs off on HTTP 429**, which the CDN returns freely under any parallelism and which otherwise records perfectly good brands as missing; and it writes **192px, 128-colour palette-quantized PNG8** via `scripts/lib/pngQuantize.mjs` (the bank logos' 256px true-colour would be ~3x the bytes for pixels nobody can tell apart at 52pt, which across ~1800 brands is a ~22MB binary rather than a ~12MB one). A fourth thing, added after the first pass shipped visible slivers: when the squarest Brandfetch tier is still wider than 1.6:1, or the brand is absent entirely, the fetcher falls back to the site's own icon (Google's favicon service, then `/apple-touch-icon.png`, then DuckDuckGo) and does **not** autocrop it, because an apple-touch-icon is a designed square tile whose background is part of the mark. `--wide-only` re-runs just the tiles whose bundled art is still a strip. Finally, a mark drawn **dark on transparency** (Amazon, Whoop, Tidal, Kindle Unlimited) is composited onto a white plate by `scripts/lib/logoPlate.mjs`, because bare on the dark-mode surface it renders as an empty tile; the rest of the catalogue is opaque app-icon art, so plating those ~3% makes them consistent rather than special. `--replate` re-applies that step to already-bundled tiles without re-downloading anything. Its **inverse** is `scripts/lib/logoBackground.mjs`, which runs just before it: plenty of tiers arrive as the mark on a flat white card, and the autocrop above trims only the _margin_ around that card, so without this step the white survives as a full-bleed plate and the picker shows a paper square behind every such logo. It floods the flat field in from the border of the **content box** (not the tile's own corners, which a card with rounded corners leaves transparent) and un-mattes the 3px antialiasing rim against it, so the mark keeps a clean edge instead of a pale halo. It refuses three cases, each of which costs real information: a **brand-coloured** field (Netflix red, Spotify green) where the colour is the mark; a mark that fails a **WCAG 2.0 contrast** check against the midnight surface, which is the very thing the plate above exists to prevent (the bar is 2.0 rather than 4.5 because these are shapes, not glyphs, and it has to pass Netflix red at 3.35 while rejecting navy at 1.07 — and the _dominant tone_ is checked separately, or a bright accent vouches for a wordmark that is entirely dark); and a mark that is itself **near-white**, which fuses to a white field so the flood walks into it and tears limbs off (TVB's white 3D mascot). Only that last check reads the cream surface, and only for this reason: cream and the plate are within a hair of each other in lightness, so removing a plate never costs light-mode contrast. `node scripts/strip-subscription-logo-bg.mjs` applies the same step to what is already on disk (`--dry-run` reports the verdicts); it is idempotent, since a stripped tile no longer has a field to find. Like `assets/account-logos`, `assets/subscription-logos` is **kept out of `expo.updates.assetPatternsToBeBundled`** so it rides the native binary instead of eating the 1000-asset OTA cap.
- **Loans (interest accrual)**: A loan is an account with `type: 'loan'`; the balance is the **principal outstanding**, and repayments are transfers into it. The balance is **not** the sum of its rows: `accountsRepository.getBalances` replaces it with the ledger walk `accrueReducingBalance` (`features/loans/lib/loanMath.ts`), which adds a month's interest at every monthly rest and takes each repayment off after it, so only the part of an instalment that is not interest retires principal. **Both interest models are walked**, flat and reducing alike: a flat contract's instalment carries interest too, and knocking the whole instalment off the principal (what the app did before) read a 5 year flat loan as 15 instalments in after 12 and as settled 7 early. The two models differ only in what the agreement fixes: `flat` fixes the total, so `leftToPay` is total less paid and `interestSaved` is null; `reducing` fixes the rate, so what is left is the live projection and paying ahead saves interest. The walk runs at the **unrounded** rate the agreement's total implies (`loanAccrualRatePercent`, via `contractMonthlyRate`), never the two-decimal `loan_interest_rate` column, because the projection and the walk are both sensitive to that rounding; on a flat loan the stored rate is already the effective one (the flat figure is never stored). It starts at `loanLedgerAnchor`: `loan_ledger_anchor_date` (migration `062`), which the editor sets on a new loan to the date of the last instalment already paid (`LoanQuote.openingBalanceDate`) so every rest falls on the payment day, falling back to `createdAt` for loans saved before the column. A **variable rate** (reducing) loan keeps `loan_rate_changes_json` (`LoanRateChange[]`, read through `loanRateChangesOf`): editing the rate on one that already has interest behind it asks whether the new rate applies **from today** (a base-rate move; the history gains an entry and every rest before it stands) or **from the start** (a correction; the history is cleared). `pendingLoanRateChange` (pure, in `loanMath.ts`) decides, reading a missing rate as 0% so a loan going interest-free is a change like any other; a history left on a loan saved as flat is cleared (`loanRateHistoryIsStale`), since the flat model never asks: its rate is fixed at signing. The editor shows the flat rate's **effective rate** as helper text under the rate field (`accounts.loan.effective_rate_hint`), which is the reducing-balance equivalent regulators quote (Malaysia's BNM moved hire purchase to EIR in 2026).
- **Savings goals**: A goal is an account with `type: 'goal'` plus the `goal*` columns (target amount required, optional target date/emoji, achievement + archive stamps). Deposits/withdrawals are ordinary transfers; auto-save is a recurring transfer rule targeting the goal. Every balance-sign branch tests `type === 'credit'`, so goals inherit debit/asset semantics everywhere. Derived numbers come from the pure `computeGoalProgress`/`monthlyEquivalentRate` in `features/goals/lib/goalMath.ts`, composed by `useGoals()` (`features/goals/useGoals.ts`). Goals are a dedicated sub-tab of the assets page (`AssetsTab`: Accounts | Goals | Items) rendered by `GoalsScreen` (`features/goals/screens/GoalsScreen.tsx`), sharing the shell's balance-visibility toggle; the gated add button is `AddGoalButton`. `GoalDetail`/`GoalEditor` are root routes. Achievement detection is an AppContext effect that stamps `goalAchievedAt` once (celebration via `GoalCelebrationOverlay`); `setGoalArchived` deactivates auto-save rules on archive. Pro-limited to `FREE_MAX_SAVINGS_GOALS` (non-archived count); goal accounts do not count toward `FREE_MAX_ACCOUNTS`. Archived goals are hidden from `AccountPickerSheet`.
- **Budgeting**: Monthly, **expense-only** budgets built from reusable **budget templates** (`budget_templates`/`budget_template_categories`) — a template sets a total plus per-root-category allocations, an optional emoji, and a `count_unbudgeted` toggle (whether spend in categories with no line counts toward the month total). Each month gets a **frozen** budget row (`monthly_budgets`/`monthly_budget_categories`) copied from a template at creation; editing a template never rewrites already-created months, and soft-deleted month rows double as **tombstones** so auto-create (via `pickAutoCreateTemplate` in the `runDueTransactions` load path) never resurrects a month the user deleted. Exactly one template is the default while any exist. All screen/widget numbers come from the pure `buildBudgetMonthSummary` in `features/budget/lib/budgetMath.ts`, valuing spend at `reportingAmount ?? amount` (never drifts with FX). The month view is an **embedded Insights page** (`BudgetPagerView` inside `InsightsScreen`, chosen from the insights type menu, not a Settings tile); template/month/allocation editors are root-stack routes (`BudgetTemplateEditor`, `BudgetMonthEditor`, `BudgetCategoryAllocation`, `SettingsBudgetTemplates`). Pro-limited to `FREE_MAX_BUDGET_TEMPLATES`; two home-screen widgets (`budget_ring`, `budget_breakdown`) surface usage. Manage via `useApp()` budget ops.
- **Split bills & Settle Up**: Splits live on `transactionSplitsTable` (per-transaction). The `SettleUp` screen has two underline tabs — **Person** and **Transactions** — over all positive, non-self splits, with paid shares shown in muted rows and only unpaid shares counted in outstanding totals. By-person rolls up via `aggregateSettleUpByPerson` (grouped by trimmed/case-folded name); by-transaction rolls up via `aggregateSettleUpByTransaction` (one entry per bill, each carrying every person's share). Both live in `features/transactions/lib/settleUp.ts` and total in the reporting currency via each parent's frozen `fxRate`. Tapping a person opens `SettleUpPerson` (itemized bills); tapping a bill opens `SettleUpTransaction` (each person's share). Both full-page root screens keep paid history visible; unpaid shares support editable payback account, mark-paid, delete-request, and share. Share opens `SplitReceiptShareModal`, which previews a fixed-light `SplitReceiptCard` (banner logo, big QR, generic `ReceiptContent`: title + optional date subtitle + itemized lines + total, no footer) and captures it to a PNG via Skia's `makeImageFromView` (lazily imported) → `expo-sharing` for a cross-platform image share, falling back to a plain-text `buildReceiptText` receipt if capture fails. **That capture does not clip the way the screen does on Android**: it walks the view tree itself (TextureView and SurfaceView children need their own path) instead of drawing the root, so it never reaches `ReactViewGroup.dispatchDraw()` and has to replay the `overflow: hidden` clip by hand. Skia 2.2.12 replayed it by reflecting for `dispatchOverflowDraw`, which React Native dropped in 0.81; the lookup throws, the throw is only logged, and every clipped child drew unclipped, which put the whole category-icon sprite atlas across the shared receipt (the app's own screens were fine, since they draw normally). `patches/@shopify+react-native-skia+2.2.12.patch` backports the upstream fix released in 2.12.0, and `__tests__/patches/skiaOverflowClip.test.ts` reads the installed module so an upgrade that drops the patch fails loudly rather than silently shipping the wrong pixels. **Anything new put on this card that relies on a clip (an atlas cell, a rounded image, a cropped avatar) is only as correct as that patch.** The user attaches their own payment QR (settings `paymentQrUri`, stored via the `payment-qr` `userAssets` kind). `useSettleUpSummary` / `useSettleUpByTransaction` wrap the two aggregations. The split editor (`SplitBillModal`, opened from the transaction editor's numpad toolbar) is a **pushed root screen** (`SplitBill`): the editor publishes its live split draft + callbacks through `context/SplitBillSession.tsx` and `SplitBillScreen` consumes them, mapping Done/Cancel (incl. swipe-back via `beforeRemove`) onto the editor's commit/discard. `SplitBillModal` renders bare in `presentation="page"` mode; it autocompletes friend names from past splits (`recentSplitPersonNames`). Reached from Settings → "Who owes you".
- **Split by Item (itemized receipt split)**: Scan (or hand-enter) a receipt's line items and split them among people. Step 1 is items only (name + amount) plus an **"apply tax/service %"** stepper (defaults to 10%, like Split Bill's adjustment control) whose Apply **multiplies the item amounts in place** — there is no separate tax field; the receipt total is just the sum of items. Step 2 sets **how many people** are splitting (a count stepper; unnamed people auto-label **"Person A", "Person B", …**, a custom name is optional) and assigns each item to its host(s); a shared item splits evenly among its people. Step 3 summarizes per-person totals (no payback-account picker — payback defaults to the settings default). The itemized detail lives on its **own tables** (`receipt_splits` header + `receipt_split_items` + `receipt_split_item_shares`, one live header per transaction; header holds only currency/merchant/date/source/image — item `line_total`s are tax-inclusive) as the source of truth; on save the computed per-person totals are written as ordinary `transactionSplitsTable` **bridge rows** (unnamed people materialized as "Person A"…), so all Settle Up machinery works unchanged. All math is the pure `computeReceiptSplit` in `features/transactions/lib/receiptSplitMath.ts` (integer cents, largest-remainder, odd cents to the self share; groups by an opaque per-person key so two unnamed people never collide; Σ per-person ≡ item subtotal). The 3-step editor (`ReceiptSplitScreen`: Items → Assign → Summary) is a root route launched via the `receiptSplitBridge` module (payload never rides params); entry points: the scan-ready banner's "Split by item" chip (quick scans that parsed ≥2 items), split-intent scans (`startScan('split')` → Worker `mode: 'itemized'` → banner opens the editor directly), the add-action sheet's Split tab ("Scan to split"), the Settle Up empty-state CTA (scan or manual; scanning returns to the home tab so its progress banner shows), and the "Itemized receipt" row on `SettleUpTransaction` — shown **only** for bills that already have itemized detail (a plain Split Bill can't be converted); **paid rows freeze** on re-edit. Manual entry needs no scan/quota and works offline. The Settle Up **share receipt** lists each person's items as bullet points (`receiptSplitShare.personItemNames`). Editing saves via `updateTransactionReceiptSplit` (replace-on-save detail + bridge-row rewrite); deleting the parent cascades; backup round-trips the three tables.
- **App Lock**: Biometric gate via `services/biometricAuth.ts`, configured in `AppLockScreen`; settings `biometricLockEnabled` / `biometricLockDelaySeconds`.
- **Receipt scan**: Background OCR of a snapped/uploaded receipt, orchestrated by `context/ReceiptScanContext.tsx` (`useReceiptScans()` → `startScan`, `scanReceiptImage`, banner `jobs`). `startScan` gates the free-tier receipts limit, then opens the **inline camera** via the `requestOpenScanCamera` bridge. There is no pushed camera route: `ReceiptCameraSheet` is mounted once by the app shell (above the navigator) and raises the viewfinder as a bottom sheet over whatever screen asked for it, so dismissing lands the user exactly where they were. The viewfinder itself is `components/InlineReceiptCamera` — a fixed-height framing box plus a shutter, an album button and a close button — and the transaction editor renders the _same_ component in its numpad slot when the receipt chip is tapped, so framing a shot never covers the amount and note being filled in. A snap is held for Retake / Use photo; an album pick skips that (the picker was the review step); either path downscales the photo (`downscaleReceiptForStorage` in the platform-split `services/receiptImage` — caps the long edge at 1600px and re-encodes JPEG via `expo-image-manipulator` so the one stored copy is small enough for both the attachment view and the base64 upload; `.ts` is a web/test passthrough) then saves it (`saveReceiptImage`) and calls `scanReceiptImage`, which enqueues a background job and hits the Worker (`services/receiptScan`). A single parsed draft becomes a tappable "ready to review" banner (opens a pre-filled editor; a secondary "Split by item" chip appears when the itemized breakdown parsed ≥2 line items); multiple drafts are added directly. `startScan('split')` carries a split intent through the camera so the ready card opens the Split-by-Item editor directly (Worker `mode: 'itemized'`). **`expo-camera` is a native module** (config plugin in `app.json`), so `InlineReceiptCamera` is `React.lazy`-loaded behind an error boundary by both hosts — never import it eagerly — adding/upgrading it needs a **dev-client/prebuild rebuild** (like MapLibre).
- **Android share-to-log**: Android's Automation page has one entry, sharing a screenshot or receipt photo to the app from the system share sheet, the counterpart of iOS's Back Tap "Log Screenshot". `plugins/withMoney2TimeShareScan.js` generates `ShareScanActivity`, a no-UI share target for `image/*` (SEND and SEND*MULTIPLE) that copies the shared images into `<filesDir>/shared-scans/` and opens the app. It is a **separate activity on purpose**: picking an alternate icon disables `MainActivity` (see the App icon switcher note), and a share filter on a disabled component disappears from the share sheet. The copy happens in the activity because a shared `content://` grant does not outlive it. Each file is written as `<name>.part` and renamed when complete, and the folder listing *is* the queue: `services/autoLog.ts` reads it on Android (`parseSharedScanFileNames` in `features/transactions/lib/autoLog.ts`) in place of the iOS App Group queue, so `ScreenshotScanSync` in `App.tsx` drains both platforms through the same `screenshot` scan intent (silent auto-create, the `autoLogSaveScreenshot` opt-in). Adding the activity needs a **prebuild/native rebuild**. The walkthrough is the `shareScreenshot` topic of `AutoLogTutorialScreen`, with frames in `assets/autolog/ss*\*.png`drawn from`scripts/data/autolog-shots.json` (`TUTORIAL_SPEC=scripts/data/autolog-shots.json TUTORIAL_OUT_DIR=assets/autolog node scripts/annotate-tutorials.mjs`).
- **Tutorials**: `features/tutorials/` is a searchable set of step-by-step guides, reached from Settings > HELP & ABOUT > Tutorials (root routes `Tutorials` and `TutorialDetail`, so `money2time://tutorial?id=<slug>` can open one directly). Three things about it are load-bearing. **The catalog is English prose in `features/tutorials/content/*.ts`, not in `lib/i18n/locales/*`** — it is long-form content, and putting it in the locale files would add hundreds of keys to all 24 of them (and 32 more on the website) and make the parity test police prose; the screen _chrome_ does go through I18n, under `tutorials.*`. **The catalog is also the single source of truth for money2time.com**: `node scripts/sync-tutorials-web.mjs` copies it plus the screenshots into the web repo (`src/lib/tutorials.generated.ts`, `public/tutorials/`), so a tutorial is written once. Re-run it after any content or artwork change, or the two drift. **`assets/tutorials` is deliberately absent from `expo.updates.assetPatternsToBeBundled`** so its ~145 frames ride the native binary instead of eating the 1000-asset OTA cap (see the icon-pack note above).
  **Artwork pipeline.** A raw simulator capture plus a red-marker spec becomes the committed frame: `scripts/data/tutorial-shots.json` names the source and the marks in **normalised [0,1] coordinates**, which is exactly what argent's `describe` reports for an element's frame, so a mark is taken from the accessibility tree rather than eyeballed off a screenshot and survives a recapture on a different device. `node scripts/annotate-tutorials.mjs [id-prefix...]` draws them, downscales to 820px wide and writes a **256-colour indexed PNG** (a flat UI quantizes almost losslessly, and true-colour would be ~3.5x the bytes, which is app download size). Raw captures are not committed (~1MB each, well over a hundred); they live in the gitignored `.tutorial-raw/`, which the spec's `RAW/` prefix resolves against. `node scripts/generate-tutorial-images.mjs` then emits the `require()` registry Metro needs. `__tests__/features/tutorials.test.ts` fails on a step pointing at a missing image, an orphan image nothing references, or an em/en dash in the copy.
- **Live earnings (Live Activity)**: Settings > Widgets > Live earnings. `WidgetsScreen` (route `Widgets`) is a **hub**, not the feature: it lists one row per widget so a second one can be added without taking the page apart, and reads `getCurrentLiveActivity()` on focus purely to show an "On" badge (read-only on purpose, so it never mounts a second controller pushing its own updates). `LiveEarningsScreen` (route `LiveEarnings`) is the feature, offering a Lock Screen / Dynamic Island activity whose money figure counts up at the user's true hourly rate for a chosen 1 to 8 hour session. It needs **no Apple approval and no entitlement**: the app declares `NSSupportsLiveActivities` (added by `plugins/withMoney2TimeWidgets.js`) and that is the whole permission story, though the user can still switch Live Activities off per app in iOS Settings, which `ActivityAuthorizationInfo` reports and the screen surfaces. **The one thing ActivityKit cannot do is repaint on its own.** Only time-derived SwiftUI views (`Text(timerInterval:)`, `ProgressView(timerInterval:)`) redraw without an update, so the card's elapsed clock and progress bar are genuinely live while the **amount** is only as fresh as the last `activity.update()`. **`useLiveEarningsSync`** therefore pushes one on every AppState transition out of `active` (the moment right before the user looks at their Lock Screen) and one on the way back in (to reap a session that expired while the app was away); and a **push Worker** carries it the rest of the way. That is the only thing that moves the figure while the phone is locked, because it is the only one that does not need the app to be running: `apps/cloudflare/workers/live-earnings` holds the session and pushes the current amount once a minute for its whole life. Worth being clear on what an ActivityKit push is, because the name misleads: no banner, no sound, nothing in Notification Center, and **no notification permission** - Live Activity delivery is independent of an app's notification settings, so it works for users who have denied notifications outright. It is a silent data channel to one card. The app requests the activity with `pushType: .token` and registers the token via `services/liveEarningsPush.ts`. **The token is not available when `request()` returns** - it is minted per activity and asynchronously, so it is nil even on an install that has run sessions before; an early version waited for it and only bought a Start button that stalled. Registration is therefore an **upsert keyed by the push token**, done on the first transition out of the foreground, which is the moment before the Lock Screen is looked at anyway. That one path also repairs a registration that failed while offline and picks up a token ActivityKit rotated mid-session. Three more things that cost real debugging time: a Live Activity push token is **not** the 64-hex-character APNs _device_ token every example uses - iOS 26 issues **256** hex characters, and a length bound written for the smaller one silently rejects every real token (registration is best-effort, so the only symptom is a card that never ticks). `ContentState.asOfMillis` is a **Double, not a Date**, because a pushed `content-state` is decoded by a JSONDecoder with _default_ strategies and the default for `Date` is `deferredToDate` - seconds since the 2001 reference date, so a Unix timestamp decodes without complaint and lands 31 years out. And the app must declare **`NSSupportsLiveActivitiesFrequentUpdates`**, or Apple's delivery budget runs out part-way through a shift and the figure freezes again with nothing to say why. That hook is mounted **once in `AppContent`, not on the screen**, and the distinction is load-bearing: a listener owned by `LiveEarningsScreen` dies when the screen is popped, which is precisely what happens right after someone taps "Start the clock" and navigates back, leaving the card frozen at the amount it started with. `useLiveEarningsActivity` owns only the screen's own state (start, stop, and re-reading ActivityKit on focus). The **in-app preview** has no such limit and re-renders four times a second, which is what sells the feature. All math is the pure `features/widgets/lib/liveEarnings.ts`; the 8-hour cap is iOS's own, not a product choice. A hand-started shift is set up **in the act of starting it**: the action bar reads "Start manually" and opens `StartSessionSheet`, which asks the two questions a session needs (how long, and when it began) and then starts it. They used to be rows in a "Session" section on the screen itself, which put the settings for one shift next to the settings for every future one (the schedule) with only a header between them, and left the screen holding draft state for a session that might never begin. The length is still persisted on the schedule blob as `hours` (so the sheet opens on the last shift worked, and still apart from the schedule's own `shiftHours`); the start time deliberately is not, since "I clocked in at nine" is true of one shift only. A session can be **backdated**, and the picker for it is two wheels of **wall-clock time**, not a list of "2h ago" presets: someone who clocked in at half nine knows the time, and making them work out the difference is arithmetic the app can do. The hour column is labelled with `Intl.DateTimeFormat(locale, { hour: 'numeric' })` so the locale picks 12- vs 24-hour, and it carries **instants, not 0-23 numbers**, since a DST fall-back repeats an hour. Both columns only ever offer the window the session allows (the earliest hour starts part-way through, the current one stops at the present minute), so every combination the wheels can land on is a legal start rather than one clamped after the fact, and shortening the duration re-clamps a start the longer window had allowed. The sheet hands back the picked **time** and the screen converts it to an offset at the moment Start is pressed, so minutes spent deciding do not shift the session. Amounts deliberately go through `formatCurrency`, **not** `formatAmount`: in time display mode the latter would divide the earned amount by the very rate that produced it and render the elapsed clock twice. The Swift lives in the config plugin like the rest of the widget code (`ios/` is gitignored) and `Money2TimeEarningsAttributes` is emitted from **one** template string into both the app target and the widget extension, because ActivityKit pairs them by type name and two hand-maintained copies would drift. Two layout rules the card depends on, both learned the hard way on device: a **`Text(timerInterval:)` that is not given the width it reserved renders `1:--` instead of the time**, so the elapsed clock lives on its own footnote-sized row rather than sharing a line with the amount; and the **amount owns its row outright**, because giving the timer `layoutPriority` next to it let the timer claim the whole row and the amount rendered as nothing at all. A `Text(timerInterval:)` also reserves a box for the widest value it could ever show, so **anything placed after it on a row gets shoved to the far side** — which is why the clock sits at the start of the footer row with only a `Spacer` and the end time after it. That reserved box is also why the clock is given a **fixed 72pt frame**: the Lock Screen renders the card narrower than Notification Center does, and without a reservation the timer was handed less than it asked for and drew `3:--` on the Lock Screen while reading correctly everywhere else. The reservation has to be a **finite** one, and this is the sharpest trap in the whole card. `fixedSize(horizontal: true)` is the obvious way to say "take the width you need", and it shipped that way, but it proposes an _unspecified_ width instead of a number; the system's own ideal width for a timer text is not finite under that proposal, and the resulting nan came back out through the sibling progress bar as `view origin is invalid: (nan, 3.0)`, a hard trap in SwiftUI's layout. It does not fail gracefully or locally: it kills `WidgetRenderer_Activities`, the out-of-process renderer that draws **every** presentation of the activity, so the Lock Screen card, Notification Center, and all four Dynamic Island states render as blank black at once while ActivityKit still reports the activity as perfectly alive. That is the signature to recognise: a Live Activity that is running and updating (`liveactivitiesd` logs it, the app's own preview animates, the home-screen widget keeps ticking) but draws nothing anywhere. When it happens, the answer is in `~/Library/Logs/DiagnosticReports/WidgetRenderer_Activities-*.ips` and in `log show --predicate 'process == "WidgetRenderer_Activities"'`, not in anything the app can see. The rule this leaves behind: inside a Live Activity, never hand a time-derived view an unspecified size proposal - give it a number. The card is deliberately spare: four rows (badge + rate, the amount with the session total and the refresh button beside it, the bar, clock + end time), **no wordmark and no captions**, because a Lock Screen card is read at a glance and every label it does not need is one more thing between the user and the number. It carries no artwork for a second reason too — a Live Activity's view is archived and rendered out of process, so an image loaded at runtime with `UIImage(contentsOfFile:)` comes back as a grey placeholder box (the same `loadBundleImage` helper works fine in the home-screen widgets, which render in process, which is what makes that trap easy to walk into). Colour: the app hands the activity **both** the light and dark variants of the user's theme primary as `0xRRGGBB` ints, since the extension cannot read `ThemeContext`, and spends that accent on exactly one element (the amount) with everything else on `.primary`/`.secondary` — the only colours legible both over the Lock Screen and in light contexts. Per the HIG the card is deliberately **uncontained**: no background tint (the system material is what the rest of the iOS 26 Lock Screen is made of) and no filled pill around the "Earning" badge, because everything on the card except the refresh control is read-only and anything else that looks like a button misleads. That **refresh button** is the card's one interactive element, and it exists precisely because the amount cannot repaint itself: `Money2TimeRefreshEarningsIntent` is a `LiveActivityIntent`, which the system runs **in the app's process** (a plain `AppIntent` would run in the extension, where `Activity.update` reaches nothing), so one tap pushes the current figure without unlocking the phone or foregrounding the app. Two things it depends on: the intent must **not** set `isDiscoverable = false` (that keeps the app's copy out of the AppIntents metadata index and the system then routes to the extension's copy, where `Activity.activities` is always empty and the button silently does nothing, which is exactly how it first shipped in testing), and it reads its figure from the widget feed below rather than recomputing one, so the card and the widget can never disagree. The amount animates with `.contentTransition(.numericText(value:))`, which is why `ContentState` carries the raw `earned` double next to the formatted string: the digit roll needs a number to interpolate and cannot get one from a localized currency string.
- **Scheduled auto-start (push-to-start)**: The schedule on `LiveEarningsScreen` raises the card by itself at the start of a shift, and is **Pro-only** (`requirePro('live_earnings_auto_start')`) while starting the clock by hand stays free: what Pro buys is not having to. The gate is checked in `syncLiveEarningsAutoStart` on every pass, not just at the toggle, because a subscription can lapse long after the switch was flipped and the stored schedule would otherwise go on raising cards; the app disarms it the first time a lapsed subscriber opens the app, which is the only moment it gets (the Worker has no idea who is Pro, and a schedule nobody comes back to is dropped by its own staleness sweep). The switch reads off for a free account even when the flag is set, so it never promises a card that is not coming. `Activity.request()` is **foreground-only**, so for its first release the schedule could only be a local notification the user tapped; what removed the tap is a **push-to-start token** (iOS 17.2+), which addresses the activity _type_ on a device rather than any card, outlives every card raised from it, and lets a push start one with the app not running at all. The app reads it with `getLiveActivityPushToStartToken()` and registers the shift (weekdays, local time, length, rate, and the device's IANA zone) with `POST /live-earnings/schedule`; `apps/cloudflare/workers/live-earnings/src/starts.ts` sends the start push at the right local minute. **Both mechanisms still exist and exactly one may be armed**, which is why `features/widgets/lib/syncLiveEarningsAutoStart.ts` owns the decision rather than the two services it drives: with a token it registers the schedule and cancels the reminders, without one (iOS below 17.2) it schedules the reminders and registers nothing, and it disarms both when the schedule is off, has no days, has no wage behind it, or Live Activities are switched off for the app. `syncScheduledNotifications` deliberately no longer touches this one. It runs from `useLiveEarningsSync`, so it re-arms on every foreground: that is what repairs a registration made while offline, follows a user into a new time zone, refreshes the prerendered copy after a change of wage, currency, language or theme, and picks up a rotated token. **Everything the card will show is registered prerendered**, like the widget's timeline, because the Worker has no i18n catalogue and no view of the user's currency - and it can be, because a scheduled shift is fixed in advance. A shift is a start time **and a length**, and the length is its own field: `shiftHours` on the schedule blob, kept apart from the `hours` a hand-started session runs for. The two were one value at first and that was a bug rather than a simplification - clocking in for two hours of overtime on a Saturday silently rewrote every weekday the schedule covered, so Monday's card ended at eleven. `normalizeLiveEarningsSchedule` reads `shiftHours` from `hours` when the stored blob names only the latter, so an install upgrading across the split keeps scheduling exactly what it already was; only a blob naming neither gets the 8-hour default. `scheduleEndClock`, `scheduledSessionTotal`, the registered `durationMinutes` and the reminder's deep link all read `shiftHours`, and `useLiveEarningsSync`'s `scheduleKey` covers it so a change re-registers. A schedule is a **wall clock, not an offset**: `src/schedule.ts` walks local calendar days so 09:00 stays 09:00 across a daylight-saving change, and `next_start_at` is precomputed per row (a range scan, not a sweep of everyone's calendar) and recomputed **strictly forward** from now, so a foreground at 09:00:30 cannot re-arm the 09:00 start that just fired. Three states the pass refuses to start in, because each would put a lie on the Lock Screen: **a card is already up for that account** (started by hand, or a shift still running - it would count the same hours twice), **the start is more than `START_GRACE_MS` late** (the phone that was off all morning gets the push the moment it comes back; `apns-expiration` matches), and **APNs is unconfigured** (rows are left armed rather than rolled past a start that never went out). Two more things the payload depends on. The **attributes travel as millis** - `startedAtMillis`/`endsAtMillis`, with `startedAt`/`endsAt` as computed `Date`s - for exactly the reason `ContentState.asOfMillis` does: a pushed `attributes` dictionary is decoded by a JSONDecoder with default strategies, and the default for a Swift `Date` is seconds since the 2001 reference date, so a Unix timestamp lands 31 years out without throwing. `__tests__/services/liveEarningsStartContract.test.ts` reads the struct out of the config plugin and fails if the Worker's payload stops matching it, because nothing else would notice: APNs returns 200 for a payload the device then discards. And a start push **must carry an `alert`** (Apple's rule, so a card cannot appear entirely unannounced); on iPhone the card is the notice and the alert is what a paired Apple Watch shows, and delivery still needs no notification permission. Once the card is up **iOS wakes the app in the background** so it can read the new activity's _update_ token and register it through the ordinary session path - which is what starts the amount ticking; `refreshLiveEarningsActivity` therefore re-reads a tokenless activity a few times a second apart, since a single empty read would leave the figure frozen until the user next opened the app themselves. If two cards ever do end up running (a start that slipped past the busy check), the module's `activityUpdates` observer ends all but the one that has been **accruing longest**, since a shift already in progress is the one with something to lose; the manual start path, which deliberately ends the old card before requesting a new one, holds the reaper off with a flag while both briefly exist.
- **Live earnings widget (the figure that moves on its own)**: The Live Activity's amount is frozen between updates; the widget's is not, and the difference is the mechanism. A widget is the one iOS surface with a **timeline**: the app hands the system a list of future entries and it renders each at its date with no app process, no network and no push. Money accruing at a fixed rate is entirely predictable, so `features/widgets/lib/liveEarningsWidget.ts` precomputes the whole session into one timeline and the number climbs by itself on the Lock Screen and Home Screen. The schedule is **two-speed on purpose** - a tick a minute for the first hour, then one every five - because a flat grid either runs out mid-shift or moves in visible jumps from the start; 1 + 5 fits a whole 8-hour session in ~145 entries, comfortably under the ~200 WidgetKit tolerates, so the timeline never needs a reload to stay true. The last entry is the session's **final total**, which is what makes running out of timeline safe: the widget is left showing the right answer rather than a stale one. Entries do not consume the 40-70 reloads/day budget (that counts `getTimeline()` calls), so the cost of the whole feature is one write per app foreground. Amounts are formatted **in JS** and travel as strings, like the snapshot widgets' labels, because the extension has no access to the user's currency settings - which is also why the refresh button above reads its figure from here instead of computing one. The feed lives on its **own App Group key** (`live_earnings`), not inside the big widget snapshot: that snapshot is rebuilt from app data on a cadence of its own and a rebuild must never wipe out a running session. `syncLiveEarningsWidget` writes it wherever the activity changes (start, stop, expiry, foreground, and once at launch so the widget is never blank), and stopping by hand clears it while a session that simply ran out keeps its total - one is the user saying they are done, the other is a shift worth reading. Families: `accessoryRectangular` / `accessoryCircular` / `accessoryInline` on the Lock Screen (accessory widgets render in a single vibrant tint, so those views spend their space on hierarchy rather than colour) and `systemSmall` on the Home Screen and StandBy, where the theme accent survives.
- **Xcode 27 / iOS 27 SDK**: `plugins/withXcode27Compat.js` adopts the UIScene lifecycle (UIKit traps apps linked against the iOS 27 SDK that have not), aligns every pod's deployment target with the app's, and patches a Swift 6.4 init clash in RevenueCat's `PaywallColor`. Where React starts is deliberate and differs by build: a dev client starts it in `didFinishLaunching` (expo-dev-launcher throws otherwise), a store build starts it in `SceneDelegate` with launch options rebuilt from the scene, because that is the only way `Linking.getInitialURL()` sees the link a widget or Shortcut cold-started the app with. `patches/expo++@expo+cli+54.0.24.patch` backports DeviceHub support (Simulator.app is gone in Xcode 27) and ignores the simulators `devicectl` now lists, so `npm run ios` works. Both are stopgaps until Expo SDK 56+, whose template and CLI do this natively. Run `pod install` with `LANG=en_US.UTF-8` or CocoaPods fails on a Unicode normalization error.
- **Transaction drag-to-reorder**: In selection mode the transaction list's grips drag rows on the FlashList itself (`features/transactions/components/transactionReorder.tsx`, geometry in `features/transactions/lib/dragReorder.ts`, the save in `reorderTransactionDate.ts`). A lifted copy of the row follows the finger, the rows it passes slide aside through the row's existing press-scale view, and the list scrolls near its edges, all on the UI thread. **Do not use `react-native-sortables` for a long, scrolling list.** It cannot virtualize, and Reanimated re-applies the last animated props of every view it has updated on each commit that is not its own. A scrolling ScrollView commits its offset every frame, so a month of Sortable rows was re-cloned, re-laid-out and re-diffed on every frame (10 to 30 dropped frames a second on the simulator). Sortable is fine for the short settings lists that still use it. The container, not the grip, follows the finger after pick-up, because a grip scrolled far enough away is clipped or recycled by FlashList and its touch is cancelled. **A drop renders in the list before it is saved:** `ActivityTransactionList` applies the drop to its own copy of the transactions (`applyReorderUpdates`) and calls `updateTransactionsBulk` on the next task. Waiting for the app-wide re-render instead kept the drag frozen for hundreds of milliseconds. During that time the lifted row stayed pinned while the list scrolled under it, and grabbing the row again scrolled the list. The render that shows the drop remounts only the rows and headers between the pick-up and drop spots, which sheds their drag styles. Remounting every row took most of that render.
- **Feature announcements**: Add a numbered entry under `features/news/announcements/` and a matching `*Showcase`; seen-state tracked by `services/featureAnnouncementState.ts`.
- **Notifications (`features/autoLog/`)**: Design: [Notification review](#notification-review). Native Android/iOS capture queues remain compatible. `PaymentAlertSync` stores captures for local review, without AI or network requests. `utils/notificationAmounts.ts` extracts currency-labelled money candidates; the user chooses Income, Expense or Ignore in root `NotificationHistory`, with bulk actions and a leave-warning. Missing or ambiguous amounts/accounts stay editable. All unfinished items persist; completed history is capped at 10. `NotificationReviewBanner` surfaces pending items on launch/foreground/live capture. Explicit review commits the transaction and capture link synchronously using `source: notification_review`; it does not charge automatic-log usage. Apple Pay stays automatic with its existing allowance. Android system access, master and selected apps still apply; iOS uses the action Account. Resets clear/invalidate pending work. Receipt photo/itemized/screenshot AI behavior remains intact; the retired Worker notification mode rejects before inference.

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

Confirmed reviews are manual actions: no inference, scanner credits or automatic-log usage. The existing free account-count restriction still applies to saving, while Ignore remains available. Apple Pay auto-log retains its allowance. Commit the transaction and capture link together before marking history complete. A failed history write can be repaired from that link without creating another transaction; a failed transaction remains pending.

Retain all unfinished items plus only the 10 newest completed history entries. Unfinished items do not expire. This avoids silently losing drafts when more than 10 notifications arrive. Old expense/income history remains historical; it is never reopened or relogged. Data resets, including main-currency reset, successful backup restores and Money Manager imports clear/invalidate local drafts and native queues to prevent stale saves. Failed backup restores preserve drafts. No schema migration or native contract change is needed.

Notification text, candidates and amounts are local data, excluded from analytics and Sentry payloads. Existing drain telemetry records queued/pending counts; successful user decisions emit existing autolog telemetry with `decision: confirm`. Feature first-use and transaction milestones follow actual successful saves.

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
- Authorize access only from `entitlements.active[configuredEntitlement]`.
  Historical entries can contain refunded/revoked lifetime purchases without
  an expiration date and must not unlock Pro.
- Report actual restore failures to Sentry under `revenueCat.restore`, with the
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
time. Inspect that customer's history and the scoped Sentry error before assigning
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

Baseline audited against this checkout on **2026-10-02**. This date records an audit, not a release date. The catalog covers native iOS/Android app tracking; [the web fallback](apps/mobile/services/analytics.ts) sends nothing. Routing means an event is eligible to be sent when the provider is configured; delivery is best-effort.

### Provider coverage

| Coverage                                               | Definitions | Meaning                                                                                                 |
| ------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------- |
| All custom events                                      | 107         | Every event in the custom-event tables goes to GA4.                                                     |
| Mixpanel + GA4 custom events                           | 26          | Install, activation, adoption milestones, the Pro funnel and approved RiceCal ad taps.                  |
| GA4-only custom events                                 | 81          | Per-use telemetry and data maintenance; never call Mixpanel track for these.                            |
| Feature first-use definitions                          | 17          | One adoption event per qualifying feature on eligible installs.                                         |
| Transaction milestone thresholds                       | 6           | One event at each documented logged-transaction count.                                                  |
| Maximum adoption/milestone events per eligible install | 23          | Feature first uses plus transaction milestones, with working persistent storage; not a total event cap. |

RevenueCat server events are listed separately below; they add billable Mixpanel lifecycle volume beyond these 26 app event definitions. Both providers identify every native app user with the same pseudonymous `settings.appUserId`; there is no user or event sampling. Mixpanel automatic mobile events are disabled. GA4 collects its SDK events after identity/consent configuration; manually emitted `screen_view` is documented below and is additional to the 107 custom definitions.

**Definition count is not event usage.** A paywall visit, wage save, RiceCal ad tap, retry or reset can create more events. Only adoption and transaction milestones have explicit persistent once-per-feature/threshold guards. For an install tracked from its first launch, those two event types together contribute at most **23 events** with working persistent storage: 17 feature first uses + 6 transaction milestones. That is not a cap on total Mixpanel events. Older installs update `features_used` but emit neither milestone type.

### Custom events

The event name is the exact display name used by Mixpanel when the Mixpanel column is Yes. GA4 receives the exact GA4 name shown for every row. Extra properties list call-site keys; common properties are documented separately. Empty properties means no extra payload, not an event without context. Links identify the current emitters; use the constant to search if code moves.

#### Mixpanel and GA4: install, activation and adoption

| Constant                           | Event name                         | GA4 name                               | Mixpanel | Trigger and frequency                                                                                                                      | Extra properties          | Call sites                                                                                                   |
| ---------------------------------- | ---------------------------------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `FIRST_APP_OPEN`                   | `First App Open`                   | `m2t_first_app_open`                   | Yes      | A newly initialized installation launches; once per fresh install, including a reinstall.                                                  | `locale`, `currency_code` | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                 |
| `ONBOARDING_STARTED`               | `Onboarding Started`               | `m2t_onboarding_started`               | Yes      | The user advances from the onboarding intro; each time that flow runs.                                                                     | None                      | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_COMPLETED`             | `Onboarding Completed`             | `m2t_onboarding_completed`             | Yes      | Onboarding completes; can repeat after a full data reset.                                                                                  | None                      | [App.tsx](apps/mobile/App.tsx)                                                                               |
| `ONBOARDING_SOURCE_SELECTED`       | `Onboarding Source Selected`       | `m2t_onboarding_source_selected`       | Yes      | The acquisition-source selection is submitted; each submission.                                                                            | `source`                  | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_NOTIFICATIONS_ENABLED` | `Onboarding Notifications Enabled` | `m2t_onboarding_notifications_enabled` | Yes      | The notification permission request returns; each request, including denied or error results.                                              | `permission`              | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_NOTIFICATIONS_SKIPPED` | `Onboarding Notifications Skipped` | `m2t_onboarding_notifications_skipped` | Yes      | The notification step is skipped; each skip.                                                                                               | None                      | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_BACKUP_ENABLED`        | `Onboarding Backup Enabled`        | `m2t_onboarding_backup_enabled`        | Yes      | Cloud backup is enabled in onboarding; each successful enable action, including pending iCloud setup.                                      | `target`, `pending`       | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `ONBOARDING_BACKUP_SKIPPED`        | `Onboarding Backup Skipped`        | `m2t_onboarding_backup_skipped`        | Yes      | The backup step is skipped; each skip.                                                                                                     | `target`                  | [features/onboarding/screens/OnboardingFlow.tsx](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx) |
| `FIRST_TRANSACTION_CREATED`        | `First Transaction Created`        | `m2t_first_transaction_created`        | Yes      | The first expense/income save in a session whose history has neither; may repeat in a later session after a reset or deleting all entries. | `type`, `source`          | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                 |
| `WAGE_CONFIG_UPDATED`              | `Wage Config Updated`              | `m2t_wage_config_updated`              | Yes      | The main wage configuration is saved; every save, with no lifetime cap.                                                                    | `wage_type`               | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                 |
| `FEATURE_FIRST_USED`               | `Feature First Used`               | `m2t_feature_first_used`               | Yes      | A qualifying feature is first used; at most once per feature on installs tracked from first launch (see feature table).                    | `feature`                 | [services/analytics.native.ts](apps/mobile/services/analytics.native.ts)                                     |
| `TRANSACTION_MILESTONE_REACHED`    | `Transaction Milestone Reached`    | `m2t_transaction_milestone_reached`    | Yes      | Logged expenses/incomes reach a documented milestone; at most once per threshold on installs tracked from first launch.                    | `count`                   | [services/analytics.native.ts](apps/mobile/services/analytics.native.ts)                                     |

#### Mixpanel and GA4: RiceCal promotion

| Constant             | Event name           | GA4 name                  | Mixpanel | Trigger and frequency                                                           | Extra properties      | Call sites                                                                                               |
| -------------------- | -------------------- | ------------------------- | -------- | ------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `RICECAL_AD_CLICKED` | `RiceCal Ad Clicked` | `m2t_rice_cal_ad_clicked` | Yes      | The RiceCal ad tile in Settings is tapped; once per tap, including repeat taps. | `source` = `settings` | [features/settings/screens/SettingsScreen.tsx](apps/mobile/features/settings/screens/SettingsScreen.tsx) |

Explicitly requested Mixpanel tracking measures engagement with the RiceCal promotion. Expected added billable volume is one event per explicit ad tap; there is no lifetime cap, sampling or automatic impression event. The actual tap rate is not yet measured. Opening Settings, rendering or dismissing the popup, and its store/download CTA do not emit this event. The popup opens without waiting for analytics delivery. This event does not qualify for feature adoption or transaction milestones.

#### Mixpanel and GA4: Pro purchase and restore

| Constant                          | Event name                        | GA4 name                              | Mixpanel | Trigger and frequency                                                                                                               | Extra properties                                                                                                                               | Call sites                                                                                                         |
| --------------------------------- | --------------------------------- | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PRO_PAYWALL_VIEWED`              | `Pro Paywall Viewed`              | `m2t_pro_paywall_viewed`              | Yes      | The paywall opens (or its source changes); each visit, with no lifetime cap.                                                        | `source`, `variant`                                                                                                                            | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PLANS_UNAVAILABLE`           | `Pro Plans Unavailable`           | `m2t_pro_plans_unavailable`           | Yes      | A paywall offering refresh returns no packages; each unsuccessful load, including a retry.                                          | `source`, `variant`                                                                                                                            | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_STARTED`            | `Pro Purchase Started`            | `m2t_pro_purchase_started`            | Yes      | A purchase attempt starts; each attempt.                                                                                            | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`                         | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_COMPLETED`          | `Pro Purchase Completed`          | `m2t_pro_purchase_completed`          | Yes      | Purchase grants active Pro access; each successful attempt, including trials and the restore fallback for an already-owned product. | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`, `period_type`          | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_PENDING`            | `Pro Purchase Pending`            | `m2t_pro_purchase_pending`            | Yes      | The store returns a pending purchase; each pending attempt.                                                                         | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`                         | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_CANCELLED`          | `Pro Purchase Cancelled`          | `m2t_pro_purchase_cancelled`          | Yes      | The user cancels the store purchase sheet; each cancelled attempt.                                                                  | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`                         | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_PURCHASE_FAILED`             | `Pro Purchase Failed`             | `m2t_pro_purchase_failed`             | Yes      | The purchase returns a failure; each failed attempt.                                                                                | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection`, `upgrade_from`, `reason`, `error_code` | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_RESTORE_STARTED`             | `Pro Restore Started`             | `m2t_pro_restore_started`             | Yes      | Restore purchases is tapped; each restore attempt.                                                                                  | `source`                                                                                                                                       | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_RESTORE_COMPLETED`           | `Pro Restore Completed`           | `m2t_pro_restore_completed`           | Yes      | Restore returns successfully, whether or not Pro was found; each result.                                                            | `source`, `found`                                                                                                                              | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_RESTORE_FAILED`              | `Pro Restore Failed`              | `m2t_pro_restore_failed`              | Yes      | Restore returns a failure; each failed attempt.                                                                                     | `source`, `reason`, `error_code`                                                                                                               | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_LIMIT_HIT`                   | `Pro Limit Hit`                   | `m2t_pro_limit_hit`                   | Yes      | The account-count limit blocks transaction entry behind an alert, each block, before any paywall visit.                             | `type`, `active_account_count`                                                                                                                 | [App.tsx](apps/mobile/App.tsx)                                                                                     |
| `PRO_CANCEL_SUB_PROMPT_ACTIONED`  | `Pro Cancel Sub Prompt Actioned`  | `m2t_pro_cancel_sub_prompt_actioned`  | Yes      | A subscriber who bought Lifetime chooses cancel or not now in the subscription prompt; each choice.                                 | `choice`                                                                                                                                       | [features/settings/screens/ProPaywallScreen.tsx](apps/mobile/features/settings/screens/ProPaywallScreen.tsx)       |
| `PRO_REDUNDANT_SUB_CANCEL_TAPPED` | `Pro Redundant Sub Cancel Tapped` | `m2t_pro_redundant_sub_cancel_tapped` | Yes      | A Lifetime owner taps cancel for a still-renewing subscription in Pro management; each tap.                                         | None                                                                                                                                           | [features/settings/screens/ProManagementScreen.tsx](apps/mobile/features/settings/screens/ProManagementScreen.tsx) |

#### GA4 only: widgets and live earnings

| Constant                | Event name              | GA4 name                    | Mixpanel | Trigger and frequency                                                                                              | Extra properties                    | Call sites                                                                                             |
| ----------------------- | ----------------------- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `WIDGET_OPENED`         | `Widget Opened`         | `m2t_widget_opened`         | No       | A supported widget/shortcut deep link opens the app; every open, including scheduled live-earnings reminder links. | `widget`, `type`, `source`, `focus` | [services/deepLinks.ts](apps/mobile/services/deepLinks.ts)                                             |
| `LIVE_EARNINGS_STARTED` | `Live Earnings Started` | `m2t_live_earnings_started` | No       | A Live Activity start succeeds through the app hook; every start recorded by that hook.                            | `hours`, `startedMinutesAgo`        | [features/widgets/useLiveEarningsActivity.ts](apps/mobile/features/widgets/useLiveEarningsActivity.ts) |
| `LIVE_EARNINGS_STOPPED` | `Live Earnings Stopped` | `m2t_live_earnings_stopped` | No       | The running Live Activity is stopped through the app hook; every stop recorded by that hook.                       | None                                | [features/widgets/useLiveEarningsActivity.ts](apps/mobile/features/widgets/useLiveEarningsActivity.ts) |

#### GA4 only: transactions and shortcuts

| Constant                      | Event name                    | GA4 name                          | Mixpanel | Trigger and frequency                                                                                                                          | Extra properties                                  | Call sites                                                   |
| ----------------------------- | ----------------------------- | --------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| `VOICE_TRANSACTION_CREATED`   | `Voice Transaction Created`   | `m2t_voice_transaction_created`   | No       | A transaction from voice entry is persisted; each saved transaction.                                                                           | `type`, `has_category`, `has_note`, `sentiment`   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx) |
| `AUTOLOG_TRANSACTION_CREATED` | `Autolog Transaction Created` | `m2t_autolog_transaction_created` | No       | An Apple Pay tap (Log Card Payment) saves automatically, or a notification review explicitly saves income/expense; each persisted transaction. | `has_category`, `has_note`, `channel`, `decision` | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx) |
| `BACK_TAP_TRIGGERED`          | `Back Tap Triggered`          | `m2t_back_tap_triggered`          | No       | An iOS Back Tap deep link opens an action; every open.                                                                                         | `action`                                          | [services/deepLinks.ts](apps/mobile/services/deepLinks.ts)   |
| `TRANSACTION_DELETED`         | `Transaction Deleted`         | `m2t_transaction_deleted`         | No       | A successful deletion request targets one transaction; each request.                                                                           | `count`                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx) |
| `TRANSACTIONS_BULK_DELETED`   | `Transactions Bulk Deleted`   | `m2t_transactions_bulk_deleted`   | No       | A successful deletion request targets multiple transactions; one event per request, with requested count.                                      | `count`                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx) |

#### GA4 only: payment alerts

Bank and wallet notifications (Android listener) and the Log Notification Shortcuts action (iOS) now create an entirely local review queue. No notification content is sent to AI, receipt scanning, entitlement checks or scanner quotas. Code extracts monetary candidates with or without a currency symbol; unlabelled numbers use the configured account currency without classifying relevance, completion or direction. The user chooses Income, Expense or Ignore, individually or in bulk. Multiple/no amounts require a selection or manual correction before an income/expense can be saved. Explicitly reviewed saves use `source = notification_review` and `decision = confirm`, with a synchronous database commit and capture link; they do not consume automatic-log usage. The existing free account-count gate still applies to saves; Ignore remains available. Apple Pay automatic logging retains its existing shared allowance and behavior. A configured iOS shortcut supplies its account directly; Android keeps notification access, the master switch and selected apps. Compact review cards use the configured account and detected currency, without editing controls. The pencil opens the full transaction editor, where users can correct transaction fields; saving completes the original capture through the same durable guard. Categories reuse the Apple Pay keyword mapping after a valid explicit preset and before Quick Entry defaults; this local suggestion emits no event. Missing/deleted accounts cannot save and can be ignored. The inline home action sits below the calendar income/expense summary alongside receipt-scan status, appears in the day view outside search, and shows the pending count on launch/foreground/live capture; dismissing the action keeps items pending. Leaving the root Notification History page warns that unfinished items will be ignored and requires confirmation; cancellation keeps the page open. History retains all pending items plus the latest 10 completed items locally; pending items never expire or silently drop. Data resets clear/invalidate the queue; identity changes cancel old capture/review work. Setup samples stay out of history. Notification text, candidates, amounts and review history never enter telemetry. Only successful user-confirmed saves emit save/activation/adoption/milestone telemetry. Capture IDs and durable links prevent replaying a reviewed capture; independent notifications remain the user's decisions.

| Constant                 | Event name               | GA4 name                     | Mixpanel | Trigger and frequency                                                                                                                                                                                                                                                                                                                                                                   | Extra properties                                                                       | Call sites                                                                                                                 |
| ------------------------ | ------------------------ | ---------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `AUTOLOG_ALERTS_SETUP`   | `Autolog Alerts Setup`   | `m2t_autolog_alerts_setup`   | No       | Android payment-alert setup reaches a step (disclosure shown, system access screen opened, access granted, apps confirmed, current requested test alert read back with a locally extracted amount and configured account; stale or unsolicited results do not complete setup); once per step reached, each time setup runs.                                                             | `step`, `platform`, `count`                                                            | [features/autoLog/screens/PaymentAlertsSetupScreen.tsx](apps/mobile/features/autoLog/screens/PaymentAlertsSetupScreen.tsx) |
| `AUTOLOG_ALERTS_DRAINED` | `Autolog Alerts Drained` | `m2t_autolog_alerts_drained` | No       | A drain stores at least one new or retried queued alert (Android listener or Log Notification); once per drain round, run on foreground and whenever the listener queues an alert while the app is open. Valid captures become pending reviews and never auto-save; disabled Android sources count as ignored. Storage failures remain in the native queue and do not count as handled. | `captured`, `pending`, `logged`, `ignored`, `duplicates`, `account_certain`, `channel` | [features/autoLog/components/PaymentAlertSync.tsx](apps/mobile/features/autoLog/components/PaymentAlertSync.tsx)           |

#### GA4 only: receipt scanning and itemized splits

| Constant                  | Event name                | GA4 name                      | Mixpanel | Trigger and frequency                                                            | Extra properties                                      | Call sites                                                                                                               |
| ------------------------- | ------------------------- | ----------------------------- | -------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `RECEIPT_SCAN_STARTED`    | `Receipt Scan Started`    | `m2t_receipt_scan_started`    | No       | A scan is started from camera or picker; each start.                             | `source`, `intent`                                    | [context/ReceiptScanContext.tsx](apps/mobile/context/ReceiptScanContext.tsx)                                             |
| `RECEIPT_SCAN_COMPLETED`  | `Receipt Scan Completed`  | `m2t_receipt_scan_completed`  | No       | The scan returns receipt drafts; each completed scan.                            | `count`, `mode`, `itemCount`                          | [context/ReceiptScanContext.tsx](apps/mobile/context/ReceiptScanContext.tsx)                                             |
| `RECEIPT_SCAN_SAVED`      | `Receipt Scan Saved`      | `m2t_receipt_scan_saved`      | No       | Scanned drafts finish saving as transactions; one event per save batch.          | `count`                                               | [context/ReceiptScanContext.tsx](apps/mobile/context/ReceiptScanContext.tsx)                                             |
| `RECEIPT_SCAN_FAILED`     | `Receipt Scan Failed`     | `m2t_receipt_scan_failed`     | No       | Scanning or saving scanned drafts fails; each failure.                           | `code`                                                | [context/ReceiptScanContext.tsx](apps/mobile/context/ReceiptScanContext.tsx)                                             |
| `RECEIPT_SPLIT_STARTED`   | `Receipt Split Started`   | `m2t_receipt_split_started`   | No       | The itemized split creation flow mounts; each entry.                             | `entryPoint`, `entryMode`                             | [features/transactions/screens/ReceiptSplitScreen.tsx](apps/mobile/features/transactions/screens/ReceiptSplitScreen.tsx) |
| `RECEIPT_SPLIT_SAVED`     | `Receipt Split Saved`     | `m2t_receipt_split_saved`     | No       | An itemized receipt split is saved; each creation or edit.                       | `itemCount`, `personCount`, `sharedItemCount`, `mode` | [features/transactions/screens/ReceiptSplitScreen.tsx](apps/mobile/features/transactions/screens/ReceiptSplitScreen.tsx) |
| `RECEIPT_SPLIT_ABANDONED` | `Receipt Split Abandoned` | `m2t_receipt_split_abandoned` | No       | The user confirms leaving an unsaved itemized split; each confirmed abandonment. | `step`                                                | [features/transactions/screens/ReceiptSplitScreen.tsx](apps/mobile/features/transactions/screens/ReceiptSplitScreen.tsx) |
| `RECEIPT_SPLIT_REOPENED`  | `Receipt Split Reopened`  | `m2t_receipt_split_reopened`  | No       | The itemized split edit flow mounts; each entry.                                 | `entryPoint`, `entryMode`                             | [features/transactions/screens/ReceiptSplitScreen.tsx](apps/mobile/features/transactions/screens/ReceiptSplitScreen.tsx) |

#### GA4 only: settlement and reimbursements

| Constant                              | Event name                            | GA4 name                                  | Mixpanel | Trigger and frequency                                                                                  | Extra properties                          | Call sites                                                                                                                                     |
| ------------------------------------- | ------------------------------------- | ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPLIT_BILL_CREATED`                  | `Split Bill Created`                  | `m2t_split_bill_created`                  | No       | A Pay First transaction gains a non-self share on creation or edit; one event per qualifying mutation. | `people`                                  | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `SPLIT_MARKED_PAID`                   | `Split Marked Paid`                   | `m2t_split_marked_paid`                   | No       | A split share is settled; each successful settlement.                                                  | `payback_account_changed`, `same_account` | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `SPLIT_MARKED_UNPAID`                 | `Split Marked Unpaid`                 | `m2t_split_marked_unpaid`                 | No       | A settled split share is reopened; each successful action.                                             | None                                      | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `SETTLE_UP_RECEIPT_SHARED`            | `Settle Up Receipt Shared`            | `m2t_settle_up_receipt_shared`            | No       | A settlement receipt is shared as an image or text; each successful share, including text fallback.    | `itemCount`, `hasQr`, `asImage`           | [features/transactions/components/SplitReceiptShareModal.tsx](apps/mobile/features/transactions/components/SplitReceiptShareModal.tsx)         |
| `SETTLE_UP_QR_SET`                    | `Settle Up Payment QR Set`            | `m2t_settle_up_payment_qr_set`            | No       | The payment QR setting is saved with an image; each save.                                              | None                                      | [features/transactions/screens/SettleUpSettingsScreen.tsx](apps/mobile/features/transactions/screens/SettleUpSettingsScreen.tsx)               |
| `REIMBURSEMENT_FLAGGED`               | `Reimbursement Flagged`               | `m2t_reimbursement_flagged`               | No       | The transaction editor toggles reimbursable; each toggle, before the transaction is saved.             | `reimbursable`                            | [features/transactions/components/TransactionEditorScreen.tsx](apps/mobile/features/transactions/components/TransactionEditorScreen.tsx)       |
| `REIMBURSEMENT_MARKED_PAID`           | `Reimbursement Marked Paid`           | `m2t_reimbursement_marked_paid`           | No       | A reimbursement is settled; each successful action.                                                    | `same_account`                            | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `REIMBURSEMENT_REOPENED`              | `Reimbursement Reopened`              | `m2t_reimbursement_reopened`              | No       | A settled reimbursement is reopened; each successful action.                                           | None                                      | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                                                   |
| `REIMBURSEMENT_COUNT_SETTING_CHANGED` | `Reimbursement Count Setting Changed` | `m2t_reimbursement_count_setting_changed` | No       | Whether reimbursements count as expenses is toggled; each change.                                      | `counts`                                  | [features/reimbursements/screens/ReimbursementSettingsScreen.tsx](apps/mobile/features/reimbursements/screens/ReimbursementSettingsScreen.tsx) |

#### GA4 only: accounts, goals, loans and categories

| Constant                | Event name              | GA4 name                    | Mixpanel | Trigger and frequency                                                                                    | Extra properties                                                               | Call sites                                                                                               |
| ----------------------- | ----------------------- | --------------------------- | -------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `ACCOUNT_CREATED`       | `Account Created`       | `m2t_account_created`       | No       | An account is created through AppContext; each creation (goal/loan flows can also emit their own event). | `type`                                                                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ACCOUNT_DELETED`       | `Account Deleted`       | `m2t_account_deleted`       | No       | An account is deleted; each successful deletion.                                                         | None                                                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `GOAL_CREATED`          | `Goal Created`          | `m2t_goal_created`          | No       | A savings goal is saved from its editor; each creation.                                                  | `hasTargetDate`, `hasAutoSave`, `hasCover`                                     | [features/goals/screens/GoalEditorScreen.tsx](apps/mobile/features/goals/screens/GoalEditorScreen.tsx)   |
| `GOAL_UPDATED`          | `Goal Updated`          | `m2t_goal_updated`          | No       | A savings goal edit is saved; each update.                                                               | None                                                                           | [features/goals/screens/GoalEditorScreen.tsx](apps/mobile/features/goals/screens/GoalEditorScreen.tsx)   |
| `GOAL_DEPOSIT_OPENED`   | `Goal Deposit Opened`   | `m2t_goal_deposit_opened`   | No       | The goal deposit flow is opened; every open.                                                             | `source`                                                                       | [features/goals/screens/GoalDetailScreen.tsx](apps/mobile/features/goals/screens/GoalDetailScreen.tsx)   |
| `GOAL_WITHDRAW_OPENED`  | `Goal Withdraw Opened`  | `m2t_goal_withdraw_opened`  | No       | The goal withdrawal flow is opened; every open.                                                          | `target`                                                                       | [features/goals/screens/GoalDetailScreen.tsx](apps/mobile/features/goals/screens/GoalDetailScreen.tsx)   |
| `GOAL_ACHIEVED`         | `Goal Achieved`         | `m2t_goal_achieved`         | No       | A goal is marked achieved; each successful state change.                                                 | None                                                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `GOAL_ARCHIVED`         | `Goal Archived`         | `m2t_goal_archived`         | No       | A goal is archived; each successful action.                                                              | None                                                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `GOAL_UNARCHIVED`       | `Goal Unarchived`       | `m2t_goal_unarchived`       | No       | A goal is restored from archive; each successful action.                                                 | None                                                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `LOAN_CREATED`          | `Loan Created`          | `m2t_loan_created`          | No       | A loan account is saved from account settings; each creation.                                            | `interestModel`, `hasRate`, `hasCollectAccount`, `countsAsExpense`, `currency` | [features/settings/screens/AccountsScreen.tsx](apps/mobile/features/settings/screens/AccountsScreen.tsx) |
| `LOAN_PAYMENT_RECORDED` | `Loan Payment Recorded` | `m2t_loan_payment_recorded` | No       | A manual loan payment is recorded; each successful payment.                                              | `source`                                                                       | [features/settings/screens/AccountsScreen.tsx](apps/mobile/features/settings/screens/AccountsScreen.tsx) |
| `LOAN_PAID_OFF`         | `Loan Paid Off`         | `m2t_loan_paid_off`         | No       | A loan is marked paid off; each successful state change.                                                 | None                                                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `LOAN_ARCHIVED`         | `Loan Archived`         | `m2t_loan_archived`         | No       | A loan is archived; each successful action.                                                              | None                                                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `LOAN_UNARCHIVED`       | `Loan Unarchived`       | `m2t_loan_unarchived`       | No       | A loan is restored from archive; each successful action.                                                 | None                                                                           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `CATEGORY_CREATED`      | `Category Created`      | `m2t_category_created`      | No       | A category is created; each successful creation.                                                         | `type`                                                                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `CATEGORY_DELETED`      | `Category Deleted`      | `m2t_category_deleted`      | No       | A category is deleted, optionally reassigning its transactions; each successful deletion.                | `reassigned`                                                                   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |

#### GA4 only: albums, budgets, items and recurring rules

| Constant                  | Event name                | GA4 name                      | Mixpanel | Trigger and frequency                                                                                                     | Extra properties             | Call sites                                                                                               |
| ------------------------- | ------------------------- | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `ALBUM_CREATED`           | `Album Created`           | `m2t_album_created`           | No       | An album is created; each successful creation.                                                                            | `transactionCount`           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ALBUM_UPDATED`           | `Album Updated`           | `m2t_album_updated`           | No       | Album details are updated; each successful update.                                                                        | None                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ALBUM_DELETED`           | `Album Deleted`           | `m2t_album_deleted`           | No       | An album is deleted; each successful deletion.                                                                            | None                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ALBUM_LOCATION_SET`      | `Album Location Set`      | `m2t_album_location_set`      | No       | An album location is set or cleared; each successful change.                                                              | `cleared`                    | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ALBUM_LOCATIONS_OPENED`  | `Album Locations Opened`  | `m2t_album_locations_opened`  | No       | The album map panel opens; each panel mount.                                                                              | `count`                      | [features/albums/components/AlbumMapPanel.tsx](apps/mobile/features/albums/components/AlbumMapPanel.tsx) |
| `BUDGET_TEMPLATE_CREATED` | `Budget Template Created` | `m2t_budget_template_created` | No       | A reusable budget template is created; each successful creation.                                                          | `categories`, `backPopulate` | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_TEMPLATE_UPDATED` | `Budget Template Updated` | `m2t_budget_template_updated` | No       | A reusable budget template is updated; each successful update.                                                            | `categories`                 | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_TEMPLATE_DELETED` | `Budget Template Deleted` | `m2t_budget_template_deleted` | No       | A budget template is deleted; each successful deletion.                                                                   | None                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_DEFAULT_CHANGED`  | `Budget Default Changed`  | `m2t_budget_default_changed`  | No       | The default budget template is changed; each successful action.                                                           | None                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_MONTH_CREATED`    | `Budget Month Created`    | `m2t_budget_month_created`    | No       | Monthly budgets are created automatically, manually, custom, or by backfill; backfill is one aggregate event with months. | `source`, `months`           | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_MONTH_UPDATED`    | `Budget Month Updated`    | `m2t_budget_month_updated`    | No       | A monthly budget is updated; each successful update.                                                                      | `categories`                 | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `BUDGET_MONTH_DELETED`    | `Budget Month Deleted`    | `m2t_budget_month_deleted`    | No       | A monthly budget is deleted; each successful deletion.                                                                    | None                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `ITEM_CREATED`            | `Item Created`            | `m2t_item_created`            | No       | An owned item is created; each successful creation.                                                                       | None                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `RECURRING_RULE_CREATED`  | `Recurring Rule Created`  | `m2t_recurring_rule_created`  | No       | A recurring rule is created; each successful creation.                                                                    | `type`, `pattern`            | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `RECURRING_RULE_UPDATED`  | `Recurring Rule Updated`  | `m2t_recurring_rule_updated`  | No       | A recurring rule is updated; each successful update.                                                                      | None                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |
| `RECURRING_RULE_DELETED`  | `Recurring Rule Deleted`  | `m2t_recurring_rule_deleted`  | No       | A recurring rule is deleted; each successful deletion.                                                                    | None                         | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                             |

#### GA4 only: tutorials, settings and data management

| Constant                     | Event name                   | GA4 name                         | Mixpanel | Trigger and frequency                                                                                                                                       | Extra properties                          | Call sites                                                                                                             |
| ---------------------------- | ---------------------------- | -------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `TUTORIAL_LIST_OPENED`       | `Tutorial List Opened`       | `m2t_tutorial_list_opened`       | No       | The tutorial list opens from settings or a deep link; every open.                                                                                           | `source`                                  | [App.tsx](apps/mobile/App.tsx), [services/deepLinks.ts](apps/mobile/services/deepLinks.ts)                             |
| `TUTORIAL_OPENED`            | `Tutorial Opened`            | `m2t_tutorial_opened`            | No       | A tutorial opens from its list or a deep link; every open.                                                                                                  | `tutorial`, `source`                      | [App.tsx](apps/mobile/App.tsx), [services/deepLinks.ts](apps/mobile/services/deepLinks.ts)                             |
| `DISPLAY_MODE_TOGGLED`       | `Display Mode Toggled`       | `m2t_display_mode_toggled`       | No       | Display switches between money and time; each toggle.                                                                                                       | `mode`                                    | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                           |
| `APP_ICON_CHANGED`           | `App Icon Changed`           | `m2t_app_icon_changed`           | No       | An alternate app icon is successfully selected; each change.                                                                                                | `icon`                                    | [features/settings/screens/AppIconScreen.tsx](apps/mobile/features/settings/screens/AppIconScreen.tsx)                 |
| `DATA_RESET`                 | `Data Reset`                 | `m2t_data_reset`                 | No       | Data is reset for a currency change, full reset, or transaction-only reset; each reset also clears local notification reviews and native automation queues. | `scope`                                   | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                           |
| `DATA_IMPORTED`              | `Data Imported`              | `m2t_data_imported`              | No       | A Money Manager backup import completes; each completed import. Replacing the ledger also clears local notification reviews and native automation queues.   | `accounts`, `categories`, `transactions`  | [context/AppContext.tsx](apps/mobile/context/AppContext.tsx)                                                           |
| `STATEMENT_IMPORT_COMPLETED` | `Statement Import Completed` | `m2t_statement_import_completed` | No       | A bank statement import finishes; each completed import.                                                                                                    | `imported_count`, `currency`, `converted` | [features/settings/screens/StatementImportScreen.tsx](apps/mobile/features/settings/screens/StatementImportScreen.tsx) |

#### GA4 only: backup and review prompts

| Constant                             | Event name                           | GA4 name                                 | Mixpanel | Trigger and frequency                                                                                                      | Extra properties                              | Call sites                                                                                                   |
| ------------------------------------ | ------------------------------------ | ---------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `AUTO_BACKUP_RESTORED`               | `Auto Backup Restored`               | `m2t_auto_backup_restored`               | No       | An auto-backup is restored; each successful restore.                                                                       | `target`                                      | [services/autoBackup.native.ts](apps/mobile/services/autoBackup.native.ts)                                   |
| `AUTO_BACKUP_DELETED`                | `Auto Backup Deleted`                | `m2t_auto_backup_deleted`                | No       | An auto-backup is deleted; each successful deletion.                                                                       | `target`                                      | [services/autoBackup.native.ts](apps/mobile/services/autoBackup.native.ts)                                   |
| `AUTO_BACKUP_SETTING_TOGGLED`        | `Auto Backup Setting Toggled`        | `m2t_auto_backup_setting_toggled`        | No       | Auto-backup is enabled or disabled in settings; each toggle.                                                               | `enabled`                                     | [features/settings/screens/AutoBackupScreen.tsx](apps/mobile/features/settings/screens/AutoBackupScreen.tsx) |
| `AUTO_BACKUP_TARGET_CHANGED`         | `Auto Backup Target Changed`         | `m2t_auto_backup_target_changed`         | No       | The auto-backup target is selected in settings; each change.                                                               | `target`                                      | [features/settings/screens/AutoBackupScreen.tsx](apps/mobile/features/settings/screens/AutoBackupScreen.tsx) |
| `AUTO_BACKUP_FAILED`                 | `Auto Backup Failed`                 | `m2t_auto_backup_failed`                 | No       | A due backup attempt records provider errors, even if local fallback succeeds; one event per failed/error-bearing attempt. | `target`, `error_count`, `fell_back_to_local` | [services/autoBackup.native.ts](apps/mobile/services/autoBackup.native.ts)                                   |
| `REVIEW_PROMPT_MANUAL_OPENED`        | `Review Prompt Manual Opened`        | `m2t_review_prompt_manual_opened`        | No       | The manual review entry point is used; every use.                                                                          | None                                          | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                               |
| `REVIEW_PREPROMPT_SHOWN`             | `Review Preprompt Shown`             | `m2t_review_preprompt_shown`             | No       | The review preprompt is presented; each presentation after its eligibility checks.                                         | `trigger`                                     | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                               |
| `REVIEW_PREPROMPT_HAPPY`             | `Review Preprompt Happy`             | `m2t_review_preprompt_happy`             | No       | The happy response is selected; each response.                                                                             | `trigger`                                     | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                               |
| `REVIEW_PREPROMPT_UNHAPPY`           | `Review Preprompt Unhappy`           | `m2t_review_preprompt_unhappy`           | No       | The unhappy response is selected; each response.                                                                           | `trigger`                                     | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                               |
| `REVIEW_PREPROMPT_DISMISSED`         | `Review Preprompt Dismissed`         | `m2t_review_preprompt_dismissed`         | No       | The review preprompt is dismissed; each dismissal.                                                                         | `trigger`                                     | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                               |
| `REVIEW_PREPROMPT_FEEDBACK_OPENED`   | `Review Preprompt Feedback Opened`   | `m2t_review_preprompt_feedback_opened`   | No       | The feedback action is selected; each selection.                                                                           | `trigger`                                     | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                               |
| `REVIEW_PREPROMPT_FEEDBACK_DECLINED` | `Review Preprompt Feedback Declined` | `m2t_review_preprompt_feedback_declined` | No       | The feedback action is declined; each selection.                                                                           | `trigger`                                     | [services/reviewPrompt.native.ts](apps/mobile/services/reviewPrompt.native.ts)                               |
| `CLOUD_BACKUP_PROMPT_SHOWN`          | `Cloud Backup Prompt Shown`          | `m2t_cloud_backup_prompt_shown`          | No       | The eligible cloud-backup prompt is shown; each presentation after its eligibility checks.                                 | `transaction_count`                           | [App.tsx](apps/mobile/App.tsx)                                                                               |
| `CLOUD_BACKUP_PROMPT_CTA_TAPPED`     | `Cloud Backup Prompt CTA Tapped`     | `m2t_cloud_backup_prompt_cta_tapped`     | No       | The cloud-backup prompt CTA opens backup settings; each tap.                                                               | None                                          | [App.tsx](apps/mobile/App.tsx)                                                                               |
| `CLOUD_BACKUP_PROMPT_DISMISSED`      | `Cloud Backup Prompt Dismissed`      | `m2t_cloud_backup_prompt_dismissed`      | No       | The cloud-backup prompt is dismissed; each dismissal.                                                                      | None                                          | [App.tsx](apps/mobile/App.tsx)                                                                               |

`First Transaction Created` captures history before the first expense/income attempt in each session and claims the event only after persistence succeeds. Failed saves leave the next successful save eligible; overlapping saves claim it once. It can repeat in a later session after a reset or deleting all entries. Use unique-user funnels rather than treating it as a durable once-per-install event. The guard lives in [firstTransactionSignal](apps/mobile/utils/firstTransactionSignal.ts).

### Common event context

| Property                      | Mixpanel                   | GA4                                                            | Source and condition                                                                                           |
| ----------------------------- | -------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `current_screen`              | Event property             | Event parameter                                                | Visible React Navigation screen at the action, when known. Milestones preserve the originating screen.         |
| `days_since_install`          | Event property             | Event parameter                                                | Whole 24-hour periods from `settings.firstAppOpen`, when readable; minimum 0.                                  |
| Stable settings and Pro state | Super properties on events | User properties, not automatically copied into custom payloads | See the user-state table.                                                                                      |
| `debug_mode`                  | Not explicitly added       | Default parameter `1` in development                           | Set during Firebase configuration; production explicitly clears the persisted key with `{ debug_mode: null }`. |

The central GA4 converter normalizes property names to snake case, so `itemCount` becomes `item_count`, `startedMinutesAgo` becomes `started_minutes_ago`, and `hasQr` becomes `has_qr`. It drops null/undefined and non-finite numbers, converts booleans to 1/0 for event parameters, limits event parameters to 25, caps names at 40 characters and string values at 100. GA4 user properties are strings with name/value caps of 24/36 characters and at most 25 properties per call. Mixpanel receives the original property keys and values. Event names use `m2t_` snake case; tests reject collisions or truncation.

No transaction amounts, balances, notes, merchant text, receipt images, person names, account/category names, email addresses or advertising IDs are explicitly sent in these payloads. `price` is the store's subscription price; `currency` in purchase events is its currency. Usage payloads contain counts, flags and controlled identifiers. SDK-added metadata is outside these explicit payload tables.

### Property values

| Field / events                          | Values and meaning                                                                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding acquisition `source`         | `xiaohongshu`, `reddit`, `instagram`, `facebook`, `tiktok`, `app_store`, `google_play`, `threads`, `friends_family`, `other`. Also written to `acquisition_source`.                                                                            |
| First transaction `type`, `source`      | Expense/income; `manual`, `voice`, `receipt`, `autolog`, `notification_review`, `split`, `receipt_split` or `statement_import` when that creation path emits it. Bulk statement/backup import code does not itself emit this event.            |
| Notification `permission`               | The permission result, including `granted`, `denied`, `undetermined` or `error`. Enabled names the attempted action, not guaranteed permission.                                                                                                |
| Backup `target`, `pending`              | `local`, `icloud`, `googleDrive` where supported; onboarding uses the platform cloud target. `pending` means enabled before the cloud is ready.                                                                                                |
| Paywall `variant`                       | `plans`, `lifetime_upgrade`, `already_pro`; captured at open. Filter free-to-Pro conversion on `plans`.                                                                                                                                        |
| Purchase base properties                | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`; `plan_selection` is `default` or `changed` when a choice exists; `upgrade_from` appears for an existing subscriber. Nullable values are omitted in GA4.  |
| Purchase `period_type`                  | Store-granted period: `trial`, `intro`, `normal`, `prepaid` when available. `has_free_trial` says a trial was offered; `period_type: trial` confirms one started.                                                                              |
| Purchase/restore `reason`, `error_code` | Action status and RevenueCat's readable error name when present; no raw error message.                                                                                                                                                         |
| Pro limit `type`                        | Currently `accounts_transaction` only; gates opening the paywall directly use its view event instead.                                                                                                                                          |
| Subscription prompt `choice`            | `cancel` or `not_now`.                                                                                                                                                                                                                         |
| Widget `widget`, `source`               | `quick_add`, `budget`, `live_earnings` or the parsed supported widget action. `source: schedule` is the reminder path and is excluded from widget adoption. `type` and `focus` are conditional.                                                |
| Auto-log `channel`, `decision`          | `channel`: `apple_pay` (Log Card Payment), `android_notification`, or `ios_alert` (Log Notification). `decision`: `auto` for Apple Pay or `confirm` for an explicit notification Income/Expense decision. Notifications never save on capture. |
| Alert setup `step`, `platform`, `count` | `disclosure_viewed`, `settings_opened`, `access_granted`, `source_added`, `test_passed`. `platform` is `android`; iOS setup is the Shortcuts tutorial. `count` (watched apps) only on `source_added`.                                          |
| Alerts drained counts, `channel`        | Per-round counts of durably handled captures, logged, ignored and duplicate alerts; `account_certain` counts explicitly selected accounts. `channel` is the round's first alert. Failed storage is left queued for automatic retry.            |
| Budget-month `source`, `months`         | `auto`, `manual`, `custom`, `backfill`; `months` is present for aggregate backfill.                                                                                                                                                            |
| Tutorial `source`                       | List: `settings` or `link`; detail: `list` or `link`. `tutorial` is the registry ID.                                                                                                                                                           |
| Data reset `scope`                      | `all`, `transactions_only`, `currency_change`.                                                                                                                                                                                                 |
| Review `trigger`                        | `transaction_milestone`, `insights_view`, `pro_purchase`, `manual`.                                                                                                                                                                            |

### Feature adoption

A qualifying per-use event goes to GA4. The first qualifying use adds the feature to the Mixpanel profile's `features_used` list on every install. Only installs tracked since `First App Open` additionally send `Feature First Used` to both providers. The JSON columns specify positive and excluded contexts for the sync test; `{}` means no extra condition and `[]` means no exclusions.

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

Usage state lives in AsyncStorage at `@m2t/analytics_usage/v1` and survives in-app data resets. Reinstalling starts a new install. With unreadable state, the app suppresses first-use/milestone claims; failed persistence can allow duplicate firsts after relaunch.

### Transaction milestones

Count only expenses/incomes logged through app entry paths: manual, voice, receipt, auto-log (Apple Pay taps and automatically logged payment alerts), split and itemized split. Transfers, balance adjustments, recurring-rule-generated rows, statement/backup imports and restores do not increment this counter. Deleting or resetting financial data does not decrement it.

| Count | Maximum events per eligible install at this threshold |
| ----- | ----------------------------------------------------- |
| 10    | 1                                                     |
| 50    | 1                                                     |
| 100   | 1                                                     |
| 250   | 1                                                     |
| 500   | 1                                                     |
| 1000  | 1                                                     |

### User state and identity

These are profile/user-property operations, not custom-event rows. Mixpanel super properties attach to subsequent Mixpanel events; their GA4 mirrors are user properties. State updates do not call `mp.track`.

| Property / identity                  | Mixpanel destination                                                            | GA4 destination                           | Update rule                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `appUserId`                          | Distinct ID through identify                                                    | User ID                                   | Pseudonymous `m2t_<UUID>`; shared with RevenueCat, preserved on reset/restore, rotated on reinstall.                                                                     |
| `$firebaseAppInstanceId`             | RevenueCat subscriber attribute, not a Mixpanel profile field                   | Actual Firebase Analytics installation ID | Written after RevenueCat login and analytics readiness; acknowledged by the attributes endpoint before purchases/restores; production only; missing/failed writes retry. |
| `$mixpanelDistinctId`                | RevenueCat subscriber attribute matching Mixpanel distinct ID                   | None                                      | Stable `appUserId`; never use an anonymous SDK ID. Written once per customer per session; failed writes retry.                                                           |
| `rc_total_revenue_usd`               | RevenueCat-managed People property; gross USD with supported refund adjustments | None                                      | Incremented by the server integration; app never increments revenue. Starts at integration activation, not historical lifetime spend.                                    |
| `rc_subscription_status`             | RevenueCat-managed People property                                              | None                                      | Server lifecycle status of the most recent subscription event; separate from app `pro_plan` and access state.                                                            |
| `$transactions`                      | RevenueCat-managed People purchase history                                      | None                                      | Server revenue operations; do not append the same purchase from the app.                                                                                                 |
| `$name`                              | People profile                                                                  | None                                      | Same pseudonymous app-user ID, not a personal name.                                                                                                                      |
| `platform`                           | People profile                                                                  | User property                             | Set on provider identification: `ios` or `android`.                                                                                                                      |
| `first_app_open`                     | People profile (set once)                                                       | None explicitly; GA4 has SDK `first_open` | From `settings.firstAppOpen`, including older installs.                                                                                                                  |
| `features_used`                      | People profile list (union)                                                     | None explicitly                           | Add each newly observed qualifying feature; covers old and new installs.                                                                                                 |
| `acquisition_source`                 | People profile                                                                  | User property                             | On onboarding source submission.                                                                                                                                         |
| `is_pro`                             | People profile + super property                                                 | User property                             | Current Pro flag; always written on a changed profile sync.                                                                                                              |
| `pro_plan`                           | People profile + super property                                                 | User property                             | `free`, `monthly`, `annual`, `lifetime`, `other`; current state.                                                                                                         |
| `pro_period_type`                    | People profile + super property                                                 | User property                             | `trial`, `intro`, `normal`, `prepaid`, `none`, `unknown`; current state.                                                                                                 |
| `pro_renewing`                       | People profile                                                                  | User property                             | Current renewing-subscription flag, including false.                                                                                                                     |
| `pro_product_id`                     | People profile                                                                  | User property                             | Set when known; retains last known value after lapse.                                                                                                                    |
| `pro_since`                          | People profile                                                                  | User property                             | Activation timestamp when known; retains history.                                                                                                                        |
| `pro_expires_at`                     | People profile                                                                  | User property                             | Expiry timestamp when known; retains history.                                                                                                                            |
| `currency_code`                      | Super property                                                                  | User property                             | Settings sync; also explicitly in `First App Open`.                                                                                                                      |
| `locale`                             | Super property                                                                  | User property                             | Settings sync; also explicitly in `First App Open`.                                                                                                                      |
| `theme_mode`                         | Super property                                                                  | User property                             | Settings sync.                                                                                                                                                           |
| `theme_color`                        | Super property                                                                  | User property                             | Settings sync.                                                                                                                                                           |
| `display_mode`                       | Super property                                                                  | User property                             | Settings sync: `money` or `time`.                                                                                                                                        |
| `sample_rate` (retired)              | Removed from persisted super properties and profile on affected installs        | None                                      | Never send again; sampling was retired.                                                                                                                                  |
| Persisted `current_screen` (retired) | Removed from super properties                                                   | None                                      | Current screen is event context instead.                                                                                                                                 |

Sources: [native analytics](apps/mobile/services/analytics.native.ts), [shared Pro profile builder](apps/mobile/services/analytics.shared.ts), [app context](apps/mobile/context/AppContext.tsx), [Pro context](apps/mobile/context/ProContext.tsx) and [onboarding](apps/mobile/features/onboarding/screens/OnboardingFlow.tsx).

### Provider configuration and delivery

| Operation / configuration    | Contract                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Source                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mixpanel startup identity    | Await `identify`, the base profile and retired-property cleanup before releasing queued tracking. Skip Mixpanel writes after a failed identity attempt; retry on the next Mixpanel operation.                                                                                                                                                                                                                                                                                  | [Native analytics](apps/mobile/services/analytics.native.ts)                                                                                                                                                                                           |
| Custom-event delivery        | Start GA4 and Mixpanel sends independently after startup configuration. A slow or failed Mixpanel event write does not block the corresponding GA4 send. Await SDK queue operations and contain rejections; queue completion is not a server delivery receipt.                                                                                                                                                                                                                 | [Native analytics](apps/mobile/services/analytics.native.ts)                                                                                                                                                                                           |
| Pro profile sync             | Deduplicate unchanged state per user ID; failed, interrupted or stale profile/super-property syncs clear the signature so a later refresh can retry. Writes name their expected user and stop after customer/state changes. Revenue attribute uploads run independently of profile writes.                                                                                                                                                                                     | [Pro context](apps/mobile/context/ProContext.tsx), [native analytics](apps/mobile/services/analytics.native.ts)                                                                                                                                        |
| Mixpanel SDK 3.3.0 wrapper   | A postinstall patch returns underlying promises for the operations used here, and removes the duplicate iOS `People.union` invocation. `features_used` receives one union per newly observed feature on both platforms. Review/reconcile this patch on SDK upgrades.                                                                                                                                                                                                           | [SDK patch](apps/mobile/patches/mixpanel-react-native+3.3.0.patch), [package scripts](apps/mobile/package.json), [installed-SDK regression tests](apps/mobile/__tests__/patches/mixpanelAsyncOperations.test.ts)                                       |
| Mixpanel availability        | `EXPO_PUBLIC_MIXPANEL_TOKEN` enables Mixpanel; no token means no Mixpanel writes. If the native module is absent, use the SDK's JavaScript mode with automatic events disabled.                                                                                                                                                                                                                                                                                                | [Native analytics](apps/mobile/services/analytics.native.ts)                                                                                                                                                                                           |
| Firebase app selection       | Android and production/preview iOS use `com.nelsongan.money2time`; development iOS uses `com.nelsongan.money2time.dev`. Expo selects the matching Firebase client configuration.                                                                                                                                                                                                                                                                                               | [Expo config](apps/mobile/app.config.ts), [base config](apps/mobile/app.json)                                                                                                                                                                          |
| Firebase iOS crash hardening | Require GoogleUtilities `~> 8.1.4` in every iOS build. Its dictionary guards ignore nil keys from malformed analytics configuration instead of crashing on a background queue, as in MONEY2TIME-5P during the September 29, 2026 incident. Native rebuild and store release required; collection, routing and Mixpanel volume stay unchanged.                                                                                                                                  | [Base config](apps/mobile/app.json), [GoogleUtilities 8.1.4](https://github.com/google/GoogleUtilities/releases/tag/8.1.4), [Firebase incident report](https://firebase.blog/posts/2026/10/firebase-analytics-outage)                                  |
| Firebase startup collection  | Auto-collection is disabled until JavaScript sets consent and the app user ID, then enables product analytics. Serialize customer configuration, reopen readiness for customer switches and retry failed configuration on the next event or identification for the same user. Failed configuration is never reported as a successful profile sync. Manual screen reporting replaces automatic native screen reporting.                                                         | [Firebase config](apps/mobile/firebase.json), [native analytics](apps/mobile/services/analytics.native.ts)                                                                                                                                             |
| Advertising collection       | Deny ad storage, ad user data and ad personalization; disable Android advertising-ID collection/permissions and iOS Analytics advertising-ID support.                                                                                                                                                                                                                                                                                                                          | [Firebase config](apps/mobile/firebase.json), [base config](apps/mobile/app.json), [native analytics](apps/mobile/services/analytics.native.ts)                                                                                                        |
| Firebase default parameters  | Development sets `debug_mode = 1`; production clears it with null. Firebase identity configuration clears `revenuecat_revenue_enabled`; an HTTP 200 acknowledgement from RevenueCat’s attributes endpoint sets it to `1`. Serialize marker writes with Firebase configuration so an old customer cannot overwrite the new customer’s defaults. Missing IDs or failed syncs leave SDK revenue intact; failures retry. Marker writes deduplicate until identity is reconfigured. | [Native analytics](apps/mobile/services/analytics.native.ts), [RevenueCat service](apps/mobile/services/revenueCat.native.ts), [Firebase defaults](https://firebase.google.com/docs/reference/android/com/google/firebase/analytics/FirebaseAnalytics) |
| Live project verification    | On 2026-10-02, RevenueCat Firebase/GA4 and Mixpanel integrations were activated. GA4 production app IDs match bundled files; Mixpanel project `4000816` is US, timezone `Asia/Kuala_Lumpur`, and receives app funnel events. `business_context` is unavailable, but project/token/query tools work. The shared `1.5.11` build/submission completed for both platforms; store availability, client adoption and production receipt delivery still require verification below.   | [RevenueCat integrations](https://app.revenuecat.com/projects/03387b56/integrations), [Mixpanel project](https://mixpanel.com/project/4000816), [GA4](https://analytics.google.com/analytics/web/#/a350740029p553783025/admin/streams)                 |

### Screens and SDK events

| Event / operation                                                            | Mixpanel                                     | GA4                                                               | Trigger and frequency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `screen_view`                                                                | No screen event                              | Explicit screen event with `screen_name` and `screen_class`       | Visible screen changes through `setCurrentScreen`; duplicate current/last screen is suppressed. No `m2t_` prefix. The Notifications settings and source screens (internally `PaymentAlerts*`) are entered from Android only. iOS Notifications stays on Automation; its Tutorial opens AutoLogTutorial directly. `NotificationHistory` is a root screen opened by the floating review action on either platform, the icon-only History action beside the Notifications section title on Android or iOS Automation; its To review / Recent tabs do not emit separate screen or action events; it produces the existing GA4 screen view only, with no additional Mixpanel or content telemetry. Opening its full editor produces the existing GA4 screen view for `NotificationReviewEditor`; saving uses the same confirmed-review transaction events. |
| SDK `first_open`, `session_start`, engagement/attribution events             | None from Mixpanel automatic mobile tracking | SDK-managed after collection is enabled                           | Outside the custom-event inventory and its 107-definition count. Actual SDK event set depends on the configured native SDK.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `$ae_first_open`, `$ae_session`, `$ae_updated`                               | Disabled                                     | Not applicable                                                    | Never enable Mixpanel automatic events to cover app sessions; use GA4 reporting.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Store trial conversions, renewals, cancellations, billing issues and refunds | RevenueCat server lifecycle events below     | RevenueCat server lifecycle events below plus legacy SDK coverage | External producer, outside the 107 app custom definitions. SDK store events become `m2t_store_revenue_observed` only when the new client marks RevenueCat identity ready.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Revenue measurement

RevenueCat remains the financial source of truth. Both integrations were saved on **2026-10-02**. [Analytics PR #553](https://github.com/NelsonGan/money2time/pull/553) merged that day, and the shared `1.5.11` [production pipeline](https://github.com/NelsonGan/money2time/actions/runs/36987004636) successfully built and submitted both iOS and Android. Store approval/public availability, client adoption and a genuine linked receipt in GA4 have not been verified. Configuring the dashboards or submitting a build does not give existing customers a Firebase installation attribute or backfill historical charges. App funnel success is separate from collected revenue.

| Producer / concern                   | Current contract                                                                                                                                                                                                                                                                                                                                                                                                                   | Accuracy / rollout limit                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App purchase completion              | `m2t_pro_purchase_completed` / `Pro Purchase Completed` carries advertised package `price`, `currency` and granted `period_type`; can include a trial or already-owned restore fallback.                                                                                                                                                                                                                                           | Funnel only. No app `purchase`, `in_app_purchase`, `logTransaction`, Mixpanel charge or revenue-profile increment. Never sum package prices as revenue.                                                                                                                                                                                                                                                                                                                                       | [Paywall](apps/mobile/features/settings/screens/ProPaywallScreen.tsx), [purchase service](apps/mobile/services/revenueCat.native.ts)                                                                                                                                              |
| RevenueCat → GA4                     | Production iOS stream `15759015760`, Firebase app `1:229377044166:ios:248d6777e3482dfe5cb1c7`; Android stream `15759032739`, app `1:229377044166:android:2efbd8e2ee9255355cb1c7`. Dedicated `RevenueCat Production iOS` / `RevenueCat Production Android` secrets exist only in GA4 and RevenueCat. Gross USD, purchased-currency option off, sandbox off, hashed email off. Web credentials and Firebase Extension webhook empty. | Requires the real `$firebaseAppInstanceId`. Development iOS and the website are excluded. Client startup/foreground and purchase/restore sync the ID; missing or failed writes retry without denying Pro.                                                                                                                                                                                                                                                                                     | [Live Firebase integration](https://app.revenuecat.com/projects/03387b56/integrations/firebase), [native analytics](apps/mobile/services/analytics.native.ts), [official setup](https://www.revenuecat.com/docs/integrations/third-party-integrations/firebase-integration)       |
| RevenueCat attribute acknowledgement | Keep the SDK’s local reserved attributes and POST the same identifiers to `https://api.revenuecat.com/v1/subscribers/{app_user_id}/attributes`, using the existing public platform SDK key and an encoded customer ID. Only HTTP 200 confirms this upload.                                                                                                                                                                         | Abort and return after five seconds; failures retry without denying Pro. Customer-status reads start this work in the background and never fetch offerings. Purchase/restore waits for the bounded attempt. The SDK’s `syncAttributesAndOfferingsIfNeeded` can skip uploads or hide attribute errors and must not authorize the marker.                                                                                                                                                       | [Native RevenueCat service](apps/mobile/services/revenueCat.native.ts), [official attributes endpoint](https://www.revenuecat.com/docs/api-v1/customers#update-customer-attributes), [public-key attribute writes](https://www.revenuecat.com/docs/customers/customer-attributes) |
| RevenueCat → Mixpanel                | Project `4000816`, Money2Time Mobile App, US. Gross USD; `rc_total_revenue_usd`; default purchase lifecycle names below. Sandbox token empty; optional paywall and web funnel events disabled.                                                                                                                                                                                                                                     | Adds recurring server lifecycle event volume. Existing users are linked when their RevenueCat app-user ID already matches Mixpanel; the updated app also writes the reserved distinct-ID attribute. API secret status is recorded in verification below; delayed events need it.                                                                                                                                                                                                              | [Live Mixpanel integration](https://app.revenuecat.com/projects/03387b56/integrations/mixpanel), [official setup](https://www.revenuecat.com/docs/integrations/third-party-integrations/mixpanel)                                                                                 |
| GA4 duplicate control                | Two saved modifications on each production app stream: `RevenueCat source - in app purchase` matches `event_name = in_app_purchase`; `RevenueCat source - store lifecycle` matches names starting `app_store_`. Both also require `revenuecat_revenue_enabled = 1`. Copy `event_name` to `legacy_event_name`, then rename to `m2t_store_revenue_observed`.                                                                         | SDK observations remain inspectable without contributing standard purchase/subscription revenue. Marker is set only after an HTTP 200 acknowledgement of the Firebase attribute upload. Local SDK setters or a successful offerings sync are not proof of remote attribute delivery. Rules may take an hour or more to reach clients. Measurement Protocol events are unaffected by client rules. Receipt delivery and actual automatic-event rewriting must still be observed after release. | [Native marker](apps/mobile/services/analytics.native.ts), [GA4 modification contract](https://support.google.com/analytics/answer/10085872?hl=en)                                                                                                                                |
| Legacy SDK / Google Play             | Existing versions retain SDK store events until they acquire the marker; GA4 Play link remains absent. No new Play revenue producer or manual StoreKit 2 transaction logger is added.                                                                                                                                                                                                                                              | Historical/default In-app purchases reports continue to differ from RevenueCat. RevenueCat is the chosen paid-event producer; do not add a Play link or manual monetary logging without rechecking duplicate control.                                                                                                                                                                                                                                                                         | [Live Play links](https://analytics.google.com/analytics/web/#/a350740029p553783025/admin/integrations/play), [StoreKit guidance](https://firebase.google.com/docs/analytics/ios/measure-in-app-purchases)                                                                        |
| GA4 reporting                        | Use `purchase` / Ecommerce purchases for the RevenueCat paid stream, limited to the two production native streams. Trials use `rc_trial_start`; restores do not create a new charge.                                                                                                                                                                                                                                               | App-stream transaction IDs are not deduplicated by GA4. During rollout, unfiltered Total revenue includes legacy SDK coverage; use the RevenueCat paid-event report when reconciling.                                                                                                                                                                                                                                                                                                         | [Google app-stream deduplication limit](https://support.google.com/analytics/answer/12313107?hl=en), [metric definitions](https://support.google.com/analytics/answer/13428834?hl=en)                                                                                             |
| Currency and dates                   | Both server integrations send gross USD before store deductions. GA4 property reports MYR; Mixpanel timezone is `Asia/Kuala_Lumpur`; RevenueCat charts use UTC.                                                                                                                                                                                                                                                                    | Compare the same currency and date boundaries, production stores and gross/net/tax definition. GA4 currency conversion can differ from RevenueCat's reporting conversion.                                                                                                                                                                                                                                                                                                                     | [RevenueCat chart definitions](https://www.revenuecat.com/docs/dashboard-and-metrics/charts/revenue-chart), [chart time zones](https://www.revenuecat.com/docs/dashboard-and-metrics/charts)                                                                                      |
| Refunds and history                  | Mixpanel supports negative revenue; its approved existing API secret is configured for imports arriving more than five days late. This legacy authentication method [retires on 2027-03-03](https://docs.mixpanel.com/reference/project-secret); migrate the RevenueCat feed before then. RevenueCat's built-in GA4 integration does not send negative revenue.                                                                    | GA4 paid gross revenue is not a refund-adjusted financial ledger. No separate refund bridge or historical backfill is deployed. RevenueCat is authoritative for refund-adjusted totals.                                                                                                                                                                                                                                                                                                       | [GA4 integration limitations](https://www.revenuecat.com/docs/integrations/third-party-integrations/firebase-integration), [Mixpanel integration](https://www.revenuecat.com/docs/integrations/third-party-integrations/mixpanel)                                                 |

#### RevenueCat server event inventory

These are external events, not entries in `AnalyticsEvents`. Enabled Mixpanel names add billable volume per lifecycle occurrence; renewals have no per-install cap. They must remain distinct from app paywall completion. GA4 monetary payloads use `value`, `currency`, `transaction_id` and `items`; Mixpanel uses `revenue` and server-managed revenue profile operations. Other server payload keys follow the provider integration contract and do not inherit the app's custom-event payload table.

| Lifecycle occurrence               | Mixpanel event                       | GA4 event                    | Monetary meaning                                              |
| ---------------------------------- | ------------------------------------ | ---------------------------- | ------------------------------------------------------------- |
| Initial paid subscription          | `rc_initial_purchase_event`          | `purchase`                   | Actual charge                                                 |
| Free trial starts                  | `rc_trial_started_event`             | `rc_trial_start`             | Zero collected                                                |
| Trial converts to paid             | `rc_trial_converted_event`           | `purchase`                   | Actual charge                                                 |
| Trial cancelled                    | `rc_trial_cancelled_event`           | `rc_cancellation`            | No new charge                                                 |
| Renewal / resubscription           | `rc_renewal_event`                   | `purchase`                   | Actual charge                                                 |
| Paid cancellation / refund         | `rc_cancellation_event`              | `rc_cancellation`            | No new charge; Mixpanel can record negative refund revenue    |
| Auto-renew re-enabled              | `rc_uncancellation_event`            | `rc_uncancellation`          | No new charge                                                 |
| One-time / lifetime purchase       | `rc_non_subscription_purchase_event` | `purchase`                   | Actual charge                                                 |
| Subscription paused                | `rc_subscription_paused_event`       | `rc_subscription_paused`     | No new charge                                                 |
| Subscription expires               | `rc_expiration_event`                | `rc_expiration`              | No new charge                                                 |
| Billing failure                    | `rc_billing_issue_event`             | `rc_billing_issue`           | Failed charge                                                 |
| Product changed                    | `rc_product_change_event`            | `rc_product_change`          | Change notice, not proof of a charge                          |
| Web purchase redeemed              | `rc_purchase_redeemed`               | No configured web producer   | Optional name configured; no native extra charge              |
| Customer transfer                  | Not sent                             | `rc_transfer_event`          | Two attribution notices, not two charges                      |
| SDK store observation after marker | Not sent                             | `m2t_store_revenue_observed` | Supplemental only; `legacy_event_name` preserves the SDK name |

#### Integration verification and rollout

| Check                             | Verified state / remaining work                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard persistence             | Firebase and Mixpanel integrations saved; production GA4 app IDs and names, Mixpanel project and region checked live. Sandbox, ad-email matching, optional paywall and web funnel producers are off.                                                                                                                                                                                                                                                                     |
| Mixpanel delayed-event credential | Existing project API secret approved, saved and confirmed configured after reload on 2026-10-02; enables events over five days late. Mixpanel retires this credential method on 2027-03-03; migrate to supported service-account authentication before then.                                                                                                                                                                                                             |
| App identity and retry tests      | Native service tests cover real Firebase ID lookup, production/development separation, customer switching, stale profiles, configuration retries, HTTP upload failures/timeouts, startup status during a pending upload and revenue-marker ordering/retries. No real purchase has been made for verification.                                                                                                                                                            |
| GA4 rule persistence              | Both conditional rules saved in production iOS and Android streams. Verify `legacy_event_name` plus `m2t_store_revenue_observed` on a controlled native transaction after SDK configuration refresh.                                                                                                                                                                                                                                                                     |
| Production receipt delivery       | Integration event logs must show valid delivered payloads and destination events after activation. A GA4 HTTP 204 alone does not prove ingestion.                                                                                                                                                                                                                                                                                                                        |
| Client rollout                    | PR #553 merged on 2026-10-02. The shared `1.5.11` production run succeeded: both iOS and Android Build app and Submit build steps passed. This proves submission, not store approval or public rollout. Verify store availability and client adoption next. Existing users gain GA4 RevenueCat coverage when an updated app syncs their attribute; old charges are not backfilled. [Release evidence](https://github.com/NelsonGan/money2time/actions/runs/36987004636). |
| Financial reconciliation          | Compare production `purchase` revenue with RevenueCat for aligned dates/currency, allowing GA4 processing delay and excluding/referring to refunds separately. Do not claim equality until receipt-level checks pass.                                                                                                                                                                                                                                                    |

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
| `app_icon`, `custom_category_icons`, `custom_subscription_logos`, `icon_packs`, `live_earnings_auto_start`, `reimbursements`                                                                     | Pro-only feature gates.                                           |
| `widget_<kind>`, `widget`                                                                                                                                                                        | Widget Pro CTA; iOS can specify kind, Android uses widget.        |
| `unknown`                                                                                                                                                                                        | Fallback for a missing source; investigate as an attribution bug. |

### Product reports and interpretation

Use the tables above to select events, then apply the product's actual send
conditions before interpreting a funnel or total. A delivered custom event is a
product signal; it is not proof of a store charge, a completed external action
or every transaction in the database.

| Product question                        | Tracking to use                                                                                                                     | Interpretation                                                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do new users activate?                  | `First App Open` → `Onboarding Started` / `Onboarding Completed` → `First Transaction Created`                                      | Use unique users and the documented qualifying saves. Restore/import/reset paths must not manufacture first-use claims. Repeated onboarding actions are not new installs                                                            |
| Which capabilities get adopted?         | `Feature First Used` by feature; `features_used` profile state                                                                      | First-use events describe eligible fresh installs, with at most 17 feature events per install. Older installs acquire profile state without historical first-use events; event counts are not adoption of the entire installed base |
| Do users build a transaction habit?     | Six transaction milestones; GA4 per-use transaction events                                                                          | Milestones summarize qualifying lifetime saves at the documented thresholds. They are not one event per transaction, a count of imported rows or a financial ledger                                                                 |
| Which paywalls lead to purchase intent? | Pro paywall, plan, purchase-started and purchase-completed events by source                                                         | Follow the exact optional conditions in the event table. `Pro Purchase Completed` is a client entitlement/funnel result; free trials and restored entitlements are not new revenue                                                  |
| How often are features used?            | GA4-only per-use rows and explicit `screen_view`                                                                                    | Mixpanel's adoption events intentionally omit repeat usage. Screens measure visible navigation, not successful feature use; SDK sessions are separate from custom-event totals                                                      |
| How much revenue was collected?         | RevenueCat paid initial/trial-converted/renewal/non-subscription charge events; GA4 `purchase` restricted to production app streams | Align dates, currency, store, environment and gross/net definitions. Keep trials, ordinary cancellations, profile spend and legacy SDK diagnostics out of charge totals; GA4 does not subtract RevenueCat refunds                   |
| Is Mixpanel volume as expected?         | 26 approved app definitions plus separately documented RevenueCat lifecycle events                                                  | 81 frequent app definitions remain GA4-only. The 23-event adoption/milestone maximum excludes other approved app events, server events, retries and profile operations; it is not a total install budget                            |

The custom inventory is **107 definitions: 26 Mixpanel + GA4 and 81 GA4-only**.
Payment alerts add two GA4-only definitions and two properties on `Autolog Transaction Created`. Automatic alert expenses qualify for the existing `autolog` first use and transaction milestones. No review, binding-learning or Smart categories events are emitted, and no additional Mixpanel event definitions or blocked-review attempts are introduced.

### Live Mixpanel dashboards

Created and verified **2026-10-02** in **Money2Time Mobile App**, project `4000816`, All Project Data workspace `4496655`. These three workspace boards contain **32 saved reports** and link to one another and this reference. All default to rolling **Last 30 days** in the project timezone, **Asia/Kuala_Lumpur**. Changing the board period overrides the report date range; each funnel's conversion window remains the definition below.

| Board                                                                                    | Saved reports | Main question                                                                                             |
| ---------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| [Activation & Adoption](https://mixpanel.com/project/4000816/app/boards#id=11562957)     | 10            | Do observed new installs complete onboarding, save their first transaction and adopt useful capabilities? |
| [Pro Conversion](https://mixpanel.com/project/4000816/app/boards#id=11562959)            | 10            | Where do plans and lifetime-upgrade checkouts succeed or fail?                                            |
| [Revenue & Tracking Health](https://mixpanel.com/project/4000816/app/boards#id=11562960) | 12            | What charges has RevenueCat delivered, and is approved app telemetry volume and attribution healthy?      |

The inventories below define the live reports as well as their limits. Every query was executed against production data before saving. All 32 saved report names/IDs and all three board layouts were read back; key saved reports, including the final 25-event usage cards, were re-executed. Browser checks confirmed the saved board headers, navigation, 30-day selection and rendered key results. An empty warning card or an as-yet unseen configured event is expected, not a failed query.

#### Activation & Adoption reports

Funnel entrants must have an observed first-open event; older installations are not manufactured into new-install cohorts. The discovery, permission and backup cards require `sample_rate` to be absent to exclude legacy sampled markers. This does not remove every historical schema difference, and old sampled data is never multiplied by two in these reports.

| Saved report                                                                                                   | Counting and filters                                                                                                                      | Interpretation                                                                                             |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Tracked first opens and first saves](https://mixpanel.com/project/4000816/app/insights/#report/93151738)      | Unique users for `First App Open` and `First Transaction Created`, counted separately.                                                    | Independent totals; dividing them does not produce a cohort conversion rate.                               |
| [New install activation within 7 days](https://mixpanel.com/project/4000816/app/funnels/#view/93151740)        | Ordered unique-user funnel: `First App Open` → `Onboarding Started` → `Onboarding Completed` → `First Transaction Created`; 7-day window. | Observed new-install activation. Recent entrants have not had the full window.                             |
| [First-open and first-save users by day](https://mixpanel.com/project/4000816/app/insights/#report/93151741)   | Daily unique users for first opens and first saves.                                                                                       | Daily counts cannot be added as distinct people across the month.                                          |
| [New install activation by OS](https://mixpanel.com/project/4000816/app/funnels/#view/93151743)                | Same four-step, 7-day activation funnel, broken down by event `$os`.                                                                      | Use client OS for app events; do not substitute the user-profile `platform` field.                         |
| [Self-reported discovery sources](https://mixpanel.com/project/4000816/app/insights/#report/93151744)          | Unique `Onboarding Source Selected` users by `source`; `sample_rate` absent.                                                              | Self-reported discovery submissions, not campaign attribution or all installs.                             |
| [Notification request outcomes](https://mixpanel.com/project/4000816/app/insights/#report/93151745)            | Unique `Onboarding Notifications Enabled` users by `permission`; permission present and `sample_rate` absent.                             | The event can include denied/error answers; unset legacy answers are excluded.                             |
| [Onboarding backup choices](https://mixpanel.com/project/4000816/app/insights/#report/93151746)                | Unique users for `Onboarding Backup Enabled` and `Onboarding Backup Skipped` by `target`; `sample_rate` absent.                           | Enabled can mean pending iCloud setup. It does not prove a successful upload; users can make both choices. |
| [First feature adoption by capability](https://mixpanel.com/project/4000816/app/insights/#report/93151747)     | Unique `Feature First Used` users by `feature`.                                                                                           | Eligible fresh-install first uses only; older installs contribute profile state. Feature bars overlap.     |
| [Users reaching transaction milestones](https://mixpanel.com/project/4000816/app/insights/#report/93151748)    | Unique `Transaction Milestone Reached` users by numeric `count`.                                                                          | Qualifying lifetime saves at the documented thresholds. Milestone bars overlap.                            |
| [Install to 10 logged entries within 30 days](https://mixpanel.com/project/4000816/app/funnels/#view/93151749) | Ordered unique-user funnel: `First App Open` → `Transaction Milestone Reached` with `count = 10`; 30-day window.                          | Early habit formation, not session retention; recent cohorts are incomplete.                               |

#### Pro Conversion reports

All ten Pro reports require `sample_rate` to be absent. Plans funnels require the first step's `variant = plans`; the lifetime funnel uses its own variant and plan filters. Funnel steps must occur in order within 24 hours, counted by unique users. Events in outcome charts are total occurrences. Historical records without the required variant, plan or period fields do not enter those respective reports. Source breakdowns do not hold a source constant through the funnel.

| Saved report                                                                                                    | Counting and filters                                                                                                                                          | Interpretation                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [Free-to-Pro checkout within 24 hours](https://mixpanel.com/project/4000816/app/funnels/#view/93151755)         | Ordered unique-user funnel: `Pro Paywall Viewed` with `variant = plans` → `Pro Purchase Started` → `Pro Purchase Completed`; 24-hour window.                  | Client entitlement success can be a trial or already-owned fallback; it is not collected revenue.                                        |
| [Plans checkout conversion by source](https://mixpanel.com/project/4000816/app/funnels/#view/93151756)          | Same plans checkout funnel, broken down by event `source`.                                                                                                    | Directional source comparison. Source is not held constant between steps; intervening visits can contribute. Inspect small denominators. |
| [Plans checkout conversion by OS](https://mixpanel.com/project/4000816/app/funnels/#view/93151757)              | Same plans checkout funnel, broken down by event `$os`.                                                                                                       | Platform comparison of observed app checkout, not store receipt attribution.                                                             |
| [Checkout attempts and outcomes by plan](https://mixpanel.com/project/4000816/app/insights/#report/93151758)    | Total `Pro Purchase Started`, `Pro Purchase Completed`, `Pro Purchase Cancelled` and `Pro Purchase Failed` events by `plan`; plan present on each metric.     | Event occurrences, not paired attempts or disjoint users. Pending purchases are outside these four outcomes.                             |
| [Purchase failure reasons](https://mixpanel.com/project/4000816/app/insights/#report/93151759)                  | Total `Pro Purchase Failed` events by `reason`.                                                                                                               | Failure occurrences, not a rate. Older clients can supply older SDK reason strings.                                                      |
| [Paywalls returning no plans by source](https://mixpanel.com/project/4000816/app/insights/#report/93151760)     | Total `Pro Plans Unavailable` events by `source`.                                                                                                             | Empty/failed plan loads can include retries; this is not a denominator-based failure rate.                                               |
| [Restore results: Pro found or absent](https://mixpanel.com/project/4000816/app/insights/#report/93151762)      | Total `Pro Restore Completed` events by boolean `found`.                                                                                                      | `false` is a valid completed restore with no Pro found. `true` restores access; neither is a new charge.                                 |
| [Account limits blocking transaction entry](https://mixpanel.com/project/4000816/app/insights/#report/93151763) | Total `Pro Limit Hit` events with `type = accounts_transaction`.                                                                                              | Current account-count alert blocking transaction entry. Excludes legacy events for other gates.                                          |
| [Granted checkouts by actual period](https://mixpanel.com/project/4000816/app/insights/#report/93151764)        | Unique `Pro Purchase Completed` users by `period_type`; period present.                                                                                       | Actual granted trial/normal period, not the package's advertised trial offer. Neither bar is a revenue total.                            |
| [Lifetime upgrade funnel within 24 hours](https://mixpanel.com/project/4000816/app/funnels/#view/93151766)      | Ordered unique-user funnel: paywall `variant = lifetime_upgrade` → purchase started `plan = lifetime` → purchase completed `plan = lifetime`; 24-hour window. | Lifetime entitlement funnel; corresponding money belongs to the server non-subscription charge event.                                    |

#### Revenue & Tracking Health reports

The seven server-revenue/lifecycle reports require `environment = PRODUCTION`. The five app-volume/version/attribution reports have no server-environment filter. Under the saved integration setting, server `revenue` amounts are **gross USD**, even when purchased-currency metadata says MYR.

The four charge types are `rc_initial_purchase_event`, `rc_trial_converted_event`, `rc_renewal_event` and `rc_non_subscription_purchase_event`, each filtered to `revenue > 0`. Negative `revenue` on `rc_cancellation_event` is the refund adjustment: gross adds the four charge sums; refund deductions negate that cancellation sum; refund-adjusted revenue adds it to gross. Trial-conversion and non-subscription names are configured but had not been observed at setup; they are already included and contribute automatically when delivered.

| Saved report                                                                                                  | Counting and filters                                                                                                             | Interpretation                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [Delivered revenue and refunds in USD](https://mixpanel.com/project/4000816/app/insights/#report/93151767)    | Sum `revenue` on the four positive charge types below; show gross, negative-refund deductions and gross plus refund adjustments. | Production delivered gross USD, with refunds separate. Ordinary cancellations, trials and client prices add no charge.         |
| [Delivered gross charges in USD by day](https://mixpanel.com/project/4000816/app/insights/#report/93151769)   | Daily sum of positive `revenue` across the four charge types.                                                                    | Charge date trend; no historical backfill.                                                                                     |
| [Delivered charge events by type](https://mixpanel.com/project/4000816/app/insights/#report/93151770)         | Total event occurrences for each of the four charge types, each with `revenue > 0`.                                              | Delivered charge records, not proof of receipt-level completeness.                                                             |
| [Delivered charge revenue by store USD](https://mixpanel.com/project/4000816/app/insights/#report/93151771)   | Sum of positive charge `revenue` by event `store`.                                                                               | Store attribution comes from RevenueCat; server events need not carry client OS.                                               |
| [Delivered charge revenue by product USD](https://mixpanel.com/project/4000816/app/insights/#report/93151772) | Sum of positive charge `revenue` by `product_id`.                                                                                | Store product IDs can differ for the same plan; annual charges are not MRR.                                                    |
| [Subscription lifecycle deliveries](https://mixpanel.com/project/4000816/app/insights/#report/93151773)       | Total initial, renewal, trial-started, trial-cancelled, cancellation, expiration and billing-issue server events.                | Seven observed lifecycle names at setup. Counts overlap across users and are not subscriber or charge totals.                  |
| [Subscription cancellation reasons](https://mixpanel.com/project/4000816/app/insights/#report/93151774)       | Total `rc_cancellation_event` occurrences by `cancel_reason`.                                                                    | Turning off renewal does not immediately end access or prove a refund.                                                         |
| [Recorded approved app event volume](https://mixpanel.com/project/4000816/app/insights/#report/93151775)      | Total recorded occurrences across all 26 approved custom app names, summed by formula.                                           | App subset only, including historical occurrences under these names; not project billing or an install budget.                 |
| [Unknown or missing plans paywall source](https://mixpanel.com/project/4000816/app/insights/#report/93151783) | Total plans paywall views with `source = unknown` and, separately, source absent; `sample_rate` absent.                          | No matching records can display No Data. That is not proof every entry point was exercised.                                    |
| [Recorded approved app events by day](https://mixpanel.com/project/4000816/app/insights/#report/93151784)     | Daily total recorded occurrences across all 26 approved custom app names.                                                        | Repeated actions, older versions and legacy sampling affect recorded volume; no extrapolation.                                 |
| [Paywall telemetry by client version](https://mixpanel.com/project/4000816/app/insights/#report/93151785)     | Total `Pro Paywall Viewed` events by `$app_version_string`, all variants and historical sampling markers.                        | Telemetry rollout by recorded event share, not installed-base share. No sampling-marker filter is applied.                     |
| [Approved app event counts by name](https://mixpanel.com/project/4000816/app/insights/#report/93151786)       | Table of total recorded events for each of the 26 approved custom app names.                                                     | Includes configured pending/restore-failure names automatically when first delivered. Empty series may be omitted by Mixpanel. |

App-usage cards explicitly enumerate all 26 approved custom app names from the active tables, including `Pro Purchase Pending`, `Pro Restore Failed` and `RiceCal Ad Clicked`. The three app-volume queries and board copy were updated on 2026-10-08, executed and read back after saving. RiceCal returned no delivered data during verification; its configured name contributes when first delivered after app release. RevenueCat server events, hidden/retired SDK names, virtual session events and profile operations are outside this app subset. Compare full project usage and billing separately. The lifecycle card currently enumerates the seven observed server names; review that diagnostic when other configured lifecycle names first arrive.

The server feed was enabled on 2026-10-02 and does not backfill history. Delivered charges must not be presented as complete RevenueCat history, store proceeds, MRR or verified receipt reconciliation. Keep using RevenueCat as the financial source of truth until aligned receipt-level checks pass. SDK sessions and GA4 per-use telemetry remain the sources for repeated use and retention; sparse Mixpanel first-use/custom events do not establish DAU or session retention.

### Monitor Mixpanel usage

| Check                      | Measurement                                                                                         | Expected interpretation                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total tracked event volume | Count all project events over the chosen day/month; break down by event name.                       | Compare app-emitted names with the 26 Yes rows. Definition counts cannot predict actual usage. Reconcile any externally emitted events separately with the project's usage report. |
| Repeatable funnel volume   | Counts for paywall views, plans unavailable, purchases/restores, limits, onboarding and wage saves. | Retries, return visits and resets can increase volume; investigate a sudden change against the documented trigger.                                                                 |
| Feature adoption volume    | `Feature First Used` count by `feature` and distinct app-user ID.                                   | At most one per feature per eligible install with durable storage; use `features_used` profiles to include older installs.                                                         |
| Habit milestones           | `Transaction Milestone Reached` count by `count` and app-user ID.                                   | At most six across one eligible install, with durable storage.                                                                                                                     |
| Unexpected events          | Names marked No, undocumented names or legacy `$ae_*` events appearing after rollout.               | Check bypassed routing, stale app versions or external producers before interpreting the increase.                                                                                 |
| Attribution quality        | Paywall views where `source = unknown`; segment by `current_screen`.                                | Find and fix the entry point missing a source; update this table with the fix.                                                                                                     |
| Install cohort conversion  | `First App Open` → `First Transaction Created` → `Pro Paywall Viewed` → `Pro Purchase Completed`.   | Use unique users; filter conversion paywalls to `variant = plans` and distinguish trial from paid period types. Historical installs use `first_app_open` profile cohorts.          |

This section inventories emitted tracking, not a live usage counter or invoice. RevenueCat settings, GA4 app streams and Mixpanel mobile-project settings were inspected on 2026-10-02. A seven-day Mixpanel query confirmed 1,228 First App Open and 132 Pro Purchase Completed events; those counts validate the destination and are not charges or an invoice. Reconcile server `rc_*` lifecycle volume separately from the 26 app Mixpanel definitions. Keep automatic Mixpanel events off, place frequent per-use actions in GA4, and use first-use adoption/profile state for Mixpanel. Never sample paying users to control volume.

### Retired tracking

The unshipped payment-alert review, binding-learning and Smart categories events were removed when this feature became automatic logging with one selected account per app. Their screens and paywall sources are also removed. Capture links and shared allowance usage commit with the expense; retrying an acknowledged expense does not emit another transaction-created event.

Historical reports can still contain these retired names and behaviors. Current GA4-only product events remain in the active table above.

| Retired name / behavior                                                  | Current replacement                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 50% cohort and `sample_rate`                                             | Every user; do not apply old ×2 weighting to unsampled data.                            |
| `$ae_first_open`                                                         | `First App Open`.                                                                       |
| `$ae_session`, `$ae_updated`                                             | GA4 SDK session/engagement reporting.                                                   |
| `Settings Updated`                                                       | Settings super properties and GA4 user properties.                                      |
| `Pro Lifetime Upgrade Viewed`                                            | Paywall view with `variant = lifetime_upgrade`.                                         |
| `Pro Lifetime Upgrade Tapped`                                            | Paywall view with `source = pro_management`.                                            |
| `Pro Lifetime Upgrade Completed`, `Pro Cancel Sub Prompt Viewed`         | Purchase completed with `plan = lifetime` and `upgrade_from`.                           |
| `Pro Redundant Sub Warning Viewed`                                       | Profile `pro_plan = lifetime` and `pro_renewing = true`.                                |
| Generic `source = settings` on paywalls                                  | The explicit settings sources above.                                                    |
| Gate-level limit event immediately followed by paywall                   | The paywall view with the gate source; retain the account alert's separate limit event. |
| `Settle Up Opened`, `Reimbursements Opened`, `Insights Drilldown Opened` | GA4 `screen_view`.                                                                      |
| `Map Pin Tapped`, `Review Prompt Skipped`                                | Removed without a current custom-event replacement.                                     |
| Per-use product events in Mixpanel                                       | GA4-only rows above; adoption uses `Feature First Used` and `features_used`.            |

#### Live Mixpanel catalog cleanup

Verified **2026-10-02** in the mobile Mixpanel project. All 138 existing definitions were compared with the current app and RevenueCat inventories. After cleanup, 101 ordinary names are blocked and hidden, five legacy SDK names are hidden only, and 32 definitions remain visible. Reading the full catalog back confirmed every requested status and that all other definitions retained their original visibility and ingestion settings. The website project was not changed.

| Scope                           | Existing names              | Live action and contract                                                                                                                                                                                                     |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current GA4-only app events     | 76                          | Blocked and hidden in Mixpanel. Their active table rows still route to GA4. The other three GA4-only names, `Item Created`, `Split Bill Created` and `Split Marked Unpaid`, had no existing Mixpanel definition to clean up. |
| Obsolete ordinary events        | 25                          | Blocked and hidden; exact names are listed below. No approved current Mixpanel emitter.                                                                                                                                      |
| Legacy Mixpanel SDK events      | 5                           | `$ae_crashed`, `$ae_first_open`, `$ae_iap`, `$ae_session` and `$ae_updated` hidden only. Automatic tracking is already disabled in the current app. SDK purchase diagnostics are never settled revenue.                      |
| Approved app events             | 23 observed of 25 defined   | Preserved. `Pro Purchase Pending` and `Pro Restore Failed` had not appeared; keep their approved routing.                                                                                                                    |
| RevenueCat server events        | 7 observed of 13 configured | Preserved, including future delivery of configured names absent from the catalog. Financial reporting uses the revenue treatment above.                                                                                      |
| Mixpanel virtual session events | 2                           | `$session_start` and `$session_end` preserved. These definitions are separate from native `$ae_session` capture.                                                                                                             |

| Retired ordinary group     | Exact blocked and hidden names                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bookkeeping and settings   | `Auto Backup Run`, `Mode Switched`, `Settings Updated`, `Transaction Created`, `Transaction Updated`                                                                                                                                                       |
| Legacy onboarding          | `Onboarding Mode Selected`, `Onboarding Skipped`                                                                                                                                                                                                           |
| Navigation and map actions | `Insights Drilldown Opened`, `Map Pin Tapped`, `Reimbursements Opened`, `Screen Viewed`, `Settle Up Opened`, `Tab Viewed`                                                                                                                                  |
| Legacy Pro prompts         | `Pro Cancel Sub Prompt Viewed`, `Pro Exit Offer All Plans Tapped`, `Pro Exit Offer Dismissed`, `Pro Exit Offer Viewed`, `Pro Lifetime Upgrade Completed`, `Pro Lifetime Upgrade Tapped`, `Pro Lifetime Upgrade Viewed`, `Pro Redundant Sub Warning Viewed` |
| Legacy review prompt       | `Review Prompt Skipped`                                                                                                                                                                                                                                    |
| Legacy tutorial flow       | `Tutorial Completed`, `Tutorial Skipped`, `Tutorial Started`                                                                                                                                                                                               |

Blocking stops future ingestion after propagation; it does not erase historical records. Hiding removes names from normal report selectors and can change All Events/Flows views, but does not stop ingestion or billing. Historical events remain available through explicit hidden-event selection. Mixpanel does not permit blocking these SDK `$` events, so old app releases can still send them until adoption catches up. Allow a few hours for blocking to propagate. This follows [Mixpanel's cleanup guidance](https://docs.mixpanel.com/docs/data-governance/data-clean-up) and [Lexicon behavior](https://docs.mixpanel.com/docs/data-governance/lexicon).

When reintroducing a retired name, review its current blocked/hidden status and clear it only after approving and documenting the new tracking contract. An approved event with no recent activity is not obsolete. Reconcile usage with billing separately; catalog visibility alone does not measure usage savings.

### Maintenance contract

For every product or code change, assess whether analytics is affected. If an event, property, trigger, frequency, source, screen, destination, profile field, first-use rule, milestone, provider configuration or external producer changes, update the affected tables and implementation **in the same change**. Remove retired events from the active table and record their replacement in Retired tracking. Review frequency/volume before adding any Yes row. Changes without an analytics impact need no artificial table edit.

Update affected saved Mixpanel reports and the Live Mixpanel dashboards inventory when their event names, filters, formulas, breakdowns or conversion windows change. Keep the 26-name app-volume formulas aligned with approved routing and include configured future charge names in revenue formulas. Saving a report does not verify financial completeness; preserve its coverage and interpretation limits.

Run `npm test -- --runInBand __tests__/services/analyticsTrackingPlan.test.ts __tests__/services/analyticsEvents.test.ts __tests__/services/analyticsNative.test.ts __tests__/services/revenueCatRestore.test.ts __tests__/patches/mixpanelAsyncOperations.test.ts __tests__/utils/firstTransactionSignal.test.ts`. The tracking-table test checks custom-event completeness, exact provider names/routing, summary counts, documented adoption triggers/exclusions and transaction thresholds. The native, installed-SDK and activation tests cover ordering, async failures, profile retries and successful-save claims. Trigger prose, property payloads, screen/source inventories and provider configuration still require review against the changed call sites; passing the tests does not verify those automatically. CI already runs these tests through `npm test`.

Follow [the analytics maintenance skill](.agents/skills/maintain-analytics-tracking/SKILL.md) (also mirrored for Claude). Treat any mismatch as unfinished work: reconcile the table and implementation before completing the change or opening a PR.

### How tracking is wired

The tables above own every event, destination and payload. This part covers the integration, native setup and verification.

#### Implementation map

- `services/analytics.shared.ts` defines the typed custom events, destination groups, GA4 converters, feature-use rules, transaction thresholds and Pro profile builder.
- `services/analytics.native.ts` identifies/configures both providers, queues work until identity is ready, routes events, records first uses and transaction milestones, and logs visible screens.
- `services/analytics.ts` is the web/unsupported-platform no-op fallback.
- `context/AppContext.tsx` and `context/ProContext.tsx` sync installation identity, settings and subscription state. Features emit tracking through the shared analytics API.
- The native layer remembers adoption state in AsyncStorage; the canonical tables explain cohort eligibility and the persistent volume budget.

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

- `identifyUser` configures GA4 consent and identity, then identifies Mixpanel,
  using the same non-PII `appUserId` in both; events tracked earlier are held
  until identification, base profile writes and retired-property cleanup finish.
  A rejected Mixpanel identity attempt skips Mixpanel writes and retries on the
  next operation; GA4 event sends remain independent of Mixpanel sends;
- no analytics prompt or preference is shown; GA4 product measurement is enabled
  by default while financial records remain excluded from event properties;
- development builds set the GA4 `debug_mode` default event parameter so the
  property-level Developer Traffic filter can keep QA data out of reports.
  Production explicitly clears the persisted key with `{ debug_mode: null }`;
- GA4 event and property names are deterministic lowercase `snake_case`
  versions of the Mixpanel display names, prefixed `m2t_`, that preserve
  camelCase word boundaries, and are validated to start with a letter and stay
  within the provider limits (a test fails if an event name would be cut to fit
  GA4's 40 characters);
- null/undefined parameters are dropped, booleans are encoded as `1`/`0`, and
  strings are capped at GA4's standard 100-character event-parameter limit;
- `setCurrentScreen` logs a GA4 `screen_view` with matching `screen_name` and
  `screen_class`, and becomes the `current_screen` of later events;
- stable app traits and Pro state are mirrored to GA4 user properties. Screen
  name remains event context rather than a user property;
- GA4 batching is left to the native SDK. `flushAnalytics` flushes Mixpanel,
  which is the only provider exposing an explicit flush operation.

The installed Mixpanel 3.3.0 wrapper discards completion promises from several
operations and calls iOS `People.union` twice. The repository's
[postinstall patch](apps/mobile/patches/mixpanel-react-native+3.3.0.patch) returns those
promises and makes union a single operation; keep it until an SDK upgrade
provides both fixes. The canonical provider table owns the resulting behavior.

Identity contract:

- `settings.appUserId` is the canonical pseudonymous identifier shared by GA4,
  Mixpanel, and RevenueCat;
- it is generated locally as `m2t_<random UUID>`, contains no name, email,
  advertising identifier, or financial data, and is never exported in backups;
- in-app data resets and backup restores preserve the current installation's ID
  so analytics and subscription history do not fragment;
- uninstalling the app removes the database and therefore rotates the ID on the
  next install, which is also what makes that launch a `First App Open`. Store
  purchase restoration remains the recovery path because Money2Time has no
  login account that could provide a cross-device identity.

#### Configuration and credentials

The Firebase project must be linked to a GA4 property. The repository then
needs the Firebase client configuration files for each registered app:

- `google-services.json` for Android;
- `GoogleService-Info.plist` for production/preview iOS;
- `GoogleService-Info.dev.plist` for the development iOS bundle.

These files contain client/project identifiers, not service-account private
keys. The Expo config chooses the appropriate iOS file from `APP_VARIANT`.

Mixpanel is enabled by `EXPO_PUBLIC_MIXPANEL_TOKEN`; without it the app sends
Mixpanel nothing and warns once in development.

The checked-in client configuration targets `money2time-expo` and matches all
three native app identifiers. Earlier setup notes record the dedicated GA4
property `Money2Time Mobile App` (property ID `553783025`) in Analytics account
`350740029`, with a data stream for each native app. The production data
streams and Firebase app IDs were checked live for the RevenueCat setup. The Developer Traffic filter was not reverified; see the
canonical provider table for verification limits.

#### Verification

Automated checks:

- `analyticsTrackingPlan.test.ts`: the canonical table and implementation agree on every custom event, exact provider names/routing, coverage counts, feature adoption triggers/exclusions and transaction thresholds;

- `analyticsEvents.test.ts`: every event is in exactly one routing group, the
  purchase funnel and the usage milestones stay in Mixpanel and data maintenance
  stays out, no event name starts with `$`, the `days_since_install`
  arithmetic, which events count as a feature use, reading the stored usage
  record, and GA4 naming (never truncated) and parameter limits;
- `analyticsNative.test.ts`: automatic events off, every user identified in
  Mixpanel, GA4-only events kept out of Mixpanel, early events held until
  identify completes, identity retries, independent GA4 sends, async error
  handling and profile sync success/failure, `days_since_install` and `first_app_open`, the retired super
  property cleanup, and first uses and transaction milestones reported once per
  new install and remembered across launches, while older installs only fill
  in `features_used`;
- `mixpanelAsyncOperations.test.ts`: load the installed SDK wrapper and verify
  promise propagation and one union operation on iOS/Android;
- `firstTransactionSignal.test.ts`: failed and overlapping saves do not lose or
  duplicate activation, and existing expense/income history suppresses it;
- `newInstallSignal.test.ts`: `isNewInstall` is true exactly once per install;
- `paywallAnalytics.test.ts`: paywall variants and the purchase properties;
- `proAnalyticsProfile.test.ts` and `revenueCatRestore.test.ts`: the trial
  period type and the readable error code;
- typecheck, lint, formatting, and the full Jest suite.

#### Reporting and rollout

Use the [canonical tracking tables](#monitor-mixpanel-usage) to monitor volume and attribution, and its [retired tracking table](#retired-tracking) to migrate older reports. Keep pre-release sampled data separate from the unsampled population.

RevenueCat's native GA4 and Mixpanel integrations were activated on 2026-10-02.
The app now syncs its real Firebase installation ID and stable Mixpanel identity
to RevenueCat, with retries and customer-switch coordination. The official
attributes endpoint provides an HTTP acknowledgement using the existing public
SDK key. Uploads have a five-second limit and run in the background for customer
status; store offerings are fetched only by paywall operations. Production GA4
stream rules retain SDK store events as supplemental observations after the
client confirms that identity sync. The canonical [revenue tables](#revenue-measurement)
own the exact server names, external settings, duplicate-control rules,
credential status, Mixpanel volume impact and remaining release/receipt checks.
The GA4 integration does not implement refund-adjusted totals or historical
backfill; RevenueCat remains the financial source of truth.

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
logo. `assets/banner.png` remains the legacy full-body wordmark; widgets do not
use it.

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
- Include a shared native-image revision in internal update runtimes. A renamed
  or recompressed image excluded from OTA uploads now requires a matching
  rebuilt development/preview app. Production configuration is unchanged.
- Pin image tooling as development dependencies and integrate the same quality
  gate into category-atlas generation so regeneration preserves the savings.

### Internal preview rebuild

Internal development and preview builds have a runtime version that includes the app version and a shared content hash of bank logos,
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
APP_VARIANT=production SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew :app:assembleRelease :app:bundleRelease --max-workers=4
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

`mode` picks the prompt and the response shape (see `src/scanModes/`): `quick` reads
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

Switch models by changing `MODEL` — no app change needed. Score a candidate first with the [receipt-scanner model eval](#receipt-scanner-model-eval): it imports this Worker's prompts (`src/scanModes/`) and its request/parse module (`src/completion.ts`), so what it measures is what production sends and receives. Model IDs use
OpenRouter's naming. Any multimodal model on OpenRouter that accepts image
input works.

If the primary `MODEL` errors or times out (provider down or overloaded), the
Worker automatically retries the request once with `BACKUP_MODEL`
(`google/gemma-3-4b-it` when unset). Set `BACKUP_MODEL` to the same value as
`MODEL` to disable failover.

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
`EXPO_PUBLIC_REQUEST_SIGNING_KEY`; leave unset to accept unsigned requests).
Dashboard secrets survive every deploy, so they only need to be set once.
(Equivalent CLI, if you prefer: `npx wrangler secret put <NAME>`.)

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

## Model evals

Local tooling for choosing models, in `apps/evals/`: one directory per eval,
each its own npm project. They are scored, not shipped, and each run is
committed to that eval's `history/` so `git log` shows how models compared over
time.

### Receipt-scanner model eval

Local pipeline for choosing the vision model behind the app's only LLM feature,
the receipt-scanner Worker. It lives in `apps/evals/receipt-scanner`,
its own npm project (Node 24+, for `sharp`), and paths in this section are
relative to it. It sends each
test image to an OpenRouter model **exactly as production does**, grades every
answer with **Opus as the judge** (Claude Code's programmatic `claude -p`) on a
rubric, and gives each model a score next to its strict accuracy, reliability,
latency and cost per 1,000 scans.

It is local only and never deployed: nothing here is imported by the app or a
Worker. `apps/evals/` sits outside the app's Metro project, `.easignore` keeps
it out of the EAS archive, `cloudflare.yml` never sees it, and `deploy.yml`'s
change classifier counts it as neither an app nor a test change, so a committed
eval run never redeploys a Worker, runs the app's checks or cuts a store build.

It imports the Worker's own prompt, request body and response parse
(`src/scanModes/`, `src/completion.ts` in the Worker), so **keep those modules
I/O-free and importable by plain Node**: no Worker globals.

```bash
cd apps/evals/receipt-scanner
npm install
npm run eval -- --model google/gemini-2.5-flash-lite      # one model, full suite
npm run eval -- --model x/a --model y/b --production      # compare against prod MODEL + BACKUP_MODEL
npm run eval -- --model x/a --limit 3                     # smoke test, 3 cases per mode
npm run eval -- --model x/a --dry-run                     # validate the id, plan, rough cost; no calls
npm run eval -- --help                                    # every flag
```

The `run-model-evals` skill (`/run-model-evals <model>`) wraps this end to end.

#### What is tested

The Worker has three modes, each a real flow in the app, and the dataset covers
all three (107 cases):

| Mode         | App flow                                             | Cases | What the cases stress                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quick`      | Snap a receipt, pre-fill an expense                  | 46    | cash tendered/change, handwritten tips, service + SST + rounding, discounts, tax-inclusive yen, `1.234,56` and `Rp 125.000` formats, currency pinning, 2-3 receipts per photo, faded/blurred/sideways/dim photos, date clamp, menus |
| `itemized`   | Split by Item (line items to assign to people)       | 32    | quantity layouts (`2 x`, `3 @`, own line, by weight), per-line vs receipt-level discounts, tax/service/tip/rounding exclusion, modifiers, POS abbreviations, long receipts, multi-receipt (no detail), currency detection           |
| `screenshot` | Auto-log a payment screenshot (posts with no review) | 29    | account matching by last 4 / wallet name, ambiguous sources (must be `""`), decoy digits, lock-screen noise and promos, balances, transfers, transaction lists, order totals, FX billed amount, emailed receipts, paper receipts    |

Cases are a mix of hand-written traps (`dataset/cases.mjs`, each with a `notes`
line naming the trap) and seeded procedural variety across nine locales
(`dataset/procedural.mjs`: MYR, USD, SGD, GBP, JPY, IDR, EUR, PHP, AUD, each
with that locale's date order, tax regime, rounding, payment methods and the
category list a user there would have, localized names included).

**Answer keys are exact.** Receipts are rendered from a spec (`dataset/receipt.mjs`)
and every figure is computed in integer minor units from the same numbers that
get printed, so the expected total can never disagree with the image. Photos are
composited on table backgrounds with tilt, blur, fade, noise and side light
(`dataset/scene.mjs`), then downscaled exactly like the app does before upload
(long edge 1600px, JPEG). Dates are written against a fixed reference "today"
(`REFERENCE_DATE`), and the Worker's 30-day date clamp is applied against it, so
the dataset rebuilds byte-identically and never goes stale.

**Real photos.** Drop private receipts into `dataset/real/` (gitignored), see
[Real receipt photos](#real-receipt-photos). They join the suite, downscaled the
same way; without an answer key the judge grades them from the image.

#### How a case is scored

1. **Scan** — the Worker's own TypeScript is imported (`lib/worker.mjs`), so the
   prompt (`buildReceiptPrompt`), request body (`buildCompletionBody`: temperature 0,
   reasoning off, per-mode `max_tokens`) and response parse (`parseTransactions`,
   `normalizeReceiptDetail`, the date clamp) are production's, not copies. The
   Worker's single retry on an empty result (at temperature 0.2) is replicated;
   `--no-empty-retry` turns it off to measure first-pass behaviour.
2. **Checks** (`lib/checks.mjs`) — deterministic facts against the answer key:
   amount exact, count, raw and app-facing date, category valid/best/acceptable,
   merchant, account (`wrong` / `invented` / `missed`), item recall/precision,
   quantities, item sum, JSON purity, currency pinned. A case **strict-passes** when
   the app would get every amount (and account / item list) exactly right.
3. **Judge** (`lib/judge.mjs`) — one headless `claude -p --model opus` session per
   case: Read-only tools scoped to the dataset folder (it can open the image), no
   CLAUDE.md/settings/skills/MCP, answer forced into the rubric's JSON schema with
   `--json-schema`. It sees the request, answer key, raw and Worker-normalized
   output and the checks, and is **blind to the model name**. Each rubric
   criterion gets 0-4 with a reason, plus critical errors, `user_would_accept`
   and a summary.
4. **Score** (`lib/scoring.mjs`) — criteria weighted per mode (`lib/rubric.mjs`) into
   0-100. A failed scan scores 0. An **auto score** fills the same criteria from
   the checks alone, so `--no-judge` runs are still comparable and a large
   judge/auto gap marks a case worth reading. A model's score is the mean per
   mode, then the mean across modes (equal weights unless `--weights`).

Rubric weights (sum to 100 per mode):

| quick              | itemized                | screenshot        |
| ------------------ | ----------------------- | ----------------- |
| amount 40          | amount 15               | amount 30         |
| receipt count 15   | count + detail 10       | account 25        |
| category 15        | item completeness 20    | count 15          |
| date 10            | item accuracy 20        | merchant/payee 10 |
| merchant 10        | non-items excluded 10   | category 10       |
| output contract 10 | detail metadata 10      | date 5            |
|                    | category 5, contract 10 | output contract 5 |

Judgements are cached in `results/.judge-cache/`, keyed by the judge prompt,
rubric version, judge model, case, image and the exact model output, so re-runs
only pay for answers that changed.

#### Output

Each run writes `results/<timestamp>/report.md` (leaderboard, app-facing metrics,
cost and speed, and per model its weakest tags and worst cases with the judge's
explanation) and `run.json` (every raw output, attempt, check and judge reason).
`results/LEADERBOARD.md` keeps the latest full-suite result per model on the
current dataset; filtered or limited runs are listed separately as partial.
`results/` is gitignored scratch.

#### Run history (committed)

Every run is also logged to `history/` and **committed automatically**, so `git log`
shows how each model scored over time:

- `history/HISTORY.md`: one table of every run, newest first (time, model, score per mode,
  strict pass, wrong/guessed accounts, invented payments, cost per 1,000 scans, latency,
  dataset version, and the code commit measured, `+` when the eval or Worker had uncommitted edits).
- `history/runs/<timestamp>.md`: that run's full report.
- `history/runs.jsonl`: the same, one JSON line per model per run.

The commit contains only those files (`git commit -- <paths>`), so anything else you have
staged is left alone. It is not pushed. Because each run records the code commit it measured,
**commit eval or Worker changes before running**; a dirty tree is marked `+`. Smoke tests and filtered runs are logged too, marked
partial. `--no-commit` writes the history without committing; `rescore.mjs` updates that run's
lines (and commits) instead of adding new ones.

#### Cost

Costs include prompt caching. OpenRouter's billed `cost` already discounts cached reads and
includes any cache-write premium; the report also shows the mean cached and cache-written prompt
tokens. For `claude-code:` models and the judge, cost is computed per token type at Anthropic list
price (`lib/anthropicPricing.mjs`): plain input, cache writes at 1.25x (5-minute) or 2x (1-hour)
input, cache reads at 0.1x (0.05x on Opus 5.5), and output. `claude -p` writes each prompt to a
1-hour cache, so a `claude-code:` row also shows the cost with no caching, which is closer to a
one-off production call. The CLI's own `total_cost_usd` is kept only for reference: it has no price
for models it does not list yet and came out about 40x above the cache-inclusive list price for Haiku 5.5.

OpenRouter calls are cheap (the production models cost cents per thousand scans). The judge
dominates: about **$0.03-0.05 per judgement**, so roughly **$4-6 per model** for the full suite, and
nothing for answers already in the cache. `--dry-run` prints the plan and a rough estimate first.

#### Setup

- Node 24+ (the Worker's TypeScript is loaded with Node's built-in type stripping), and `npm install` in this directory for `sharp`.
- `claude` CLI on PATH, signed in (the judge runs on your Claude Code account).
- `OPENROUTER_API_KEY` in `.env` here (gitignored), `.env.local`, or the environment.

#### Flags and maintenance

`npm run eval -- --help` prints every flag (the list lives in `run.mjs`).

After changing `lib/checks.mjs` or `lib/scoring.mjs`, re-score a saved run without calling any
model or the judge (judge verdicts are kept):

```bash
node rescore.mjs results/<run>
```

Rebuild or inspect the dataset on its own:

```bash
node build-dataset.mjs --list     # case table
node build-dataset.mjs --force    # re-render into dataset/generated/
```

#### Changing things

- **Prompts or parsing** live in the Worker and are picked up automatically; re-run the models you care about.
- **New case**: add it to `dataset/cases.mjs` (receipt spec, screen template data, or paper SVG) with a `notes` line naming the trap. `build-dataset` validates that expected categories and accounts are in the case's own lists.
- **Rubric**: edit `lib/rubric.mjs` and bump `RUBRIC_VERSION`.
- **Procedural set**: bump `PROCEDURAL_VERSION` in `dataset/procedural.mjs` to reshuffle it deliberately.

#### Real receipt photos

`dataset/real/` is gitignored, so real receipts never get committed. Each case is an image plus a JSON file sharing its name:

```
dataset/real/
  lunch-0927.jpg
  lunch-0927.json
```

The JSON is a case without `image` (the builder downscales the photo like the
app does). `expect` is optional: leave it out and the Opus judge grades the
answer from the image alone (no strict metrics for that case).

```json
{
  "id": "real-lunch-0927",
  "mode": "quick",
  "notes": "Crumpled kopitiam receipt, total RM 18.40 at the bottom.",
  "tags": ["MYR", "crumpled"],
  "input": { "currency": "MYR", "categories": ["Food", "Groceries", "Transport", "Other"] },
  "expect": {
    "transactions": [
      { "amount": 18.4, "date": "2026-09-27", "category": ["Food"], "note": ["Kedai Kopi Ah Seng"] }
    ]
  }
}
```

For `screenshot` mode add `input.accounts` and an `account` on each expected
transaction (`""` when none should match). For `itemized` mode add
`expect.receiptDetail` with `merchant`, `date`, `currency` (acceptable codes,
`null` allowed), `itemsSubtotal` and `items: [{ name, aliases, quantity, lineTotal }]`.

Dates are checked after the Worker's 30-day clamp, measured from the case's own
`referenceDate` ("today" for that receipt). It defaults to the first expected
transaction's date, so a recent receipt keeps its printed date; set it explicitly
(e.g. `"referenceDate": "2026-10-05"`) to test the clamp on an old receipt.

## CI and deploy

App CI/CD is [.github/workflows/deploy.yml](.github/workflows/deploy.yml), gated `changes → test → plan → deploy`:

- **Changes** — runs first on every event and classifies the diff (`git diff` of the PR merge commit's base parent, or the push's `before..after`) into three flags every other job keys off: `app` (anything that can reach the mobile binary, i.e. everything except `apps/cloudflare/**`, `apps/evals/**`, `.github/**`, `.claude/**`, `.agents/**`, `.codex/**`, `.vscode/**`, any `*.md`, `LICENSE`), `worker` (non-markdown `apps/cloudflare/**`), and `checks` (anything outside `apps/cloudflare/**` and `apps/evals/**`). **Fail open:** an unresolvable diff or an unrecognized path sets every flag true, so a new directory builds the app rather than silently skipping the release.
- **Test** — `npm ci`, `npm run check` (typecheck + lint + format), `npm test`. Runs in `apps/mobile`. Skipped when `checks` is false, because eslint and tsconfig only see the app, prettier sees the app plus the root `*.md` and `.github/`, and jest only reads `__tests__/` — there is literally nothing for it to check on a Worker-only change. A failure blocks everything downstream.
- **PR preview** (`preview-pending` → `worker-preview` → `pr-update`) — pull requests only, and only when `app` or `worker` is set (docs-only PRs publish nothing). `worker-preview` uploads a per-PR aliased Worker version **only** when `worker` is set; when it is skipped, `pr-update` points the EAS update at the production Worker URL instead.
- **Plan** — manual dispatch, or push-to-main **when `app` is set**. A Worker-only or docs-only merge to `main` therefore never cuts a store build. Resolves the build matrix (push = both iOS+Android production; dispatch = the chosen single platform/profile).
- **Deploy** — from `apps/mobile`, `eas build --local` on the matched runner (macos-15 for iOS, ubuntu-latest for Android), then `eas submit`. `fail-fast: false` so a single-platform failure doesn't kill the other build.

Cloudflare has its own workflow, [.github/workflows/cloudflare.yml](.github/workflows/cloudflare.yml) (typecheck on PRs, D1 schema apply + `wrangler deploy` on push to `main`), path-filtered to non-markdown `apps/cloudflare/**` so an app-only change never redeploys the Worker and vice versa. Both directions of that split are deliberate: **gate jobs with `if:`, not workflow-level `paths:`** — a job skipped by `if:` reports success to branch protection, while a whole workflow skipped by a path filter leaves its required checks pending forever.

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

[.github/workflows/cloudflare.yml](.github/workflows/cloudflare.yml) — the Workers: typecheck on PRs, D1 schema apply + `wrangler deploy` on push to `main`.

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
- Variable shadowing is an error.
- No-build-path restrictions on moved modules (`~/lib/*` → `~/*`, `~/types/*`, `~/services/*`, `~/hooks/*`, `~/constants/*`).
