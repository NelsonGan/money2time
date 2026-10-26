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
README is the single source of truth for PostHog and Google Analytics
tracking. For every product or code change, assess its analytics impact. If
events, properties, triggers, frequency, routing, paywall sources, screens,
user state, feature adoption, transaction milestones, provider configuration or
external producers change, update the affected tables in the same change. A
change with stale tracking documentation is unfinished; a change without
analytics impact needs no artificial table edit. Use the
`maintain-analytics-tracking` skill. `__tests__/services/analyticsTrackingPlan.test.ts`
checks the tables against the code, but not payloads, triggers or sources:
review those against the diff yourself, and add the expected PostHog event
volume to the README's event budget when adding an event or increasing its
frequency.

**Show the device in Expo Device Hub while testing.** `expo-device-hub` is a
dev dependency, so every `npx expo start` serves a live, interactive view of
the running simulators and emulators. Open
<http://localhost:8081/_expo/plugins/expo-device-hub> (not the `127.0.0.1`
link Metro prints: `--localhost` binds Metro to IPv6 only) in the browser
pane, select the device you are testing, and leave it on the tested screen so
the user can follow along. The Hub only starts listing devices once a page is
open. Use these devices and no others:

| Platform | Device                                                                     | Boot with Argent             |
| -------- | -------------------------------------------------------------------------- | ---------------------------- |
| iOS      | Money2Time iPhone 18 Pro simulator, `D33ACD74-8FC1-4F53-B7B8-690086AC1223` | `boot-device` with `udid`    |
| Android  | `Money2Time_Pixel_10` emulator (Pixel 10, Android 16)                      | `boot-device` with `avdName` |

The Hub and `expo run:android` need the Android SDK and a JDK: start Metro
with `ANDROID_HOME` and `JAVA_HOME` set (see Getting set up in the README).

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
