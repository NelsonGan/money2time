import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { I18n } from '~/lib/i18n';
import { saveReceiptImage } from '~/services/userAssets';

/**
 * Request permission, launch the camera or photo library, and copy the picked
 * image into the receipt store. Returns the saved relative path (e.g.
 * `receipts/9f3c.jpg`), or null when permission is denied, the picker is
 * cancelled, or saving fails (an alert is shown in the denial/failure cases).
 *
 * Shared by the transaction editor and the Receipts page so the permission +
 * picker + save flow lives in one place.
 */
export async function pickAndSaveReceiptImage(
  source: 'camera' | 'library',
): Promise<string | null> {
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
      return null;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return null;
    return saveReceiptImage(result.assets[0].uri);
  } catch {
    Alert.alert(I18n.t('accounts.logo.upload_failed'));
    return null;
  }
}
