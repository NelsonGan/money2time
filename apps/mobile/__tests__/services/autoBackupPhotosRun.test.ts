/**
 * An automatic run stores the photos a target lacks before the backup that
 * lists them, so a backup never names a photo that is not there yet, and
 * cleans up photos only after rotation decided which backups stay.
 */
import { runAutoBackupIfDue } from '~/services/autoBackup.native';
import { localProvider } from '~/services/autoBackupProviders/local';
import { pruneBackupPhotos, uploadMissingPhotos } from '~/services/backupPhotos';

let settings: Record<string, unknown> = {};
const calls: string[] = [];

jest.mock('expo-background-task', () => ({}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('~/lib/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: () => settings,
    updateSettings: (patch: Record<string, unknown>) => {
      settings = { ...settings, ...patch };
    },
  },
}));
jest.mock('~/services/analytics', () => ({ trackEvent: jest.fn(), AnalyticsEvents: {} }));
jest.mock('~/services/autoBackupProviders/local', () => ({
  localProvider: { upload: jest.fn(), list: jest.fn(), delete: jest.fn() },
}));
jest.mock('~/services/autoBackupProviders/icloud', () => ({ iCloudProvider: {} }));
jest.mock('~/services/autoBackupProviders/googleDrive', () => ({
  googleDriveProvider: {},
  resetGoogleDriveFolderCache: jest.fn(),
}));
jest.mock('~/services/autoBackupProviders/googleDriveAuth', () => ({}));
jest.mock('~/services/dataManagementService', () => ({
  buildBackupData: jest.fn(async () => ({
    version: 3,
    exportedAt: '',
    tables: {},
    assetFiles: [{ path: 'avatars/me.jpg', uri: 'file:///me.jpg' }],
  })),
  yieldToEventLoop: jest.fn(async () => undefined),
}));
const PHOTO = `money2time_PHOTO_${'a'.repeat(32)}.jpg`;
jest.mock('~/services/backupPhotos', () => ({
  describeBackupPhotos: jest.fn(async () => [
    {
      path: 'avatars/me.jpg',
      photo: `money2time_PHOTO_${'a'.repeat(32)}.jpg`,
      uri: 'file:///me.jpg',
    },
  ]),
  uploadMissingPhotos: jest.fn(async () => {
    calls.push('photos');
  }),
  rememberBackupPhotos: jest.fn(),
  pruneBackupPhotos: jest.fn(async () => {
    calls.push('prune');
    return 0;
  }),
}));

const local = localProvider as unknown as Record<'upload' | 'list' | 'delete', jest.Mock>;
const record = (id: string) => ({ id, target: 'local', createdAt: id.slice(16, 35), ref: id });

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  settings = { autoBackupEnabled: true, autoBackupTarget: 'local', lastAutoBackupAt: null };
  local.upload.mockImplementation(async (name: string) => {
    calls.push('backup');
    return record(name);
  });
  local.delete.mockImplementation(async () => {
    calls.push('rotate');
  });
});

it('stores photos, then the backup, then rotates and cleans up', async () => {
  const kept = Array.from({ length: 10 }, (_, i) =>
    record(`money2time_AUTO_2026-11-${String(11 + i).padStart(2, '0')}T00-00-00.json.gz`),
  );
  const expired = record('money2time_AUTO_2026-10-01T00-00-00.json');
  local.list.mockResolvedValue([...kept, expired]);

  const result = await runAutoBackupIfDue();

  expect(result.errors).toEqual([]);
  expect(calls).toEqual(['photos', 'backup', 'rotate', 'prune']);
  expect(uploadMissingPhotos).toHaveBeenCalledWith(localProvider, [
    { path: 'avatars/me.jpg', photo: PHOTO, uri: 'file:///me.jpg' },
  ]);
  const [name, bytes] = local.upload.mock.calls[0];
  expect(name).toMatch(/^money2time_AUTO_.*\.json\.gz$/);
  expect(bytes[0]).toBe(0x1f);
  // Cleanup sees what rotation kept, not the backup it deleted.
  const [, written, keptAfterRotation] = (pruneBackupPhotos as jest.Mock).mock.calls[0];
  expect(written.id).toBe(name);
  expect(keptAfterRotation).toEqual(kept);
});

it('writes no backup when its photos could not be stored', async () => {
  (uploadMissingPhotos as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  local.list.mockResolvedValue([]);

  const result = await runAutoBackupIfDue({ force: true });

  expect(result.written).toEqual([]);
  expect(local.upload).not.toHaveBeenCalled();
});
