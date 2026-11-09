You are doing a pre-merge code cleanup pass. Your job is to find and fix real problems — dead code, bugs, convention violations — without changing behavior or adding features.

## Step 1: Discover changed files

Run `git diff main...HEAD --name-only` to get the list of files changed in this branch. If on main with no branch, use `git diff HEAD~5...HEAD --name-only` to get recently touched files. Focus your review on these files only.

Group them by app: `apps/mobile` (the app), `apps/cloudflare/workers/<name>`, `apps/web` (the website and Web Dashboard) and `apps/app-studio`. Each app has its own conventions, so judge a file by its own app's, and skip generated files (`*.generated.ts`, `public/dashboard-assets/`, `media/`).

## Step 2: Read and audit each file

For each changed file, read it fully and flag issues in these categories:

**Dead / unused code**

- Variables, imports, functions, or components that are declared but never used
- Code that is unreachable (after an early return, inside a condition that is always false)
- Commented-out code blocks left behind

**Bugs**

- Missing `await` on async calls
- Off-by-one errors or incorrect conditions
- Stale closures in hooks (missing deps in `useEffect`/`useCallback`/`useMemo`)
- Null/undefined dereferences that are not guarded
- Incorrect logic that contradicts the surrounding code's intent

**Convention violations** (the app's patterns; for `apps/web` and `apps/app-studio` use the rules in the `work-on-website` and `work-on-app-studio` skills: copy in all 32 `messages/*.json`, typed analytics events, `.ts` value imports in tested modules, no imports across apps)

- `console.log` instead of `console.warn` / `console.error`
- Raw date logic instead of `dayKeyFromDateLocal()` / `monthKeyFromIsoLocal()` etc.
- Raw currency/hour display instead of `formatAmount()` / `formatHours()`
- Missing `void` on fire-and-forget `triggerHaptic()` calls
- Direct DB access outside of `lib/repositories/`
- State mutations outside of `AppContext` / `useApp()`
- Type imports not using `import type`
- Tracking or tracked-flow changes without matching updates to the authoritative Analytics tables in `README.md` (follow `.claude/skills/maintain-analytics-tracking/SKILL.md`; review payloads, triggers, frequency, sources and destinations even if event names did not change)

**Code quality**

- Duplicate logic that already exists elsewhere in the codebase
- Overly complex logic that can be simplified without changing behavior
- Inconsistent naming relative to the surrounding file

## Step 3: Fix issues

Fix every issue you found. Edits must be surgical — change only the lines needed. Do not:

- Reformat code that wasn't already broken
- Add comments to self-documenting code
- Refactor files that had no issues
- Add new features or error handling for hypothetical cases
- Change behavior

## Step 4: Run checks

Run each changed app's checks from its directory: `npm run check` in `apps/mobile` (typecheck + lint + format), `npm run typecheck` in a changed Worker, `npm run lint`, `npm test` and `node scripts/validate-messages.mjs` in `apps/web`, and `npx tsc --noEmit` and `npm test` in `apps/app-studio`. Fix any errors they surface that are related to your changes. If analytics is affected, also run `npm test -- --runInBand __tests__/services/analyticsTrackingPlan.test.ts __tests__/services/analyticsEvents.test.ts __tests__/services/analyticsNative.test.ts` and reconcile the table with the implementation before completing the cleanup.

## Step 5: Report

After all fixes are done, output a concise summary grouped by file:

```
### path/to/file.ts
- Removed unused `foo` import
- Fixed missing `await` on updateSettings call
- Replaced raw date math with dayKeyFromDateLocal()
```

If a file had no issues, omit it from the report. If no issues were found anywhere, say so.
