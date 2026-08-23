# App icon variants

One folder per mascot pose. Only **`happy`** is wired into the build today; the
rest are here for the app-icon switcher, which is not built yet.

| File             | Size      | Notes                                                      |
| ---------------- | --------- | ---------------------------------------------------------- |
| `icon-light.png` | 1024x1024 | Cream backdrop `#FDF0D8`. **No alpha channel** (see below) |
| `icon-dark.png`  | 1024x1024 | Midnight backdrop `#17212E`. No alpha channel              |
| `foreground.png` | 432x432   | Transparent. Android's adaptive foreground layer           |

The backdrop is deliberately the same in every variant: cream in light,
midnight in dark. A variant changes the **pose**, never the colour, so the icon
still reads as the same app whichever one is picked.

The shipped `happy` tile uses the supplied rounded full-mascot composition
instead of the earlier zoomed head crop. The staged switcher variants still use
head crops, which is why those poses are the ones whose **face** tells them
apart (a wink, shut eyes, a magnifier). Two poses differing only below the neck
would make two identical icons, which is why `waving` is not in the set.

## Promoting a variant to the shipped icon

The shipped icon is not read from this folder. Copy the chosen pose out to the
four places that are:

- `assets/ios/AppIcon*.png` — every size, resized from `icon-light.png`.
  Only `AppIcon~ios-marketing.png` reaches a store build (prebuild renders the
  rest from it); the full set is kept in step for `npm run sync:icons`.
- `assets/android/play_store_512.png` — `icon-light.png` at 512.
- `assets/android/res/mipmap-*/` — `foreground.png` into `ic_launcher_foreground`
  and `ic_launcher_monochrome`, the backdrop colour into `ic_launcher_background`,
  and `icon-light.png` into the legacy `ic_launcher`. `app.json`'s
  `android.adaptiveIcon.backgroundColor` must match the backdrop.
- `assets/splash.png` — the pose alone on transparency; `app.json` paints cream
  behind it in light and `#121A24` in dark.

**The App Store rejects an icon that carries an alpha channel**, so the 1024
icons are written as flat RGB. Keep it that way.

`icon-dark.png` is not wired up yet either. Pointing `ios.icon` at
`{ light, dark }` in `app.json` is all it takes, but that changes what prebuild
generates, so it belongs with the switcher work rather than ahead of it.

## How these were composed

From the mascot artwork in `assets/mascots/` (`happy` from the full-resolution
hero render, which is sharper than the 512px bundled copy):

The scale and centring notes below describe the staged switcher variants. Keep
the shipped `happy` composition as supplied rather than re-cropping it.

- **Scale.** The pose stands 1.32 tiles tall, with its crown 6% down from the
  top; the rest runs off the bottom. The Android foreground uses the same
  framing composed for a 90/108 window — Android only ever shows the middle of
  that canvas, and 90dp covers the shapes launchers actually use, so the crown
  survives every mask. Nothing is painted outside the pose there: the background
  layer is the same cream, so there is no seam wherever the mask lands.
- **Centring.** On the **beak**, weighted 70/30 against the head silhouette. The
  beak is the one landmark every pose keeps — half of them have their eyes shut
  — but centring purely on it lets a turned head hang off one side, and centring
  purely on the silhouette lets the face itself drift. Not the bounding box: a
  raised wing or a spray of confetti stretches that well past the chick.
- **Debris.** Cropping to the head slices the pose off below the chin. Anything
  still attached to the chick (belt, pouch) reads as the body carrying on past
  the edge. A _detached_ prop down there does not — a lone coin or the tip of a
  piggy bank's ear becomes a smear with nothing to belong to — so those are
  dropped. Props level with the head (hearts, a Zzz, a question mark) are the
  point of the pose and stay.

The splash is the exception: it keeps the **whole** character, centred on its
alpha centroid, at 56% of the canvas. It has the room, and it is not competing
with a 40px launcher tile.

Not covered by these files: `assets/banner.png`, the wordmark used by the native
widgets. Its badge is the same chick, full body, on the rosewood disc `#D86C72`.
