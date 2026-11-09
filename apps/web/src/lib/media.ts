/**
 * Every picture and video the site shows, apart from its own icons in
 * `public/`, is served from the `money2time-assets` R2 bucket through its
 * custom domain. `media/` in this repository is the source, mirrored to the
 * bucket's `web/` prefix by `node scripts/upload-media.mjs`: a file added to
 * `media/` shows on the site, in development too, only once that has run.
 */
export const MEDIA_ORIGIN = "https://media.money2time.com";

const PREFIX = "/web";

type MediaPath = `/${string}`;

/** The file as it is in `media/`, by its path there: `/videos/back-tap.mp4`. */
export function media(path: MediaPath): string {
  return `${MEDIA_ORIGIN}${PREFIX}${path}`;
}

/**
 * The same file resized at Cloudflare's edge (Image Transformations, enabled
 * on the money2time.com zone) and sent as AVIF or WebP when the browser takes
 * them. `scale-down` never enlarges past the original, and `onerror=redirect`
 * falls back to the original if a transformation ever fails.
 *
 * Each width and quality is a separate transformation, and the free plan
 * includes 5,000 distinct ones a month, so this is for the large captures
 * drawn at a fraction of their size, not for icons already exported small.
 */
export function resizedMedia(path: MediaPath, width: number, quality = 75): string {
  const options = `width=${width},quality=${quality},format=auto,fit=scale-down,onerror=redirect`;
  return `${MEDIA_ORIGIN}/cdn-cgi/image/${options}${PREFIX}${path}`;
}

/**
 * The file converted to JPEG at Cloudflare's edge, at its own size. For the
 * Open Graph cards: satori reads PNG and JPEG but not WebP, and Image
 * Transformations cannot write PNG. There is no `onerror=redirect`, so a failed
 * conversion fails the card instead of handing satori the WebP. The deployed
 * Worker cannot fetch `/cdn-cgi/image/` URLs (404) and passes `cf.image`
 * instead (`tutorialShotAsset` in `og.tsx`); this URL is for everywhere else.
 */
export function jpegMedia(path: MediaPath, quality = 90): string {
  return `${MEDIA_ORIGIN}/cdn-cgi/image/format=jpeg,quality=${quality}${PREFIX}${path}`;
}

/**
 * `src` and `srcSet` for a capture drawn `width` CSS pixels wide, at one, two
 * and three times that for denser screens. Pass the same `width` as the
 * element's `sizes`.
 */
export function responsiveMedia(path: MediaPath, width: number, quality = 75) {
  return {
    src: resizedMedia(path, width * 2, quality),
    srcSet: [1, 2, 3]
      .map((density) => `${resizedMedia(path, width * density, quality)} ${width * density}w`)
      .join(", "),
  };
}
