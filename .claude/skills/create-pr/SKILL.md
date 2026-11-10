---
name: create-pr
description: Create a pull request or rewrite an existing PR description with a one-line summary, plain-language changes, a verification table, evidence tables of screenshots, GIFs or video, and possible regression risks. Use when asked to open a PR or improve its title or description.
---

# Create a PR

Write for a reviewer who has not seen the conversation. Describe the final change in plain English, with short sentences and no jargon in the summary or change bullets.

## Prepare

- Read the repository instructions and any PR template. Inspect the branch, working tree, full diff against the target branch, and existing PR before writing.
- Assess analytics impact for every change. If tracking or a tracked flow changes, follow [maintain-analytics-tracking](../maintain-analytics-tracking/SKILL.md), update the [Analytics](../../../README.md#analytics) tables in `README.md` in the same change, run the tracking-table check, and explain any PostHog volume change (against the README event budget) in the PR.
- Assess Web Dashboard impact for every change with [sync-web-dashboard](../sync-web-dashboard/SKILL.md). Its website change (`apps/web`) goes in the same PR; give it a row in the Verification table: what was checked on the dashboard, or "No impact" and why.
- This repository holds the app (`apps/mobile`), the Workers (`apps/cloudflare`), the website (`apps/web`) and App Studio (`apps/app-studio`). Work that spans them goes in one PR. Name the apps it changes, run each changed app's checks (AGENTS.md lists them), and say what merging does: `apps/web` deploys the website at once, any change under `apps/mobile` cuts a store build, a Worker change deploys that Worker, and App Studio deploys nothing.
- Review the actual changes and available verification results. Run the checks required by the repository for code changes; when only rewriting a description, reuse verified results for the same code and identify any gaps.
- When creating a PR, commit only the intended changes, follow the repository's branch and commit conventions, and push the branch. Preserve unrelated work. When rewriting a PR, update that PR instead of opening a duplicate or making unrelated code changes.

## Description

Start with one sentence explaining what the PR achieves. No Summary heading is needed. Then use these sections, with a blank line before each list and table:

### What changed

- Describe each meaningful change or fix as a straightforward bullet about behavior or outcome.
- Group related work. Avoid a file-by-file inventory, implementation names, acronyms, and narration of the development process.

### Verification

- Report checks in one table, one row per check: what was checked, where, and the result. Lead each result with ✅ passed, ❌ failed, ⚠️ not tested or partial, or ➖ no impact, then say what happened in a few words.

  ```markdown
  | Check                           | Where                                                | Result                                        |
  | ------------------------------- | ---------------------------------------------------- | --------------------------------------------- |
  | Swipe back from November to May | Android, Pixel 10 emulator (Android 16), local Metro | ✅ Every month shows its own budget           |
  | Same swipes, both directions    | iOS, iPhone 18 Pro simulator (iOS 27.0)              | ✅ Matches the header, layout unchanged       |
  | `npm run check`, `npm test`     | Local                                                | ✅ 283 suites, 3,901 tests                    |
  | Household page                  | Not run: needs a signed-in shared ledger             | ⚠️ Same change as Budget, covered by the test |
  | Web Dashboard                   |                                                      | ➖ No impact: native page layout only         |
  | Analytics                       |                                                      | ➖ No impact: no events or screens changed    |
  ```

- Name the platform, device or simulator, and whether the backend was local, staging, or production when relevant. Distinguish manual checks, automated checks, and pending CI. Keep untested platforms or paths, the Web Dashboard row, and the Analytics row in the table instead of in loose paragraphs.
- A setup worth knowing (seeded data, an account state, the build used) goes in one sentence above the table. After the table, one line says what merging does, such as "**Merging** cuts a store build."
- For instructions-only changes without UI testing, the table has the documentation checks and a row saying no app behavior changed. Leave out the Evidence section; screenshots of unchanged app screens are not required.

### Evidence

After UI testing, always show the final UI here. Evidence goes in tables, never scattered between paragraphs:

- **Group by device.** Start each group with one bold line naming the device, such as `**Android · Pixel 10 emulator (Android 16)**`, then its table. One table per group; do not repeat the setup already given under Verification.
- **Every image and GIF sits in a table cell, with a header that says what it shows.** Never put an image alone between paragraphs or several images on one line. Center the columns (`| :---: |`). Captions go in the header or the first column, not only in alt text, and alt text never contains `|`.
- **Before and after** (only when both were captured): `| | Before | After |` with one row per state, the first column naming the state. Without a before: one column per platform, screen, or theme (`| iOS | Android |`, `| Light | Dark |`). Use up to four phone screenshots per row, and one or two for iPad, web, or other wide captures.
- **Numbers and observations** (measurements, a step-by-step result) go in a table of their own, like `| Swipe | Header | Old code | With the fix |`. Long logs or test output go in a collapsed `<details>` block.

```markdown
**Android · Pixel 10 emulator (Android 16)**

|              |                                          Before                                           |                                           After                                            |
| :----------- | :---------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------: |
| July         |            ![Blank July page](.github/pr-assets/budget-pager/before-july.png)             |     ![July budget ring and categories](.github/pr-assets/budget-pager/after-july.png)      |
| Swiping back | ![Old code swiping from November to May](.github/pr-assets/budget-pager/before-swipe.gif) | ![Fixed code swiping from November to May](.github/pr-assets/budget-pager/after-swipe.gif) |
```

Pick the medium that shows the change, and record motion only when a still cannot show it:

- **Screenshot** by default, for any state a still image shows: a layout, a label, a value, an error, an empty state.
- **GIF** when the change is the motion itself: an animation, a gesture, a transition, swiping or scrolling, a loading-to-loaded step, or a bug that appears over time. Keep it under about 10 seconds and 10 MB, cropped to the action. GIFs autoplay and loop inside a table cell, so a before and after play side by side. Record with the `agent-device` command from `device_open` (its help lists the recording command), then convert:

  ```bash
  ffmpeg -y -ss 1 -t 8 -i recording.mp4 \
    -vf "fps=12,scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" \
    -loop 0 .github/pr-assets/<topic>/after-swipe.gif
  ```

- **Video (MP4)** only for a flow too long for a GIF (more than about 15 seconds) or one that needs full frame rate. Keep it under 10 MB. GitHub plays a video only when it is alone on its own line, and shows a bare link inside a table, so put it under the group's table after a bold caption line, as `![Caption](.github/pr-assets/<topic>/flow.mp4)` alone on its line: `--attach` rewrites it to the bare URL that GitHub plays.

**Upload images and videos as GitHub attachments with `gh`'s `--attach`; never commit them.**

- Save captures in `.github/pr-assets/<topic>/` (one kebab-case folder per PR, ignored by git) or anywhere outside the repository. Reference each one in the description by its local path, `![Split bill after the fix](.github/pr-assets/split-bill-name-typing/after.png)`, inside its table cell, and pass the same path to `--attach` on `gh pr create`, `gh pr edit` or `gh pr comment`: `gh` uploads the file and rewrites the reference to its GitHub URL. Repeat `--attach` per file (up to 50 per command). A file the description does not reference is appended at the end, outside any table, so reference every file you attach.
- To add evidence to an existing PR, run `gh pr edit <number> --body-file <file> --attach <path> …` with the full new description; without `--body-file`, `gh pr edit --attach` appends the files to the current one. If some uploads fail, `gh` still updates the PR with the ones that worked and exits non-zero.
- Read the description back (`gh pr view <number> --json body`): every image, GIF and video must be a `https://github.com/user-attachments/...` URL, none still a local path, and every table must still have the same number of cells in each row.
- Only images and videos can be attached. Put other evidence (measurements, logs, test output) in the description as text, in a table or a `<details>` block.
- Never commit PR evidence, under `.github/pr-assets/` or anywhere else (a `docs/` folder, an app's `assets/`): committed evidence once made every clone hundreds of MB bigger. Local filesystem paths and a text-only report are not enough. Do not invent attachments, expose private account data, or claim unrun checks passed.
- Keep the simulator or emulator window visible while testing, following the repository's simulator visibility instructions, and leave it open on the tested screen.

### Possible regression risks

- Name concrete existing behavior that could break because of this diff, plus the checks that reduce the risk or any remaining gap. Use plain language.
- Keep this proportional to the change. For instructions-only work, say there is no app behavior change and identify any workflow risk if relevant. Do not claim zero risk for app changes or list unrelated hypothetical problems.

Add another section only when needed for a reviewer to make a decision, such as a required app rebuild, release order, data change, or follow-up. Explain technical requirements in everyday language; keep precise commands or identifiers in verification or release notes only where useful.

## Publish and verify

Use a concise title about the result. Keep required repository template fields while preserving the content above. Write the exact body to a temporary file and use `gh pr create --body-file` or `gh pr edit --body-file`, or pass a structured body to an available tool. Existing authorization to create or update the PR is sufficient; the skill does not authorize merging or deploying.

Read the published title and body back to verify formatting, links, and accuracy. Return the PR link.
