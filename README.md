# money2time

A React Native expense tracker that lets you view spending as **money or as time** — every dollar reframed as hours of your life at your hourly rate. Local-first, offline, on-device.

## Tech stack

- **Expo SDK 54** + React Native 0.81.5 + React 19 (New Architecture enabled)
- **TypeScript** strict mode, path alias `~/*` → repo root
- **SQLite** via `expo-sqlite` + **Drizzle ORM** (44 migrations)
- **NativeWind 4** (Tailwind for React Native) — class-based dark mode, 8 theme colors
- **React Navigation** native stack (root + nested settings stack)
- **react-native-reanimated 4** + Skia + gifted-charts for animation and visualizations
- **Mixpanel** analytics, **RevenueCat** subscriptions, **expo-notifications**
- **expo-speech-recognition** for voice quick-entry
- **react-native-cloud-storage** + Google Sign-In for iCloud / Google Drive backup

## Prerequisites

- Node.js 20+ and npm 9+
- Xcode (iOS) / Android Studio (Android) for simulator builds
- For local EAS builds: `ANDROID_HOME=$HOME/Library/Android/sdk` exported

## Setup

```bash
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
EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER=https://workers-receipt-scanner.money2time.com
```

`EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER` points at the receipt-scan Cloudflare
Worker (see [`worker/`](worker/README.md)). The Featherless API key lives only
in the Worker's secrets — never in the app. In CI, PR builds override this with
the branch's Worker **preview URL** so each branch talks to its own Worker.

## Scripts

| Script                 | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm start`            | `expo start`                                       |
| `npm run ios`          | Sync icons → `expo run:ios`                        |
| `npm run android`      | Sync icons → `expo run:android`                    |
| `npm run web`          | `expo start --web`                                 |
| `npm run typecheck`    | `tsc --noEmit`                                     |
| `npm run lint`         | `expo lint`                                        |
| `npm run lint:fix`     | `expo lint --fix`                                  |
| `npm run format`       | Prettier write                                     |
| `npm run format:check` | Prettier check                                     |
| `npm run check`        | typecheck + lint + format check                    |
| `npm test`             | Jest (`__tests__/**/*.test.ts`, ts-jest, node env) |
| `npm run sync:icons`   | Copy adaptive-icon assets into native folders      |

## Architecture

```text
money2time/
├── App.tsx                     # Root navigator + MainShellScreen (tab orchestrator)
├── index.ts                    # Expo entrypoint
├── app.json / app.config.ts    # Expo config
├── eas.json                    # EAS build & submit profiles
├── assets/                     # Icons, splash, brand
├── bootstrap/                  # App init hooks
├── components/
│   ├── ui/                     # Button, Card, Input, Text, Toggle, Select, sheets…
│   ├── feedback/               # EmptyState, AppErrorBoundary, Mascot
│   ├── icons/                  # Lucide NavIcons
│   ├── layout/                 # TabletContentContainer
│   └── navigation/             # BottomNav, MonthControlsHeader, InOutHeader
├── features/
│   ├── calendar/               # Calendar tab (month grid)
│   ├── insights/               # Charts: trends, breakdowns, sentiment
│   ├── onboarding/             # 5-step first-run flow
│   ├── settings/               # All settings screens + nested stack
│   ├── transactions/           # Activity list, add/edit, quick-add, voice, split-bill
│   ├── albums/                 # Trip albums — group transactions, cover, breakdown
│   ├── news/                   # In-app feature announcements & showcases
│   ├── tutorial/               # Coach-mark overlay
│   └── reviewPrompt/           # In-app store review request
├── context/
│   ├── AppContext.tsx          # Global state — single useApp() hook
│   ├── ThemeContext.tsx        # Theme color + light/dark resolution
│   └── ProContext.tsx          # RevenueCat subscription state
├── navigation/                 # rootStack, settingsStack, stackOptions, swipeBackHaptics
├── hooks/                      # Cross-screen hooks (month paging, scroll-to-top, theme vars…)
├── services/                   # Device/integration services (see below)
├── lib/
│   ├── db/                     # SQLite client, schema, 28 migrations, currency normalizer
│   ├── i18n/                   # i18n-js setup, 23 locales
│   └── repositories/           # Drizzle data-access layer
├── constants/                  # appDefaults, designSystem, motion, pager, proLimits, icons, accountLogos
├── utils/                      # Pure helpers (formatters, IDs, date keys, currency, error utils)
├── types/                      # Shared domain types
├── scripts/                    # sync-icons.mjs
├── __tests__/                  # Jest tests (29 suites: utils, repositories, services, navigation, db, features, i18n)
└── .github/workflows/          # CI: deploy.yml (test → build → submit)
```

### Navigation

`App.tsx` mounts a single `RootStack`. The base screen `Main` renders `MainShellScreen`, which keeps five bottom-nav tabs mounted for fast switching: **calendar, accounts, insights, albums, settings** (the app is calendar-first).

The `calendar` tab is the home view (`CalendarScreen`, with three-level year/month/day zoom and a day pager). In simple mode the `accounts` tab is hidden and the activity list is rendered by `SimpleActivityScreen`. The `settings` tab hosts its own nested stack.

- **Root stack** ([navigation/rootStack.ts](navigation/rootStack.ts)): `Main`, `AddTransaction`, `AddTransactionDetailed`, `EditTransaction`, `AccountDetail`, `InsightsDrilldown`, `RecurringEditor`, `SettingsRecurring`, `SettingsAccounts`, `SettingsHourlyValue`, `SettingsQuickEntry`, `SettingsMultiCurrency`, `SettingsWageCalculator`, `ShareAndEarn`, `ProPaywall`, `CreateAlbum`, `AlbumDetail`, `EditAlbumTransactions`, `AddAlbumTransactions`, `EditAlbumDetails`.
- **Settings stack** ([navigation/settingsStack.ts](navigation/settingsStack.ts)): `SettingsHome`, `DisplaySettings`, `HourlyValue`, `WageCalculator`, `AccountSettings`, `Accounts`, `ExchangeRates`, `Categories`, `Recurring`, `Notifications`, `NotificationDetail`, `DataManagement`, `News`, `AutoBackupSettings`, `StatementImport`, `StatementImportList`, `ProManagement`, `ShareAndEarn`, `QuickEntrySettings`, `AppLock`, `WidgetPreviews`.

### State

All app data flows through `context/AppContext.tsx` via the `useApp()` hook — accounts, transactions, categories, settings, recurring rules, monthly wages, balances. CRUD operations are methods on the same context (no Redux/Zustand). See [CLAUDE.md](CLAUDE.md) for the full API surface.

Two other contexts:

- `context/ThemeContext.tsx` — resolved theme + color palette
- `context/ProContext.tsx` — RevenueCat subscription + paywall offering

### Database

SQLite (`money2time.db`) opened via `expo-sqlite`, queried with Drizzle. Schema in [lib/db/schema.ts](lib/db/schema.ts), migrations in [lib/db/migrations/](lib/db/migrations/). All tables use soft-deletes (`deletedAt`).

| Table                      | Purpose                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `accountsTable`            | Wallets (debit/credit), starting balance, currency, sort order                                 |
| `accountGroupsTable`       | Groupings for accounts                                                                         |
| `categoriesTable`          | Income/expense categories with parent (subcategory) support                                    |
| `transactionsTable`        | Transactions (expense/income/transfer/balance-adjustment) + multi-currency FX snapshot columns |
| `transactionSplitsTable`   | Split-bill participants (with payback tracking) on a transaction                               |
| `recurringRulesTable`      | Templates that schedule future transactions                                                    |
| `exchangeRatesTable`       | Cached FX rates (api/manual) per base→quote currency                                           |
| `albumsTable`              | Trip albums (cover, date range, active flag)                                                   |
| `albumTransactionsTable`   | Album ↔ transaction join table                                                                 |
| `monthlyWageSettingsTable` | Per-month wage config (hourly/monthly/yearly + commute)                                        |
| `settingsTable`            | Singleton row for app preferences (locale, currency, theme, mode, App Lock, FX, prefs JSON)    |

Repositories live in `lib/repositories/`; mapping between rows and domain types is in [lib/repositories/mappers.ts](lib/repositories/mappers.ts).

### Services

Most services are platform-split (`.native.ts` for iOS/Android, `.shared.ts` for web fallback).

| Service                                                                                      | Purpose                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `analytics.*`                                                                                | Mixpanel: `trackEvent`, `identifyUser`, `setCurrentScreen`                |
| `notifications.*`                                                                            | Daily check-in, weekly summary, recurring-txn nudges (expo-notifications) |
| `haptics.ts`                                                                                 | `triggerHaptic('medium' \| 'selection' \| 'success' \| 'warning')`        |
| `revenueCat.*`                                                                               | RevenueCat SDK — purchase, restore, customer state                        |
| `speechRecognition.*`                                                                        | On-device speech-to-text for voice quick-entry                            |
| `autoBackup.*` + `autoBackupProviders/`                                                      | Daily auto-backup to local / iCloud / Google Drive                        |
| `autoBackupTaskRegistration.ts`                                                              | Registers `expo-background-task` for daily backup runs                    |
| `mmbakImportService.ts` + `mmbakImport/`                                                     | Money Manager `.mmbackup` import                                          |
| `dataManagementService.ts`                                                                   | Export, JSON backup/restore                                               |
| `exchangeRates.ts`                                                                           | Multi-currency FX fetch/refresh (Frankfurter), cache, manual overrides    |
| `biometricAuth.*`                                                                            | App Lock — Face ID / Touch ID gate (expo-local-authentication)            |
| `reviewPrompt.*`                                                                             | In-app store review request (expo-store-review)                           |
| `widgetSnapshot.*` + `widgetRegistry.ts`                                                     | Home-screen widget data snapshots                                         |
| `featureAnnouncementState.ts`, `deepLinks.ts`, `userAssets.ts`                               | News seen-state, deep-link routing, profile asset handling                |
| `*Navigation.ts` (calendar, insights, tab, hourlyValue, paywall, transactions, reviewPrompt) | Imperative navigation helpers used outside react-navigation context       |

### Theming & i18n

NativeWind drives styles; theme colors live in [constants/designSystem.ts](constants/designSystem.ts) with palettes for **sage, ocean, terracotta, slate, amber, indigo, emerald, rosewood**. Dark mode is class-based.

i18n via `i18n-js` ([lib/i18n/index.ts](lib/i18n/index.ts)). **23 locales** shipped (da, de, en, es, fil, fr, hi, id, it, ja, ko, ms, nb, nl, pl, pt, ru, sv, th, tr, uk, vi, zh); device locale auto-detected with English fallback. `en.ts` is the source of truth and a parity test keeps every locale's key set in sync.

### Modes

`settings.userMode` is `'simple' | 'power'`. Simple mode hides the accounts tab, uses a single auto-created wallet (`SIMPLE_WALLET_NAME` in `lib/db/client.ts`), and renders `SimpleActivityScreen` for the activity list. `useApp()` exposes `isSimpleMode` and `simpleWalletId` globally.

## CI

One workflow ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)), three jobs:

| Job      | Runs on                                          | What it does                                                                            |
| -------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `test`   | every push, every PR, every dispatch             | `npm ci` → `npm run check` (typecheck + lint + format) → `npm test`                     |
| `plan`   | push to `main` + manual dispatch (skipped on PR) | Resolves the build matrix (push = both platforms production; dispatch = the chosen one) |
| `deploy` | push to `main` + manual dispatch (skipped on PR) | `eas build --local` on macos-latest (iOS) / ubuntu-latest (Android), then `eas submit`  |

`deploy` needs `plan` needs `test` — a failing test blocks the build. Concurrency cancels in-flight runs when a newer commit lands on the same ref. Requires repo secret `EXPO_TOKEN`. Pushes to `main` auto-submit to TestFlight + Play Internal.

## Tests

```bash
npm test
```

Jest with `ts-jest` over `__tests__/`. Modules with native deps are mocked via `__tests__/__mocks__/` (i18n, haptics, DB client, drizzle, expo-localization). Coverage skews to pure utilities, repository mappers, and navigation helpers — no React Native render tests.

## Code style

- ESLint via `expo lint`; import sorting enforced (`simple-import-sort`).
- Prettier for formatting; run `npm run lint:fix && npm run format` before opening a PR.
- `console.log` disallowed (use `console.warn`/`console.error`).
- `import type` required for type-only imports.
- React hooks exhaustive-deps is an error.
- Comment complex logic only — skip comments on self-documenting code.

See [CLAUDE.md](CLAUDE.md) for a deeper architecture reference aimed at AI assistants and new contributors.
