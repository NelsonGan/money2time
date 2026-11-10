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
apps/web         money2time.com and the Web Dashboard (vinext on a Worker)
apps/app-studio  App Studio: store screenshots, creatives and listing copy
.github          CI workflows (pr-assets/ is an ignored scratch folder for PR captures)
```

There is no root `package.json` and no workspace: each app is its own npm
project. App commands run from `apps/mobile`, and app paths in the README and
in these instructions (`features/…`, `lib/…`, `__tests__/…`, `scripts/…`) are
relative to it unless they name another app.

```bash
cd apps/mobile
npx expo start --localhost   # tunnel and LAN modes do not work on this machine
npm run check                # typecheck + lint + format (also the root *.md and .github/)
npm test
```

Run `npm run check` and `npm test` before you say you are done. A Worker
change also needs `npm run typecheck` in its own directory under
`apps/cloudflare/workers/`. A website change needs, from `apps/web`,
`npm run lint`, `npm test`, `node scripts/validate-messages.mjs`,
`npm run build` and `npm run typecheck` (after the build). An App Studio change
needs, from `apps/app-studio`, `npm test` and `npx tsc --noEmit`. Run `npm ci`
in an app before its first command in a worktree: a symlinked `node_modules`
breaks the website's build.

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
cannot do. Always start the dev server yourself, with `simlock-metro` (below).

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

**The Web Dashboard is part of the change.** app.money2time.com (`apps/web`)
rebuilds the app's pages, totals and editors from the data the phone sends, so
it falls behind every time the app changes and it does not. After every
product or code change works in the app, and before the PR, run the
`sync-web-dashboard` skill: it decides whether the dashboard shows, edits or
reads what changed, and if so has you change `apps/web` in the same PR, keep
older apps and pages working, and verify it end to end against the simulator.
A change without web impact says "Web Dashboard: no impact" and why in its PR.
Merging deploys the website at once, while the app reaches the stores later.

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
`origin/main` (the normal `com.nelsongan.money2time` app),
signed out and with no data (T3 Code's own note that a pool device starts with
no apps is generic; `agent-device apps` lists them). It is ready to test: the
Expo dev menu's intro and floating Tools button are off, photo, camera,
microphone and location permissions are granted (notifications still ask once),
four synthetic meal photos are in the photo library, and keyboard autocorrect
is off. To test a permission prompt, reset it first with
`agent-device settings permission reset <name> --app com.nelsongan.money2time`.

**Run your working tree on it with `simlock-metro <device id> <agent-device
command>`**, from anywhere in the worktree. It reuses or starts this checkout's
Metro on a free port, copies a missing `.env` from the main checkout, forwards
the port on Android, builds the bundle, opens the app and answers the "Open in
Money2Time?" prompt. A JS change needs no build after that; a Metro reload picks
it up. By hand: plain `npx expo start --port <port>` (it works on both
platforms; `--localhost` binds `::1` only, which Android cannot reach), then
`money2time://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A<port>&disableOnboarding=1`
(`money2time://` works on both platforms; the
`com.nelsongan.money2time://` scheme exists on iOS only). A dev client refuses
a bundle with another runtime version (an empty red box), so a branch that bumps
the version or changes native code needs its own build: from the worktree, run
`simlock-build ios <device id>` (or `android`), which builds this checkout's dev
client and installs it on the device `device_open` leased. Do not use
`npm run ios`, `npm run android` or `expo run:*` for that: they look for devices
outside the pool. The shared builds are in `~/MobileBuilds/money2time/`, with
the commit they came from beside them.

**Every `adb` command for a leased emulator needs
`ANDROID_ADB_SERVER_PORT=5038`**, including the README's: Simlock runs its
emulators on its own adb server, and the default one on 5037 cannot see them.
`simlock-metro` forwards Metro's port; by hand it is
`ANDROID_ADB_SERVER_PORT=5038 adb reverse tcp:<port> tcp:<port>` (the pool runs
one emulator, so no `-s` is needed).
`simlock-udid <device id>` prints the simulator UDID or emulator serial behind a
lease, for what `agent-device` cannot do. Gradle needs `ANDROID_HOME` and
`JAVA_HOME` set (see Getting set up in the README).

**Always include screenshots in PR descriptions after UI testing.** Capture the
final UI and save it, with any recording, in `.github/pr-assets/<topic>/` (one
kebab-case folder per PR, ignored by git) and upload it as a GitHub attachment, laid out
in the description's Evidence tables (a GIF when the change is motion):
reference it by that path (`![alt](.github/pr-assets/<topic>/after.png)`)
and pass the same path to `--attach` on `gh pr create`, `gh pr edit` or
`gh pr comment`, which uploads it and rewrites the reference. **Never commit
screenshots, recordings or other evidence**: committed evidence once made every
clone hundreds of MB bigger. Non-image evidence goes in the description
as text. Then read the description back and check every image is a
`github.com/user-attachments` URL. Local file paths and a text-only report are
not enough. Keep private account details out of the
images. Include before/after screenshots only when both were actually captured.
For instructions-only changes without UI testing, state that no app behavior
changed and report the documentation checks instead. The `create-pr` skill
covers the rest of the description.

## Working on the website

`apps/web` is Next.js App Router code that does not run on Next.js: vinext
builds and serves it as one Cloudflare Worker, every `next/*` import is a
vinext shim, and webpack or Turbopack settings do nothing. Before relying on a
Next.js feature, check `node_modules/vinext/README.md` (API coverage, _Known
gaps_) and the `migrate-to-vinext` skill's `references/compatibility.md`. The
`work-on-website` skill is the procedure (setup, previewing, checks, how it
ships), and the README's Website section is the reference.

- **A page is a page times thirty-two.** Copy lives in `messages/<locale>.json`,
  never in components; `node scripts/validate-messages.mjs` is the parity check.
  Bump `src/app/sitemap.ts`'s real `lastModified` date for the route you
  changed, and only that one.
- **SEO work goes through the `seo-loop` skill.** No page is created before its
  ownership check against Google Search Console (`CREATE`, `IMPROVE EXISTING`
  or `REJECT`, with the numbers), and no page ships on what the source says it
  does: the gate is what the server returned. Never invent Search Console
  numbers.
- **Pictures are published, not deployed.** A deploy does not upload `media/`;
  run `node scripts/upload-media.mjs` before merging a change that shows new
  pictures, or the workflow's media check fails.
- Put a local relay URL in `.env.development.local`, never `.env.local`: Vite
  reads `.env.local` for production builds too.
- The website uses double quotes and its own ESLint config, not the app's
  Prettier settings. Match the file you are in.

## Working on App Studio

`apps/app-studio` runs only on this Mac (`npm run dev`, port 3000); it is never
deployed. Store uploads write to live listings through the `asc` and `gplay`
CLIs, so never run one without the user asking, and never commit store
credentials (`.env.local`, `.p8` or service-account JSON). The
`update-whats-new` skill writes each release's What's New in
`src/data/appDescriptions.ts`, the `update-app-studio-screenshots` skill
recaptures the app screens in every language (from the `app-studio-seed-data`
branch), and the `work-on-app-studio` skill covers the rest (running it,
scenes, exports and uploads).

## Skills

Claude's skills and commands live in `.claude/skills/` and `.claude/commands/`.
Codex reads shared copies in `.agents/skills/` (with their supporting
references) and `.agents/commands/`, the commands exposed to Codex as
`$source-command-cleanup` and `$source-command-create-pr` skills. When you
change a Claude workflow, refresh its shared copy in the same change. Local
`.agents/memory/` stays ignored.

Every app in this repository has its skills here, at the root. Start from the
one for the app you are changing: `work-on-website` (with `seo-loop`,
`migrate-to-vinext` and `sync-web-dashboard`) for `apps/web`,
`work-on-app-studio` (with `update-whats-new` and
`update-app-studio-screenshots`) for `apps/app-studio`, and the
rest for the app in `apps/mobile`. A skill's paths are relative to its app
unless it says otherwise.
