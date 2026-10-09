# Working in this repo

**[README.md](README.md) is the documentation.** It explains the whole project:
the layout, the architecture, every feature's rules, analytics, the Workers, CI
and the traps. Read the section you are about to touch before you touch it.

This file is only the things an agent needs that are not in there. It is the
one set of instructions for every agent: `CLAUDE.md` is a pointer to it, and
anything reading `AGENTS.md` by convention gets the same thing.

## Before you start

```
apps/mobile      Expo / React Native app, its own npm project
apps/cloudflare  workers/ and d1/, one directory per Worker and per database
.github          CI workflows, and pr-assets/ for PR screenshots and evidence
```

There is no root `package.json`. App commands run from `apps/mobile`, and app
paths in the README and in these instructions (`features/…`, `lib/…`,
`__tests__/…`, `scripts/…`) are relative to it.

```bash
cd apps/mobile
npx expo start --localhost   # tunnel and LAN modes do not work on this machine
npm run check                # typecheck + lint + format (also the root *.md and .github/)
npm test
```

Run `npm run check` and `npm test` before you say you are done. A Worker
change also needs `npm run typecheck` in its own directory under
`apps/cloudflare/workers/`.

**Simulator and emulator control goes through the Argent MCP tools**
(`mcp__argent__*`: `boot-device`, `launch-app`, `describe`, `gesture-tap`,
`screenshot`, `debugger-*`, `profile-*`). Prefer them over raw `xcrun simctl`
or `adb`. Argent may
offer to start Metro itself; always start the dev server with
`npx expo start --localhost` instead.

## Rules for changes

**Do not add a documentation file.** Everything goes in `README.md`. A
scattered `docs/` folder, per-directory READMEs and design notes are what this
layout replaced. Update the README section a change affects in the same change.

**Analytics tables are part of the change.** The Analytics section of the
README is the single source of truth for Mixpanel and Google Analytics
tracking. For every product or code change, assess its analytics impact. If
events, properties, triggers, frequency, routing, paywall sources, screens,
user state, feature adoption, transaction milestones, provider configuration or
external producers change, update the affected tables in the same change. A
change with stale tracking documentation is unfinished; a change without
analytics impact needs no artificial table edit. Use the
`maintain-analytics-tracking` skill. `__tests__/services/analyticsTrackingPlan.test.ts`
checks the tables against the code, but not payloads, triggers or sources:
review those against the diff yourself, and review the expected Mixpanel event
volume when adding an event or increasing its frequency.

**Keep the Simulator visible while testing.** Booting a device does not open
the macOS Simulator window. Before iOS testing, run
`open -a Simulator --args -CurrentDeviceUDID <udid>`, then
`osascript -e 'tell application "Simulator" to activate'`. On Xcode 27+,
Simulator.app is replaced by DeviceHub.app: use
`open "devices://device/open?id=<udid>"` and
`tell application "DeviceHub" to activate` instead. Verify that the selected
device window is visible, and leave it open on the tested screen so the user
can follow along. Keep the Android emulator window visible when testing Android
too.

**Always include screenshots in PR descriptions after UI testing.** Capture the
final UI and save it, with any recording or other evidence, in
`.github/pr-assets/<topic>/` (one kebab-case folder per PR), committed on the
PR branch. That is the only place PR assets go. Embed them with URLs pinned to
the commit that added them
(`https://raw.githubusercontent.com/NelsonGan/money2time/<commit-sha>/.github/pr-assets/<topic>/<file>`),
so they keep loading after a merge or a later move. Local file paths and a
text-only report are not enough. Keep private account details out of the
images. Include before/after screenshots only when both were actually captured.
For instructions-only changes without UI testing, state that no app behavior
changed and report the documentation checks instead. The `create-pr` skill
covers the rest of the description.

## Skills

Claude's skills and commands live in `.claude/skills/` and `.claude/commands/`.
Codex reads shared copies in `.agents/skills/` (with their supporting
references) and `.agents/commands/`, the commands exposed to Codex as
`$source-command-cleanup` and `$source-command-create-pr` skills. When you
change a Claude workflow, refresh its shared copy in the same change. Local
`.agents/memory/` stays ignored.
