/**
 * The `Auto Backup Failed` payload. Most failed Google Drive backups arrive as
 * error_kind `client`, repeating daily for the same users, and that kind covers
 * every 4xx Drive does not single out. The event carries the HTTP status and
 * Drive's reason code so those failures can be told apart.
 *
 * A Drive that refused the upload (full, or no access) used to leave nothing
 * written anywhere: the backup stayed due, and every automatic run six hours
 * later failed and reported again (about four events per affected user). The
 * day's copy now goes to the phone, and the failure is reported once a day.
 */
import { trackEvent } from '~/services/analytics';
import { runAutoBackupIfDue } from '~/services/autoBackup.native';
import { googleDriveProvider } from '~/services/autoBackupProviders/googleDrive';
import { DriveError } from '~/services/autoBackupProviders/googleDriveApi';
import { localProvider } from '~/services/autoBackupProviders/local';

let settings: Record<string, unknown> = {};

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
jest.mock('~/services/analytics', () => ({
  trackEvent: jest.fn(),
  AnalyticsEvents: { AUTO_BACKUP_FAILED: 'Auto Backup Failed' },
}));
jest.mock('~/services/autoBackupProviders/local', () => ({
  localProvider: { isAvailable: jest.fn(), upload: jest.fn(), list: jest.fn() },
}));
jest.mock('~/services/autoBackupProviders/icloud', () => ({ iCloudProvider: {} }));
jest.mock('~/services/autoBackupProviders/googleDrive', () => ({
  googleDriveProvider: {
    isAvailable: jest.fn(),
    unavailableReason: jest.fn(),
    upload: jest.fn(),
    list: jest.fn(),
  },
  resetGoogleDriveFolderCache: jest.fn(),
}));
jest.mock('~/services/autoBackupProviders/googleDriveAuth', () => ({}));
jest.mock('~/services/dataManagementService', () => ({
  buildBackupJson: jest.fn(async () => ({ json: '{}' })),
  yieldToEventLoop: jest.fn(async () => undefined),
}));

const drive = googleDriveProvider as unknown as Record<
  'isAvailable' | 'unavailableReason' | 'upload' | 'list',
  jest.Mock
>;
const local = localProvider as unknown as Record<'isAvailable' | 'upload' | 'list', jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  settings = { autoBackupEnabled: true, autoBackupTarget: 'googleDrive', lastAutoBackupAt: null };
  drive.isAvailable.mockResolvedValue(true);
  drive.unavailableReason.mockResolvedValue(null);
  drive.list.mockResolvedValue([]);
  local.upload.mockResolvedValue({ id: 'local.json', target: 'local' });
  local.list.mockResolvedValue([]);
});

it('reports the HTTP status and Drive reason of a refused upload', async () => {
  drive.upload.mockRejectedValue(
    new DriveError('client', 'insufficient scopes', 403, 'insufficientPermissions'),
  );

  await runAutoBackupIfDue({ force: true });

  expect(trackEvent).toHaveBeenCalledWith('Auto Backup Failed', {
    target: 'googleDrive',
    trigger: 'manual',
    error_count: 1,
    error_kind: 'client',
    fell_back_to_local: true,
    http_status: 403,
    drive_reason: 'insufficientPermissions',
  });
});

it('keeps the backup on the phone when Drive is full', async () => {
  drive.upload.mockRejectedValue(
    new DriveError('quota', 'storage full', 403, 'storageQuotaExceeded'),
  );

  const result = await runAutoBackupIfDue();

  expect(local.upload).toHaveBeenCalledTimes(1);
  expect(result.written).toEqual([{ id: 'local.json', target: 'local' }]);
  expect(settings.lastAutoBackupAt).toEqual(expect.any(String));
  expect(settings.lastAutoBackupError).toEqual(expect.stringContaining('auto_backup'));
  expect(trackEvent).toHaveBeenCalledWith('Auto Backup Failed', {
    target: 'googleDrive',
    trigger: 'automatic',
    error_count: 1,
    error_kind: 'quota',
    fell_back_to_local: true,
    http_status: 403,
    drive_reason: 'storageQuotaExceeded',
  });
});

it('does not fail and report again on the same day after Drive refused the upload', async () => {
  drive.upload.mockRejectedValue(
    new DriveError('quota', 'storage full', 403, 'storageQuotaExceeded'),
  );
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now');
  try {
    clock.mockReturnValue(now);
    await runAutoBackupIfDue();
    // Past the six-hour failure backoff, but still the same day.
    clock.mockReturnValue(now + 7 * 60 * 60 * 1000);
    const later = await runAutoBackupIfDue();

    expect(later).toMatchObject({ skipped: true, reason: 'fresh' });
    expect(drive.upload).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledTimes(1);
  } finally {
    clock.mockRestore();
  }
});

it('still reports the Drive failure when the phone copy fails too', async () => {
  drive.upload.mockRejectedValue(
    new DriveError('quota', 'storage full', 403, 'storageQuotaExceeded'),
  );
  local.upload.mockRejectedValue(new Error('disk full'));

  const result = await runAutoBackupIfDue();

  expect(result.written).toEqual([]);
  expect(trackEvent).toHaveBeenCalledWith(
    'Auto Backup Failed',
    expect.objectContaining({
      error_count: 2,
      error_kind: 'quota',
      fell_back_to_local: false,
      drive_reason: 'storageQuotaExceeded',
    }),
  );
});

it('says why Drive was unreachable when the backup fell back to the device', async () => {
  drive.unavailableReason.mockResolvedValue('no_drive_access');

  await runAutoBackupIfDue({ force: true });

  expect(drive.upload).not.toHaveBeenCalled();
  expect(local.upload).toHaveBeenCalled();
  expect(trackEvent).toHaveBeenCalledWith('Auto Backup Failed', {
    target: 'googleDrive',
    trigger: 'manual',
    error_count: 1,
    error_kind: 'unavailable',
    fell_back_to_local: true,
    http_status: null,
    drive_reason: 'no_drive_access',
  });
});

it('sends no reason for a target that cannot give one', async () => {
  settings.autoBackupTarget = 'icloud';
  const { iCloudProvider } = jest.requireMock('~/services/autoBackupProviders/icloud') as {
    iCloudProvider: Record<string, unknown>;
  };
  iCloudProvider.isAvailable = jest.fn(async () => false);

  await runAutoBackupIfDue({ force: true });

  expect(trackEvent).toHaveBeenCalledWith(
    'Auto Backup Failed',
    expect.objectContaining({ error_kind: 'unavailable', drive_reason: null }),
  );
});

it('writes no phone copy for a failure that usually passes, so Drive is retried later', async () => {
  drive.upload.mockRejectedValue(new DriveError('timeout', 'timed out', null, null));

  // Manual, so the six-hour backoff an earlier case left behind does not skip it.
  const result = await runAutoBackupIfDue({ force: true });

  expect(local.upload).not.toHaveBeenCalled();
  expect(result.written).toEqual([]);
  expect(settings.lastAutoBackupAt).toBeNull();
  expect(trackEvent).toHaveBeenCalledWith(
    'Auto Backup Failed',
    expect.objectContaining({ error_kind: 'timeout', fell_back_to_local: false }),
  );
});

it('keeps why Drive was unreachable when the phone write fails too', async () => {
  drive.unavailableReason.mockResolvedValue('signed_out');
  local.upload.mockRejectedValue(new Error('disk full'));

  await runAutoBackupIfDue({ force: true });

  expect(trackEvent).toHaveBeenCalledWith(
    'Auto Backup Failed',
    expect.objectContaining({
      error_count: 2,
      error_kind: 'unavailable',
      drive_reason: 'signed_out',
    }),
  );
});

it('tells the caller a refused Drive upload was saved on the phone instead', async () => {
  drive.upload.mockRejectedValue(
    new DriveError('quota', 'storage full', 403, 'storageQuotaExceeded'),
  );

  const result = await runAutoBackupIfDue({ force: true });

  expect(result.savedOnDeviceAfterFailure).toBe(true);
  expect(result.fellBackToLocalFrom).toBeUndefined();
});

it('writes no phone copy when a reachable iCloud throws, so it is retried later today', async () => {
  settings.autoBackupTarget = 'icloud';
  const { iCloudProvider } = jest.requireMock('~/services/autoBackupProviders/icloud') as {
    iCloudProvider: Record<string, unknown>;
  };
  iCloudProvider.isAvailable = jest.fn(async () => true);
  iCloudProvider.upload = jest.fn(async () => {
    throw new Error('container not synced yet');
  });
  iCloudProvider.list = jest.fn(async () => []);

  const result = await runAutoBackupIfDue({ force: true });

  expect(local.upload).not.toHaveBeenCalled();
  expect(result.written).toEqual([]);
  expect(result.savedOnDeviceAfterFailure).toBe(false);
  expect(settings.lastAutoBackupAt).toBeNull();
});
