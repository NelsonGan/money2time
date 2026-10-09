import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { I18n } from '~/lib/i18n';
import { getErrorMessage } from '~/utils/errorHandling';

interface PickLibraryImageOptions {
  /** Crop the pick to this aspect ratio. Omitted keeps the whole image. */
  aspect?: [number, number];
  /** Shown when photo access is denied. Defaults to the generic photo-access copy. */
  permissionAlert?: { title: string; message: string };
  /**
   * Shown alone when picking or `onPicked` throws. Without it the failure reads
   * as the generic "operation failed" with the error's own message.
   */
  failureTitle?: string;
}

/**
 * Ask for photo access, let the user pick one image from their library, and
 * hand its uri to `onPicked` (typically to copy it into app storage). Cancelling
 * does nothing. The picker itself can reject, not just the save in `onPicked`,
 * so both surface through the same alert.
 */
export async function pickLibraryImage(
  onPicked: (uri: string) => void,
  { aspect, permissionAlert, failureTitle }: PickLibraryImageOptions = {},
): Promise<void> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      permissionAlert?.title ?? I18n.t('accounts.logo.permission_title'),
      permissionAlert?.message ?? I18n.t('accounts.logo.permission_message'),
    );
    return;
  }
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: aspect != null,
      ...(aspect ? { aspect } : {}),
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    onPicked(result.assets[0].uri);
  } catch (error) {
    if (failureTitle) {
      Alert.alert(failureTitle);
    } else {
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }
}
