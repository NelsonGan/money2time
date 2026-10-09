/**
 * Web / non-native fallback for receipt downscaling. The real implementation
 * lives in receiptImage.native.ts (uses expo-image-manipulator). Metro resolves
 * this file on web/tests, where there is no image pipeline — so it returns the
 * source URI unchanged.
 */

import type { ReceiptPixelCrop } from '~/utils/receiptCrop';

/** Platform fallback used by web/tests, where the native crop pipeline is unavailable. */
export async function cropReceiptImage(uri: string, _crop: ReceiptPixelCrop): Promise<string> {
  return uri;
}

/** No-op off-device: hand the original URI straight back. */
export async function downscaleReceiptForStorage(
  uri: string,
  _source?: { width?: number | null; height?: number | null },
): Promise<string> {
  return uri;
}
