export type SaveReceiptToLibraryResult = 'saved' | 'permission-denied' | 'unavailable';

/** Photo-library saving is native-only. The receipt viewer hides this action on web. */
export async function saveReceiptToPhotoLibrary(
  _fileUri: string,
): Promise<SaveReceiptToLibraryResult> {
  return 'unavailable';
}
