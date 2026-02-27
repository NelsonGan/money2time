# Money2Time Conventions

This document defines the default patterns for this repository. Keep behavior
and UX the same when refactoring unless a fix is intentional and isolated.

## Folder structure

Current feature-oriented structure:

```text
components/
  feedback/
  navigation/
  ui/
constants/
context/
features/
  <feature>/components
  <feature>/screens
hooks/
lib/
  db/
  repositories/
  i18n/
navigation/
services/
types/
utils/
```

Rules:

- Keep domain screens/components under `features/<feature>/...`.
- Keep cross-feature primitives in `components/ui`.
- Keep navigation types/config in `navigation/`.
- Keep persistence/repository code in `lib/db` and `lib/repositories`.
- Keep side-effect services in `services/`.

## Naming rules

- Components: `PascalCase` symbol names (`SettingsScreen`, `TransactionItem`).
- Hooks: `useX` (`useThemeColors`, `useEdgeSwipeBack`).
- Utilities/functions: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` for true constants, `camelCase` for maps/config objects.
- Prefer one exported component per file unless tiny private subcomponents are
  tightly coupled.

## Component patterns

- Prefer named exports for components.
- Import shared UI primitives from `~/components/ui` (barrel) rather than
  deep module paths.
- Type props with interfaces.
- Keep presentational components pure; push data mutations into context/services.
- Memoize selectively (`React.memo`, `useMemo`, `useCallback`) only for
  expensive trees or hot paths.
- Avoid inline object/function creation inside `renderItem` for long lists unless
  required by a library.

## Hooks patterns

- Keep custom hooks in `hooks/` unless feature-scoped.
- Return stable values and callbacks when consumers are memoized.
- Always satisfy `react-hooks/exhaustive-deps`; refactor instead of disabling.
- Use effects for synchronization/side effects only, not derived state.

## Styling rules

- Default to NativeWind `className` for static styling.
- Use `StyleSheet.create` for shared style objects and performance-sensitive
  dynamic styles.
- Keep design tokens in `constants/designSystem.ts`.
- Reuse shared UI primitives (`Button`, `Card`, `Input`, `Text`, etc.) before
  creating one-off controls.

## Error handling

- Normalize unknown errors with `toError` and display user-safe messages via
  `getErrorMessage`.
- Keep recoverable failures in UI flows (alerts, empty/error states) instead of
  crashing.
- Reserve `throw` for truly unrecoverable programming errors.

## Navigation rules

- Root stack route types live in `navigation/rootStack.ts`.
- Settings stack route types live in `navigation/settingsStack.ts`.
- Shared native stack options live in `navigation/stackOptions.ts`.
- Shared swipe/back haptics listeners live in `navigation/swipeBackHaptics.ts`.
- Route params must be typed; avoid untyped stringly navigation payloads.

## Add a new screen or feature

1. Add screen/component files under `features/<feature>/screens` or
   `features/<feature>/components`.
2. Add/extend typed route params in the relevant navigator file.
3. Reuse `components/ui` primitives and design tokens.
4. Keep data access in context/repositories/services, not directly in UI files.
5. Add or update i18n strings in `lib/i18n/locales/en.ts`.
6. Run `npm run lint`, `npm run typecheck`, and `npm run format:check`.
