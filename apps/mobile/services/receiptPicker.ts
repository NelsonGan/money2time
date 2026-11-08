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

/** An album pick not yet in the receipt store: the picker's temporary copy. */
export interface PickedReceiptAsset {
  uri: string;
  width: number;
  height: number;
}

/**
 * Downscale a picked or captured photo and copy it into the receipt store,
 * returning its relative path (e.g. `receipts/9f3c.jpg`). Throws when the copy
 * fails.
 */
export async function saveReceiptAsset(asset: PickedReceiptAsset): Promise<string> {
  const downscaled = await downscaleReceiptForStorage(asset.uri, {
    width: asset.width,
    height: asset.height,
  });
  return saveReceiptImage(downscaled);
}

/** Ask for camera or library access; alerts and returns false when refused. */
async function ensurePickerPermission(source: 'camera' | 'library'): Promise<boolean> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.granted) return true;
  Alert.alert(I18n.t('accounts.logo.permission_title'), I18n.t('accounts.logo.permission_message'));
  return false;
}

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
    if (!(await ensurePickerPermission(source))) return { status: 'denied' };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return { status: 'cancelled' };
    return { status: 'saved', path: await saveReceiptAsset(result.assets[0]) };
  } catch {
    Alert.alert(I18n.t('accounts.logo.upload_failed'));
    return { status: 'failed' };
  }
}

export type PickReceiptAssetsResult =
  | { status: 'picked'; assets: PickedReceiptAsset[] }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'failed' };

/**
 * Open the photo library for up to `limit` receipts, returned in the order the
 * user picked them. Unlike {@link pickAndSaveReceiptImage} nothing is stored:
 * the scan batch saves each one with {@link saveReceiptAsset} in the
 * background, so the camera sheet can close the moment the picker does.
 */
export async function pickReceiptAssets(limit: number): Promise<PickReceiptAssetsResult> {
  try {
    if (!(await ensurePickerPermission('library'))) return { status: 'denied' };
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: limit,
      orderedSelection: true,
    });
    const assets = result.canceled ? [] : (result.assets ?? []);
    if (assets.length === 0) return { status: 'cancelled' };
    return {
      status: 'picked',
      // The system picker enforces the limit; slicing guards a picker that
      // ignores it.
      assets: assets
        .slice(0, limit)
        .map((asset) => ({ uri: asset.uri, width: asset.width, height: asset.height })),
    };
  } catch {
    Alert.alert(I18n.t('accounts.logo.upload_failed'));
    return { status: 'failed' };
  }
}
