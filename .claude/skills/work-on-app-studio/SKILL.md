---
name: work-on-app-studio
description: Work on App Studio, the tool in this repository at apps/app-studio that makes Money2Time's App Store and Google Play screenshots, iPad and iPhone Duo sets, the App Store header and search creatives, the Play feature graphic, the landing card and the store listing text, and uploads them. Use for any change under apps/app-studio, refreshing or recapturing store screenshots, changing a scene's headline or its translations, exporting store assets, a store upload, store listing descriptions, or the bank and wallet logo set the app's account logos come from. For the What's New note use update-whats-new.
---

# Work on App Studio (apps/app-studio)

App Studio is a local Next.js tool in **this repository**, at
`apps/app-studio`. It was the separate `money2time-screenshots-creator`
repository until 2026-11-09; that repository is retired. Never clone it or open
a PR there. Studio is never deployed: it runs on this Mac, which holds the store
CLIs' credentials.

Read the README's **App Studio** section before changing anything. Paths below
are relative to `apps/app-studio`.

## What lives where

| You are changing…                                         | Look in                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| a scene's headline or layout (iPhone, iPad, iPhone Duo)   | `src/scenes/sceneData.tsx`, `ipadSceneData.tsx`, `duoSceneData.tsx`          |
| the scene copy, per language                              | `src/scenes/locales/<locale>.ts` (23 locales, `en.ts` is the source)         |
| the real app screens inside the scenes                    | `public/assets/screenshots-iphone/<locale>/`, `public/assets/screenshots-duo/<locale>/` (8 PNGs each) |
| the App Store header and search creatives                 | `src/components/AppStoreCreative.tsx`, `src/data/searchAnimation.json`, `src/scenes/appStoreCreativeCopy.ts` |
| store listing text and each release's What's New           | `src/data/appDescriptions.ts` (the [update-whats-new](../update-whats-new/SKILL.md) skill writes What's New) |
| uploads                                                   | `src/data/storeUpload.mjs`, `src/data/storeCreativeUpload.mjs`, `scripts/upload-*.mjs`, `src/app/api/upload/` |
| bank and wallet logos                                     | `public/logos/` and its `manifest.json` (`scripts/fetch-brand-logos.mjs`, `normalize-logos.mjs`, `triage-logos.mjs`) |
| the Play store icon                                       | `public/assets/icons/play_store_512.png`, copied from `apps/mobile`          |

What other parts of the repo take from Studio:

- **The app's account logos.** `apps/mobile/scripts/generate-account-logos.mjs`
  reads `public/logos/`. After you add or change a logo here, run that script in
  `apps/mobile` and commit its output in the same PR.
- **The website's home gallery.** `apps/web/media/screenshots/<language>/` is an
  **iPhone → Export All Locales** from Studio, converted to WebP (see the
  README's "Generated website files" and [work-on-website](../work-on-website/SKILL.md)).

## Set up and run it

```bash
cd apps/app-studio
npm ci
npx next dev -p <free port>   # npm run dev uses 3000, which another worktree may hold
```

Open it with the T3 Code preview tools (`preview_open` with
`target: { kind: "environment-port", port }`), pick a view and a language, and
close the tab and stop the server when you are done. Encoding or checking the
Search video needs `ffmpeg` and `ffprobe` (`brew install ffmpeg`).

## Refreshing the app screenshots

The PNGs in `public/assets/screenshots-*` are real captures of the app with
synthetic data, one folder per locale, so a redesigned screen means
recapturing it in all 23 languages.

1. The data comes from the app's mock-data branch
   (`origin/claude/mock-data-locales-robust-3kk6pv`, `services/previewData`;
   `generatePreviewData(profile)` also sets the app language). It predates the
   app's move to `apps/mobile`: in your worktree, merge `origin/main` into a
   local branch, `git mv services/previewData` and `assets/preview` into
   `apps/mobile/`, and keep both imports in `AppContext.tsx`. Never push that
   branch.
2. Lease a device with the T3 Code device tools (`simlock:ios:iPhone 18 Pro`, or
   `simlock:ios:iPhone Duo` for the Duo set) and run the branch on it with
   `simlock-metro`. Drive the app only with the `agent-device` command
   `device_open` returns; evaluate JavaScript in the app with `agent-device cdp`
   (Metro rejects a raw inspector WebSocket).
3. For each locale: seed its preview profile, turn on Pro
   (`setDevProOverride(true)`), visit the eight screens and save each capture
   under the scene's file name (`01-home.png` … `08-budgeting.png`).
4. iPhone Duo: unfold it (`agent-device help foldable`), go Home, rotate to
   landscape, then launch the app; rotating with the app in front leaves its
   window portrait. An upright capture is 2853 × 2007.
5. Look at the scenes in Studio for every locale, then close the device with
   `device_close` (`shutdown: true`).

The Search creative takes its payment amount and crop from each locale's
`01-home.png`; when those change, check `src/data/searchAnimation.json`
against the new images.

## Rules

- **All 23 locales move together.** A headline or scene change goes into every
  `src/scenes/locales/*.ts`, and new screenshots into every locale folder.
  Filipino exports but has no App Store localization.
- **Uploads write to live store listings.** Never upload unless the user asks
  for that upload. Run the same upload with `--dry-run` first, say what it would
  change, and never submit a version for review.
- **No credentials in the repository.** They stay in the `asc` and `gplay` CLIs
  (`asc doctor`, `gplay doctor`); `.env.local` and `scripts/*.json` / `*.p8` are
  ignored. Never commit a key, a service-account file or a token.
- **Exports are not committed.** Exported sets go in the ignored `exports/`
  folder or outside the repo. Only source art and the captures in `public/` are
  committed; remove art that nothing uses any more.
- Its conventions are its own (Next.js 15 defaults, single quotes). Match the
  file you are in. Never import from another app in this repo.

## Checks

From `apps/app-studio`:

```bash
npm test          # node --test tests/*.test.mjs, uploads and video encoding (needs ffmpeg)
npx tsc --noEmit
npm run build     # when you changed more than copy
```

The `App Studio` workflow (`.github/workflows/app-studio.yml`) runs the same on
every PR and push to `main` that touches `apps/app-studio`. A Studio-only
change cuts no store build and deploys nothing. Put screenshots of changed
scenes in the PR (`.github/pr-assets/<topic>/`, removed again in the next
commit, see [create-pr](../create-pr/SKILL.md)).
