import { Platform } from 'react-native';

import { launchImageLibraryWithCropFallback } from '~/utils/imagePicker';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ImagePicker = require('expo-image-picker');

describe('launchImageLibraryWithCropFallback', () => {
  beforeEach(() => {
    ImagePicker.launchImageLibraryAsync.mockReset();
  });

  it('returns the result as-is on success', async () => {
    const result = { canceled: false, assets: [{ uri: 'file:///a.jpg' }] };
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce(result);

    await expect(
      launchImageLibraryWithCropFallback({ mediaTypes: ['images'], allowsEditing: true }),
    ).resolves.toBe(result);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  it('retries without cropping on Android when the crop step rejects with a scheme mismatch', async () => {
    Platform.OS = 'android';
    const fallbackResult = { canceled: false, assets: [{ uri: 'content://media/picker/0/1' }] };
    ImagePicker.launchImageLibraryAsync
      .mockRejectedValueOnce(
        new Error(
          "Uri lacks 'file' scheme: content://media/picker/0/com.android.providers.media.photopicker/media/1000089835",
        ),
      )
      .mockResolvedValueOnce(fallbackResult);

    const result = await launchImageLibraryWithCropFallback({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
    });

    expect(result).toBe(fallbackResult);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(2);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenNthCalledWith(1, {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
    });
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenNthCalledWith(2, {
      mediaTypes: ['images'],
      allowsEditing: false,
      aspect: [1, 1],
    });
  });

  it('does not retry on iOS, even for the same message', async () => {
    Platform.OS = 'ios';
    const error = new Error("Uri lacks 'file' scheme: content://media/picker/0/x");
    ImagePicker.launchImageLibraryAsync.mockRejectedValueOnce(error);

    await expect(
      launchImageLibraryWithCropFallback({ mediaTypes: ['images'], allowsEditing: true }),
    ).rejects.toBe(error);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  it('does not retry when allowsEditing was not requested', async () => {
    Platform.OS = 'android';
    const error = new Error("Uri lacks 'file' scheme: content://media/picker/0/x");
    ImagePicker.launchImageLibraryAsync.mockRejectedValueOnce(error);

    await expect(
      launchImageLibraryWithCropFallback({ mediaTypes: ['images'], allowsEditing: false }),
    ).rejects.toBe(error);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  it('rethrows unrelated errors without retrying', async () => {
    Platform.OS = 'android';
    const error = new Error('User cancelled the crop');
    ImagePicker.launchImageLibraryAsync.mockRejectedValueOnce(error);

    await expect(
      launchImageLibraryWithCropFallback({ mediaTypes: ['images'], allowsEditing: true }),
    ).rejects.toBe(error);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });
});
