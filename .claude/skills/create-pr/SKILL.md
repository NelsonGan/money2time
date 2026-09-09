---
name: create-pr
description: Create a pull request or rewrite an existing PR description with a one-line summary, plain-language changes, verification evidence, and possible regression risks. Use when asked to open a PR or improve its title or description.
---

# Create a PR

Write for a reviewer who has not seen the conversation. Describe the final change in plain English, with short sentences and no jargon in the summary or change bullets.

## Prepare

- Read the repository instructions and any PR template. Inspect the branch, working tree, full diff against the target branch, and existing PR before writing.
- Review the actual changes and available verification results. Run the checks required by the repository for code changes; when only rewriting a description, reuse verified results for the same code and identify any gaps.
- When creating a PR, commit only the intended changes, follow the repository's branch and commit conventions, and push the branch. Preserve unrelated work. When rewriting a PR, update that PR instead of opening a duplicate or making unrelated code changes.

## Description

Start with one sentence explaining what the PR achieves. No Summary heading is needed. Then use these sections, with a blank line before each list:

### What changed

- Describe each meaningful change or fix as a straightforward bullet about behavior or outcome.
- Group related work. Avoid a file-by-file inventory, implementation names, acronyms, and narration of the development process.

### Verification

- State what was actually tested, where, and the result. For mobile apps, name the platform/device or simulator and whether the backend was local, staging, or production when relevant.
- Include useful evidence: screenshots or recordings for visible changes when available, test results, or a short description of the flows checked. Include before/after images only if both were captured.
- Link or embed only evidence that a PR reviewer can access. Local filesystem paths do not work on GitHub. Do not invent attachments, expose private account data, or claim unrun checks passed. If an image cannot be attached, report the observed UI checks instead.
- Call out relevant untested platforms or paths. Distinguish automated checks from manual verification and pending CI.

### Possible regression risks

- Name concrete existing behavior that could break because of this diff, plus the checks that reduce the risk or any remaining gap. Use plain language.
- Keep this proportional to the change. For instructions-only work, say there is no app behavior change and identify any workflow risk if relevant. Do not claim zero risk for app changes or list unrelated hypothetical problems.

Add another section only when needed for a reviewer to make a decision, such as a required app rebuild, release order, data change, or follow-up. Explain technical requirements in everyday language; keep precise commands or identifiers in verification or release notes only where useful.

## Publish and verify

Use a concise title about the result. Keep required repository template fields while preserving the content above. Write the exact body to a temporary file and use `gh pr create --body-file` or `gh pr edit --body-file`, or pass a structured body to an available tool. Existing authorization to create or update the PR is sufficient; the skill does not authorize merging or deploying.

Read the published title and body back to verify formatting, links, and accuracy. Return the PR link.
