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
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Longest edge (px) the stored receipt is capped to; never upscales. */
const MAX_EDGE = 1600;
/** JPEG quality for the re-encode (0–1). */
const COMPRESS = 0.6;

export async function downscaleReceiptForStorage(uri: string): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(uri);
    const rendered = await context.renderAsync();
    const longEdge = Math.max(rendered.width, rendered.height);

    if (longEdge > MAX_EDGE) {
      const scale = MAX_EDGE / longEdge;
      context.resize({
        width: Math.round(rendered.width * scale),
        height: Math.round(rendered.height * scale),
      });
      const resized = await context.renderAsync();
      const out = await resized.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG });
      return out.uri;
    }

    // Already within budget — just re-encode to shed the original's overhead.
    const out = await rendered.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    // Never block a scan/attach on a resize failure — fall back to the original.
    return uri;
  }
}
