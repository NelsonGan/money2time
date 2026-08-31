# App icon variants

One folder per icon variant, composed by `node scripts/generate-app-icons.mjs`
from the mascot artwork in `assets/mascots/`, plus the whole-tile artwork in
`assets/app-icon-sources/` for the variants that are not a mascot pose. The user
picks between them in Settings > Display > App icon. `classic` and `purse` are
free; the rest are Pro, which the catalogue records as a `free` flag per variant
rather than deriving from the default.

| File                | Size      | Notes                                                      |
| ------------------- | --------- | ---------------------------------------------------------- |
| `icon-light.png`    | 1024x1024 | Cream backdrop `#FDF0D8`. **No alpha channel** (see below) |
| `icon-dark.png`     | 1024x1024 | Midnight backdrop `#17212E`. No alpha channel              |
| `icon-tinted.png`   | 1024x1024 | Greyscale on black, for iOS 18's tinted mode. No alpha     |
| `foreground.png`    | 432x432   | Transparent. Android's adaptive foreground layer           |
| `monochrome.png`    | 432x432   | Transparent silhouette. Android's themed-icon layer        |
| `preview-light.png` | 256x256   | What the in-app picker renders in light mode               |
| `preview-dark.png`  | 256x256   | What the in-app picker renders in dark mode                |

The backdrop is deliberately the same in every variant: cream in light,
midnight in dark. A variant changes the **pose**, never the colour, so the icon
still reads as the same app whichever one is picked. `purse` is the one variant
that is not a pose at all (see below), and it keeps the shared backdrop for
exactly that reason: it is already a different era of artwork, and letting it
carry its own field too would leave it looking like a foreign tile in the picker
rather than an older one. That costs nothing here, since the cream it was drawn
on turns out to be the same cream.

The folder name is the variant **id**, which is the app's own and not the
mascot's: an id ends up in a DB row (`settings.app_icon`), in the iOS
alternate-icon name and in the Android activity-alias, so it has to survive the
artwork behind it being redrawn. `scripts/generate-app-icons.mjs` owns the id ->
mascot mapping, and `constants/appIcons.ts` owns the picker order and labels.

## Dark mode

Each platform's own mechanism, rather than the app driving it:

- **iOS 18+** registers `icon-light`, `icon-dark` and `icon-tinted` as
  appearances of one icon, and the system picks between them from the home
  screen's own appearance setting (long-press > Edit > Customize; Dark can be
  set to Always or Auto, and Tinted is offered there too). Note that the
  **Default** setting stays on the light face even with the system in dark mode,
  so the dark tile is opt-in on the user's side and the picker deliberately
  promises nothing about when it appears. Doing it
  from the app instead would mean calling `setAlternateIconName` on every theme
  change, and iOS shows a modal alert on every successful call: a user on the
  automatic theme would get one at dusk. Older iOS falls back to the light face.
- **Android** has no light/dark launcher icons. `plugins/withAndroidAlternateIcons.js`
  overrides each icon's background colour in `values-night`, which launchers
  that re-resolve resources in dark mode will pick up (many cache the bitmap
  until the next app update, so treat this as a bonus). The reliable Android
  story is the themed icon, which is what `monochrome.png` is for. That same
  plugin also carries the deep-link fix that keeps widgets working after an icon
  change; its header explains why.

## The pre-mascot icon

`purse` is the coin-purse character the app wore immediately before the current
mascot. It is offered free rather than as a Pro alternate, because it is the icon
a long-time user already had and putting it back is not a premium feature. Its
source is a transparent cut-out in `assets/app-icon-sources/`, whose README
records which blob in git history it was lifted from. From the generator's point
of view it is ordinary: artwork already composed at tile scale, stamped through
the identity framing, given the same seven faces as everything else.

The icon before _that_ one, a coin and a clock inside two circular arrows, was
offered here for a while under the id `clock` and has been retired: two eras of
retired artwork in one picker is one more than the feature is worth, and the
purse is the one people actually remember having. It is still in history if it is
ever wanted back, along with the archaeology its restoration needed, at
`35c0de74`.

Its artwork is gone but its **alias is not**, and that asymmetry is deliberate.
Retiring an alternate icon outright breaks Android in a way the user cannot undo:
switching icons there enables an `activity-alias` and disables whatever component
the app was launched through, which on the default icon is `MainActivity`. That
disabled state survives the update, so an install sitting on a retired icon comes
back up with `MainActivity` disabled and no alias to replace it — no launcher
entry, and no way in to fix it. So `Clock` stays registered in `app.json`,
pointed at `classic`'s artwork, and `RETIRED_ALTERNATE_NAMES` in
`constants/appIcons.ts` records why. `AppContext`'s icon-sync effect is what
moves such a device back to the primary icon, and it is the only thing that
re-enables `MainActivity`.

## Adding or changing a variant

Edit `ALTERNATES` (or `RESTORED`, for whole-tile artwork) in
`scripts/generate-app-icons.mjs`, re-run it, then mirror the
change in three places: `APP_ICONS` in `constants/appIcons.ts` (id, PascalCase
`alternateName`, label key, `free`), the `expo-alternate-app-icons` and
`withAppIconNightBackgrounds` entries in `app.json`, and the `app_icon.*` labels
in all 23 locales. `__tests__/constants/appIcons.test.ts` fails if the catalogue
and app.json disagree, or if a face is missing from disk: none of that wiring is
exercised until `expo prebuild` runs on an EAS build, which is long after CI has
gone green.

A pose only earns a slot if it survives being cropped to the head and masked
into a squircle at 40px. That is a harsh filter: most of the mascot sheet
(`receipt`, `laptop`, `writing`, `scan-*`) collapses into the default because
its prop is below the neck, and poses that differ only in how the chick is
turned (`cheering`, `waving`) read as duplicates.

## The shipped icon

`classic` is what every existing install already has. Its `icon-light.png` is the
supplied artwork out of `assets/ios/AppIcon~ios-marketing.png`, passed through
pixel-for-pixel (re-encoded, never recropped) and it must stay that way; the other faces are composed from a cut-out of it, which
lands in exactly the same place because the framing landmarks in the generator
were measured off that tile. `app.json` points `ios.icon` and
`android.adaptiveIcon` straight at this folder.

**The App Store rejects an icon that carries an alpha channel**, so the 1024
tiles are written as 3-channel PNGs. `__tests__/constants/appIcons.test.ts`
checks the IHDR colour-type byte of every one.

`assets/android/` is gone. It held a `res/` mipmap set left over from the
pre-switcher pipeline plus the 512 tile that `android.icon` and the web favicon
pointed at. Nothing regenerated that tile, so redrawing the mascot updated every
icon except those two and left them on the old chick with nothing to catch it.
Both now read `classic/icon-light.png` like everything else, and a test pins them
there. The Play Console listing wants exactly 512x512, which is one resize away:

```bash
sips -z 512 512 assets/app-icons/classic/icon-light.png --out play_store_512.png
```

Dropping `res/` also removes a trap. Its `ic_launcher_foreground.png` had the
cream backdrop baked in, so anything that copied it back would draw a cream card
inside the launcher's own mask, which is the bug adaptive icons exist to avoid.
`npm run sync:icons` deletes those three filenames out of the prebuilt native
`res/` for that reason.

The rest of `assets/ios/` is still a leftover of that pipeline and is kept:
nothing reads it except `AppIcon~ios-marketing.png`, which is the source of
`classic`, and the other sizes give a revert of this wiring something to go back
to.

`assets/ios/` keeps the legacy full-size icon set. Only `AppIcon~ios-marketing.png`
is still read (as the source of `classic`); prebuild renders every other size
from `ios.icon`, and `npm run sync:icons` no longer copies that folder into the
native project, because doing so would overwrite the appearance-aware
`Contents.json` prebuild writes and drop the dark and tinted faces.

## Framing

One fixed transform for every pose, not a per-pose fit. The mascot sheets all
draw the same rig at the same scale and position, so a per-pose measurement buys
nothing and actively hurts: a raised wing or a spray of confetti moves the
measured bounds without moving the head, and the icons then disagree about how
big the chick is. The transform is calibrated so the head lands where it lands in
the shipped tile, measured off it: crown 6.2% down, head 85% of the tile wide,
centred a hair right of middle because the head is drawn slightly turned.

- **Android** composes for the middle **72 of 108** dp. An adaptive layer is
  108dp but the system only ever shows that inner 72dp square, reserving the
  outer 18dp on each side for the launcher's parallax and pulse effects, and it
  applies the mask inside what is left. The pose is left to run out into the
  reserved margin rather than stopping at it, and the background layer is the
  same colour, so there is no seam wherever the mask lands.
- **Debris.** Cropping to the head slices the pose off below the chin. Anything
  still attached to the chick (belt, pouch) reads as the body carrying on past
  the edge. A _detached_ prop down there does not, so it is simply cropped.
  Props level with the head (hearts, a Zzz, a magnifier) are the point of the
  pose and stay.

The splash is the exception, and is not generated here: it keeps the **whole**
character, centred on its alpha centroid, at 56% of the canvas. It has the room,
and it is not competing with a 40px launcher tile.

Not covered by these files: `assets/banner.png`, the wordmark used by the native
widgets. Its badge is the same chick, full body, on the rosewood disc `#D86C72`.
