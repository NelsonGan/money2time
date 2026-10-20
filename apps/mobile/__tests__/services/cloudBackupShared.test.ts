import {
  CLOUD_BACKUP_INTERVAL_MS,
  CloudBackupError,
  isCloudBackupStale,
} from '~/services/cloudBackup.shared';

describe('isCloudBackupStale', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');

  it('is due when there has never been a cloud backup', () => {
    expect(isCloudBackupStale(null, now)).toBe(true);
  });

  it('waits until the interval has passed since the last backup', () => {
    const recent = new Date(now - CLOUD_BACKUP_INTERVAL_MS + 60_000).toISOString();
    const old = new Date(now - CLOUD_BACKUP_INTERVAL_MS).toISOString();
    expect(isCloudBackupStale(recent, now)).toBe(false);
    expect(isCloudBackupStale(old, now)).toBe(true);
  });

  it('treats an unreadable timestamp as due rather than never backing up again', () => {
    expect(isCloudBackupStale('not a date', now)).toBe(true);
  });

  it('runs a daily habit that happens a little earlier each day', () => {
    // Opened at 09:00 yesterday, 08:00 today: still a new day's backup.
    const yesterday = new Date(now - 23 * 60 * 60 * 1000).toISOString();
    expect(isCloudBackupStale(yesterday, now)).toBe(true);
  });
});

describe('CloudBackupError', () => {
  it('carries the primary device for a not-primary refusal', () => {
    const primary = { id: 'a', platform: 'ios', name: 'iPhone', appVersion: null, lastSeenAt: 1 };
    const error = new CloudBackupError('not_primary', primary);
    expect(error.code).toBe('not_primary');
    expect(error.primaryDevice).toBe(primary);
  });
});
