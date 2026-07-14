/**
 * Native receipt downscaling. Camera/library photos are multi-megapixel, which
 * bloats both local storage (receipts live on-device) and the base64 upload to
 * the scan Worker (image tokens dominate the model cost). Cap the long edge and
 * re-encode as JPEG before the image is stored, so the single stored copy is
 * what both the attachment view and the upload use.
 *
 * The cap is 1536px on the long edge — receipts are dense small text, so
 * shrinking too far would make line items unreadable to the OCR model. 1536 is
 * chosen to land on the model's tile grid: vision models tile images into
 * 768px cells (2 x 768 = 1536), so a portrait receipt fits in a 2x2 = 4-tile
 * budget. Nudging up to 1600 spills the long edge into a third tile row (6
 * tiles, ~50% more image tokens) for no readable gain, so we sit right at the
 * boundary. A typical portrait receipt lands at ~1.2–1.8 MP: legible, but a
 * fraction of the original ~12 MP.
 *
 * Resizing is by a SINGLE dimension (the longer edge), so the library preserves
 * the aspect ratio — the whole receipt is scaled down, never cropped or
 * stretched. The source dimensions come from the caller (both expo-camera and
 * expo-image-picker return width/height), so no extra decode is needed to
 * measure the image.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Longest edge (px) the stored receipt is capped to; never upscales. Sits on
 * the 768px tile grid (2 x 768) so a portrait receipt fits a 4-tile budget.
 */
const MAX_EDGE = 1536;
/**
 * JPEG quality for the re-encode (0–1). Quality does not affect the model's
 * image-token cost (that is resolution/tile-based), only the stored file size,
 * so keep it high enough for crisp small text.
 */
const COMPRESS = 0.7;

export async function downscaleReceiptForStorage(
  uri: string,
  source: { width?: number | null; height?: number | null } = {},
): Promise<string> {
  try {
    const width = source.width ?? 0;
    const height = source.height ?? 0;
    const context = ImageManipulator.manipulate(uri);

    // Only scale down, and only along the longer edge so the aspect ratio is
    // preserved (single-dimension resize never crops or distorts). When the
    // dimensions are unknown or already within budget we just re-encode.
    if (Math.max(width, height) > MAX_EDGE) {
      context.resize(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE });
    }

    const image = await context.renderAsync();
    const out = await image.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    // Never block a scan/attach on a resize failure — fall back to the original.
    return uri;
  }
}
