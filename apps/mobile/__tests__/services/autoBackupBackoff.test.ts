import { AUTO_BACKUP_FAILURE_BACKOFF_MS, isInFailureBackoff } from '~/services/autoBackup.shared';

describe('automatic backup failure backoff', () => {
  const failedAt = Date.parse('2026-10-19T08:00:00Z');

  it('does not hold back a run when nothing has failed', () => {
    expect(isInFailureBackoff(null, failedAt)).toBe(false);
  });

  it('holds back automatic runs until the backoff has passed', () => {
    expect(isInFailureBackoff(failedAt, failedAt + 60_000)).toBe(true);
    expect(isInFailureBackoff(failedAt, failedAt + AUTO_BACKUP_FAILURE_BACKOFF_MS - 1)).toBe(true);
    expect(isInFailureBackoff(failedAt, failedAt + AUTO_BACKUP_FAILURE_BACKOFF_MS)).toBe(false);
  });
});
