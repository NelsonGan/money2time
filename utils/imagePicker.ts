import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Android's system Photos Picker (used by `launchImageLibraryAsync` on
 * Android 13+ when the app doesn't hold full media-library permission)
 * hands back a `content://media/picker/...` uri. When `allowsEditing` is
 * requested, expo-image-picker feeds that uri straight into the native
 * crop step, which requires a `file://` uri and throws
 * `IllegalArgumentException: Uri lacks 'file' scheme` before any image is
 * returned (Sentry MONEY2TIME-26). There's no crop-safe uri to retry with,
 * so the fallback re-runs the pick without cropping — the caller gets the
 * user's photo uncropped rather than a hard failure.
 */
export async function launchImageLibraryWithCropFallback(
  options: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult> {
  try {
    return await ImagePicker.launchImageLibraryAsync(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isAndroidCropUriMismatch =
      Platform.OS === 'android' &&
      options.allowsEditing &&
      /lacks ['"]file['"] scheme/i.test(message);
    if (!isAndroidCropUriMismatch) throw error;
    return ImagePicker.launchImageLibraryAsync({ ...options, allowsEditing: false });
  }
}
