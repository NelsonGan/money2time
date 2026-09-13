import * as MediaLibrary from 'expo-media-library';

export type SaveReceiptToLibraryResult = 'saved' | 'permission-denied' | 'unavailable';

/**
 * Save an attached receipt to the device photo library.
 *
 * Only write access is requested: Money2Time never needs to enumerate the
 * user's library for this action. Passing an empty granular-permission list
 * also avoids requesting Android's broad photo-reading permission.
 */
export async function saveReceiptToPhotoLibrary(
  fileUri: string,
): Promise<SaveReceiptToLibraryResult> {
  if (!(await MediaLibrary.isAvailableAsync())) return 'unavailable';

  const permission = await MediaLibrary.requestPermissionsAsync(true, []);
  if (!permission.granted) return 'permission-denied';

  await MediaLibrary.saveToLibraryAsync(fileUri);
  return 'saved';
}
