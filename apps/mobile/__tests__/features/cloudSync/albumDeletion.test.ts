import { albumListing } from '~/features/cloudSync/lib/albumListing';
import {
  forgetSignedOutAlbums,
  listPendingLedgerActions,
  rememberSignedOutAlbums,
  takeSignedOutAlbum,
} from '~/features/cloudSync/services/sharedLedgerStore';
import { sharedLedgerSync } from '~/features/cloudSync/services/sharedLedgerSync';

// Deleting a shared album (README: Album members and shared albums >
// Deleting): a deleted album never comes back from the Worker's list, unless
// the user joins it again.

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('~/lib/db/client', () => ({ getSQLite: jest.fn() }));
jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system/next', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('~/services/resetAutomationCaptureData', () => ({
  resetAutomationCaptureData: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: {} },
  File: class {},
  Directory: class {},
}));
jest.mock('~/services/userAssets', () => ({
  assetRelativePathFromRef: () => null,
  invalidateCustomUriCache: jest.fn(),
}));
jest.mock('~/services/userAssetGc', () => ({ collectReferencedAssetPaths: () => new Set() }));

const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('a list read', () => {
  const base = { known: 'this_share', foreignId: false, deleted: false } as const;

  it('keeps an album the user is in, made here when it is new', () => {
    expect(albumListing({ ...base, role: 'member' })).toBe('keep');
    expect(albumListing({ ...base, role: 'owner', known: null })).toBe('keep');
  });

  it('leaves alone an album under another share, or with an id this phone uses', () => {
    expect(albumListing({ ...base, role: 'member', known: 'other_share' })).toBe('skip');
    expect(albumListing({ ...base, role: 'member', known: null, foreignId: true })).toBe('skip');
  });

  it('finishes a deletion from another phone of the user’s, never bringing the album back', () => {
    expect(albumListing({ ...base, role: 'member', deleted: true })).toBe('leave');
    expect(albumListing({ ...base, role: 'owner', deleted: true })).toBe('stop');
  });

  it('ends an album its owner deleted while signed out', () => {
    expect(albumListing({ ...base, role: 'owner', known: null, deleted: true })).toBe('stop');
  });

  it('brings back an album a member deleted and then joined again (on the website, say)', () => {
    // A member who deleted it while signed out is left by the pending action
    // that deletion queued, which the list read finishes first.
    expect(albumListing({ ...base, role: 'member', known: null, deleted: true })).toBe('keep');
  });
});

describe('an album frozen by signing out', () => {
  const trip = { ledgerId: 'trip', shareId: 'share-trip', role: 'member', userId: 'u-me' } as const;

  it('is held until it is deleted, then forgotten', async () => {
    await rememberSignedOutAlbums([trip, { ...trip, ledgerId: 'ski', shareId: 'share-ski' }]);
    await expect(takeSignedOutAlbum('trip')).resolves.toEqual(trip);
    await expect(takeSignedOutAlbum('trip')).resolves.toBeNull();
    await expect(takeSignedOutAlbum('ski')).resolves.toMatchObject({ shareId: 'share-ski' });
  });

  it('is forgotten by the account’s next list read, and only that account’s', async () => {
    await rememberSignedOutAlbums([trip, { ...trip, ledgerId: 'ski', userId: 'u-other' }]);
    await forgetSignedOutAlbums('u-me');
    await expect(takeSignedOutAlbum('trip')).resolves.toBeNull();
    await expect(takeSignedOutAlbum('ski')).resolves.toMatchObject({ userId: 'u-other' });
  });

  it('signed out again, the album is held once, as it is now', async () => {
    await rememberSignedOutAlbums([trip]);
    await rememberSignedOutAlbums([{ ...trip, role: 'owner' }]);
    await expect(takeSignedOutAlbum('trip')).resolves.toMatchObject({ role: 'owner' });
    await expect(takeSignedOutAlbum('trip')).resolves.toBeNull();
  });

  it('reads nothing it did not write', async () => {
    await AsyncStorage.setItem(
      'm2t.sharedLedgers.signedOutAlbums',
      JSON.stringify([{ ledgerId: 'trip' }, 'junk', { ...trip, role: 'admin' }]),
    );
    await expect(takeSignedOutAlbum('trip')).resolves.toBeNull();
  });

  it('turns into a pending leave once deleted, as an offline leave is, and its owner’s into a stop', async () => {
    await rememberSignedOutAlbums([
      trip,
      { ledgerId: 'ski', shareId: 'share-ski', role: 'owner', userId: 'u-me' },
    ]);
    await sharedLedgerSync.albumDeletedHere('trip');
    await sharedLedgerSync.albumDeletedHere('ski');
    // An album never frozen by signing out queues nothing.
    await sharedLedgerSync.albumDeletedHere('own');
    await expect(listPendingLedgerActions()).resolves.toEqual([
      { shareId: 'share-trip', action: 'leave', userId: 'u-me' },
      { shareId: 'share-ski', action: 'stop', userId: 'u-me' },
    ]);
    await expect(takeSignedOutAlbum('trip')).resolves.toBeNull();
  });
});
