// Which bundled logo tiles are marks that disappear on the app's dark surface.
//
// Some brand marks are drawn dark-on-transparent (Apple's glyph, Amazon's
// wordmark, the WSJ masthead). Rendered bare on midnight those all but vanish —
// the row shows an empty tile.
//
// This used to be fixed in the pipeline, two different ways: `logoBackground`
// refused to strip the white card such a mark arrived on, and marks that came
// on transparency were composited onto a white square before bundling. Both
// trade a dark-mode problem for a light-mode one — on cream the result reads as
// a paper card behind the logo, which is exactly what stripping exists to
// remove everywhere else. So the tile now stays transparent and the *app* puts
// a plate behind it, in dark mode only (components/ui/SubscriptionLogo.tsx).
//
// What is left here is the detection half of that decision, which is the same
// midnight-contrast test `logoBackground` used to gate stripping on.
// scripts/generate-subscription-logos.mjs runs it over the catalog and emits
// the ids, so the component can look one up instead of measuring pixels at
// runtime.

/** The dark surface a bare mark has to read against; see constants/designSystem.ts. */
const MIDNIGHT = [23, 33, 46];
/**
 * Share of the mark that has to stay legible on midnight. Below it the tile
 * needs a plate.
 */
const MIN_VISIBLE = 0.6;
/** Share that must read when there is no dominant tone to test on its own. */
const MIN_VISIBLE_DIFFUSE = 0.75;
/**
 * WCAG contrast ratio at which a mark still reads against a surface. 2.0 rather
 * than the 4.5 required of body text: these are shapes, not glyphs, and the bar
 * has to pass saturated brand colours whose luminance is genuinely low (Netflix
 * red is 3.35 against midnight) while still catching navy (1.07) and black
 * (1.30).
 */
const MIN_CONTRAST = 2;
/** Bits dropped per channel when tallying the mark's tones. */
const TONE_SHIFT = 3;
/**
 * Share the most common tone needs before "does the dominant tone read" says
 * anything. Below it the mark is a gradient or a photo with no body colour, and
 * the largest bucket can be a stray accent (LA Fitness's gold swoosh is 3.6% of
 * its mark and would vouch for a navy wordmark).
 */
const DOMINANT_MIN_SHARE = 0.1;
/** Alpha below which a pixel is not part of the mark at all. */
const MARK_ALPHA = 16;
/**
 * Share of the tile that must be transparent for a plate to make sense. A tile
 * that is opaque edge to edge is its own background — an app-icon render, a
 * brand-coloured card — and a plate behind it would only show as a rim.
 */
const MIN_TRANSPARENT = 0.25;

/** sRGB -> linear, per WCAG, memoised over the 256 possible channel values. */
const LINEAR = Array.from({ length: 256 }, (_, v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const relativeLuminance = ([r, g, b]) =>
  0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
const MIDNIGHT_LUMA = relativeLuminance(MIDNIGHT);
const contrastOnMidnight = (pixel) => {
  const l = relativeLuminance(pixel);
  return (Math.max(l, MIDNIGHT_LUMA) + 0.05) / (Math.min(l, MIDNIGHT_LUMA) + 0.05);
};

/**
 * True when `image` needs a light plate behind it on the dark surface. A tile
 * that is opaque edge to edge (a brand-coloured card, an app-icon render) is
 * its own background and never qualifies, however dark it is.
 */
export function isDarkMark(image) {
  const { width, height, data } = image.bitmap;
  let mark = 0;
  let visible = 0;
  // Tally the mark's tones so the dominant one can be checked on its own; a
  // pixel-share test alone passes a logo whose whole wordmark is dark as long
  // as some bright accent outvotes it (Amazon's swoosh over its black "a").
  const tones = new Map();

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < MARK_ALPHA) continue;
    const pixel = [data[i], data[i + 1], data[i + 2]];
    mark += 1;
    if (contrastOnMidnight(pixel) >= MIN_CONTRAST) visible += 1;
    const key =
      ((pixel[0] >> TONE_SHIFT) << 10) | ((pixel[1] >> TONE_SHIFT) << 5) | (pixel[2] >> TONE_SHIFT);
    const tone = tones.get(key);
    if (tone) {
      tone.n += 1;
      for (let c = 0; c < 3; c += 1) tone.sum[c] += pixel[c];
    } else {
      tones.set(key, { n: 1, sum: [...pixel] });
    }
  }
  const total = width * height;
  if (!mark || !total) return false;
  if ((total - mark) / total < MIN_TRANSPARENT) return false;

  let dominant = null;
  let dominantCount = 0;
  for (const tone of tones.values())
    if (tone.n > dominantCount) {
      dominantCount = tone.n;
      dominant = tone.sum.map((v) => Math.round(v / tone.n));
    }

  const dominantShare = dominantCount / mark;
  const minVisible = dominantShare >= DOMINANT_MIN_SHARE ? MIN_VISIBLE : MIN_VISIBLE_DIFFUSE;
  if (visible / mark < minVisible) return true;
  return dominantShare >= DOMINANT_MIN_SHARE && contrastOnMidnight(dominant) < MIN_CONTRAST;
}
