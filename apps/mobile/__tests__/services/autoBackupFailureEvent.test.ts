/**
 * The `Auto Backup Failed` payload. Most failed Google Drive backups arrive as
 * error_kind `client`, repeating daily for the same users, and that kind covers
 * every 4xx Drive does not single out. The event carries the HTTP status and
 * Drive's reason code so those failures can be told apart.
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
  googleDriveProvider: { isAvailable: jest.fn(), upload: jest.fn(), list: jest.fn() },
  resetGoogleDriveFolderCache: jest.fn(),
}));
jest.mock('~/services/autoBackupProviders/googleDriveAuth', () => ({}));
jest.mock('~/services/dataManagementService', () => ({
  buildBackupJson: jest.fn(async () => ({ json: '{}' })),
  yieldToEventLoop: jest.fn(async () => undefined),
}));

const drive = googleDriveProvider as unknown as Record<
  'isAvailable' | 'upload' | 'list',
  jest.Mock
>;
const local = localProvider as unknown as Record<'isAvailable' | 'upload' | 'list', jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  settings = { autoBackupEnabled: true, autoBackupTarget: 'googleDrive', lastAutoBackupAt: null };
  drive.isAvailable.mockResolvedValue(true);
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
    error_count: 1,
    error_kind: 'client',
    fell_back_to_local: false,
    http_status: 403,
    drive_reason: 'insufficientPermissions',
  });
});

it('sends nulls when Drive was unreachable and the backup fell back to the device', async () => {
  drive.isAvailable.mockResolvedValue(false);

  await runAutoBackupIfDue({ force: true });

  expect(local.upload).toHaveBeenCalled();
  expect(trackEvent).toHaveBeenCalledWith('Auto Backup Failed', {
    target: 'googleDrive',
    error_count: 1,
    error_kind: 'unavailable',
    fell_back_to_local: true,
    http_status: null,
    drive_reason: null,
  });
});
