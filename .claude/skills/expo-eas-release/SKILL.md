---
name: expo-eas-release
description: Build, submit, and OTA-update the money2time app with Expo EAS. Use when cutting a release, running an EAS build, submitting to TestFlight / App Store / Play, pushing an over-the-air (expo-updates) JS update, bumping the version, choosing a build profile/channel, or debugging an EAS build/submit/update. Grounded in this repo's eas.json, app.json, and CI.
---

# Expo EAS release (money2time)

Expo SDK 54 / RN 0.81, New Architecture. Releases go through **EAS Build → EAS Submit**, with **expo-updates** for OTA JS patches. This repo builds **locally** (`--local`), not on EAS cloud builders.

Config sources of truth: `eas.json` (profiles/submit), `app.json` (version, updates, runtimeVersion), `.github/workflows/deploy.yml` (CI), and the `/ship-ios` & `/ship-android` commands (the manual path).

## Project facts (don't re-derive)

- **EAS project**: `projectId 27dec73c-197f-4b74-87ae-542e75fc549e`, slug `money2time`. Updates URL `https://u.expo.dev/<projectId>`.
- **Profiles** (`eas.json`): `development` (dev client, internal dist), `preview` (internal dist), `production` (`autoIncrement: true`, `channel: production`).
- **`appVersionSource: "remote"`** — the version/build number is owned by EAS, not hand-edited build-to-build. `production` auto-increments the build number.
- **Submit targets**: iOS `ascAppId 6760418898`; Android `track: production`.
- **OTA**: `expo-updates` with `runtimeVersion.policy = "appVersion"` and the `production` channel. **An OTA update only reaches installed builds whose app version (e.g. `1.3.1`) matches** — change the native runtime (new native module, SDK bump, version bump) and old installs will NOT receive that JS bundle; they need a new store build.

## Preflight (always, before any build or update)

The CI `test` job gates every build on `npm run check && npm test`. Reproduce it locally first — a red check means a wasted ~20–40 min build:

```bash
npm run check   # typecheck + lint + format:check
npm test
```

Also confirm you're on the intended ref (releases ship from `main`) and the working tree is clean.

## Path A — Full native release (most common)

Use when anything native changed (new native dep, config plugin, version bump, SDK) or for a normal store release.

- **Easiest: use the existing commands** — `/ship-ios` and `/ship-android`. They run the exact two-step local build + submit for this project (answer `Y` to prompts; iOS submit may ask for the Apple ID email).
- **Or push to `main`** — CI (`deploy.yml`) auto-runs test → plan → deploy: `eas build --local` on the matched runner (macOS for iOS, Ubuntu for Android) then `eas submit`. Push to `main` ships both platforms to the stores automatically. Requires the `EXPO_TOKEN` repo secret.
- **Manual equivalents** (what the ship commands wrap):
  ```bash
  # iOS
  eas env:exec production 'eas build --platform ios --profile production --local \
    --output ./dist/Money2Time.ipa --non-interactive'
  yes | eas submit --platform ios --profile production --path ./dist/Money2Time.ipa --non-interactive

  # Android
  eas env:exec production 'eas build --platform android --profile production --local \
    --output ./dist/Money2Time.aab --non-interactive'
  yes | eas submit --platform android --profile production --path ./dist/Money2Time.aab
  ```
  `eas env:exec production` injects the EAS-hosted production env vars (RevenueCat/Mixpanel keys) into the local build.

## Path B — OTA update (JS-only, no native change)

Use **only** when the change is pure JS/assets (no native module, no version/SDK bump). Much faster than a store release; no review.

```bash
eas update --branch production --message "describe the change"
```

The `production` channel maps to the `production` branch. The update reaches only installs whose `runtimeVersion` (= app version) matches the current `app.json` `version`. If you bumped `version`, OTA won't reach older installs — ship a native build instead.

**Decision rule:** native code / native deps / SDK / `version` changed → **Path A**. Otherwise → **Path B**.

## Versioning

- App marketing version lives in `app.json` `expo.version` (currently `1.3.1`) and drives `runtimeVersion` via the `appVersion` policy. Bump it for a user-facing release with native changes.
- Build numbers are remote/auto-incremented by the `production` profile — don't hand-set them.
- Bumping `version` starts a fresh OTA runtime: pre-bump installs stop getting OTA on the old runtime and must update via the stores.

## Debugging

- **Build fails in check/test**: fix locally; CI won't proceed past the `test` job.
- **Local build env/credentials**: builds use `--local`; ensure Xcode/Android SDK and signing are set up. `ANDROID_HOME` must be exported for Android. Credentials are managed by EAS (`eas credentials`).
- **Submit rejected**: verify `ascAppId` / Play track in `eas.json` and that the binary's version/build number isn't already used.
- **OTA not landing**: almost always a `runtimeVersion` (app version) mismatch, wrong channel/branch, or the app not having fetched the update yet (expo-updates checks on launch). Confirm with `eas update:list --branch production`.
- **Inspect**: `eas build:list`, `eas build:view`, `eas submit` logs, `eas update:list`.

## Definition of done

- `npm run check` + `npm test` green before building.
- Correct path chosen (native build vs OTA) per the decision rule.
- Version bumped iff a user-facing native release.
- Build submitted to the right store track / OTA pushed to `production`.
- Release notes / `eas update` message describe the change.

## Anti-patterns

- Shipping an OTA update that includes a native change or version bump (old installs break or silently miss it).
- Hand-editing build numbers despite `appVersionSource: remote` + `autoIncrement`.
- Building before `npm run check`/`npm test` pass — wastes a long local build.
- Submitting from a profile/channel other than `production` for a real release.
- Committing secrets — production env comes from `eas env:exec`, not the repo.
