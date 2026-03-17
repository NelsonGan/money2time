Create a pull request for the current branch.

1. Run `git branch --show-current`, `git status -uall`, and `git log main...HEAD --oneline` to understand the current state.

2. If on main:
   - If there are no uncommitted changes AND no commits ahead of main → stop and tell the user: "Nothing to PR — make your changes first."
   - If there are uncommitted changes → derive a branch name from the changed files or diff (e.g. `feat/add-login-screen`), create and switch to it with `git checkout -b <branch>`, then stage specific changed files and commit with a conventional commit message.

3. If on a feature branch:
   - If there are uncommitted changes → stage specific changed files (not `git add -A`) and commit with a conventional commit message derived from the changes.
   - If there are no uncommitted changes and commits exist ahead of main → proceed to push.

4. Push the branch to origin with `-u` if not yet tracking, otherwise just `git push`.

5. Run `git diff main...HEAD` and `git log main...HEAD --oneline` to understand all changes going into the PR.

6. Create the PR with `gh pr create`.

The PR title should be concise (under 70 chars).

The PR body must contain only a one-sentence summary and a bullet list of every change. No extra headers, sections, or attribution. Example:

```
## Summary
Disables iOS Dynamic Type scaling to ensure consistent layouts.

## Changes
- Disable font scaling globally in App.tsx via disableDynamicType()
- Add allowFontScaling={false} to Text component
- Add allowFontScaling={false} to Input component
```
