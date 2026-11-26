import { trackEvent } from '~/services/analytics';
import {
  restoreFromBackup,
  restoreImportedBackup,
  saveRestoreSafetyBackup,
} from '~/services/autoBackup.native';
import {
  type BackupRecord,
  buildAutoBackupName,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';
import { localProvider } from '~/services/autoBackupProviders/local';
import { clearResolvedBackupPhotos, resolveBackupPhotos } from '~/services/backupPhotos';
import { applyBackupData, buildBackupData } from '~/services/dataManagementService';

jest.mock('expo-background-task', () => ({}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('~/lib/repositories/settingsRepository', () => ({
  settingsRepository: {
    get: jest.fn(() => ({ autoBackupEnabled: true, autoBackupTarget: 'googleDrive' })),
  },
}));
jest.mock('~/services/analytics', () => ({
  trackEvent: jest.fn(),
  AnalyticsEvents: { AUTO_BACKUP_RESTORED: 'restored' },
}));
jest.mock('~/services/autoBackupProviders/local', () => ({
  localProvider: { download: jest.fn(), list: jest.fn(), upload: jest.fn() },
}));
jest.mock('~/services/autoBackupProviders/icloud', () => ({
  iCloudProvider: { isAvailable: jest.fn(async () => true) },
}));
jest.mock('~/services/autoBackupProviders/googleDrive', () => ({
  googleDriveProvider: {
    isAvailable: jest.fn(async () => false),
    unavailableReason: jest.fn(async () => 'signed_out'),
  },
}));
jest.mock('~/services/autoBackupProviders/googleDriveAuth', () => ({}));
jest.mock('~/services/dataManagementService', () => ({
  applyBackupData: jest.fn(),
  buildBackupData: jest.fn(),
  yieldToEventLoop: jest.fn(async () => undefined),
}));
jest.mock('~/services/backupPhotos', () => ({
  BackupPhotoVanishedError: class VanishedError extends Error {
    constructor(readonly original?: unknown) {
      super('vanished');
    }
  },
  describeBackupPhotos: jest.fn(async () => []),
  uploadMissingPhotos: jest.fn(async () => undefined),
  rememberBackupPhotos: jest.fn(),
  pruneBackupPhotos: jest.fn(async () => 0),
  resolveBackupPhotos: jest.fn(async (backup: unknown) => ({
    backup: { ...(backup as object), resolved: 1 },
    missing: 2,
  })),
  clearResolvedBackupPhotos: jest.fn(),
}));

const backup = {
  version: 5,
  exportedAt: '2026-10-31T12:00:00.000Z',
  tables: {},
  sharedLedgers: [],
};
const record: BackupRecord = {
  id: 'source.json',
  target: 'local',
  ref: 'local-test',
  createdAt: backup.exportedAt,
  sizeBytes: 1,
};
beforeEach(() => {
  jest.clearAllMocks();
  (localProvider.download as jest.Mock).mockResolvedValue(JSON.stringify(backup));
  (localProvider.list as jest.Mock).mockResolvedValue([]);
  (localProvider.upload as jest.Mock).mockResolvedValue(record);
  (buildBackupData as jest.Mock).mockResolvedValue({
    version: 3,
    exportedAt: backup.exportedAt,
    tables: { accounts: [] },
    assetFiles: [],
  });
});

it('passes the downloaded snapshot through selection without prematurely applying it', async () => {
  const restore = jest.fn(async () => ({ canceled: true }));
  expect(await restoreFromBackup(record, restore)).toEqual({ canceled: true });
  expect(restore).toHaveBeenCalledWith(backup);
  expect(applyBackupData).not.toHaveBeenCalled();
  expect(trackEvent).not.toHaveBeenCalled();
});

it('tracks a locally completed recovery once, even if its shared upload is pending', async () => {
  const result = { canceled: false, success: true, syncPending: true };
  expect(await restoreFromBackup(record, async () => result)).toEqual(result);
  expect(trackEvent).toHaveBeenCalledTimes(1);
  expect(trackEvent).toHaveBeenCalledWith('restored', { target: 'local', missing_photos: 0 });
});

it('does not apply or track an unreadable snapshot', async () => {
  (localProvider.download as jest.Mock).mockResolvedValueOnce('{broken');
  const restore = jest.fn();
  expect((await restoreFromBackup(record, restore)).success).toBe(false);
  expect(restore).not.toHaveBeenCalled();
  expect(trackEvent).not.toHaveBeenCalled();
});

it('does not apply or track a failed provider download', async () => {
  (localProvider.download as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  const restore = jest.fn();
  expect((await restoreFromBackup(record, restore)).success).toBe(false);
  expect(restore).not.toHaveBeenCalled();
  expect(trackEvent).not.toHaveBeenCalled();
});

it('keeps safety backups separate from existing backups created in the same second', async () => {
  // Only the clock: packing the file yields through real timers.
  jest
    .useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout'] })
    .setSystemTime(new Date(backup.exportedAt));
  try {
    (localProvider.list as jest.Mock).mockResolvedValue([
      { id: 'money2time_RECOVERY_2026-10-31T12-00-00.json.gz' },
    ]);
    await saveRestoreSafetyBackup();
    expect(localProvider.upload).toHaveBeenCalledWith(
      'money2time_RECOVERY_2026-10-31T12-00-01.json.gz',
      expect.any(Uint8Array),
    );
    expect(trackEvent).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

it('uses a discoverable recovery filename that an automatic run cannot overwrite', async () => {
  // Only the clock: packing the file yields through real timers.
  jest
    .useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout'] })
    .setSystemTime(new Date(backup.exportedAt));
  try {
    await saveRestoreSafetyBackup();
    const name = (localProvider.upload as jest.Mock).mock.calls[0][0];
    expect(name).not.toBe(buildAutoBackupName());
    expect(parseTimestampFromName(name)).toBe(backup.exportedAt);
  } finally {
    jest.useRealTimers();
  }
});

it('does not create an incomplete recovery file when collecting the safety snapshot fails', async () => {
  (buildBackupData as jest.Mock).mockRejectedValueOnce(new Error('asset read failed'));
  await expect(saveRestoreSafetyBackup()).rejects.toThrow('asset read failed');
  expect(localProvider.upload).not.toHaveBeenCalled();
});

it('reads an older JSON backup without looking for stored photos', async () => {
  const restore = jest.fn(async () => ({ canceled: false, success: true }));
  await restoreFromBackup(record, restore);
  expect(resolveBackupPhotos).not.toHaveBeenCalled();
});

it('downloads the photos a compact backup lists from its own target, then clears them', async () => {
  const photos = [{ path: 'avatars/a.jpg', photo: `money2time_PHOTO_${'a'.repeat(32)}.jpg` }];
  const file = {
    version: 6,
    dataVersion: 5,
    exportedAt: backup.exportedAt,
    tables: {},
    sharedLedgers: [],
    photos,
  };
  (localProvider.download as jest.Mock).mockResolvedValueOnce(JSON.stringify(file));
  const restore = jest.fn(async () => ({ canceled: false, success: true }));

  await restoreFromBackup(
    { ...record, id: 'money2time_AUTO_2026-10-31T12-00-00.json.gz' },
    restore,
  );

  const decoded = { ...backup, photos };
  expect(resolveBackupPhotos).toHaveBeenCalledWith(decoded, [localProvider]);
  expect(restore).toHaveBeenCalledWith({ ...decoded, resolved: 1 });
  expect(clearResolvedBackupPhotos).toHaveBeenCalledTimes(1);
  expect(trackEvent).toHaveBeenCalledWith('restored', { target: 'local', missing_photos: 2 });
});

describe('a picked backup file', () => {
  const photos = [{ path: 'avatars/a.jpg', photo: `money2time_PHOTO_${'a'.repeat(32)}.jpg` }];

  it('looks for its stored photos on the phone, then in connected iCloud, skipping a signed-out Drive', async () => {
    const { iCloudProvider } = jest.requireMock('~/services/autoBackupProviders/icloud');
    const restore = jest.fn(async () => ({ canceled: false, success: true }));
    const result = await restoreImportedBackup({ ...backup, photos } as never, restore);
    expect(resolveBackupPhotos).toHaveBeenCalledWith({ ...backup, photos }, [
      localProvider,
      iCloudProvider,
    ]);
    expect(result).toEqual({ canceled: false, success: true, missingPhotos: 2 });
    expect(clearResolvedBackupPhotos).toHaveBeenCalledTimes(1);
  });

  it('restores a file that embeds its photos without touching any target', async () => {
    const { googleDriveProvider } = jest.requireMock('~/services/autoBackupProviders/googleDrive');
    const restore = jest.fn(async () => ({ canceled: false, success: true }));
    await restoreImportedBackup(backup as never, restore);
    expect(restore).toHaveBeenCalledWith(backup);
    expect(googleDriveProvider.unavailableReason).not.toHaveBeenCalled();
    expect(resolveBackupPhotos).not.toHaveBeenCalled();
  });

  it('counts a connected Drive it cannot reach now as unreachable, not as empty', async () => {
    const { googleDriveProvider } = jest.requireMock('~/services/autoBackupProviders/googleDrive');
    googleDriveProvider.unavailableReason.mockResolvedValueOnce('no_token');
    const restore = jest.fn(async () => ({ canceled: false, success: true }));
    await restoreImportedBackup({ ...backup, photos } as never, restore);
    const stores = (resolveBackupPhotos as jest.Mock).mock.calls.at(-1)[1];
    expect(stores).toHaveLength(3);
    await expect(stores[2].listPhotos()).rejects.toThrow('Google Drive unavailable');
  });

  it('skips an unreachable Drive this phone does not back up to', async () => {
    const { googleDriveProvider } = jest.requireMock('~/services/autoBackupProviders/googleDrive');
    const { settingsRepository } = jest.requireMock('~/lib/repositories/settingsRepository');
    googleDriveProvider.unavailableReason.mockResolvedValueOnce('no_token');
    settingsRepository.get.mockReturnValueOnce({
      autoBackupEnabled: true,
      autoBackupTarget: 'icloud',
    });
    const restore = jest.fn(async () => ({ canceled: false, success: true }));
    await restoreImportedBackup({ ...backup, photos } as never, restore);
    expect((resolveBackupPhotos as jest.Mock).mock.calls.at(-1)[1]).toHaveLength(2);
  });

  it('uses a reachable Drive as a store', async () => {
    const { googleDriveProvider } = jest.requireMock('~/services/autoBackupProviders/googleDrive');
    googleDriveProvider.unavailableReason.mockResolvedValueOnce(null);
    const restore = jest.fn(async () => ({ canceled: false, success: true }));
    await restoreImportedBackup({ ...backup, photos } as never, restore);
    expect((resolveBackupPhotos as jest.Mock).mock.calls.at(-1)[1].at(-1)).toBe(
      googleDriveProvider,
    );
  });

  it('restores nothing when the stored photos cannot be downloaded', async () => {
    (resolveBackupPhotos as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const restore = jest.fn();
    await expect(restoreImportedBackup({ ...backup, photos } as never, restore)).rejects.toThrow(
      'offline',
    );
    expect(restore).not.toHaveBeenCalled();
    expect(clearResolvedBackupPhotos).toHaveBeenCalledTimes(1);
  });
});
