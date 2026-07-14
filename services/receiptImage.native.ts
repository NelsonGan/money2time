/**
 * Native receipt downscaling. Camera/library photos are multi-megapixel, which
 * bloats both local storage (receipts live on-device) and the base64 upload to
 * the scan Worker (image tokens dominate the model cost). Cap the long edge and
 * re-encode as JPEG before the image is stored, so the single stored copy is
 * what both the attachment view and the upload use.
 *
 * The cap is deliberately generous (1600px long edge) — receipts are dense
 * small text, so shrinking too far would make line items unreadable to the OCR
 * model. At 1600px a typical portrait receipt is ~1.2–1.6 MP: legible, but a
 * fraction of the original ~12 MP.
 *
 * Resizing is by a SINGLE dimension (the longer edge), so the library preserves
 * the aspect ratio — the whole receipt is scaled down, never cropped or
 * stretched. The source dimensions come from the caller (both expo-camera and
 * expo-image-picker return width/height), so no extra decode is needed to
 * measure the image.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest edge (px) the stored receipt is capped to; never upscales. */
const MAX_EDGE = 1600;
/** JPEG quality for the re-encode (0–1). */
const COMPRESS = 0.6;

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
