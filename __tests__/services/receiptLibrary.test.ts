const isAvailableAsync = jest.fn();
const requestPermissionsAsync = jest.fn();
const saveToLibraryAsync = jest.fn();

jest.mock('expo-media-library', () => ({
  isAvailableAsync,
  requestPermissionsAsync,
  saveToLibraryAsync,
}));

import { saveReceiptToPhotoLibrary } from '~/services/receiptLibrary.native';

describe('saveReceiptToPhotoLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAvailableAsync.mockResolvedValue(true);
    requestPermissionsAsync.mockResolvedValue({ granted: true });
    saveToLibraryAsync.mockResolvedValue(undefined);
  });

  it('requests write-only access and saves the local receipt', async () => {
    await expect(saveReceiptToPhotoLibrary('file:///receipt.jpg')).resolves.toBe('saved');

    expect(requestPermissionsAsync).toHaveBeenCalledWith(true, []);
    expect(saveToLibraryAsync).toHaveBeenCalledWith('file:///receipt.jpg');
  });

  it('does not ask for access when the media library is unavailable', async () => {
    isAvailableAsync.mockResolvedValue(false);

    await expect(saveReceiptToPhotoLibrary('file:///receipt.jpg')).resolves.toBe('unavailable');
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
    expect(saveToLibraryAsync).not.toHaveBeenCalled();
  });

  it('does not save when write access is denied', async () => {
    requestPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(saveReceiptToPhotoLibrary('file:///receipt.jpg')).resolves.toBe(
      'permission-denied',
    );
    expect(saveToLibraryAsync).not.toHaveBeenCalled();
  });

  it('surfaces native save failures to the caller', async () => {
    saveToLibraryAsync.mockRejectedValue(new Error('disk full'));

    await expect(saveReceiptToPhotoLibrary('file:///receipt.jpg')).rejects.toThrow('disk full');
  });
});
