import type { RemoteSharedLedger } from '~/features/cloudSync/services/sharedLedgersApi';
import { listSharedLedgers } from '~/features/cloudSync/services/sharedLedgersApi';
import type { SharedLedger } from '~/features/cloudSync/services/sharedLedgerStore';
import { sharedLedgerSync } from '~/features/cloudSync/services/sharedLedgerSync';
import { applyBackupData, type BackupData } from '~/services/dataManagementService';

jest.mock('expo-file-system', () => ({}));
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
  listPendingLedgerActions: async () => [],
  getDeferredLedgerDeletes: () => [],
  noteRemovedLedgers: jest.fn(),
}));
jest.mock('~/features/cloudSync/services/ledgerChannels', () => ({
  deleteLedgerLocally: jest.fn(),
  forgetChannel: jest.fn(),
}));
jest.mock('~/features/cloudSync/services/sharedLedgersApi', () => ({
  listSharedLedgers: jest.fn(),
}));
jest.mock('~/features/cloudSync/services/syncEngine', () => ({
  runExclusive: (fn: () => unknown) => fn(),
  deleteReplicaFiles: jest.fn(),
}));
jest.mock('~/services/dataManagementService', () => ({ applyBackupData: jest.fn() }));

const remote: RemoteSharedLedger = {
  id: 'share-family',
  ledgerId: 'family',
  role: 'owner',
  name: 'Family',
  emoji: null,
  ownerName: 'Owner',
  memberCount: 2,
  active: true,
};
const backup = {
  version: 5,
  exportedAt: '2026-10-31',
  sharedLedgers: [{ ledgerId: 'family', shareId: 'share-family' }],
  tables: { ledgers: [{ id: 'family', name: 'Family' }] },
} as unknown as BackupData;
const options = { restorePersonal: false, sharedLedgerIds: ['family'] };
const snapshot = { channel: 'share-family', rows: [] };
const engine = {
  syncNow: jest.fn(),
  prepareSnapshotRestore: jest.fn(),
  stageSnapshotRestore: jest.fn(),
  close: jest.fn(),
  waitIdle: jest.fn(),
};
const saveSafety = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockShares = [{ ...remote, shareId: remote.id }];
  sharedLedgerSync.configure({
    userId: 'owner',
    getSessionToken: async () => 'local-test',
    deviceName: 'Local test',
    personalInactive: () => false,
  });
  (listSharedLedgers as jest.Mock).mockResolvedValue([remote]);
  engine.syncNow.mockResolvedValue({ appliedRows: 0, pushed: false, applyError: null });
  engine.prepareSnapshotRestore.mockResolvedValue(snapshot);
  saveSafety.mockResolvedValue({});
  (applyBackupData as jest.Mock).mockImplementation((_data, selection) => {
    selection.beforeCommit();
    return { canceled: false, success: true };
  });
  jest
    .spyOn(sharedLedgerSync as unknown as { engineFor: () => Promise<typeof engine> }, 'engineFor')
    .mockResolvedValue(engine);
});
afterEach(() => {
  sharedLedgerSync.configure(null);
  jest.restoreAllMocks();
});

it('saves a safety backup and verifies live ownership before replacing any rows', async () => {
  const result = await sharedLedgerSync.restoreBackup(backup, options, saveSafety);
  expect(result.success).toBe(true);
  expect(listSharedLedgers).toHaveBeenCalledTimes(2);
  expect(saveSafety.mock.invocationCallOrder[0]).toBeLessThan(
    (applyBackupData as jest.Mock).mock.invocationCallOrder[0],
  );
  expect(engine.stageSnapshotRestore).toHaveBeenCalledWith(snapshot);
  expect(engine.syncNow).toHaveBeenCalledTimes(2);
});

it('does not replace data if the safety backup fails', async () => {
  saveSafety.mockRejectedValueOnce(new Error('disk full'));
  await expect(sharedLedgerSync.restoreBackup(backup, options, saveSafety)).rejects.toThrow(
    'disk full',
  );
  expect(applyBackupData).not.toHaveBeenCalled();
});

it.each([
  ['member', { ...remote, role: 'member' }],
  ['paused', { ...remote, active: false }],
  ['new share', { ...remote, id: 'different-share' }],
])('refuses %s before creating a recovery or changing data', async (_name, changed) => {
  mockShares = [];
  (listSharedLedgers as jest.Mock).mockResolvedValue([changed]);
  await expect(sharedLedgerSync.restoreBackup(backup, options, saveSafety)).rejects.toThrow();
  expect(saveSafety).not.toHaveBeenCalled();
  expect(applyBackupData).not.toHaveBeenCalled();
});

it('refuses a permission change between confirmation and replacement', async () => {
  (listSharedLedgers as jest.Mock)
    .mockResolvedValueOnce([remote])
    .mockResolvedValueOnce([{ ...remote, role: 'member' }]);
  await expect(sharedLedgerSync.restoreBackup(backup, options, saveSafety)).rejects.toThrow(
    'shared_restore_not_owner',
  );
  expect(applyBackupData).not.toHaveBeenCalled();
});

it('fails closed when the online ownership check is unreachable', async () => {
  (listSharedLedgers as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  await expect(sharedLedgerSync.restoreBackup(backup, options, saveSafety)).rejects.toThrow(
    'offline',
  );
  expect(applyBackupData).not.toHaveBeenCalled();
});

it('reports a completed local restore with pending sync when the push fails', async () => {
  engine.syncNow
    .mockResolvedValueOnce({ appliedRows: 0, pushed: false, applyError: null })
    .mockRejectedValueOnce(new Error('offline'));
  expect(await sharedLedgerSync.restoreBackup(backup, options, saveSafety)).toEqual({
    canceled: false,
    success: true,
    syncPending: true,
  });
  expect(applyBackupData).toHaveBeenCalledTimes(1);
});

it('allows an offline personal-only restore without checking shared credentials', async () => {
  sharedLedgerSync.configure(null);
  expect(
    (await sharedLedgerSync.restoreBackup(backup, { restorePersonal: true }, saveSafety)).success,
  ).toBe(true);
  expect(listSharedLedgers).not.toHaveBeenCalled();
});
