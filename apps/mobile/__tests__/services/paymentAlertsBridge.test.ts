import { isCurrentTestAlertResult, type TestAlertResult } from '~/services/paymentAlertsBridge';

const result = (capturedAt: string): TestAlertResult => ({
  capturedAt,
  amount: 1,
  currency: 'MYR',
  counterparty: 'Test Cafe',
  accountId: 'account',
  categoryId: 'food',
  wouldLog: true,
});
const startedAt = Date.parse('2026-10-08T12:00:00Z');

describe('setup notification result ownership', () => {
  it('ignores queued results when this screen has not requested a test', () => {
    expect(isCurrentTestAlertResult(result('2026-10-08T12:00:01Z'), null)).toBe(false);
  });
  it('ignores a slow previous attempt when the user has started another test', () => {
    expect(isCurrentTestAlertResult(result('2026-10-08T11:59:59Z'), startedAt)).toBe(false);
  });
  it('accepts a result posted during the current attempt, including after a timeout', () => {
    expect(isCurrentTestAlertResult(result('2026-10-08T12:00:00Z'), startedAt)).toBe(true);
    expect(isCurrentTestAlertResult(result('2026-10-08T12:02:00Z'), startedAt)).toBe(true);
  });
  it('rejects a malformed capture timestamp', () => {
    expect(isCurrentTestAlertResult(result('invalid'), startedAt)).toBe(false);
  });
});
