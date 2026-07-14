/**
 * Web / non-native fallback for receipt downscaling. The real implementation
 * lives in receiptImage.native.ts (uses expo-image-manipulator). Metro resolves
 * this file on web/tests, where there is no image pipeline — so it returns the
 * source URI unchanged.
 */

/** No-op off-device: hand the original URI straight back. */
export async function downscaleReceiptForStorage(
  uri: string,
  _source?: { width?: number | null; height?: number | null },
): Promise<string> {
  return uri;
}
