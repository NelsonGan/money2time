import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { I18n } from '~/lib/i18n';
import { downscaleReceiptForStorage } from '~/services/receiptImage';
import { saveReceiptImage } from '~/services/userAssets';

/**
 * Outcome of a receipt pick. Callers that offer an automatic camera→library
 * fallback should retry only on `cancelled` — `denied` and `failed` already
 * showed an alert, so retrying would double-prompt.
 */
export type PickReceiptResult =
  | { status: 'saved'; path: string }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'failed' };

/**
 * Request permission, launch the camera or photo library, and copy the picked
 * image into the receipt store. Returns a discriminated result: `saved` with
 * the relative path (e.g. `receipts/9f3c.jpg`), `cancelled` when the user backs
 * out, or `denied`/`failed` when permission is refused or saving throws (an
 * alert is shown in the latter two cases).
 *
 * Shared by the transaction editor, the Receipts page, and the scan flow so the
 * permission + picker + save flow lives in one place.
 */
export async function pickAndSaveReceiptImage(
  source: 'camera' | 'library',
): Promise<PickReceiptResult> {
  try {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        I18n.t('accounts.logo.permission_title'),
        I18n.t('accounts.logo.permission_message'),
      );
      return { status: 'denied' };
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return { status: 'cancelled' };
    const downscaled = await downscaleReceiptForStorage(result.assets[0].uri);
    return { status: 'saved', path: saveReceiptImage(downscaled) };
  } catch {
    Alert.alert(I18n.t('accounts.logo.upload_failed'));
    return { status: 'failed' };
  }
}
