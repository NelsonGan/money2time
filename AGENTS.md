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

**Simulator and emulator control goes through the T3 Code device tools**, so
the user can watch the device in T3 Code's Device panel. Devices come from the
Simlock pool on this machine, which T3 Code leases from: each worktree gets its
own fresh device, and the pool deletes it when you close it. Never create,
clone, erase or boot a simulator or emulator yourself. `device_list` lists the
pool's models (host `simlock-mac-mini`); `device_open` leases one (it waits
while the pool is full), shows it in the panel and returns an `agent-device`
command pinned to it. Use that command for every app launch, deep link, tap,
text entry, alert, screenshot and recording (`agent-device help` lists the
commands, `agent-device help foldable` covers the iPhone Duo),
`device_screenshot` to look at the screen, and `device_close` with
`shutdown: true` when you are done, which gives the device back. Do not drive a
device with `xcrun simctl`, `adb` or scripts that wrap them; those stay fine for
builds, installs, port forwards (`adb reverse`), logs and what `agent-device`
cannot do. Always start the dev
server yourself with `npx expo start --localhost`.

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

**Show the device in T3 Code's Device panel while testing.** Open it with
`device_open` and leave it on the tested screen while the user should still look
at it. The pool runs two devices at once and at most one Android emulator, so
close yours when you are done. Use these models:

| Platform | `device_open` id                    | Use                                       |
| -------- | ----------------------------------- | ----------------------------------------- |
| iOS      | `simlock:ios:iPhone 18 Pro`         | everyday testing (iOS 27.0)               |
| iOS      | `simlock:ios:iPhone Duo`            | iPhone Duo (foldable) work only, iOS 27.1 |
| iOS      | `simlock:ios:iPad Pro 13-inch (M5)` | iPad layouts                              |
| Android  | `simlock:android:Pixel 10`          | Android testing (Android 16)              |

**A leased device already has the Money2Time dev client**, built from
`origin/main` (the normal `com.nelsongan.money2time` app, never M2T Dev),
signed out and with no data. It runs whatever is in your working tree through
Metro, so a JS change needs no build. A dev client refuses a bundle with another
runtime version (an empty red box), so a branch that bumps the version or
changes native code needs its own build. Build it in the worktree and install
it on your leased device; `simlock-udid <device id>` turns the id
`device_open` returned into the simulator's UDID:
`xcrun simctl --set ~/.simlock/devices/ios install "$(simlock-udid <id>)" <path>/Money2Time.app`
or `ANDROID_ADB_SERVER_PORT=5038 adb install -r <path>/app-debug.apk`, a few
seconds each (`agent-device install` works too but takes minutes). The shared
builds are in `~/MobileBuilds/money2time/`, with the commit they came from
beside them. On a fresh device the first deep link asks "Open in
Money2Time?" and the screen ignores taps until you answer
(`agent-device alert accept`), and the first launch shows the Expo dev-menu
intro sheet (tap Continue).

**On Android, forward Metro's port through Simlock's adb server** (port 5038,
not the default 5037): `ANDROID_ADB_SERVER_PORT=5038 adb reverse tcp:<port>
tcp:<port>`. The pool runs one emulator, so no `-s` is needed. `adb reverse`
reaches the Mac over IPv4, and `--localhost` binds Metro to `::1` only, so for
Android start Metro with plain `npx expo start --port <port>`.
`expo run:android` and Gradle need `ANDROID_HOME` and `JAVA_HOME` set (see
Getting set up in the README).

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
