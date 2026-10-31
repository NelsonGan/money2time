import { trackEvent } from '~/services/analytics';
import { restoreFromBackup, saveRestoreSafetyBackup } from '~/services/autoBackup.native';
import {
  type BackupRecord,
  buildAutoBackupName,
  parseTimestampFromName,
} from '~/services/autoBackup.shared';
import { localProvider } from '~/services/autoBackupProviders/local';
import { applyBackupData, buildBackupJson } from '~/services/dataManagementService';

jest.mock('expo-background-task', () => ({}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('~/lib/repositories/settingsRepository', () => ({}));
jest.mock('~/services/analytics', () => ({
  trackEvent: jest.fn(),
  AnalyticsEvents: { AUTO_BACKUP_RESTORED: 'restored' },
}));
jest.mock('~/services/autoBackupProviders/local', () => ({
  localProvider: { download: jest.fn(), list: jest.fn(), upload: jest.fn() },
}));
jest.mock('~/services/autoBackupProviders/icloud', () => ({ iCloudProvider: {} }));
jest.mock('~/services/autoBackupProviders/googleDrive', () => ({ googleDriveProvider: {} }));
jest.mock('~/services/autoBackupProviders/googleDriveAuth', () => ({}));
jest.mock('~/services/dataManagementService', () => ({
  parseBackupJson: (json: string) => JSON.parse(json),
  applyBackupData: jest.fn(),
  buildBackupJson: jest.fn(),
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
  (buildBackupJson as jest.Mock).mockResolvedValue({ json: 'safety-json' });
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
  expect(trackEvent).toHaveBeenCalledWith('restored', { target: 'local' });
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
  jest.useFakeTimers().setSystemTime(new Date(backup.exportedAt));
  try {
    (localProvider.list as jest.Mock).mockResolvedValue([
      { id: 'money2time_RECOVERY_2026-10-31T12-00-00.json' },
    ]);
    await saveRestoreSafetyBackup();
    expect(localProvider.upload).toHaveBeenCalledWith(
      'money2time_RECOVERY_2026-10-31T12-00-01.json',
      'safety-json',
    );
    expect(trackEvent).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});

it('uses a discoverable recovery filename that an automatic run cannot overwrite', async () => {
  jest.useFakeTimers().setSystemTime(new Date(backup.exportedAt));
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
  (buildBackupJson as jest.Mock).mockRejectedValueOnce(new Error('asset read failed'));
  await expect(saveRestoreSafetyBackup()).rejects.toThrow('asset read failed');
  expect(localProvider.upload).not.toHaveBeenCalled();
});
