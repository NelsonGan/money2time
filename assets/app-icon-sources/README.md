# Whole-tile icon sources

Artwork for app icon variants that are **not** a mascot pose, so there is no head
for `scripts/generate-app-icons.mjs` to frame. Each file is a transparent cut-out
already composed at tile scale (1024x1024), stamped through the generator's
identity framing and then given the same seven faces as every other variant.

| File        | Variant | Origin                                             |
| ----------- | ------- | -------------------------------------------------- |
| `clock.png` | `clock` | The pre-mascot app icon, restored from git history |

## How `clock.png` was restored

The icon the app shipped with until the mascot landed (`8acb252a`, Aug 2026) was
a coin and a clock inside two circular arrows. Two artefacts of it survive in
history, and neither is usable on its own:

- `31aa5186:assets/ios/AppIcon~ios-marketing.png` — the full 1024 tile, but the
  artwork is baked onto an off-white `#FAF9F6` backdrop with a soft drop shadow.
- `31aa5186:assets/android/res/mipmap-xxxhdpi/ic_launcher_foreground.png` — a
  clean, artist-authored transparent cut-out, but only 432px.

Lifting the tile's backdrop off by colour alone does not work, and the reason is
worth recording because it looks like it should: **the arrows are white**, only a
few levels from the off-white field, so any flood fill that reaches the backdrop
walks straight into them and tears the arrows apart. Upscaling the 432 cut-out
3.6x instead keeps the arrows but throws away most of the resolution a 1024 tile
needs.

So the two were combined: the 432 cut-out's **alpha** was aligned onto the 1024
tile (a brute-force scale/offset search over the saturated pixels of both, which
settled at scale 3.555, offset -254/-255, IoU 0.973) and used for the artwork's
_topology_ — what is inside the silhouette, arrows included — while the tile's
own full-resolution colour supplies the **sub-pixel edge** wherever it is
unambiguous. The drop shadow, which the 432 cut-out does not have, is dropped by
rejecting near-neutral pixels darker than the backdrop outside the deep interior.

That was one-off archaeology on two blobs that will never change, so the restored
cut-out is committed here rather than re-derived on every run. To check it, or to
redo it: the light face should sit on cream like every other variant, and the
white arrows should survive intact on the midnight face.
