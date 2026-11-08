// Encoding for the annotated screenshots under assets/tutorials/ and
// assets/autolog/. They ride the native binary, so their bytes are app size.
//
// Lossy WebP at quality 85 is about 40% of the 256-colour PNG these frames
// used to be (tutorials 12.9 MB to 7.6 MB, automation 5.8 MB to 2.5 MB), and
// small UI text stays as sharp as in the PNG. Below about 75 the edges of
// coloured text start to smear.
import sharp from 'sharp';

export const SCREENSHOT_WEBP_QUALITY = 85;

/** Encodes raw RGBA pixels, or any image file sharp can read, as WebP. */
export function encodeScreenshotWebp(input, raw) {
  return sharp(input, raw ? { raw } : undefined)
    .webp({ quality: SCREENSHOT_WEBP_QUALITY, effort: 6 })
    .toBuffer();
}

/**
 * The website still serves PNG, so the sync decodes a frame back to the
 * 256-colour PNG it has always received.
 */
export function decodeScreenshotToPng(input) {
  return sharp(input)
    .png({ palette: true, colours: 256, dither: 0, compressionLevel: 9 })
    .toBuffer();
}
