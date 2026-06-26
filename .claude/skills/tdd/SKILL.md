---
name: tdd
description: Test-driven development for the money2time codebase using Jest + ts-jest. Use when adding or changing logic in utils, repositories/mappers, services, navigation helpers, or i18n; when the user asks to write tests, do TDD, or improve coverage; or before refactoring pure logic. Write the failing test first, then the code. Knows what is testable here (node env, native deps mocked) and what is not (no RN render tests).
---

# TDD (money2time)

This project runs **Jest with `ts-jest` in a `node` test environment** (`jest.config.js`). Tests live in `__tests__/`, named `*.test.ts`. There are **no React Native render tests** — the test env has no native runtime. So TDD here targets the *logic* layers, which is where bugs actually hide.

Read `CLAUDE.md` for the architecture; this skill is how you build it test-first.

## The Red → Green → Refactor loop

1. **Red** — write the smallest test that captures the next behavior, and watch it fail for the right reason:
   `npx jest __tests__/path/to/file.test.ts -t "name"`
2. **Green** — write the minimum code to pass. No extra scope.
3. **Refactor** — clean up with the test as a safety net; keep it green.
4. Repeat. Run the focused file on each loop; run the full `npm test` before declaring done.

Never write the implementation before its test exists. If you're tempted to, write the assertion first.

## What is testable here (target these)

- **`utils/*` — pure functions. This is the sweet spot.** Formatters, currency conversion, date keys, balance computation, recurring-rule expansion, transaction sorting, parsing. No mocks needed; just call and assert. When logic lives in a component or context, **extract the pure core into `utils/` so it can be tested**, then have the caller use it.
- **`lib/repositories/*` + `mappers.ts`** — row↔domain mapping and query helpers. `drizzle-orm` and the db client are mocked (see below), so test mapping/transform logic and edge cases.
- **`services/*`** — exchange rates, review prompt, feature-announcement state, widget snapshot, deep links, navigation helpers. Test the `.shared.ts` / pure parts and the decision logic (staleness guards, "is due" checks, payload building).
- **`navigation/*`** helpers (e.g. `swipeBackHaptics`).
- **i18n parity** — `__tests__/i18n/localeParity.test.ts` guarantees every one of the 23 locales has the same key set as `en.ts`. **Adding a string key is a test-driven act: add to `en.ts`, run the parity test, watch it fail, add the key to all locales until green.**

## What is NOT testable here (don't try)

- React components / screens / hooks rendering (no RN renderer; `testEnvironment: node`).
- Anything requiring a real SQLite database, real device APIs, or Expo native modules at runtime.
- For UI behavior, verify with the **Argent MCP tools** instead (see `argent-test-ui-flow`), not Jest.

## Mocks and module mapping (already wired)

`jest.config.js` `moduleNameMapper` redirects native-coupled modules to fakes in `__tests__/__mocks__/`:

| Import | Mocked by |
| --- | --- |
| `~/lib/i18n` | `__mocks__/i18n.ts` |
| `~/services/haptics` | `__mocks__/haptics.ts` |
| `~/lib/db/client` | `__mocks__/dbClient.ts` |
| `expo-localization` | `__mocks__/expo-localization.ts` |
| `drizzle-orm` + `drizzle-orm/sqlite-core` | `__mocks__/drizzle.ts` |

The `~/*` alias resolves to repo root. If you introduce a new native dependency in code under test, add a mapping/mock here **as part of the same change** or the suite won't load.

## Conventions to match

- Mirror the source path under `__tests__/` (e.g. `utils/currency.ts` → `__tests__/utils/currency.test.ts`).
- Use `describe`/`it` with behavior-focused names ("includes the base at 1 and tracks the latest asOfDate"), like the existing suites.
- Build inputs with small typed factory helpers (see `rate()` in `__tests__/utils/currency.test.ts`) instead of repeating literals.
- Import domain types from `~/types`; import the unit under test by `~/...` path.
- Cover the **edge cases the domain cares about**: empty data, soft-deleted rows, multi-currency vs single-currency, transfers (no category), missing FX rate, simple vs power mode, month/timezone boundaries, recurrence end dates.

## Commands

```bash
npx jest <path>                 # one file
npx jest <path> -t "substring"  # one test by name
npm test                        # full suite (CI runs this after `npm run check`)
```

CI (`.github/workflows/deploy.yml`) gates builds on `npm run check && npm test`, so a red test blocks deploy. Keep the suite green.

## Definition of done

- New/changed logic has a test that was written first and fails without the implementation.
- Edge cases enumerated above are covered where relevant.
- Pure logic was extracted to `utils/` where it made the behavior unit-testable.
- New string keys exist in all 23 locales (parity test green).
- New native deps have mocks wired in `moduleNameMapper`.
- `npm test` and `npm run check` both pass.

## Anti-patterns

- Writing the implementation first and back-filling a test that just mirrors it.
- Trying to render a screen/hook in Jest (won't work — use Argent).
- Leaving logic embedded in a component because "it can't be tested" — extract the pure part instead.
- Asserting on incidental output (exact whitespace, full object dumps) instead of the behavior that matters.
- Adding an `en.ts` key without updating the other locales (breaks the parity suite).
