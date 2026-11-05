import {
  sharedLedgerSync,
  type SharedSyncOutcome,
} from '~/features/cloudSync/services/sharedLedgerSync';

// A sync no longer pulls again after it pushes, so a live nudge that arrives
// during a round of shared-ledger syncs must not just join that round (which
// may have pulled already): one more round follows, as for the user's own
// data (README: Cloud Sync > How it works, Sync run).

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

type Round = (forceList: boolean) => Promise<SharedSyncOutcome>;

let rounds: { forceList: boolean; finish: (outcome: Partial<SharedSyncOutcome>) => void }[];
let runAll: jest.SpyInstance;

beforeEach(() => {
  rounds = [];
  sharedLedgerSync.configure({
    userId: 'test-user',
    getSessionToken: async () => 'token',
    deviceName: 'Test',
    personalInactive: () => false,
  });
  runAll = jest
    .spyOn(sharedLedgerSync as unknown as { runAll: Round }, 'runAll')
    .mockImplementation(
      (forceList: boolean) =>
        new Promise((resolve) => {
          rounds.push({
            forceList,
            finish: (outcome) =>
              resolve({ appliedRows: 0, removedLedgers: 0, error: null, ...outcome }),
          });
        }),
    );
});

afterEach(() => {
  runAll.mockRestore();
  sharedLedgerSync.configure(null);
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

it('runs one more round for calls made during a round, and resolves them with it', async () => {
  const first = sharedLedgerSync.syncAll();
  const second = sharedLedgerSync.syncAll({ forceList: true });
  const third = sharedLedgerSync.syncAll();
  expect(rounds).toHaveLength(1);
  rounds[0].finish({ appliedRows: 2, error: new Error('offline') });
  await flush();
  // Both calls during the round share one more, which keeps the list refresh.
  expect(rounds).toHaveLength(2);
  expect(rounds[1].forceList).toBe(true);
  rounds[1].finish({ appliedRows: 3 });
  const outcomes = await Promise.all([first, second, third]);
  for (const outcome of outcomes) {
    expect(outcome).toEqual({ appliedRows: 5, removedLedgers: 0, error: null });
  }
  expect(sharedLedgerSync.isRunning()).toBe(false);
});

it('runs a single round when nothing asks again', async () => {
  const only = sharedLedgerSync.syncAll();
  rounds[0].finish({ appliedRows: 1 });
  await expect(only).resolves.toEqual({ appliedRows: 1, removedLedgers: 0, error: null });
  expect(rounds).toHaveLength(1);
  // A later call starts afresh, without a leftover request.
  const next = sharedLedgerSync.syncAll();
  expect(rounds).toHaveLength(2);
  expect(rounds[1].forceList).toBe(false);
  rounds[1].finish({});
  await next;
});

it('does not run the extra round for a session that has signed out', async () => {
  const first = sharedLedgerSync.syncAll();
  void sharedLedgerSync.syncAll();
  sharedLedgerSync.configure(null);
  rounds[0].finish({});
  await first;
  expect(rounds).toHaveLength(1);
});
