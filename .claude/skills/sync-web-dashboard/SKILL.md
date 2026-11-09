---
name: sync-web-dashboard
description: Keep the Web Dashboard (app.money2time.com, the website in apps/web) in step with the app. Run it on every product or code change, after the app change works, before the PR, to decide whether the dashboard shows, edits or parses what changed and, if it does, change and verify apps/web in the same branch and PR. Use whenever a change adds or alters a feature, a screen's rules, a list or total, a database table or column, the Export Database JSON, an editor flow, a free-plan limit, or anything under services/webDashboard*.
---

# Sync the Web Dashboard

The Web Dashboard is a second front end for the same data. The phone sends its
Export Database JSON (patched row by row afterwards), and the website in
`apps/web` rebuilds the app's pages, totals and editors from it. Nothing there updates by itself: a
feature the app gains and the web does not learn makes the dashboard wrong
or out of date. **A change is not finished until this skill has run on it.**

Read the README's "Web-dashboard Worker" and "Website" sections, and the
[work-on-website](../work-on-website/SKILL.md) skill (setup, checks and rules
for `apps/web`), before changing anything on either side.
Web paths below are relative to `apps/web`, app paths to `apps/mobile`.

## 1. Decide the impact

Walk the app diff and answer each question. Any "yes" means `apps/web` changes
in the same branch and PR.

| The app change…                                                                                                                                                        | Web places to check                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| adds or changes a table, column or the backup's top-level fields                                                                                                       | `src/lib/backup/types.ts`, `parse.ts`, `model.ts`. The app's `services/webDashboardPatch.ts` needs no change: a table whose rows all have a unique string `id` patches row by row, any other is sent whole                                                  |
| changes what a list, total, balance, chart or budget counts or shows                                                                                                   | `src/lib/backup/model.ts` (the "app-equivalent maths") and the page in `src/components/dashboard/views/`                                                                                                                                                    |
| adds a row type, badge, tint, grouping or label to a list                                                                                                              | `views/transactions.tsx` (`TxList`, used by Transactions, Calendar, Accounts in `wealth.tsx`, Spending, Life)                                                                                                                                               |
| changes an editor flow, its rules or what a save writes                                                                                                                | `src/components/dashboard/edit/` and `src/lib/cloud/edits.ts`; on the app, `services/webDashboardEdits.ts`, `services/webDashboardEditModules/`, `features/settings/lib/webDashboardApply/`                                                                 |
| changes the link, crypto, patch or edit protocol                                                                                                                       | `src/lib/cloud/relay.ts`, `crypto.ts`, `patch.ts`, `edits.ts`, which must match `services/webDashboardLink.ts`, `webDashboardCrypto.ts`, `webDashboardPatch.ts`, `webDashboardEdits.ts` byte for byte                                                       |
| changes what the phone sends (budgets, assets, `meta`)                                                                                                                 | the app's `services/webDashboard*.ts` (monthly budgets only: `webDashboardBudgets.ts`) and the web reader of it                                                                                                                                             |
| changes a free-plan limit or what needs Pro                                                                                                                            | `src/components/dashboard/pro-limits.ts`, `paywall.tsx`                                                                                                                                                                                                     |
| adds user-facing words the web also shows                                                                                                                              | `messages/<locale>.json` (32 locales; reuse an existing key when the words match)                                                                                                                                                                           |
| adds logos, icons, item art or card designs                                                                                                                            | `node scripts/sync-dashboard-assets.mjs` in `apps/web` (it reads `../mobile`, so your branch's app); if it changed `media/mascots`, publish them with `node scripts/upload-media.mjs`                                                                          |
| is app-only by design (image uploads, Pro icon packs, main-currency change, online rates, weekly and yearly budgets, device features such as widgets or notifications) | nothing; say so                                                                                                                                                                                                                                             |

When nothing applies, write "Web Dashboard: no impact (reason)" in the PR's
description and stop. Do not make an empty web change.

## 2. Keep both versions working

The web deploys the moment the PR merges (the `Web` workflow); the app reaches
people through the stores days later, and some never update. So:

- The web must read data from **older apps** (a missing column, an older
  shape) and from **the new app** at once. Default every new field.
- A new field the web sends in an edit, or a format an older page would
  misread, goes behind a page feature: add a name to `WANT_FEATURES` in the
  app's `services/webDashboardLink.ts` and the web's `src/lib/cloud/relay.ts`,
  and have each side use it only when the other names it (`meta.features`).
  `budget-currencies` is the worked example (README: "Page features").
- An older app refuses an edit op with a key it does not know: never send a
  new key to a phone that has not said it takes it.
- Derived, display-only rows (like payback rows) need no protocol change: build
  them in the web from the data it already gets, the way the app does.

## 3. Make the web change

- Work in `apps/web` of the same worktree and branch as the app change, and
  run `npm ci` there first (a symlinked `node_modules` breaks the build).
- Mirror the app's rule, not its code: name the app function it follows in a
  comment (as `model.ts` does), keep the same rounding, rates and edge cases.
- Put pure logic in a module whose value imports all end in `.ts` and use no
  `@/` alias (type-only imports are fine), so `node --test` can load it, and
  test it (`src/**/*.test.ts`).
- Run the website's checks in `apps/web`: `npm run lint`, `npm run typecheck` (it generates
  the Worker binding types first; plain `tsc` fails in a fresh worktree),
  `npm test`, `node scripts/validate-messages.mjs`, and `npm run build` for
  anything beyond a small view change.
- Update the README's "Website" section where it describes what changed, and
  its "Web-dashboard Worker" section for any protocol, page-feature or edit-op
  change.

## 4. Verify end to end

Check the change on a real dashboard fed by the simulator running your app
branch:

1. Relay: in `apps/cloudflare/workers/web-dashboard`, a gitignored `.dev.vars`
   with `ALLOWED_ORIGINS=http://app.localhost:<web port>`, then
   `npm ci && npm run dev -- --port 8787 --ip 127.0.0.1` (the pinned wrangler).
2. Web: `.env.development.local` (never `.env.local`) with
   `NEXT_PUBLIC_WEB_DASHBOARD_RELAY_URL=http://127.0.0.1:8787`, then
   `npm run dev -- --port <web port>` and open `http://app.localhost:<web port>`
   (port 3000 is often taken).
3. App: stop this worktree's Metro (the `pkill -f 'expo start --port <port> '`
   line `simlock-metro` printed; it reuses a running Metro, which would ignore
   the new variable), then run
   `EXPO_PUBLIC_MONEY2TIME_WORKERS_WEB_DASHBOARD=http://127.0.0.1:8787 simlock-metro <device id> <agent-device command>`.
   On Android also run `ANDROID_ADB_SERVER_PORT=5038 adb reverse tcp:8787 tcp:8787`.
4. Link: open the dashboard with `preview_open` and `profileId: "incognito"`
   (a profile that linked an earlier simulator keeps that link). Read the QR's
   `money2time://pair?…` value through React: from `svg[role=img]`, walk the
   `__reactFiber…` key's `.return` chain until `memoizedProps.value`. Open it on
   the device with the `agent-device` command (`open com.nelsongan.money2time
'<link>'`), check both screens show the same six-digit code, and tap Link on
   the phone, then on the page.
   - **iOS: the pool's dev clients cannot link.** `simlock-build` and the
     nightly builds use `CODE_SIGNING_ALLOWED=NO`, which drops the keychain
     entitlement, so saving the link key fails ("A required entitlement is not
     present"; the phone shows "Something went wrong"). Build a dev client
     signed to run locally and install it on your lease (re-signing the shared
     `.app` with `codesign` makes the simulator refuse to launch it). From
     `apps/mobile` in your worktree, with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`:
     `npm ci` (if `node_modules` is missing), `APP_VARIANT= npx expo prebuild -p ios`
     (if `ios/` is missing), then
     `xcodebuild -workspace ios/Money2Time.xcworkspace -scheme Money2Time -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath ~/MobileBuilds/derived/<worktree>-signed ARCHS=arm64 ONLY_ACTIVE_ARCH=NO CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= build`
     (about 10 minutes), and
     `agent-device install com.nelsongan.money2time ~/MobileBuilds/derived/<worktree>-signed/Build/Products/Debug-iphonesimulator/Money2Time.app`
     from the worktree. The app's data stays.
5. Exercise the changed flow on the phone and check the dashboard updates;
   for an editor change, edit from the browser and check the phone. Capture
   screenshots of the dashboard (the preview tools or a browser screenshot).

## 5. Ship them together

- The web change goes in the same PR as the app change, with the dashboard
  screenshots attached beside the app's (`--attach`, see
  [create-pr](../create-pr/SKILL.md)).
- Merging deploys the web at once and ships the app through the stores later.
  When the web needs the new app to be useful, say in the description that it
  degrades safely until then (step 2).
- Under Verification, say what was checked on the dashboard, or "Web
  Dashboard: no impact (reason)".
