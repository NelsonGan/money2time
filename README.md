# money2time

A React Native expense tracker that lets you view spending as **money or as time** — every dollar reframed as hours of your life at your hourly rate. Local-first, offline, on-device.

## Tech stack

- **Expo SDK 54** + React Native 0.81.5 + React 19 (New Architecture enabled)
- **TypeScript** strict mode, path alias `~/*` → repo root
- **SQLite** via `expo-sqlite` + **Drizzle ORM** (58 migrations)
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
EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER=
EXPO_PUBLIC_MONEY2TIME_WORKERS_LIVE_EARNINGS=
EXPO_PUBLIC_REQUEST_SIGNING_KEY=
EXPO_PUBLIC_BRANDFETCH_CLIENT_ID=
BRANDFETCH_API_KEY=
```

The two Worker URLs point at the receipt-scan
([`cloudflare/workers/receipt-scanner/`](cloudflare/workers/receipt-scanner/README.md)) and live-earnings-push
([`cloudflare/workers/live-earnings/`](cloudflare/workers/live-earnings/README.md)) Cloudflare Workers. Their
provider secrets (OpenRouter, APNs) live only in the Workers — never in the app.
In CI, PR builds override the receipt-scan URL with the branch's Worker
**preview URL** so each branch talks to its own Worker.

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

`scripts/` also holds the asset-generation pipelines that are run by hand and
whose output is committed: category, clay, item and app icons; account and
subscription logos; the emoji catalog; the offline cities DB; and the tutorial
annotate → registry → website sync (see [CLAUDE.md](CLAUDE.md) for each).

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
│   ├── settings/               # All settings screens + nested stack
│   ├── onboarding/             # First-run flow (welcome, basics + tracking mode, wage, backup, source, notifications, features)
│   ├── tutorials/              # Searchable how-to guides, mirrored to money2time.com
│   ├── news/                   # In-app feature announcements & showcases
│   └── reviewPrompt/           # In-app store review request
├── context/
│   ├── AppContext.tsx          # Global state — useApp() + useTransactions()
│   ├── ThemeContext.tsx        # Theme color, icon style, light/dark resolution
│   ├── ProContext.tsx          # RevenueCat subscription state
│   ├── TabVisibilityContext.tsx # Lets hidden tabs skip recomputation
│   ├── ReceiptScanContext.tsx  # Background receipt-OCR jobs
│   └── SplitBillSession.tsx    # Hands the split draft to the pushed editor
├── navigation/                 # rootStack, settingsStack, stackOptions, swipeBackHaptics
├── hooks/                      # Cross-screen hooks (month paging, scroll-to-top, theme vars…)
├── services/                   # Device/integration services (see below)
├── lib/
│   ├── db/                     # SQLite client, schema, 58 migrations, currency/icon normalizers
│   ├── i18n/                   # i18n-js setup, 23 locales
│   └── repositories/           # Drizzle data-access layer
├── constants/                  # appDefaults, designSystem, motion, pager, proLimits, icons, accountLogos
├── utils/                      # Pure helpers (formatters, IDs, date keys, currency, error utils)
├── types/                      # Shared domain types
├── plugins/                    # Expo config plugins (widgets, auto-log, alternate icons)
├── cloudflare/                 # Receipt-scan + live-earnings Workers and their D1 schemas
├── scripts/                    # Icon/logo/tutorial generation pipelines
├── __tests__/                  # Jest tests (96 suites: utils, repositories, services, navigation, db, features, i18n)
└── .github/workflows/          # CI: deploy.yml (app), cloudflare.yml (Workers)
```

### Navigation

`App.tsx` mounts a single `RootStack`. The base screen `Main` renders `MainShellScreen`, which keeps five bottom-nav tabs mounted for fast switching: **calendar, accounts, insights, albums, settings** (the app is calendar-first).

The `calendar` tab is the home view (`CalendarScreen`, with three-level year/month/day zoom and a day pager). In simple mode the `accounts` tab is hidden and the activity list is rendered by `SimpleActivityScreen`. The `settings` tab hosts its own nested stack.

Editors, drilldowns and flows are pushed at the root level; everything under Settings lives in the nested stack. The two route lists are enumerated in [CLAUDE.md](CLAUDE.md) and defined in [navigation/rootStack.ts](navigation/rootStack.ts) and [navigation/settingsStack.ts](navigation/settingsStack.ts).

### State

All app data flows through `context/AppContext.tsx` — accounts, categories, settings, recurring rules, wages, albums, budgets, FX. CRUD operations are methods on the same context (no Redux/Zustand). The volatile transaction-derived state is split into a second context read with `useTransactions()`, so the app's most frequent mutation does not re-render every settings and account consumer. See [CLAUDE.md](CLAUDE.md) for the full API surface.

Other contexts:

- `context/ThemeContext.tsx` — resolved theme, color palette, icon style
- `context/ProContext.tsx` — RevenueCat subscription + paywall offering
- `context/TabVisibilityContext.tsx` — lets hidden tabs skip recomputation
- `context/ReceiptScanContext.tsx` — background receipt-OCR jobs
- `context/SplitBillSession.tsx` — hands the split draft to the pushed editor

### Database

SQLite (`money2time.db`) opened via `expo-sqlite`, queried with Drizzle. Schema in [lib/db/schema.ts](lib/db/schema.ts), migrations in [lib/db/migrations/](lib/db/migrations/). All tables use soft-deletes (`deletedAt`).

| Table                                    | Purpose                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `accountsTable`                          | Wallets (debit/credit), savings goals ('goal') and loans ('loan'), each with their own columns |
| `accountGroupsTable`                     | Groupings for accounts                                                                         |
| `categoriesTable`                        | Income/expense categories with parent (subcategory) support                                    |
| `transactionsTable`                      | Transactions (expense/income/transfer/balance-adjustment) + FX snapshot + reimbursement links  |
| `transactionSplitsTable`                 | Split-bill participants (with payback tracking) on a transaction                               |
| `receiptSplits*` (3 tables)              | Itemized receipt splits: header, line items, per-item person shares                            |
| `recurringRulesTable`                    | Templates that schedule future transactions                                                    |
| `exchangeRatesTable`                     | Cached FX rates (api/manual) per base→quote currency                                           |
| `albumsTable` / `albumTransactionsTable` | Trip albums (cover, date range, active flag) and their join table                              |
| `itemsTable`                             | Owned things, priced by cost-per-day                                                           |
| `budgetTemplates*` (2 tables)            | Reusable budget templates and their per-category allocations                                   |
| `monthlyBudgets*` (2 tables)             | The frozen budget copied into a given month, and its lines                                     |
| `monthlyWageSettingsTable`               | Per-month wage config (hourly/monthly/yearly + commute)                                        |
| `settingsTable`                          | Singleton row for app preferences (locale, currency, theme, mode, App Lock, FX, prefs JSON)    |

Repositories live in `lib/repositories/`; mapping between rows and domain types is in [lib/repositories/mappers.ts](lib/repositories/mappers.ts).

### Services

Most services are platform-split (`.native.ts` for iOS/Android, `.shared.ts` for web fallback).

| Service                                                                                             | Purpose                                                                                 |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `analytics.*`                                                                                       | Mixpanel: `trackEvent`, `identifyUser`, `setCurrentScreen`                              |
| `notifications.*`                                                                                   | Daily check-in, weekly summary, recurring-txn nudges (expo-notifications)               |
| `haptics.ts`                                                                                        | `triggerHaptic('medium' \| 'selection' \| 'success' \| 'warning')`                      |
| `revenueCat.*`                                                                                      | RevenueCat SDK — purchase, restore, customer state                                      |
| `speechRecognition.*`                                                                               | On-device speech-to-text for voice quick-entry                                          |
| `autoBackup.*` + `autoBackupProviders/`                                                             | Daily auto-backup to local / iCloud / Google Drive                                      |
| `autoBackupTaskRegistration.ts`                                                                     | Registers `expo-background-task` for daily backup runs                                  |
| `mmbakImportService.ts` + `mmbakImport/`                                                            | Money Manager `.mmbackup` import                                                        |
| `dataManagementService.ts`                                                                          | Export, JSON backup/restore                                                             |
| `exchangeRates.ts`                                                                                  | Multi-currency FX fetch/refresh (Frankfurter), cache, manual overrides                  |
| `biometricAuth.*`                                                                                   | App Lock — Face ID / Touch ID gate (expo-local-authentication)                          |
| `reviewPrompt.*`                                                                                    | In-app store review request (expo-store-review)                                         |
| `widgetSnapshot.*` + `widgetRegistry.ts`                                                            | Home-screen widget data snapshots                                                       |
| `liveActivity.ts`, `liveEarningsPush.ts`, `liveEarningsWidget.ts`                                   | The live-earnings Live Activity: ActivityKit bridge, push registration, widget timeline |
| `receiptScan.*`, `receiptImage.*`, `receiptPicker.ts`                                               | Receipt OCR against the Worker, plus the photo pick and downscale                       |
| `appIcon.*`                                                                                         | Alternate home-screen app icons                                                         |
| `errorReporting.*`                                                                                  | Sentry crash/error reporting                                                            |
| `excelExportService.ts` + `utils/xlsx.ts`                                                           | Excel (`.xlsx`) export, via a dependency-free writer                                    |
| `userAssetGc.ts`                                                                                    | Sweeps orphaned user-asset images                                                       |
| `featureAnnouncementState.ts`, `deepLinks.ts`, `userAssets.ts`                                      | News seen-state, deep-link routing, profile asset handling                              |
| `*Navigation.ts` (calendar, insights, tab, settings, review, hourlyValue, paywall, transactions, …) | Imperative navigation helpers used outside react-navigation context                     |

### Theming & i18n

NativeWind drives styles; theme colors live in [constants/designSystem.ts](constants/designSystem.ts) with palettes for **sage, ocean, terracotta, slate, amber, indigo, emerald, rosewood**. Dark mode is class-based.

i18n via `i18n-js` ([lib/i18n/index.ts](lib/i18n/index.ts)). **23 locales** shipped (da, de, en, es, fil, fr, hi, id, it, ja, ko, ms, nb, nl, pl, pt, ru, sv, th, tr, uk, vi, zh); device locale auto-detected with English fallback. `en.ts` is the source of truth and a parity test keeps every locale's key set in sync.

### Modes

`settings.userMode` is `'simple' | 'power'`. Simple mode hides the accounts tab, uses a single auto-created wallet (`SIMPLE_WALLET_NAME` in `lib/db/client.ts`), and renders `SimpleActivityScreen` for the activity list. `useApp()` exposes `isSimpleMode` and `simpleWalletId` globally.

## CI

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

## Tests

```bash
npm test
```

Jest with `ts-jest` over `__tests__/` (96 suites, node env). Modules with native deps are mocked via `__tests__/__mocks__/` (i18n, haptics, DB client, drizzle, expo-localization, image assets). Coverage skews to pure utilities, feature math, repository mappers, and navigation helpers — no React Native render tests.

## Code style

- ESLint via `expo lint`; import sorting enforced (`simple-import-sort`).
- Prettier for formatting; run `npm run lint:fix && npm run format` before opening a PR.
- `console.log` disallowed (use `console.warn`/`console.error`).
- `import type` required for type-only imports.
- React hooks exhaustive-deps is an error.
- Comment complex logic only — skip comments on self-documenting code.

See [CLAUDE.md](CLAUDE.md) for a deeper architecture reference aimed at AI assistants and new contributors.
