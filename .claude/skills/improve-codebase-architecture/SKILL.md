---
name: improve-codebase-architecture
description: Evaluate and improve the structural health of the money2time codebase — layering, module boundaries, separation of concerns, dead code, duplication, and consistency. Use when refactoring, when a feature is growing messy, when deciding where new code belongs, when reviewing architecture, or when the user asks to clean up / restructure / reduce coupling. Preserves the existing layered architecture; does not rewrite it.
---

# Improve codebase architecture (money2time)

Read `CLAUDE.md` first — it is the canonical architecture map. This skill is about *keeping the codebase true to that map* and improving it incrementally, not redesigning it.

## The intended architecture (respect the layers)

Data flows in one direction. Each layer may only depend on the ones below it:

```
Screens / Components (features/*, components/*)
        │  read state + call ops via useApp()
        ▼
Context (context/AppContext.tsx, ThemeContext, ProContext)   ← single source of truth
        │  calls
        ▼
Repositories (lib/repositories/*)   ← the ONLY place that touches Drizzle/SQLite
        │  maps rows via mappers.ts
        ▼
Database (lib/db/schema.ts, client.ts, migrations/)
```

Cross-cutting:
- **Services** (`services/*`) wrap device/integration concerns (analytics, notifications, FX, biometrics, backup, speech, widgets). Platform-split as `.native.ts` / `.shared.ts`.
- **Pure helpers** (`utils/*`) — no React, no DB, no I/O. Easy to unit-test.
- **Types** (`types/index.ts`) — shared domain types, the contract between layers.
- **Constants** (`constants/*`) — static config/design tokens.

## Boundary rules to enforce

1. **No DB access outside repositories.** Components and services must not import `drizzle`, the schema tables, or the db client. If you see Drizzle queries in a screen or context method that should be in a repo, that's a violation — push it down into `lib/repositories/`.
2. **Components don't reach past the context.** Screens/components get data and operations from `useApp()` / `useThemeColors()` / `useProGate()` — never from repositories or the DB directly.
3. **Mappers own row↔domain translation.** Repositories return domain types (from `types/`) via `lib/repositories/mappers.ts`; raw `*Row` types from `schema.ts` must not leak above the repository layer.
4. **Utils stay pure.** Anything in `utils/` that imports React, a repository, or a service is misplaced. Pure functions are where tests are cheap — favor moving logic here.
5. **Feature isolation.** Code specific to one feature lives under `features/<feature>/`. Promote to `components/`, `hooks/`, `utils/`, or `services/` only when a *second* consumer appears. Avoid premature sharing and cross-feature imports between sibling features.
6. **Platform splits stay symmetric.** A `.native.ts` and `.shared.ts` pair must export the same surface, re-exported by the base `.ts`. Keep them in sync.
7. **Imperative navigation goes through the `*Navigation.ts` helpers**, not ad-hoc navigation refs scattered in components.

## How to assess (before changing anything)

1. **Map the change to a layer.** Ask: is this data access (repo), orchestration/state (context), device integration (service), pure logic (util), or presentation (component)? Put each piece where it belongs.
2. **Look for the smells:**
   - DB/Drizzle imports above the repository layer.
   - `AppContext.tsx` ballooning with logic that's really pure (extract to `utils/`) or really data-access (extract to a repository).
   - Duplicated logic across features (date math, currency conversion, balance computation) that should be a shared util — check `utils/` first (`formatters`, `currency`, `accountBalances`, `recurringRules`, `transactions`).
   - A feature folder importing another feature's internals.
   - Components formatting money/dates by hand instead of using formatters.
   - Dead code: unused exports, screens not registered in a stack, orphaned services.
   - Asymmetric platform splits.
3. **Check the contracts.** Changes to `types/index.ts` or a repository signature ripple upward — trace every caller.

## How to improve (incremental, safe)

- **Make the smallest structural move that removes the smell.** Extract a util, push a query into a repository, lift shared UI into `components/`. Avoid speculative abstraction — no layer or indirection without a present need.
- **Refactors preserve behavior.** Separate "move/restructure" commits from "change behavior" commits.
- **Tests are the safety net.** This codebase tests utils, repositories/mappers, services, and navigation (Jest + ts-jest, `__tests__/`). When you extract logic into a util or repo, add/adjust its test. Run `npm test` after each structural move.
- **Keep `useApp()` cohesive.** New cross-entity operations belong as methods on `AppContext`, delegating to repositories — not as one-off DB calls in screens. But if a method is pure computation, extract the core to a `utils/` function and have the context call it (so it's unit-testable without the DB).
- **Migrations are append-only.** Schema changes add a new numbered file in `lib/db/migrations/` (next after `028`) plus a `schema.ts` update and mapper/type updates. Never edit a shipped migration. Consider data backfill (see `normalizeCurrencies.ts` as the pattern).
- **i18n parity is structural.** Any new string key must exist in all 23 locales or `localeParity.test.ts` fails.

## Definition of done

- Each new/changed piece of code sits in the correct layer; no boundary violations introduced.
- No new duplication; shared logic lives in `utils/`/`components/`/`services/` with a test.
- Dead code removed, not left "just in case".
- Public contracts (`types/`, repo/context signatures) updated consistently across all callers.
- `npm run check` and `npm test` both pass.
- The change is documented in `CLAUDE.md` if it alters the architecture map (new table, new feature folder, new service category, new top-level pattern).

## Anti-patterns (do not introduce)

- Drizzle/SQLite calls in a component, screen, or context method that belongs in a repository.
- "God" utils or a context method doing data access, formatting, and side effects at once.
- New abstraction layers / dependency-injection scaffolding the codebase doesn't currently use (no Redux/Zustand — don't add a state library).
- Cross-feature imports reaching into another feature's `components/` internals.
- Editing a shipped migration instead of adding a new one.
- Large drive-by rewrites that mix refactor + behavior change in one commit.
