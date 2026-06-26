---
name: expo-eas-release
description: Release the money2time app via the GitHub Actions pipeline (EAS Build → EAS Submit). Use when cutting a release, triggering or debugging the deploy workflow, submitting to TestFlight / App Store / Play, bumping the version, or choosing a build profile. Releases run only through CI — there is no manual local-build or OTA path. Grounded in this repo's eas.json, app.json, and .github/workflows/deploy.yml.
---

# Expo EAS release (money2time)

Expo SDK 54 / RN 0.81, New Architecture. **Releases happen only through GitHub Actions** (`.github/workflows/deploy.yml`), which runs EAS Build then EAS Submit. There is no manual local-build path and no OTA/`eas update` flow — do not run `eas build` / `eas submit` / `eas update` by hand for a release.

Config sources of truth: `eas.json` (profiles/submit), `app.json` (version), `.github/workflows/deploy.yml` (the pipeline).

## Project facts (don't re-derive)

- **EAS project**: slug `money2time`, `projectId 27dec73c-197f-4b74-87ae-542e75fc549e`.
- **Profiles** (`eas.json`): `development` (dev client, internal dist), `preview` (internal dist), `production` (`autoIncrement: true`, `channel: production`).
- **`appVersionSource: "remote"`** — the build number is owned by EAS, not hand-edited; the `production` profile auto-increments it.
- **Submit targets**: iOS `ascAppId 6760418898`; Android `track: production`.
- **CI secret**: the pipeline requires the `EXPO_TOKEN` repo secret.

## The pipeline (`deploy.yml`)

Three jobs, gated `test → plan → deploy`:

- **test** — runs on every push, PR, and dispatch: `npm ci`, `npm run check` (typecheck + lint + format), then `npm test`. A red check here blocks `plan` and `deploy`.
- **plan** — push-to-`main` and manual-dispatch only. Resolves the build matrix (push = iOS + Android production; dispatch = the chosen single platform/profile).
- **deploy** — push-to-`main` and manual-dispatch only. `eas build --local` on the matched runner (macos-latest for iOS, ubuntu-latest for Android), then `eas submit`. `fail-fast: false`, so one platform failing doesn't kill the other.

Concurrency cancels in-flight runs on a new push to the same ref.

## How to release

1. **Make sure `npm run check` and `npm test` pass** (locally is fine; CI's `test` job will block the release otherwise). This is the only gate that matters before shipping.
2. **Bump `app.json` `expo.version`** for a user-facing release. Don't touch build numbers — `appVersionSource: remote` + `autoIncrement` manages them.
3. **Trigger the deploy:**
   - **Normal release:** merge/push to `main`. CI runs test → plan → deploy and ships **both** platforms to TestFlight + Play (`production` track) automatically.
   - **Single platform / non-production profile:** use **workflow_dispatch** on `deploy.yml` and pick the `platform` (ios/android) and `profile` (production/preview/development) inputs.
4. **Watch the run** until `deploy` is green; confirm the build reached the store track.

## Versioning

- Marketing version lives in `app.json` `expo.version` (currently `1.3.1`); bump it for a user-facing release.
- Build numbers are remote/auto-incremented by the `production` profile — never hand-set them.

## Debugging

- **`test` job red** → fix `npm run check` / `npm test` locally and push again; the pipeline won't build until it's green.
- **`deploy` build fails** → read the EAS build logs in the job output; common causes are signing/credentials (`eas credentials`) or a native/config error. Credentials are managed by EAS.
- **Submit rejected** → verify `ascAppId` / Play track in `eas.json` and that the version/build number isn't already used on the store.
- **Inspect** outside CI with read-only commands if needed: `eas build:list`, `eas build:view`, `eas submit` history.

## Definition of done

- `npm run check` + `npm test` green.
- `app.json` version bumped iff a user-facing release.
- The `deploy` job finished green and the build reached the correct store track.
- Release notes describe the change.

## Anti-patterns

- Running `eas build` / `eas submit` / `eas update` by hand for a release — releases go through GitHub Actions only.
- Pushing a release before `npm run check`/`npm test` pass — CI blocks it at the `test` job.
- Hand-editing build numbers despite `appVersionSource: remote` + `autoIncrement`.
- Triggering a release from a profile other than `production` for a real store release.
- Committing secrets — release env is provided to CI via `EXPO_TOKEN`, not the repo.
