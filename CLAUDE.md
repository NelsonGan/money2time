# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start development server (always use tunnel)
EXPO_TUNNEL_SUBDOMAIN=nikia-nonadaptive-hugeously npx expo start --tunnel --clear

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
```

There is no test suite — no Jest, Vitest, or test files exist in this project.

## Architecture

### Navigation

`App.tsx` is the root. It contains a single `RootStack` (NativeStack) with `MainShellScreen` as the base screen. `MainShellScreen` renders a `BottomNav` (5 tabs: home, activity, insights, accounts, settings) overlaying a tab-based content area. Modal/push screens (editors, drilldowns, flows) are registered at the root stack level.

**Root stack screens** (defined in `navigation/rootStack.ts`):
`Main`, `AddTransaction`, `EditTransaction`, `AccountDetail`, `InsightsDrilldown`, `RecurringEditor`, `SettingsRecurring`, `SettingsAccounts`, `SettingsHourlyValue`, `SettingsWageCalculator`, `ProPaywall`, `AIChat`.

**Settings has its own nested stack** (`navigation/settingsStack.ts`):
`SettingsHome`, `DisplaySettings`, `HourlyValue`, `WageCalculator`, `AccountSettings`, `Accounts`, `Categories`, `CategoriesSubcategories`, `Recurring`, `Notifications`, `NotificationDetail`, `DataManagement`, `StatementImport`, `StatementImportList`, `ProManagement`.

Stack options live in `navigation/stackOptions.ts` (headerShown: false, slide animations, gesture-enabled back).

### State Management

Global state lives in `context/AppContext.tsx` via the `useApp()` hook. This is the single source of truth for all DB data — wallets, transactions, categories, settings, recurring rules, monthly wages, account balances. All CRUD operations are methods on this context. There is no Redux, Zustand, or other state library.

Key properties from `useApp()`:

- **State**: `isLoading`, `settings`, `currentMonthWage`, `accounts`, `accountGroups`, `categories`, `transactions`, `filteredTransactions`, `monthlyWages`, `accountBalances`, `recurringRules`, `transactionFilters`, `activeAccountFilter`
- **Account ops**: `createAccount`, `updateAccount`, `deleteAccount`, `reorderAccounts`, `createAccountGroup`, `renameAccountGroup`, `deleteAccountGroup`, `reorderAccountGroups`
- **Transaction ops**: `createTransaction`, `updateTransaction`, `deleteTransaction`, `updateTransactionsBulk`, `deleteTransactionsBulk`
- **Category ops**: `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories`
- **Recurring ops**: `createRecurringRule`, `updateRecurringRule`, `deleteRecurringRule`
- **Settings ops**: `updateSettings`, `updateWageConfig`, `updateWageConfigForMonth`, `deleteWageConfigForMonth`, `toggleDisplayMode`, `canUseTimeDisplayMode`
- **Queries**: `getAccountById`, `getCategoryById`, `getTransactionsByAccount`, `queryTransactions`, `getCashflowSummary`, `getExpenseBreakdownByCategory`, `getExpenseBreakdownBySubcategory`, `getIncomeBreakdown`, `getTransfersBetweenAccounts`, `getTrueHourlyRateForDate`, `getDisplayValueForTransaction`
- **Data management**: `resetTransactionsOnly`, `resetAllData`, `importMoneyManagerBackup`
- **Mode helpers**: `isSimpleMode`, `simpleWalletId`, `completeOnboarding`, `switchToSimpleMode`, `switchToPowerMode`, `deleteSimpleWalletAndTransactions`
- **Preferences**: `insightsPreferencesJson`, `updateInsightsPreferencesJson`, `notificationPrefs`, `updateNotificationPrefs`

Other contexts:

- `context/ThemeContext.tsx` — theme management: `resolvedTheme`, `themeColor`, `useResolvedTheme()`, `useThemeColor()`
- `context/ProContext.tsx` — RevenueCat subscription state: `isPro`, `isLoading`, `customerState`, `offering`, `purchasePackage`, `restorePurchases`, `refresh`

### Database

SQLite via `expo-sqlite` + Drizzle ORM. Schema is in `lib/db/schema.ts`. The DB client is initialized in `lib/db/client.ts` (database file: `money2time.db`, 15 migrations, `SIMPLE_WALLET_NAME` constant defined there).

**Tables** (all use soft-deletes via `deletedAt`):

| Table                      | Key columns                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountsTable`            | id, name, sortOrder, type (debit/credit), accountGroup, currency, startingBalance, includeInTotals                                                               |
| `accountGroupsTable`       | id, name, sortOrder                                                                                                                                              |
| `categoriesTable`          | id, name, sortOrder, type (expense/income), parentId, icon, isDefault                                                                                            |
| `transactionsTable`        | id, type (expense/income/transfer/balance_adjustment), amount, currency, date, accountId, categoryId, note, recurrence fields, sentiment                         |
| `recurringRulesTable`      | id, name, type, amount, accountId, categoryId, recurrencePattern, recurrenceInterval, nextRunDate, isActive                                                      |
| `settingsTable`            | id, appUserId, locale, currencyCode, displayMode, themeMode, themeColor, userMode, ai-chat fields, insightsPrefsJson, notificationPrefsJson, onboardingCompleted |
| `monthlyWageSettingsTable` | id, month (YYYY-MM), wageType, wageAmount, hoursWorkedPerWeek, workdaysPerWeek, commuteMinutesPerWorkday, baseHourlyRate, trueHourlyRate                         |

Data access goes through repositories in `lib/repositories/`: `accountsRepository`, `accountGroupsRepository`, `categoriesRepository`, `transactionsRepository`, `recurringRulesRepository`, `settingsRepository`, `monthlyWageRepository`, plus `mappers.ts` for DB row → domain type transformations.

### Feature Structure

Features live under `features/` in domain folders. Each has `screens/` and sometimes `components/`, `services/`, `constants/`.

| Feature         | Purpose                                                               | Key screens                                                                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home/`         | Dashboard with balance, income/expense summary, sentiment             | `HomeScreen`                                                                                                                                                                                                                                    |
| `transactions/` | Transaction CRUD, month-paged activity list, search, bulk edit        | `TransactionsScreen`, `AddTransactionScreen`, `EditTransactionScreen`, `SimpleActivityScreen`                                                                                                                                                   |
| `settings/`     | All configuration, account/category management, data import/export    | `SettingsScreen`, `DisplaySettingsScreen`, `HourlyValueScreen`, `AccountsScreen`, `CategoriesScreen`, `RecurringScreen`, `NotificationsScreen`, `DataManagementScreen`, `StatementImportScreen`, `ProPaywallScreen`, `WageCalculatorFlowScreen` |
| `insights/`     | Analytics charts — expense trends, category breakdown, sentiment      | `InsightsScreen`, `InsightsDrilldownScreen`                                                                                                                                                                                                     |
| `onboarding/`   | First-time setup flow: mode, wage, preferences, notifications         | `OnboardingFlow` + step screens                                                                                                                                                                                                                 |
| `ai-chat/`      | Local LLM chat for natural-language transaction creation via llama.rn | `AIChatScreen`                                                                                                                                                                                                                                  |
| `tutorial/`     | Coach-mark overlays for first-use guidance                            | `TutorialCoachmarkOverlay`                                                                                                                                                                                                                      |

Shared UI primitives are in `components/ui/` (button, text, input, select, card, toggle, theme-modal, settings, SentimentIcons, time-value-inline).

Other shared components: `components/feedback/` (EmptyState, AppErrorBoundary, Mascot), `components/navigation/` (BottomNav, MonthControlsHeader, InOutHeader, FilterIconButton), `components/icons/` (NavIcons via Lucide), `components/layout/` (TabletContentContainer).

### Services

| Service                                           | Purpose                                                                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics.ts` (+ `.native.ts`, `.shared.ts`)     | Mixpanel: `trackEvent`, `identifyUser`, `setCurrentScreen`, `flushAnalytics`                                                              |
| `notifications.ts` (+ `.native.ts`, `.shared.ts`) | Expo Notifications: `scheduleDailyCheckin`, `scheduleWeeklySummary`, `fireRecurringTransactionNotification`, `syncScheduledNotifications` |
| `haptics.ts`                                      | `triggerHaptic('medium' \| 'selection' \| 'success' \| 'warning')`                                                                        |
| `revenueCat.ts` (+ `.native.ts`, `.shared.ts`)    | RevenueCat SDK: subscription state, purchase, restore                                                                                     |
| `mmbakImportService.ts`                           | Money Manager .mmbackup file import                                                                                                       |
| `dataManagementService.ts`                        | Export/backup functionality                                                                                                               |
| `hourlyValueNavigation.ts`                        | Navigation helper for hourly value settings                                                                                               |
| `paywallNavigation.ts`                            | Navigation helper for pro paywall                                                                                                         |
| `transactionsNavigation.ts`                       | Navigation helper for transactions/activity                                                                                               |

Platform-split services (`.native.ts` / `.shared.ts`) use the `.native.ts` implementation on iOS/Android and `.shared.ts` as web fallback.

### Custom Hooks

| Hook                            | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `useMonthPager`                 | Month paging with scroll callbacks          |
| `useScrollToTopTokenNavigation` | Scroll-to-top on tab navigation             |
| `useIndexedScrollToTopRefs`     | Track multiple scrollable refs              |
| `useThemeVars`                  | Access theme color scheme CSS variables     |
| `useThemeColors`                | Get theme-specific color values             |
| `useEdgeSwipeBack`              | Handle edge-swipe back gestures             |
| `useProGate`                    | Gate features behind Pro subscription       |
| `useFocusMonthNavigation`       | Navigate to specific month on screen focus  |
| `useDeviceLayout`               | Detect tablet vs phone layout               |
| `usePersistedJsonSnapshot`      | Persist/restore JSON state via AsyncStorage |
| `usePressScale`                 | Animated press scaling effect               |

### Styling

NativeWind (Tailwind CSS for React Native). Custom colors and theming defined in `tailwind.config.js`. Eight theme color palettes: sage, ocean, terracotta, slate, amber, indigo, emerald, rosewood (defined in `constants/designSystem.ts`). Class-based dark mode. Import path alias `~/` maps to the repo root.

### Types

All shared types are in `types/index.ts`:

- **Display**: `DisplayMode` ('money' | 'time'), `ThemeMode` ('system' | 'light' | 'dark'), `ThemeColor` (8 options), `UserMode` ('power' | 'simple'), `WageType` ('hourly' | 'monthly' | 'yearly')
- **Domain**: `Account`, `AccountGroup`, `Category`, `Transaction`, `TransactionWithRelations`, `RecurringTransactionRule`, `MonthlyWageSettings`, `UserSettings`
- **Enums**: `TransactionSentiment` ('happy' | 'neutral' | 'sad'), `AccountType` ('debit' | 'credit'), `CategoryType` ('expense' | 'income'), `RecurrencePattern` ('none' | 'daily' | 'weekly' | 'monthly' | 'yearly')
- **Queries**: `TransactionFilters`, `AccountBalance`, `CashflowSummary`, `BreakdownItem`, `DateRange`, `NotificationPreferences`

### Constants

| File                        | Contents                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `constants/appDefaults.ts`  | Default wage config, transaction filters, currency defaults, account templates, category emojis |
| `constants/designSystem.ts` | Color palettes for all 8 themes, spacing, typography, theme-specific styles                     |
| `constants/motion.ts`       | Animation timings and easing curves                                                             |
| `constants/pager.ts`        | Pagination constants                                                                            |
| `constants/proLimits.ts`    | Free tier transaction limits                                                                    |

### i18n

`I18n.t('key')` via i18n-js. Setup in `lib/i18n/index.ts` with device locale detection. Two locales implemented: English (`lib/i18n/locales/en.ts`) and Chinese (`lib/i18n/locales/zh.ts`). Falls back to English for unsupported locales. Locale labels exist for es, fr, de, pt, ja, ko (strings not yet implemented).

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

### ESLint Rules Worth Knowing

- Import sorting enforced via `simple-import-sort` (run `lint:fix` to auto-fix).
- `console.log` is disallowed; use `console.warn` or `console.error`.
- Type imports must use `import type`.
- React hooks exhaustive deps is an error.
- Variable shadowing is an error.
- No-build-path restrictions on moved modules (`~/lib/*` → `~/*`, `~/types/*`, `~/services/*`, `~/hooks/*`, `~/constants/*`).
