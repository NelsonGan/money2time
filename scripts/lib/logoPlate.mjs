// Some brand marks are drawn dark-on-transparent (Amazon's wordmark, Whoop's
// monogram, Tidal, Kindle Unlimited). Rendered bare on the app's midnight dark
// surface those all but disappear — the picker shows an empty tile. The rest of
// the catalog is opaque app-icon art that reads on any background, so the fix is
// to give just these a plate and make them consistent with the majority.
//
// Shared by scripts/fetch-subscription-logos.mjs and the one-off repair pass.

/** Fraction of the tile that must be fully transparent to count as "no background". */
const TRANSPARENT_BG_RATIO = 0.25;
/** Fraction of the visible mark that must be dark for it to be at risk. */
const DARK_MARK_RATIO = 0.8;
/** Luminance below which a pixel reads as "dark" against a midnight surface. */
const DARK_LUMINANCE = 70;
/** How much of the plate the mark occupies — the inset that makes it read as an app icon. */
const MARK_SCALE = 0.78;

export function needsPlate(image) {
  const { width, height, data } = image.bitmap;
  let clear = 0;
  let opaque = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 32) {
      clear += 1;
      continue;
    }
    opaque += 1;
    if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < DARK_LUMINANCE) dark += 1;
  }
  const total = width * height;
  if (!total || !opaque) return false;
  return clear / total > TRANSPARENT_BG_RATIO && dark / opaque > DARK_MARK_RATIO;
}

/**
 * Centres the mark on an opaque white tile at MARK_SCALE. White rather than a
 * theme colour because these are third-party brand marks drawn for light
 * backgrounds — that is the surface their contrast was designed against, and it
 * is what their own app icons use.
 */
export function applyPlate(Jimp, image, size) {
  const inset = Math.round(size * MARK_SCALE);
  const { width, height } = image.bitmap;
  // Scale by hand rather than via Jimp's `contain`, whose third argument is an
  // alignment bitmask, not a resize mode — passing one for the other happens to
  // work only because the string coerces.
  const scale = Math.min(inset / Math.max(1, width), inset / Math.max(1, height));
  const scaled = image
    .clone()
    .resize(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
      Jimp.RESIZE_BICUBIC,
    );
  const plate = new Jimp(size, size, 0xffffffff);
  plate.composite(
    scaled,
    Math.round((size - scaled.bitmap.width) / 2),
    Math.round((size - scaled.bitmap.height) / 2),
  );
  return plate;
}
