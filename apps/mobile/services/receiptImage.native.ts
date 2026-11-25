/**
 * Native receipt downscaling. Camera/library photos are multi-megapixel, which
 * bloats both local storage (receipts live on-device) and the base64 upload to
 * the scan Worker (image tokens dominate the model cost). Cap the long edge and
 * re-encode as JPEG before the image is stored, so the single stored copy is
 * what both the attachment view and the upload use.
 *
 * The cap depends on what the image is (`receiptMaxEdge` in
 * utils/receiptImageSize.ts): 1536px for photos of paper receipts, whose small
 * printed text needs it, and 1280px for phone screenshots in screenshot scans,
 * which read the same at that size. Claude, the scan model, bills an image by
 * its pixels (width x height / 750 tokens), so the cap sets the image's share
 * of every scan's cost directly.
 *
 * Resizing is by a SINGLE dimension (the longer edge), so the library preserves
 * the aspect ratio — the whole receipt is scaled down, never cropped or
 * stretched. The source dimensions come from the caller (both expo-camera and
 * expo-image-picker return width/height), so no extra decode is needed to
 * measure the image.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { ReceiptPixelCrop } from '~/utils/receiptCrop';
import { type ReceiptImageKind, receiptMaxEdge } from '~/utils/receiptImageSize';

/**
 * JPEG quality for the re-encode (0–1). Quality does not affect the model's
 * image-token cost (that is set by the pixel count), only the stored file size,
 * so keep it high enough for crisp small text.
 */
const COMPRESS = 0.7;

/** Crop a receipt to the selected source-image pixels and return a temporary JPEG URI. */
export async function cropReceiptImage(uri: string, crop: ReceiptPixelCrop): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.crop(crop);
  const image = await context.renderAsync();
  const out = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  return out.uri;
}

export async function downscaleReceiptForStorage(
  uri: string,
  source: { width?: number | null; height?: number | null } = {},
  kind: ReceiptImageKind = 'photo',
): Promise<string> {
  try {
    const width = source.width ?? 0;
    const height = source.height ?? 0;
    const maxEdge = receiptMaxEdge(source, kind);
    const context = ImageManipulator.manipulate(uri);

    // Only scale down, and only along the longer edge so the aspect ratio is
    // preserved (single-dimension resize never crops or distorts). When the
    // dimensions are unknown or already within budget we just re-encode.
    if (Math.max(width, height) > maxEdge) {
      context.resize(width >= height ? { width: maxEdge } : { height: maxEdge });
    }

    const image = await context.renderAsync();
    const out = await image.saveAsync({ compress: COMPRESS, format: SaveFormat.JPEG });
    return out.uri;
  } catch {
    // Never block a scan/attach on a resize failure — fall back to the original.
    return uri;
  }
}
