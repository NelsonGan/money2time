// Prepares the bundled sample receipt for the preview seeder. The image is
// copied once into the user-assets receipt store; the returned relative path is
// then reused across the seeded transactions that carry a receipt ("can use the
// same one"). Kept out of ./seed so the seeding module — and the tests that
// import it — never pull in the native expo-asset / file-system modules.
//
// All heavy imports are dynamic so this only touches native modules at runtime,
// on the device, when the user actually taps "Generate preview data".

// Copies the bundled receipt image into the receipt store and returns its
// relative path (e.g. `receipts/preview-xxxx.png`), or null if the asset can't
// be resolved (so seeding degrades gracefully to receipt-less transactions).
export async function preparePreviewReceipt(): Promise<string | null> {
  try {
    const { Asset } = await import('expo-asset');
    const { saveReceiptImage } = await import('~/services/userAssets');

    // Required lazily (not at module load) so Jest — which imports this module
    // transitively but never calls this function — doesn't try to parse the PNG.
    // Metro still statically bundles the literal require.
    const asset = Asset.fromModule(require('../../assets/preview/receipt.png'));
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) return null;

    return saveReceiptImage(sourceUri);
  } catch {
    return null;
  }
}
