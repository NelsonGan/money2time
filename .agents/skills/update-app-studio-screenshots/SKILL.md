---
name: update-app-studio-screenshots
description: "Recapture App Studio's store screenshots (iPhone, iPad and iPhone Duo, all 23 locales) from the current app with seeded demo data. Use after screens change, when the store screenshots look out of date, or when someone asks to refresh, update or recapture the App Studio / App Store / Play screenshots."
---

# Update App Studio screenshots

App Studio (`apps/app-studio`) builds the store galleries from real captures of
the app: eight screens per locale for three devices, in
`public/assets/screenshots-iphone/`, `screenshots-ipad/` and `screenshots-duo/`
(`<locale>/01-home.png` … `08-budgeting.png`). Each locale is seeded with its
own demo profile first, so a German shot shows euros, German merchants and the
German UI. Read the README's **App Studio screenshots** section, and the
[work-on-app-studio](../work-on-app-studio/SKILL.md) skill for Studio itself.

A full run is about 50 seconds per locale per device: roughly 20 minutes a
device, and two devices can run at once.

## 1. The seed branch

`origin/app-studio-seed-data` is `main` plus the seed data. **It is never
merged.** It adds:

- `apps/mobile/services/previewData/`: one profile per app language
  (`PREVIEW_PROFILE_FOR_LOCALE`: English, Chinese and Malay show Malaysia, the
  rest their main country), the seeder (`seed.ts`) and its test.
- `AppContext.generatePreviewData(profile)`: wipes and seeds the database, sets
  the app language.
- `services/previewData/appStudio.ts`: a dev-only `globalThis.__appStudio` the
  capture script calls (`seed(locale)`, `seedStatus`, `info(locale)`,
  `t(key, locale)`). It also marks the what's-new announcements seen, maxes out
  the cloud-backup nudge and hides dev log toasts, so nothing covers a screen.

Bring it up to date with `main` in its own worktree (the app must be today's
app, or the screenshots show old screens):

```bash
git fetch origin
W=~/.t3/worktrees/money2time/app-studio-seed-data
[ -d $W ] || git worktree add $W origin/app-studio-seed-data
cd $W && git checkout -B app-studio-seed-data origin/app-studio-seed-data
git rebase origin/main
cd apps/mobile && npm ci
npx tsc --noEmit && npx jest __tests__/services/previewData.test.ts
git push --force-with-lease origin app-studio-seed-data
```

When the rebase or the typecheck fails, `main` changed something the seeder
writes (a table, a column, a repository's signature). Fix the seeder against the
new code, keep the change in the branch, and push it. Past breaks: budgets
gaining a period and currency (`periodBudgetsRepository`), item purchase dates
becoming day keys, rows gaining a `ledgerId`. Keep the branch to as few commits
as is practical so rebases stay easy.

If a new screen or feature should look lived-in in the screenshots, seed it
here too (as the week and year budgets are, for the Budgeting rings).

## 2. Devices

Lease with the T3 Code device tools (`device_open`, host `simlock-mac-mini`).
The pool runs two at a time, so do iPhone and iPad together, then the Duo.

| Set        | `device_open` id                    | Before opening the app                                       | `--device` |
| ---------- | ----------------------------------- | ------------------------------------------------------------ | ---------- |
| iPhone     | `simlock:ios:iPhone 18 Pro`         | nothing                                                      | `iphone`   |
| iPad       | `simlock:ios:iPad Pro 13-inch (M5)` | `agent-device orientation landscape-left` on the Home Screen | `ipad`     |
| iPhone Duo | `simlock:ios:iPhone Duo`            | unfold it (below); the open display is already landscape     | `duo`      |

**The iPhone Duo needs `simctl` for two things `agent-device` cannot do on a
pool device.** Simlock keeps its simulators in their own device set, which
CoreDevice cannot see, so `agent-device fold` and `agent-device screenshot`
both fail on a leased Duo (taps, `open` and alerts still work). A lease starts
folded, with the inner display dark. Unfold it with `agent-device`'s own fold
helper, built once and sent through `simctl spawn`:

```bash
U=$(simlock-udid <device id>)
F=$(ls ~/.t3/tools/agent-device/*/node_modules/agent-device/apple/fold-helper/Fold.m | tail -1)
xcrun --sdk iphonesimulator clang -mios-simulator-version-min=15.0 -fobjc-arc \
  -framework Foundation -framework IOKit "$F" -o /tmp/fold-helper
xcrun simctl --set ~/.simlock/devices/ios spawn $U /tmp/fold-helper open
xcrun simctl --set ~/.simlock/devices/ios io $U screenshot --display=3 /tmp/duo.png  # check: 2853 × 2007, Home Screen
```

Display 3 is the inner display (2853 × 2007, landscape); display 1 is the outer
one. The capture script takes the Duo's screenshots the same way when given
`--udid $U`. If the app was opened by a deep link (`simlock-metro` does), an
"Open in Money2Time?" prompt can stay on screen: look at a display-3 capture
and tap its button with `agent-device press <x> <y>` (points in the 951 × 669
window) before running the script, or every shot will have it.

Pin the status bar on each device (9:41, full battery, full signal). This is a
`simctl` job because `agent-device` cannot set it, and Simlock devices live in
their own device set:

```bash
U=$(simlock-udid <device id>)
xcrun simctl --set ~/.simlock/devices/ios status_bar $U override \
  --time 9:41 --batteryState discharging --batteryLevel 100 \
  --wifiBars 3 --cellularMode active --cellularBars 4 --operatorName ''
```

(`--time` takes `9:41`; the ISO form is refused. The iPad then shows
"9:41 AM" with the day's date.)

Then run the seed branch on it, from the seed worktree:

```bash
cd ~/.t3/worktrees/money2time/app-studio-seed-data
simlock-metro <device id> <agent-device command>   # prints the Metro port
```

A fresh lease starts at onboarding; that is fine, seeding completes it. If the
app drops to the Home Screen with an "Open in Money2Time?" alert, run
`agent-device alert accept` (on the Duo, press its Open button by coordinates).

## 3. Capture

`scripts/capture.mjs` (in this skill's folder) connects to the app through
Metro's debugger, seeds each locale, turns on Pro (`setDevProOverride`), walks
to the eight screens and saves each with the device's `agent-device
screenshot` at native density:

```bash
S=.claude/skills/update-app-studio-screenshots/scripts
node $S/capture.mjs --device iphone --port <metro port> \
  --agent-device <agent-device command> --out /tmp/shots/iphone run all
```

- `run all` does all 23 locales; or list them (`run en zh ms`).
- Two devices on one Metro: add `--target <text>`, part of the device's
  `deviceName` in `curl -s http://127.0.0.1:<port>/json/list` (a
  `simlock-<uuid>`; the newest target is the device you opened last). Without
  it the script refuses to guess.
- `--only 01-home,02-accounts` recaptures some screens.
- The iPhone Duo also needs `--udid <UDID>` (from `simlock-udid`): its shots
  come from `simctl io screenshot --display=3`.
- `eval '<js>'` runs JavaScript in the app with the helpers loaded, for
  debugging a step: `eval '__cap.where()'` prints the root stack.
- A failed locale is retried twice after relaunching the app. iPhone shots that
  catch the Dynamic Island's black pill (a simulator quirk) are retaken.

The screens, in the order taken: Home zoomed to the month's list (`01-home`),
Accounts (`02`), Insights breakdown (`03`) and budget (`08`), Settings →
Recurring (`04`) and Hourly value (`06`), then the full editor with Food › Dining
and a typed amount and note (`07`), split three ways (`05`). Amounts and notes
per locale are at the top of the script. When a screen is redesigned, change
the step that reaches it; the helpers find components by their props
(`onTabChange`, `onSelectDay`, the insight type menu's `options`), route names
and translated labels, so check those still exist.

## 4. Review and copy into Studio

Look at every locale before copying. A contact sheet per locale is quick:

```bash
ffmpeg -loglevel error -y -pattern_type glob -i "/tmp/shots/iphone/de/*.png" \
  -vf "scale=300:-1,tile=8x1" -frames:v 1 /tmp/sheet-iphone-de.png
```

Check for: a pop-up or toast over a screen, an empty list, the wrong language or
currency, a `[missing "…" value]` translation, a black Dynamic Island pill, a
half-finished transition, and the status bar. A broken string is an app bug:
fix it on `main` in its own PR (it ships the app), carry the same fix on the
seed branch until it lands, and recapture that locale. Recapture a bad screen
with `--only`. Then copy them in:

```bash
for d in iphone ipad duo; do
  for l in /tmp/shots/$d/*/; do
    mkdir -p apps/app-studio/public/assets/screenshots-$d/$(basename $l)
    cp $l*.png apps/app-studio/public/assets/screenshots-$d/$(basename $l)/
  done
done
```

Then shrink them losslessly (about 40% smaller, the same pixels; the three
sets are otherwise about 240 MB a refresh in the repository's history):

```bash
oxipng -o 2 --strip safe -q apps/app-studio/public/assets/screenshots-*/*/*.png
```

Open Studio (`npx next dev -p <free port>` in `apps/app-studio`, viewed with
`preview_open`) and look at the iPhone, iPad and iPhone Duo views for a few
locales, including one with a long language (de) and one without spaces (ja or
th). The Search creative takes its payment amount and crop from each locale's
iPhone `01-home.png`: it animates rows 740–1050 px (the top day header and
row) as a new payment, and `amounts` in `src/data/searchAnimation.json` must
be that row's amount, exactly as shown, for each locale. Crop the strip from
every locale to read them:

```bash
for l in $(ls apps/app-studio/public/assets/screenshots-iphone); do
  ffmpeg -loglevel error -y -i apps/app-studio/public/assets/screenshots-iphone/$l/01-home.png \
    -vf "crop=1206:310:0:740" /tmp/row-$l.png
done
```

The website's home gallery is an iPhone export from Studio, refreshed
separately (README, "Generated website files").

## 5. Finish

- `device_close` with `shutdown: true` for each device, and stop the seed
  worktree's Metro (`pkill -f 'expo start --port <port> '`).
- From `apps/app-studio`: `npm test`, `npx tsc --noEmit`, `npm run build`.
- Open the PR with the `create-pr` skill: contact sheets of the new captures and
  a few rendered scenes as attachments, never committed.
- Uploading to the stores is a separate step the user asks for (see
  work-on-app-studio: dry run first).
