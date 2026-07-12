# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start development server (use --localhost; tunnel mode no longer needed)
npx expo start --localhost

# Run on iOS/Android (syncs icons first)
npm run ios
npm run android

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check

# All checks together
npm run check

# Simulator/emulator control, debugging, profiling — use the Argent MCP tools
# (mcp__argent__*: boot-device, launch-app, describe, gesture-tap, screenshot,
# debugger-*, profile-*). Prefer them over raw xcrun simctl / adb. Skills are in
# .claude/skills/argent-*. Argent may offer to start Metro itself — always start
# the dev server with `npx expo start --localhost` instead (network issue on this
# machine; tunnel/LAN modes don't work).

# Tests (Jest + ts-jest, node env)
npm test
```

Tests live in `__tests__/` (29 suites covering utils, repositories, services, navigation, db, features, i18n parity). Native deps are mocked in `__tests__/__mocks__/` (i18n, haptics, DB client, drizzle, expo-localization). CI runs `npm run check && npm test` in the `test` job of [.github/workflows/deploy.yml](.github/workflows/deploy.yml) before any build.

## Architecture

### Navigation

`App.tsx` is the root. It contains a single `RootStack` (NativeStack) with `MainShellScreen` as the base screen. `MainShellScreen` renders a `BottomNav` overlaying a tab-based content area. The app is **calendar-first**: the 5 tabs are **calendar, accounts, insights, albums, settings** (`TabName` in `components/navigation/BottomNav.tsx`). The `calendar` tab is the home/base view and renders `CalendarScreen` (which surfaces the month grid, day pager, and transaction list); `accounts` is hidden in simple mode. Modal/push screens (editors, drilldowns, flows) are registered at the root stack level.

**Root stack screens** (defined in `navigation/rootStack.ts`):
`Main`, `AddTransaction`, `AddTransactionDetailed`, `EditTransaction`, `AccountDetail`, `InsightsDrilldown`, `RecurringEditor`, `SettingsRecurring`, `SettingsAccounts`, `SettingsHourlyValue`, `SettingsQuickEntry`, `SettingsMultiCurrency`, `SettingsWageCalculator`, `ShareAndEarn`, `SettleUp`, `SettleUpPerson`, `SettleUpTransaction`, `SplitBill`, `ProPaywall`, `CreateAlbum`, `AlbumDetail`, `EditAlbumTransactions`, `AddAlbumTransactions`, `EditAlbumDetails`.

**Settings has its own nested stack** (`navigation/settingsStack.ts`):
`SettingsHome`, `DisplaySettings`, `HourlyValue`, `WageCalculator`, `AccountSettings`, `Accounts`, `ExchangeRates`, `Categories`, `Recurring`, `Notifications`, `NotificationDetail`, `DataManagement`, `News`, `AutoBackupSettings`, `StatementImport`, `StatementImportList`, `ProManagement`, `ShareAndEarn`, `SettleUp`, `SettleUpPerson`, `QuickEntrySettings`, `AppLock`, `WidgetPreviews`.

Stack options live in `navigation/stackOptions.ts` (headerShown: false, slide animations, gesture-enabled back).

### State Management

Global state lives in `context/AppContext.tsx` via the `useApp()` hook. This is the single source of truth for all DB data — wallets, transactions, categories, settings, recurring rules, monthly wages, account balances, albums, and the multi-currency exchange-rate table. All CRUD operations are methods on this context. There is no Redux, Zustand, or other state library.

**Two contexts, by update frequency.** The volatile transaction-derived state — `transactions`, `filteredTransactions`, `accountBalances`, `transactionFilters`, `activeAccountFilter` — lives in a separate `TransactionsContext`, read via **`useTransactions()`**. Everything else (settings, accounts, categories, albums, FX, wages, prefs) plus all action functions stay on `useApp()`. This matters because transaction CRUD updates `transactions` optimistically/granularly (not via the full `refreshAll()` reload), so isolating it keeps the app's most frequent mutation from re-rendering every settings/account/album consumer. **Rule of thumb:** if a component needs live transaction data use `useTransactions()`; otherwise use `useApp()` and it won't re-render on transaction churn. Functions on `useApp()` that touch transactions (`getTransactionsByAccount`, `queryTransactions`, the breakdown queries, the bulk mutations, `getDisplayValueForTransaction`) are **identity-stable across transaction churn** (they read render-synced refs) — a memo that caches their results must also key on `useTransactions().transactions`.

**Scoped mutation refreshes.** Non-transaction mutations refresh only the state slice they touch (`refreshAccountsAndGroups`, `refreshCategories`, `refreshAlbums`, `refreshWages`, `refreshSettings` — passed to `runMutation` via `options.refresh`). The full `refreshAll()` is reserved for load/retry, restores/imports/resets, mode switches, and recurring-rule edits (which rely on its `runDueTransactions` pass). When adding a mutation, pick the narrowest refresh; include `refreshTransactions()` only if the write changes transaction rows or their denormalized relation names (account/category renames, reassignment, redenomination).

**Tab visibility.** The five main tabs stay mounted for the app's lifetime (`MountedTab` in `App.tsx`), so hidden tabs would otherwise recompute on every write. `MountedTab` provides `TabVisibilityContext`; heavy screens hold their transaction-derived inputs with `useValueWhileTabVisible()` (`context/TabVisibilityContext.tsx`) so hidden tabs skip recomputation and catch up once on activation. Root-stack screens (editors, drilldowns) default to visible.

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
- **Mode helpers**: `isSimpleMode`, `simpleWalletId`, `completeOnboarding`, `switchToSimpleMode`, `switchToPowerMode`, `deleteSimpleWalletAndTransactions`
- **Album ops**: `albums`, `activeAlbumId`, `createAlbum`, `updateAlbum`, `deleteAlbum`, `reorderAlbums`, `setActiveAlbum`, `addTransactionsToAlbum`, `removeTransactionsFromAlbum`, `getAlbumTransactionIds`, `getAlbumTransactions`, `getAlbumStats` (trip albums — group transactions with a cover, date range, and breakdown; Pro-limited to `FREE_MAX_ALBUMS`)
- **Budget ops**: `budgetTemplates`, `monthlyBudgets`, `createBudgetTemplate`, `updateBudgetTemplate`, `deleteBudgetTemplate`, `setDefaultBudgetTemplate`, `createMonthlyBudget`, `createCustomMonthlyBudget`, `updateMonthlyBudget`, `deleteMonthlyBudget` (monthly, expense-only budgets built from reusable templates; Pro-limited to `FREE_MAX_BUDGET_TEMPLATES`)
- **Multi-currency / FX ops**: `listExchangeRates`, `refreshExchangeRates`, `setManualExchangeRate` (reporting-currency rate table; transactions snapshot `reportingCurrency`/`reportingAmount`/`fxRate` at write time so historical aggregates never drift)
- **Preferences**: `insightsPreferencesJson`, `updateInsightsPreferencesJson`, `notificationPrefs`, `updateNotificationPrefs`, `quickEntryPrefs`, `updateQuickEntryPrefs`, `calendarPrefs`

Other contexts:

- `context/ThemeContext.tsx` — theme management: `resolvedTheme`, `themeColor`, `useResolvedTheme()`, `useThemeColor()`
- `context/ProContext.tsx` — RevenueCat subscription state: `isPro`, `isLoading`, `customerState`, `offering`, `purchasePackage`, `restorePurchases`, `refresh`

### Database

SQLite via `expo-sqlite` + Drizzle ORM. Schema is in `lib/db/schema.ts`. The DB client is initialized in `lib/db/client.ts` (database file: `money2time.db`, migrations in `lib/db/migrations/` numbered `001`–`046` (045 intentionally skipped), `SIMPLE_WALLET_NAME` constant defined there). `lib/db/normalizeCurrencies.ts` collapses legacy single-currency rows on restore/upgrade.

**Offline places DB (`lib/db/citiesDb.ts`).** A second, **read-only** SQLite connection holds GeoNames cities (used by `CityPickerSheet` to attach a location to an album). The prebuilt asset lives at `assets/db/cities.db` (bundled via the `db` entry added to metro `assetExts`; gitignore-negated since `*.db` is otherwise ignored) and is copied into the SQLite dir once on first run, guarded by `CITIES_DB_VERSION`. Regenerate it with `node scripts/build-cities-db.mjs` (downloads GeoNames `cities15000`; `--empty` writes a schema-only placeholder). **Never** run the money2time migration runner against `cities.db` — it is pure reference data: not migrated, not backed up, not reset. The loader degrades to empty results if the asset is missing/corrupt. `searchCities` is **fuzzy**: the FTS5 index covers city, admin1/state and country names so a query can resolve by any of them (e.g. `japan`, `california`), and results are ordered by match tier (city-name match > state > country) then population. Each table carries an `ascii_name` column for the diacritic-free LIKE checks that drive that tiering.

**Album location map (`features/albums/`).** Albums with a location render on a full-page map, reached from the map FAB on `AlbumsScreen` → `AlbumLocations` root screen (`AlbumLocationsScreen` — full-bleed map, floating back button, no header). The map (`components/AlbumMapView.tsx`) is **MapLibre** (`@maplibre/maplibre-react-native`, open-source, no API key): photo `Marker`s showing each album's name + total spend (`AlbumMapMarker`) over a sleek, theme-tinted vector basemap (`buildThemedMapStyle` paints MapLibre's no-key demotiles vector source in the active `ColorPalette`), plus a "fit all" camera button. The path to full street-level/offline detail is a Protomaps PMTiles archive (`assets/map/style.json` is a bundled OSM-raster fallback). **MapLibre is a native module:** its Expo config plugin is registered in `app.json`, so adding/upgrading it needs a **dev-client / prebuild rebuild** (no Expo Go). `AlbumMapView` is `React.lazy`-loaded so the rest of the app works on a dev client that hasn't been rebuilt yet — only opening the location screen's map touches the native module. Pins come from `AlbumPin[]` (built from `locatedAlbums` + `getAlbumStats`); `locatedAlbums` is a selector on `useApp()`.

**Tables** (all use soft-deletes via `deletedAt`, except `exchange_rates` which is a cache):

| Table                           | Key columns                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountsTable`                 | id, name, sortOrder, type (debit/credit), accountGroup, logoId, creditStatementDay, creditDueDay, currency, startingBalance, includeInTotals                                                                                                                                                                                                                                                                                |
| `accountGroupsTable`            | id, name, sortOrder                                                                                                                                                                                                                                                                                                                                                                                                         |
| `categoriesTable`               | id, name, sortOrder, type (expense/income), parentId, icon, isDefault                                                                                                                                                                                                                                                                                                                                                       |
| `transactionsTable`             | id, type (expense/income/transfer/balance_adjustment), amount, currency, **reportingCurrency, reportingAmount, fxRate** (frozen FX snapshot), **toAmount, accountAmount** (cross-currency), date, accountId, fromAccountId, toAccountId, categoryId, note, recurrence fields, sentiment                                                                                                                                     |
| `transactionSplitsTable`        | id, transactionId, personName, amount, isSelf, paybackAccountId, paidAt, paidTransactionId, sortOrder, note (receipt line-item name)                                                                                                                                                                                                                                                                                        |
| `recurringRulesTable`           | id, name, type, amount, currency, toAmount, accountId, fromAccountId, toAccountId, categoryId, recurrencePattern, recurrenceInterval, nextRunDate, endDate, isActive                                                                                                                                                                                                                                                        |
| `settingsTable`                 | id, appUserId, locale, currencyCode, currencySymbol, displayMode, hapticsEnabled, themeMode, themeColor, accountLogoCountry, profileName, profileAvatarUri, insights/notification/quickEntry/calendar PrefsJson, onboardingCompleted, userMode, weekStartsOn, biometricLockEnabled, biometricLockDelaySeconds, autoBackup fields, autoFxRefreshEnabled, lastRateFetchAt/Error, fxCurrenciesJson, firstAppOpen, paymentQrUri |
| `exchangeRatesTable`            | id, baseCurrency, quoteCurrency, rate, asOfDate, source (api/manual), updatedAt (FX rate cache, no soft-delete)                                                                                                                                                                                                                                                                                                             |
| `albumsTable`                   | id, name, coverPhotoUri, isActive, startDate, endDate, sortOrder                                                                                                                                                                                                                                                                                                                                                            |
| `albumTransactionsTable`        | id, albumId, transactionId, sortOrder (join table)                                                                                                                                                                                                                                                                                                                                                                          |
| `monthlyWageSettingsTable`      | id, month (YYYY-MM), wageType, wageAmount, hoursWorkedPerWeek, workdaysPerWeek, commuteMinutesPerWorkday, baseHourlyRate, trueHourlyRate                                                                                                                                                                                                                                                                                    |
| `budgetTemplatesTable`          | id, name, emoji, totalAmount, isDefault, countUnbudgeted, sortOrder (reusable budget template; exactly one live default)                                                                                                                                                                                                                                                                                                    |
| `budgetTemplateCategoriesTable` | id, templateId, categoryId, amount, sortOrder (per-root-category allocation on a template)                                                                                                                                                                                                                                                                                                                                  |
| `monthlyBudgetsTable`           | id, month (YYYY-MM), templateId, templateName, templateEmoji, totalAmount, countUnbudgeted (frozen at creation; one live row per month via partial unique index, soft-deleted rows are tombstones)                                                                                                                                                                                                                          |
| `monthlyBudgetCategoriesTable`  | id, budgetId, categoryId, amount, sortOrder (frozen budget line for a month)                                                                                                                                                                                                                                                                                                                                                |

Data access goes through repositories in `lib/repositories/`: `accountsRepository`, `accountGroupsRepository`, `categoriesRepository`, `transactionsRepository`, `transactionSplitsRepository`, `recurringRulesRepository`, `settingsRepository`, `monthlyWageRepository`, `albumsRepository`, `exchangeRatesRepository`, `budgetTemplatesRepository`, `monthlyBudgetsRepository`, plus `mappers.ts` for DB row → domain type transformations.

### Feature Structure

Features live under `features/` in domain folders. Each has `screens/` and sometimes `components/`, `services/`, `constants/`.

| Feature         | Purpose                                                                                                               | Key screens / components                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `transactions/` | Transaction CRUD, month-paged activity list, search, bulk edit, voice quick-entry, split-bill, settle-up              | `TransactionsScreen`, `SimpleActivityScreen`, `AddTransactionScreen`, `EditTransactionScreen`, `QuickAddScreen`, `QuickAddSheet`, `VoiceQuickAddOverlay`, `VoiceCaptureOverlay`, `VoicePreviewSheet`, `TransactionEditorScreen`, `SettleUpScreen`, `SettleUpPersonScreen`, `SettleUpTransactionScreen`, `SplitReceiptCard`, `SplitReceiptShareModal` (+ `transactions/lib/settleUp.ts`)                      |
| `calendar/`     | Calendar tab (app home) — three-level zoom (year/month/day), month grid of daily totals, day pager, search overlay    | `CalendarScreen`, `CalendarMonthGrid`, `CalendarMonthPage` (+ `calendar/lib/`)                                                                                                                                                                                                                                                                                                                               |
| `albums/`       | Trip albums — group transactions with a cover photo, date range, breakdown drill-down, active auto-add                | `AlbumsScreen`, `AlbumDetailScreen`, `CreateAlbumScreen`, album editor screens (+ `albums/utils.ts`)                                                                                                                                                                                                                                                                                                         |
| `insights/`     | Analytics charts — expense trends, category breakdown, sentiment                                                      | `InsightsScreen`, `InsightsDrilldownScreen` (+ `insights/breakdownPieLayout.ts`)                                                                                                                                                                                                                                                                                                                             |
| `budget/`       | Monthly expense budgets from reusable templates — per-category depletion, month pager, widgets (embedded in Insights) | `BudgetScreen`/`BudgetPagerView`, `BudgetTemplatesScreen`, `BudgetTemplateEditorScreen`, `MonthlyBudgetEditorScreen`, `CategoryAllocationScreen` (+ `budget/lib/budgetMath.ts`, `budget/lib/categoryAllocationBridge.ts`)                                                                                                                                                                                    |
| `settings/`     | All configuration, account/category management, data import/export, auto-backup, multi-currency, App Lock             | `SettingsScreen`, `DisplaySettingsScreen`, `HourlyValueScreen`, `AccountsScreen`, `ExchangeRatesScreen`, `CategoriesScreen`, `RecurringScreen`, `NotificationsScreen`, `DataManagementScreen`, `AutoBackupScreen`, `StatementImportScreen`, `QuickEntrySettingsScreen`, `AppLockScreen`, `WidgetPreviewsScreen`, `ProManagementScreen`, `ProPaywallScreen`, `WageCalculatorFlowScreen`, `ShareAndEarnScreen` |
| `news/`         | In-app feature announcements & showcases (changelog-style)                                                            | `NewsScreen`, `FeatureAnnouncementModal`, per-feature `*Showcase` components, `announcements/` (numbered entries), `featureAnnouncements.ts`                                                                                                                                                                                                                                                                 |
| `onboarding/`   | First-time setup flow: value-prop, mode, wage, preferences, notifications                                             | `OnboardingFlow` + 6 step screens (`OnboardingValuePropStep`, `OnboardingModeStep`, `OnboardingWageStep`, `OnboardingPreferencesStep`, `OnboardingNotificationsStep`, `OnboardingBootstrapStep`)                                                                                                                                                                                                             |
| `tutorial/`     | Coach-mark overlays for first-use guidance                                                                            | `TutorialCoachmarkOverlay`                                                                                                                                                                                                                                                                                                                                                                                   |
| `reviewPrompt/` | In-app App Store / Play review request prompt                                                                         | review prompt components (paired with `services/reviewPrompt.ts`)                                                                                                                                                                                                                                                                                                                                            |

Shared UI primitives in `components/ui/`: `button`, `fat-button`, `card`, `input`, `select`, `settings`, `text`, `textInputStyles`, `theme-modal`, `time-value-inline`, `toggle`, plus the cross-feature sheets `AccountPickerSheet`, `CategoryPickerSheet`, `CurrencyPickerSheet`, `AccountLogoPickerSheet`, and icon/logo helpers `CategoryEmoji`, `SentimentIcons`, `AccountLogo`.

Other shared components: `components/feedback/` (EmptyState, AppErrorBoundary, Mascot, LoadingDots, ImportingOverlay), `components/navigation/` (BottomNav, BottomNavMinimize, AddFab, TodayJumpFab, EdgeSwipeBackContainer, MonthControlsHeader, InOutHeader, FilterIconButton, `liquidGlass`), `components/icons/` (NavIcons, SocialIcons via Lucide), `components/datePicker/` (DatePickerModal, InlineDatePicker, MonthYearWheelPicker), `components/layout/` (TabletContentContainer), `components/widget-preview/` (home-screen widget previews).

### Services

| Service                                                                                                                                                                            | Purpose                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                      | Mixpanel: `trackEvent`, `identifyUser`, `setCurrentScreen`, `flushAnalytics`                                                                                                                                                                                     |
| `errorReporting.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                 | Sentry crash/error reporting: `reportError` (used by `AppErrorBoundary`), `setErrorUser`; `.shared` holds pure `beforeSend`/`beforeBreadcrumb` PII-scrub + dedupe/cap hooks. DSN via `EXPO_PUBLIC_SENTRY_DSN`; source-map upload needs `SENTRY_AUTH_TOKEN` in CI |
| `notifications.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                  | Expo Notifications: `scheduleDailyCheckin`, `scheduleWeeklySummary`, `fireRecurringTransactionNotification`, `syncScheduledNotifications`                                                                                                                        |
| `haptics.ts`                                                                                                                                                                       | `triggerHaptic('medium' \| 'selection' \| 'success' \| 'warning')`                                                                                                                                                                                               |
| `revenueCat.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                     | RevenueCat SDK: subscription state, purchase, restore                                                                                                                                                                                                            |
| `speechRecognition.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                              | On-device speech-to-text for voice quick-entry (`expo-speech-recognition`)                                                                                                                                                                                       |
| `autoBackup.ts` (+ `.native.ts`, `.shared.ts`) + `autoBackupProviders/`                                                                                                            | Daily auto-backup: `runAutoBackupIfDue`, `listAllBackups`, `restoreFromBackup`, `previewBackup`, `deleteBackup`, `isTargetAvailable`, Google Sign-In helpers                                                                                                     |
| `autoBackupTaskRegistration.ts`                                                                                                                                                    | Registers the `expo-background-task` task for periodic backup runs                                                                                                                                                                                               |
| `mmbakImportService.ts` + `mmbakImport/`                                                                                                                                           | Money Manager `.mmbackup` file import                                                                                                                                                                                                                            |
| `dataManagementService.ts`                                                                                                                                                         | Export, JSON backup/restore                                                                                                                                                                                                                                      |
| `biometricAuth.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                  | App Lock — Face ID / Touch ID / device-credential gate (`expo-local-authentication`)                                                                                                                                                                             |
| `exchangeRates.ts`                                                                                                                                                                 | Multi-currency FX: Frankfurter daily fetch, `refreshRatesNow`, `runRateRefreshIfDue`, staleness guard, offline-safe cache, manual overrides, historical rates                                                                                                    |
| `reviewPrompt.ts` (+ `.native.ts`, `.shared.ts`)                                                                                                                                   | In-app App Store / Play review request (`expo-store-review`)                                                                                                                                                                                                     |
| `speechRecognition.ts` + `voiceInputPermission.ts`                                                                                                                                 | On-device speech-to-text + mic permission flow for voice quick-entry                                                                                                                                                                                             |
| `widgetSnapshot.ts` (+ `.shared.ts`) + `widgetRegistry.ts`                                                                                                                         | Home-screen widget data snapshots and registry                                                                                                                                                                                                                   |
| `featureAnnouncementState.ts`                                                                                                                                                      | Tracks which `news` feature announcements have been seen                                                                                                                                                                                                         |
| `deepLinks.ts`                                                                                                                                                                     | Deep-link / URL routing into the app                                                                                                                                                                                                                             |
| `userAssets.ts`                                                                                                                                                                    | Profile avatar / user-supplied image asset handling                                                                                                                                                                                                              |
| `calendarNavigation.ts`, `insightsNavigation.ts`, `tabNavigation.ts`, `reviewPromptNavigation.ts`, `hourlyValueNavigation.ts`, `paywallNavigation.ts`, `transactionsNavigation.ts` | Imperative navigation helpers (route into a tab/screen from anywhere)                                                                                                                                                                                            |

Platform-split services (`.native.ts` / `.shared.ts`) use the `.native.ts` implementation on iOS/Android and `.shared.ts` as web/test fallback.

### Custom Hooks

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

### Styling

NativeWind (Tailwind CSS for React Native). Custom colors and theming defined in `tailwind.config.js`. Eight theme color palettes: sage, ocean, terracotta, slate, amber, indigo, emerald, rosewood (defined in `constants/designSystem.ts`). Class-based dark mode. Import path alias `~/` maps to the repo root.

### Types

All shared types are in `types/index.ts`:

- **Display**: `DisplayMode` ('money' | 'time'), `ThemeMode` ('system' | 'light' | 'dark'), `ThemeColor` (8 options), `UserMode` ('power' | 'simple'), `WageType` ('hourly' | 'monthly' | 'yearly'), `BackupTarget` ('local' | 'icloud' | 'googleDrive'), `WeekStartsOn` (0–6)
- **Domain**: `Account`, `AccountGroup`, `Category`, `Transaction`, `TransactionWithRelations`, `TransactionSplit`, `TransactionSplitsSummary`, `RecurringTransactionRule`, `ProcessedRecurringRule`, `MonthlyWageSettings`, `WageConfig`, `UserSettings`, `QuickEntryPrefs`, `Album`, `AlbumStats`, `AlbumWithStats`
- **Multi-currency**: `ExchangeRateSource` ('api' | 'manual'), `ExchangeRate`, `RateTable`, `RateRefreshResult`
- **Enums**: `TransactionSentiment` ('happy' | 'neutral' | 'sad'), `AccountType` ('debit' | 'credit'), `TransactionType` ('expense' | 'income' | 'transfer' | 'balance_adjustment'), `RecurringTransactionType` (TransactionType minus balance_adjustment), `CategoryType` ('expense' | 'income'), `RecurrencePattern` ('none' | 'daily' | 'weekly' | 'monthly' | 'yearly')
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

`I18n.t('key')` via i18n-js. Setup in `lib/i18n/index.ts` with device locale detection. **23 locales** are fully implemented in `lib/i18n/locales/` (da, de, en, es, fil, fr, hi, id, it, ja, ko, ms, nb, nl, pl, pt, ru, sv, th, tr, uk, vi, zh). English (`en.ts`) is the source of truth; falls back to English for unsupported locales. `__tests__/i18n/localeParity.test.ts` enforces that every locale has the same key set as `en.ts` — when you add a string to `en.ts`, add it to all locales or the parity test fails.

### Key Patterns

- **Simple Mode vs Power Mode**: `settings.userMode: 'simple' | 'power'`. `isSimpleMode` and `simpleWalletId` are available from `useApp()`. Simple mode hides the accounts tab and uses `SimpleActivityScreen` instead of `TransactionsScreen`.
- **Date keys**: Use `dayKeyFromDateLocal()`, `monthKeyFromDateLocal()`, `monthKeyFromDateIso()` etc. from `~/utils/formatters` — do not roll custom date logic.
- **Currency/hour formatting**: `formatAmount(value, settings, { showSign })` and `formatHours(value)`.
- **Haptics**: `void triggerHaptic('medium' | 'selection' | 'success' | 'warning')`.
- **Settings updates**: `updateSettings({ field: value })` from `useApp()`.
- **i18n**: `I18n.t('key')` — strings defined in `lib/i18n/locales/en.ts`.
- **Analytics**: `trackEvent(AnalyticsEvents.X, props)` from `~/services/analytics`.
- **Font scaling**: Disabled globally in `App.tsx` for both `Text` and `TextInput`.
- **Pro gating**: Use `useProGate()` hook or check `isPro` from `useProContext()`. Paywall via `ProPaywall` screen.
- **Platform-split services**: `.native.ts` for iOS/Android, `.shared.ts` for web fallback (analytics, notifications, revenueCat).
- **IDs**: Use `newId()` from `~/utils/id` for generating unique identifiers (UUID-based).
- **Error handling**: Use `getErrorMessage()` from `~/utils/errorHandling` to safely extract error messages.
- **Tablet layout**: Use `useDeviceLayout()` hook and `TabletContentContainer` for responsive layouts.
- **Multi-currency**: Each transaction stores its entered `currency` plus a frozen reporting-currency snapshot (`reportingCurrency`/`reportingAmount`/`fxRate`) taken at write time so historical aggregates never drift when FX rates move. Use `convert`/`buildRateTable` from `~/utils/currency`; never recompute historical totals from live rates. FX rates come from `services/exchangeRates.ts`.
- **Albums**: Trip albums are a Pro-limited feature (`FREE_MAX_ALBUMS`). One album can be "active" (`activeAlbumId`) so new transactions auto-add. Manage via `useApp()` album ops.
- **Budgeting**: Monthly, **expense-only** budgets built from reusable **budget templates** (`budget_templates`/`budget_template_categories`) — a template sets a total plus per-root-category allocations, an optional emoji, and a `count_unbudgeted` toggle (whether spend in categories with no line counts toward the month total). Each month gets a **frozen** budget row (`monthly_budgets`/`monthly_budget_categories`) copied from a template at creation; editing a template never rewrites already-created months, and soft-deleted month rows double as **tombstones** so auto-create (via `pickAutoCreateTemplate` in the `runDueTransactions` load path) never resurrects a month the user deleted. Exactly one template is the default while any exist. All screen/widget numbers come from the pure `buildBudgetMonthSummary` in `features/budget/lib/budgetMath.ts`, valuing spend at `reportingAmount ?? amount` (never drifts with FX). The month view is an **embedded Insights page** (`BudgetPagerView` inside `InsightsScreen`, chosen from the insights type menu, not a Settings tile); template/month/allocation editors are root-stack routes (`BudgetTemplateEditor`, `BudgetMonthEditor`, `BudgetCategoryAllocation`, `SettingsBudgetTemplates`). Pro-limited to `FREE_MAX_BUDGET_TEMPLATES`; two home-screen widgets (`budget_ring`, `budget_breakdown`) surface usage. Manage via `useApp()` budget ops.
- **Split bills & Settle Up**: Splits live on `transactionSplitsTable` (per-transaction). The `SettleUp` screen has two underline tabs — **By person** and **By transaction** — over the same pool of **unpaid**, non-self splits. By-person rolls up via `aggregateUnpaidSplitsByPerson` (grouped by trimmed/case-folded name); by-transaction rolls up via `aggregateUnpaidSplitsByTransaction` (one entry per bill, each carrying every person's share). Both live in `features/transactions/lib/settleUp.ts` and total in the reporting currency via each parent's frozen `fxRate`. Tapping a person opens `SettleUpPerson` (itemized bills); tapping a bill opens `SettleUpTransaction` (each person's share). Both full-page root screens support editable payback account, mark-paid, delete-request, and share. Share opens `SplitReceiptShareModal`, which previews a fixed-light `SplitReceiptCard` (banner logo, big QR, generic `ReceiptContent`: title + optional date subtitle + itemized lines + total, no footer) and captures it to a PNG via Skia's `makeImageFromView` (lazily imported) → `expo-sharing` for a cross-platform image share, falling back to a plain-text `buildReceiptText` receipt if capture fails. The user attaches their own payment QR (settings `paymentQrUri`, stored via the `payment-qr` `userAssets` kind). `useSettleUpSummary` / `useSettleUpByTransaction` wrap the two aggregations. The split editor (`SplitBillModal`, opened from the transaction editor's numpad toolbar) is a **pushed root screen** (`SplitBill`): the editor publishes its live split draft + callbacks through `context/SplitBillSession.tsx` and `SplitBillScreen` consumes them, mapping Done/Cancel (incl. swipe-back via `beforeRemove`) onto the editor's commit/discard. `SplitBillModal` renders bare in `presentation="page"` mode; it autocompletes friend names from past splits (`recentSplitPersonNames`). Reached from Settings → "Who owes you".
- **App Lock**: Biometric gate via `services/biometricAuth.ts`, configured in `AppLockScreen`; settings `biometricLockEnabled` / `biometricLockDelaySeconds`.
- **Feature announcements**: Add a numbered entry under `features/news/announcements/` and a matching `*Showcase`; seen-state tracked by `services/featureAnnouncementState.ts`.

### CI / Deploy

Single workflow at [.github/workflows/deploy.yml](.github/workflows/deploy.yml) with three jobs gated `test → plan → deploy`:

- **Test** — runs on every push, PR, and dispatch. Executes `npm ci`, `npm run check` (typecheck + lint + format), then `npm test`. A failure here blocks `plan` and `deploy`.
- **Plan** — push-to-main and manual-dispatch only. Resolves the build matrix (push = both iOS+Android production; dispatch = the chosen single platform/profile).
- **Deploy** — push-to-main and manual-dispatch only. `eas build --local` on the matched runner (macos-latest for iOS, ubuntu-latest for Android), then `eas submit`. `fail-fast: false` so a single-platform failure doesn't kill the other build.

Concurrency group `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true` — a new push to `main` cancels the in-flight run; new commits to a PR cancel previous test runs. Requires repo secret `EXPO_TOKEN`. Push to `main` auto-submits to TestFlight (iOS) + Play **production** (`production` track, Android); promote to App Store manually.

### ESLint Rules Worth Knowing

- Import sorting enforced via `simple-import-sort` (run `lint:fix` to auto-fix).
- `console.log` is disallowed; use `console.warn` or `console.error`.
- Type imports must use `import type`.
- React hooks exhaustive deps is an error.
- Variable shadowing is an error.
- No-build-path restrictions on moved modules (`~/lib/*` → `~/*`, `~/types/*`, `~/services/*`, `~/hooks/*`, `~/constants/*`).
