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

All route types are defined in `navigation/rootStack.ts`. Stack options live in `navigation/stackOptions.ts`.

### State Management
Global state lives in `context/AppContext.tsx` via the `useApp()` hook. This is the single source of truth for all DB data — wallets, transactions, categories, settings, recurring rules. All CRUD operations are methods on this context. There is no Redux, Zustand, or other state library.

`context/ThemeContext.tsx` handles theming separately.

### Database
SQLite via `expo-sqlite` + Drizzle ORM. Schema is in `lib/db/schema.ts`. The DB client is initialized in `lib/db/client.ts`, which also handles migrations (schema version tracked there, `SIMPLE_WALLET_NAME` constant defined there).

Data access goes through repositories in `lib/repositories/`. All tables use soft-deletes via a `deletedAt` column.

### Feature Structure
Features live under `features/` in domain folders (`home`, `insights`, `transactions`, `settings`, `onboarding`, `tutorial`). Each has `screens/` and sometimes `components/`. Shared UI primitives are in `components/ui/`.

### Styling
NativeWind (Tailwind CSS for React Native). Custom colors (coral, lavender, sky), spacing, and border radii are defined in `tailwind.config.js`. The theme is class-based dark mode. Import path alias `~/` maps to the repo root.

### Key Patterns
- **Simple Mode vs Power Mode**: `settings.userMode: 'simple' | 'power'`. `isSimpleMode` and `simpleWalletId` are available from `useApp()`. Simple mode hides the accounts tab and uses `SimpleActivityScreen` instead of `TransactionsScreen`.
- **Date keys**: Use `dayKeyFromDateLocal()`, `monthKeyFromIsoLocal()`, etc. from `~/utils/formatters` — do not roll custom date logic.
- **Currency/hour formatting**: `formatAmount(value, settings, { showSign })` and `formatHours(value)`.
- **Haptics**: `void triggerHaptic('medium' | 'selection' | 'success' | 'warning')`.
- **Settings updates**: `updateSettings({ field: value })` from `useApp()`.
- **i18n**: `I18n.t('key')` — strings defined in `lib/i18n/locales/en.ts`.
- **Analytics**: `trackEvent(AnalyticsEvents.X, props)` from `~/services/analytics`.
- **Font scaling**: Disabled globally in `App.tsx` for both `Text` and `TextInput`.

### ESLint Rules Worth Knowing
- Import sorting enforced via `simple-import-sort` (run `lint:fix` to auto-fix).
- `console.log` is disallowed; use `console.warn` or `console.error`.
- Type imports must use `import type`.
- React hooks exhaustive deps is an error.
