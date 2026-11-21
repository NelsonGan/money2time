/**
 * Picked images are stored at their kind's size, and large ones already stored
 * are re-encoded in place before a backup reads them, keeping each file's path
 * and format so every row naming it still does.
 */
import {
  IMAGE_LIMITS,
  resizeFor,
  savesAsPng,
  shouldShrinkStored,
  storedImageKind,
} from '~/services/imageShrink.shared';

const storage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    storage.set(key, value);
  }),
}));

/** Files by uri, as sizes. */
const sizes = new Map<string, number>();
const moves: { from: string; to: string; overwrite?: boolean }[] = [];
jest.mock('expo-file-system/next', () => ({
  File: class {
    constructor(public uri: string) {}
    get size() {
      return sizes.get(this.uri) ?? 0;
    }
    get exists() {
      return sizes.has(this.uri);
    }
    delete() {
      sizes.delete(this.uri);
    }
    moveSync(to: { uri: string }, options?: { overwrite?: boolean }) {
      moves.push({ from: this.uri, to: to.uri, overwrite: options?.overwrite });
      sizes.set(to.uri, sizes.get(this.uri) ?? 0);
      sizes.delete(this.uri);
    }
  },
}));

let appState = 'active';
jest.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return appState;
    },
  },
}));

const listed: { path: string; uri: string }[] = [];
jest.mock('~/services/userAssets', () => ({
  listUserAssetFilesForBackup: () => listed,
}));

/** Decoded dimensions by source uri, and the size each save produces. */
const dimensions = new Map<string, { width: number; height: number }>();
let savedSize = 100_000;
const saves: { resize?: unknown; options: unknown }[] = [];
jest.mock('expo-image-manipulator', () => {
  let outputs = 0;
  const manipulate = (source: string | { width: number; height: number }) => {
    let resize: unknown;
    const context = {
      resize(value: unknown) {
        resize = value;
        return context;
      },
      async renderAsync() {
        const size =
          typeof source === 'string' ? (dimensions.get(source) ?? { width: 0, height: 0 }) : source;
        return {
          ...size,
          async saveAsync(options: unknown) {
            saves.push({ resize, options });
            const uri = `cache/out-${outputs++}`;
            sizes.set(uri, savedSize);
            return { uri };
          },
        };
      },
    };
    return context;
  };
  return {
    ImageManipulator: { manipulate },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  };
});

import { shrinkPickedImage, shrinkStoredPhotos } from '~/services/imageShrink.native';

beforeEach(() => {
  jest.restoreAllMocks();
  appState = 'active';
  storage.clear();
  sizes.clear();
  moves.length = 0;
  listed.length = 0;
  dimensions.clear();
  saves.length = 0;
  savedSize = 100_000;
});

describe('limits', () => {
  it('knows which folders hold which kind', () => {
    expect(storedImageKind('album-covers/a.jpg')).toBe('cover');
    expect(storedImageKind('goal-covers/a.png')).toBe('cover');
    expect(storedImageKind('avatars/a.jpg')).toBe('avatar');
    expect(storedImageKind('payment-qr/a.jpg')).toBe('qr');
    expect(storedImageKind('category-icons/a.png')).toBe('icon');
    // Receipts and card designs size themselves.
    expect(storedImageKind('receipts/a.jpg')).toBeNull();
    expect(storedImageKind('card-designs/a.text-light.jpg')).toBeNull();
  });

  it('only ever scales the long edge down', () => {
    expect(resizeFor(4032, 3024, 1280)).toEqual({ width: 1280 });
    expect(resizeFor(1170, 2532, 1280)).toEqual({ height: 1280 });
    expect(resizeFor(800, 600, 1280)).toBeNull();
    expect(resizeFor(0, 0, 1280)).toBeNull();
  });

  it('keeps an icon PNG a PNG, and makes every photo a JPEG', () => {
    expect(savesAsPng('icon', 'file:///a.PNG')).toBe(true);
    expect(savesAsPng('icon', 'file:///a.heic')).toBe(false);
    expect(savesAsPng('cover', 'file:///a.png')).toBe(false);
  });

  it('re-encodes a stored file only when it is a JPEG or PNG over its limit, once per size', () => {
    const big = IMAGE_LIMITS.cover.shrinkAboveBytes + 1;
    expect(shouldShrinkStored('album-covers/a.jpg', big, {})).toBe(true);
    expect(shouldShrinkStored('album-covers/a.jpg', big - 1, {})).toBe(false);
    expect(shouldShrinkStored('album-covers/a.heic', big, {})).toBe(false);
    expect(shouldShrinkStored('receipts/a.jpg', big, {})).toBe(false);
    expect(shouldShrinkStored('album-covers/a.jpg', big, { 'album-covers/a.jpg': big })).toBe(
      false,
    );
    expect(shouldShrinkStored('album-covers/a.jpg', big, { 'album-covers/a.jpg': 5 })).toBe(true);
  });
});

describe('shrinkPickedImage', () => {
  it('scales a cover to its limit at its quality', async () => {
    const uri = await shrinkPickedImage('file:///pick.jpg', 'cover', { width: 3000, height: 2000 });
    expect(uri).toMatch(/^cache\/out-/);
    expect(saves).toEqual([
      { resize: { width: 1280 }, options: { compress: 0.7, format: 'jpeg' } },
    ]);
  });

  it('measures a pick whose size the picker did not give', async () => {
    dimensions.set('file:///icon.png', { width: 300, height: 2000 });
    await shrinkPickedImage('file:///icon.png', 'icon');
    expect(saves).toEqual([{ resize: { height: 512 }, options: { format: 'png' } }]);
  });
});

describe('shrinkStoredPhotos', () => {
  it('replaces a large JPEG in place with its smaller re-encode', async () => {
    listed.push({ path: 'album-covers/a.jpg', uri: 'doc/album-covers/a.jpg' });
    sizes.set('doc/album-covers/a.jpg', 800_000);
    dimensions.set('doc/album-covers/a.jpg', { width: 1290, height: 1290 });

    await shrinkStoredPhotos();

    expect(saves).toEqual([
      { resize: { width: 1280 }, options: { compress: 0.7, format: 'jpeg' } },
    ]);
    expect(moves).toEqual([
      {
        from: expect.stringMatching(/^cache\/out-/),
        to: 'doc/album-covers/a.jpg',
        overwrite: true,
      },
    ]);
    expect(sizes.get('doc/album-covers/a.jpg')).toBe(100_000);
  });

  it('leaves small files, other folders and unshrinkable PNGs alone', async () => {
    listed.push(
      { path: 'album-covers/small.jpg', uri: 'small' },
      { path: 'receipts/big.jpg', uri: 'receipt' },
      { path: 'goal-covers/flat.png', uri: 'png' },
    );
    sizes.set('small', 200_000);
    sizes.set('receipt', 2_000_000);
    sizes.set('png', 1_500_000);
    dimensions.set('png', { width: 968, height: 966 });

    await shrinkStoredPhotos();

    expect(saves).toEqual([]);
    expect(moves).toEqual([]);
  });

  it('does nothing in a background task', async () => {
    appState = 'background';
    listed.push({ path: 'album-covers/a.jpg', uri: 'doc/album-covers/a.jpg' });
    sizes.set('doc/album-covers/a.jpg', 800_000);
    await shrinkStoredPhotos();
    expect(saves).toEqual([]);
  });

  it('leaves a file replaced while it was being re-encoded', async () => {
    listed.push({ path: 'avatars/me.jpg', uri: 'me' });
    sizes.set('me', 400_000);
    dimensions.set('me', { width: 2000, height: 2000 });
    savedSize = 50_000;
    // The user picks a new avatar (a new size at the same path) mid-pass.
    const original = dimensions.get.bind(dimensions);
    jest.spyOn(dimensions, 'get').mockImplementation((uri: string) => {
      if (uri === 'me') sizes.set('me', 123_456);
      return original(uri);
    });

    await shrinkStoredPhotos();

    expect(moves).toEqual([]);
    expect(sizes.get('me')).toBe(123_456);
  });

  it('tries a file again after a failure instead of remembering it', async () => {
    listed.push({ path: 'avatars/me.jpg', uri: 'me' });
    sizes.set('me', 400_000);
    jest.spyOn(dimensions, 'get').mockImplementationOnce(() => {
      throw new Error('decode failed');
    });
    await shrinkStoredPhotos();
    expect(saves).toHaveLength(0);
    dimensions.set('me', { width: 2000, height: 2000 });
    await shrinkStoredPhotos();
    expect(saves).toHaveLength(1);
  });

  it('remembers a file that cannot get smaller and checks only its size next time', async () => {
    listed.push({ path: 'avatars/me.jpg', uri: 'me' });
    sizes.set('me', 400_000);
    dimensions.set('me', { width: 512, height: 512 });
    savedSize = 390_000;

    await shrinkStoredPhotos();
    expect(moves).toEqual([]);
    expect(sizes.get('me')).toBe(400_000);
    expect(saves).toHaveLength(1);

    await shrinkStoredPhotos();
    expect(saves).toHaveLength(1);
  });
});
