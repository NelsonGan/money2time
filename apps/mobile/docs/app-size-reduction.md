# App size reduction — October 2026

Measured against `8e779f1d` using fresh production builds on the same machine,
with the same SDK, signing configuration and four Android CPU architectures.
MB below means 1,000,000 bytes. Exact bytes and artifact hashes are in
[measurements.json](../../../.github/pr-evidence/app-size/measurements.json).

| Artifact                                 |    Before |     After |         Reduction |
| ---------------------------------------- | --------: | --------: | ----------------: |
| Universal Android release APK            | 316.67 MB | 283.34 MB | 33.32 MB (10.52%) |
| Android release app bundle (AAB)         | 231.45 MB | 206.70 MB | 24.76 MB (10.70%) |
| Android exported Hermes bundle           |  13.52 MB |  12.33 MB |   1.19 MB (8.83%) |
| iOS exported Hermes bundle               |  13.52 MB |  12.32 MB |   1.20 MB (8.87%) |
| Repository assets, excluding PR evidence | 255.00 MB | 238.15 MB |  16.85 MB (6.61%) |

APK/AAB sizes are build artifacts, not store download sizes. Play delivers
architecture/device-specific splits; no App Store IPA or store download was
measured. Export asset counts dropped from 925 to 839 on Android and 833 on iOS.
The OTA asset allowlist excludes logo/tutorial/news directories, so export
counts do not represent every asset embedded in a store binary.

## What contributes to size

The largest reachable asset groups before optimization were category atlases
(24.76 MB), subscription logos (13.92 MB), tutorial captures (12.37 MB), item
icons (7.88 MB), automation illustrations (5.39 MB), the offline cities database
(5.26 MB), bank logos (4.55 MB), and interface illustrations (4.29 MB). Metro
asset hashes deduplicate identical files; an unlisted duplicate is not proof
that an asset is unused.

Across all four APK architectures, native libraries occupy 189.34 MB. The
largest are Skia (40.07 MB), MapLibre (39.54 MB), React Native (22.52 MB), and the
barcode scanner (20.22 MB). They support existing charts, maps and scanning.
Native library bytes and architecture support remain unchanged.

Every runtime dependency has an application import, native/config plugin,
or required peer relationship. No runtime package was removed. In particular,
Skia, worklets and the development client cannot be classified by direct
application imports alone. Source icon packs, artwork sheets and launcher
artwork are generator inputs and were retained.

## Changes and quality limits

- Resolve named Lucide imports to individual modules, including aliases. The
  production dependency graph now includes 155 Lucide icon/helper modules,
  down from 1,672. Type and namespace imports retain their normal behavior.
- Bundle only six used Work Sans faces on Android, rather than all 18 faces
  pulled in by the package barrel. iOS retains its existing system typography
  and now bundles none of those unused font assets.
- Remove 74 unused interface illustrations and their generated/flat registry
  entries (2.02 MB). All 1,905 selectable category icons, their stored IDs,
  and all six packs remain intact.
- Compress PNGs, saving 12.84 MB. Lossless candidates must preserve exact visible pixels.
  Quantization is restricted to true-color atlases, interface illustrations,
  and automation captures. Already indexed artwork is not quantized again.
- Quantized candidates preserve fully transparent pixels and must have maximum
  RGB RMSE no greater than 3/255 on both black and white backgrounds. Atlases
  are checked per 128 px icon cell at 52 px display width, rather than averaging
  errors across the whole sheet. PNG dimensions remain unchanged.
- Replace the small news goal-cover photograph with a 1024 × 512 JPEG at
  quality 85, saving 1.99 MB; its in-app cover was visually checked.
- Enable Android release code and resource shrinking. Compressed APK Java code
  drops from 23.49 MB to 8.83 MB. The AAB includes shrinker metadata, which is
  why its total reduction differs from the APK reduction.
- Include a shared native-image revision in internal update runtimes. A renamed
  or recompressed image excluded from OTA uploads now requires a matching
  rebuilt development/preview app. Production configuration is unchanged.
- Pin image tooling as development dependencies and integrate the same quality
  gate into category-atlas generation so regeneration preserves the savings.

## Internal preview rebuild

Internal development and preview builds must be rebuilt once for this change.
Their runtime includes the app version and a shared content hash of bank logos,
subscription logos, tutorials, and news images. These directories are excluded
from OTA uploads, so their filenames and bytes must match the native build.
Both internal variants use the same revision so a development client can still
load PR previews. Later changes to those images also invalidate old internal
builds; images eligible for OTA retain the existing update flow.

Store builds still disable OTA and retain the existing app-version runtime.
The resolved production configuration was compared with the measured build
and is exactly unchanged. See [Expo asset selection](https://docs.expo.dev/eas-update/asset-selection/).

## Reproduce

Run both baseline and candidate builds with the same environment and SDK:

```sh
CI=1 APP_VARIANT=production npx expo export --platform ios --platform android --dump-assetmap --source-maps --output-dir /tmp/money2time-size-export --max-workers 4
APP_VARIANT=production npx expo prebuild --platform android --no-install
cd android
APP_VARIANT=production SENTRY_DISABLE_AUTO_UPLOAD=true ./gradlew :app:assembleRelease :app:bundleRelease --max-workers=4
```

Set `JAVA_HOME` to JDK 17 and the Android SDK variables to the installed SDK.
When rebuilding after changing an asset, clear these generated directories:

- `android/app/build/generated/res/createBundleReleaseJsAndAssets`
- `android/app/build/generated/assets/createBundleReleaseJsAndAssets`
- `android/app/build/generated/assets/createReleaseUpdatesResources`

Do this first, so obsolete resources and embedded update metadata cannot affect the
comparison. The update-resource task does not track imported image changes
in its incremental inputs.

Review further image candidates without writing, or apply accepted savings:

```sh
python3 scripts/measure-app-size.py android/app/build/outputs/apk/release/app-release.apk android/app/build/outputs/bundle/release/app-release.aab
node scripts/optimize-assets.mjs
npm run optimize:assets
node scripts/generate-category-icons.mjs
```

The optimizer reports per-file bytes, mode and quality error. A repeat pass on
this change reports zero savings. Regenerating all 72 category atlases produces
byte-identical images and leaves the category registry unchanged.

## Verification

- `npm run check`: type checking, lint and formatting passed.
- `npm test -- --runInBand`: 151 suites / 2,162 tests passed, including import
  alias/type behavior, compression, transparency and indexed PNG preservation.
- Internal runtime tests cover renamed/changed native-only images, shared
  development/preview compatibility, and unchanged production behavior.
- Both production exports and fresh Android production/release and internal
  preview builds succeeded. Android asset coverage verification passed against
  the actual embedded update manifest; the preview runtime matches its
  packaged configuration and the published CI preview.
- All 5,771 repository raster images decoded successfully.
- iPhone 17 simulator: cold startup, persisted transaction, all main tabs,
  charts, album map, tutorials, automation guides, light/dark themes, all six category packs,
  emoji picker, item showcase, subscription-logo selection and the JPEG goal-cover showcase checked.
- Pixel 7 / Android API 36 emulator: optimized release installed on a clean
  device; onboarding, transaction creation/persistence, account/item icon
  selection, offline city search, album creation, native map rendering,
  receipt-camera preview, and JPEG goal-cover rendering checked. The final
  production APK was also installed over the internal preview without clearing
  app data; startup and saved onboarding/settings state were preserved.
- Android onboarding before/after screenshots differ by only two pixels below
  the status bar in the screenshot comparison.

Screenshots use synthetic test data and are stored in
[PR evidence](../../../.github/pr-evidence/app-size/). Store purchases and cloud account
operations were not completed; offerings were unavailable in the local release
configuration. iOS store packaging and physical devices remain unverified.
