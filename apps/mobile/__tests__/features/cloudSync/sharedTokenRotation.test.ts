import { CloudSyncApiError } from '~/features/cloudSync/services/cloudSyncApi';
import type { RemoteSharedLedger } from '~/features/cloudSync/services/sharedLedgersApi';
import {
  getLedgerCredentials,
  listSharedLedgers,
} from '~/features/cloudSync/services/sharedLedgersApi';
import type { SharedLedger } from '~/features/cloudSync/services/sharedLedgerStore';
import { sharedLedgerSync } from '~/features/cloudSync/services/sharedLedgerSync';

// When a member leaves or is removed, the Worker rotates the album database's
// tokens (`removeMemberAccess`), so every other phone's cached token is
// refused by Turso until it asks for a new one. A round should ask at once
// instead of failing, showing an error and reporting it (PostHog 01a185ab,
// "invalid JWT token: role was invalidated after token was issued").

jest.mock('expo-file-system', () => ({}));
jest.mock('~/services/dataManagementService', () => ({ applyBackupData: jest.fn() }));
let mockShares: SharedLedger[] = [];
jest.mock('~/lib/db/client', () => ({
  getSQLite: () => ({ getFirstSync: () => null, getAllSync: () => [] }),
}));
jest.mock('~/features/cloudSync/services/sharedLedgerStore', () => ({
  listSharedLedgers: () => mockShares,
  sharedLedgerFor: (id: string) => mockShares.find((share) => share.ledgerId === id),
  saveSharedLedger: (share: SharedLedger) => {
    mockShares = [...mockShares.filter((item) => item.ledgerId !== share.ledgerId), share];
  },
  removeSharedLedger: (id: string) => {
    mockShares = mockShares.filter((share) => share.ledgerId !== id);
  },
  listAlbumShares: () => [],
  sharedAlbumFor: () => null,
  listPendingLedgerActions: async () => [],
  getDeferredLedgerDeletes: () => [],
  noteRemovedLedgers: jest.fn(),
}));
jest.mock('~/features/cloudSync/services/ledgerChannels', () => ({
  deleteLedgerLocally: jest.fn(),
  forgetChannel: jest.fn(),
  recordedChannel: () => null,
}));
jest.mock('~/features/cloudSync/services/sharedLedgersApi', () => ({
  listSharedLedgers: jest.fn(),
  getLedgerCredentials: jest.fn(),
}));

/** Turso's answer to a token issued before the database's tokens were rotated. */
const ROTATED =
  'sync engine operation failed: database sync engine error: remote server returned an error: ' +
  'status=401, body={"error":"Unauthorized: `unauthorized access attempt on database: ' +
  'invalid JWT token: role was invalidated after token was issued`"}';

let mockValidToken = 'fresh';
const mockSyncNow = jest.fn();
jest.mock('~/features/cloudSync/services/syncEngine', () => ({
  runExclusive: (fn: () => unknown) => fn(),
  deleteReplicaFiles: jest.fn(),
  SyncEngine: class {
    constructor(private config: { getTursoToken: () => Promise<string> }) {}
    open = jest.fn(async () => undefined);
    close = jest.fn();
    waitIdle = jest.fn(async () => undefined);
    // Like the Turso engine: every request asks for the token again, and an
    // error from that callback comes back as a plain message (`poison`).
    syncNow = jest.fn(async () => {
      mockSyncNow();
      const token = await this.config.getTursoToken().catch((error: Error) => {
        throw new Error(error.message);
      });
      if (token !== mockValidToken) throw new Error(ROTATED);
      return { appliedRows: 1, pushed: false, applyError: null };
    });
  },
}));

const remote: RemoteSharedLedger = {
  id: 'share-trip',
  ledgerId: 'trip',
  role: 'owner',
  name: 'Trip',
  emoji: null,
  ownerName: 'Owner',
  memberCount: 2,
  active: true,
};
const DAY = 24 * 60 * 60 * 1000;
const credentials = (authToken: string) => ({
  url: 'libsql://album.example',
  authToken,
  expiresAt: Date.now() + DAY,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockShares = [{ ...remote, shareId: remote.id }];
  mockValidToken = 'fresh';
  (listSharedLedgers as jest.Mock).mockResolvedValue([remote]);
  sharedLedgerSync.configure({
    userId: 'owner',
    getSessionToken: async () => 'session',
    deviceName: 'Test',
    personalInactive: () => false,
  });
});
afterEach(() => {
  sharedLedgerSync.configure(null);
});

it('asks for a new token at once when the cached one was revoked, without failing', async () => {
  // A day's token, cached by an earlier round.
  (getLedgerCredentials as jest.Mock).mockResolvedValueOnce(credentials('first'));
  mockValidToken = 'first';
  expect((await sharedLedgerSync.syncAll()).error).toBeNull();

  // A member leaves: the Worker rotates the tokens, the next mint is new.
  mockValidToken = 'fresh';
  (getLedgerCredentials as jest.Mock).mockResolvedValueOnce(credentials('fresh'));
  const outcome = await sharedLedgerSync.syncAll();

  expect(outcome.error).toBeNull();
  expect(outcome.appliedRows).toBe(1);
  expect(getLedgerCredentials).toHaveBeenCalledTimes(2);
});

it('tries a refused token once only, then reports the failure', async () => {
  (getLedgerCredentials as jest.Mock).mockResolvedValue(credentials('still-refused'));
  mockValidToken = 'never';
  const outcome = await sharedLedgerSync.syncAll();

  expect(outcome.error).toEqual(new Error(ROTATED));
  // The first try, and one more with a token asked for again.
  expect(mockSyncNow).toHaveBeenCalledTimes(2);
  expect(getLedgerCredentials).toHaveBeenCalledTimes(2);
});

it('does not retry other failures within the round', async () => {
  (getLedgerCredentials as jest.Mock).mockResolvedValue(credentials('fresh'));
  mockSyncNow.mockImplementationOnce(() => {
    throw new Error('sync engine operation failed: database sync engine error: status=500');
  });
  const outcome = await sharedLedgerSync.syncAll();

  expect(outcome.error).toBeInstanceOf(Error);
  expect(mockSyncNow).toHaveBeenCalledTimes(1);
});

it('keeps a Worker refusal during the retry as what it is, not a sync failure', async () => {
  (getLedgerCredentials as jest.Mock)
    .mockResolvedValueOnce(credentials('first'))
    .mockRejectedValueOnce(new CloudSyncApiError('not_found', 404));
  mockValidToken = 'first';
  await sharedLedgerSync.syncAll();
  const listsBefore = (listSharedLedgers as jest.Mock).mock.calls.length;

  // Removed from the album: the token is refused and the Worker says so.
  mockValidToken = 'fresh';
  const outcome = await sharedLedgerSync.syncAll();

  // The list is read again to learn why, as for any `not_found`; nothing is reported.
  expect(outcome.error).toBeNull();
  expect((listSharedLedgers as jest.Mock).mock.calls.length).toBeGreaterThan(listsBefore);
  expect(mockSyncNow).toHaveBeenCalledTimes(2);
});

it('asks again shortly when the Worker is busy minting the new token for another phone', async () => {
  jest.useFakeTimers();
  try {
    (getLedgerCredentials as jest.Mock)
      .mockResolvedValueOnce(credentials('first'))
      .mockRejectedValueOnce(new CloudSyncApiError('server', 500))
      .mockResolvedValueOnce(credentials('fresh'));
    mockValidToken = 'first';
    await sharedLedgerSync.syncAll();

    mockValidToken = 'fresh';
    const round = sharedLedgerSync.syncAll();
    await jest.advanceTimersByTimeAsync(3_000);
    const outcome = await round;

    expect(outcome.error).toBeNull();
    expect(getLedgerCredentials).toHaveBeenCalledTimes(3);
  } finally {
    jest.useRealTimers();
  }
});
