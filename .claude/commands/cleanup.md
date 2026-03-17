You are doing a pre-merge code cleanup pass. Your job is to find and fix real problems — dead code, bugs, convention violations — without changing behavior or adding features.

## Step 1: Discover changed files

Run `git diff main...HEAD --name-only` to get the list of files changed in this branch. If on main with no branch, use `git diff HEAD~5...HEAD --name-only` to get recently touched files. Focus your review on these files only.

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

**Convention violations** (based on this codebase's patterns)
- `console.log` instead of `console.warn` / `console.error`
- Raw date logic instead of `dayKeyFromDateLocal()` / `monthKeyFromIsoLocal()` etc.
- Raw currency/hour display instead of `formatAmount()` / `formatHours()`
- Missing `void` on fire-and-forget `triggerHaptic()` calls
- Direct DB access outside of `lib/repositories/`
- State mutations outside of `AppContext` / `useApp()`
- Type imports not using `import type`

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

Run `npm run check` (typecheck + lint). Fix any errors it surfaces that are related to your changes.

## Step 5: Report

After all fixes are done, output a concise summary grouped by file:

```
### path/to/file.ts
- Removed unused `foo` import
- Fixed missing `await` on updateSettings call
- Replaced raw date math with dayKeyFromDateLocal()
```

If a file had no issues, omit it from the report. If no issues were found anywhere, say so.
