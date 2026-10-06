import type { CaptureInput } from '~/features/autoLog/lib/captureQueue';
import { withAlertSource } from '~/features/autoLog/lib/prefs';
import { previewTestAlerts } from '~/features/autoLog/previewAlerts';
import { isCurrentTestAlert } from '~/services/paymentAlertsBridge';
import { scanPaymentAlert } from '~/services/paymentAlertScan';
import { DEFAULT_QUICK_ENTRY_PREFS } from '~/types';

import { account, category, prefs, source } from './helpers';

jest.mock('~/services/paymentAlertScan', () => ({ scanPaymentAlert: jest.fn() }));
jest.mock('~/services/errorReporting', () => ({ reportError: jest.fn() }));
const now = new Date('2026-10-06T12:00:00.000Z');
const capture: CaptureInput = {
  id: 'test',
  channel: 'android_notification',
  sourceKey: 'app',
  sourceLabel: null,
  capturedAt: now.toISOString(),
  title: 'Test',
  subtitle: null,
  body: 'You spent MYR 1',
  extra: [],
  nativeKey: null,
  presetAccountId: null,
  presetCategoryId: null,
  isTest: true,
};
const deps = () => ({
  accounts: [account()],
  categories: [category()],
  transactions: [],
  prefs: withAlertSource(prefs(), source({ accountId: 'a1' })),
  reportingCurrency: 'MYR',
  quickEntryPrefs: DEFAULT_QUICK_ENTRY_PREFS,
  appUserId: 'user',
});
const emit = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(scanPaymentAlert).mockResolvedValue({
    type: 'expense',
    amount: 1,
    currency: 'MYR',
    category: 'Food',
    note: 'Test',
    date: null,
    sentiment: 'neutral',
  });
});
it('discards stale setup tests without uploading their notification text', async () => {
  const stale = { ...capture, capturedAt: '2026-10-05T12:00:00.000Z' };
  expect(await previewTestAlerts([stale], deps, emit, now)).toEqual([stale]);
  expect(scanPaymentAlert).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});
it('clears a failed preview and reports failure for that capture', async () => {
  jest.mocked(scanPaymentAlert).mockRejectedValueOnce(new Error('offline'));
  expect(await previewTestAlerts([capture], deps, emit, now)).toEqual([capture]);
  expect(emit).toHaveBeenCalledWith(
    expect.objectContaining({ captureId: 'test', capturedAt: capture.capturedAt, wouldLog: false }),
  );
});
it('does not upload a preview when alerts have been turned off', async () => {
  const input = deps();
  input.prefs.alertsEnabled = false;
  expect(await previewTestAlerts([capture], () => input, emit, now)).toEqual([capture]);
  expect(scanPaymentAlert).not.toHaveBeenCalled();
});
it('rechecks source opt-in after preview inference', async () => {
  const input = deps();
  jest.mocked(scanPaymentAlert).mockImplementationOnce(async () => {
    input.prefs.alertsEnabled = false;
    return {
      type: 'expense',
      amount: 1,
      currency: 'MYR',
      category: 'Food',
      note: 'Test',
      date: null,
      sentiment: 'neutral',
    };
  });
  await previewTestAlerts([capture], () => input, emit, now);
  expect(emit).toHaveBeenCalledWith(expect.objectContaining({ wouldLog: false }));
});
it('accepts only the active setup test window', () => {
  const result = {
    captureId: 'id',
    capturedAt: now.toISOString(),
    amount: 1,
    currency: 'MYR',
    counterparty: 'Test',
    accountId: 'a1',
    categoryId: 'c1',
    wouldLog: true,
  };
  expect(isCurrentTestAlert(result, null)).toBe(false);
  expect(isCurrentTestAlert(result, now.getTime() + 1)).toBe(false);
  expect(isCurrentTestAlert(result, now.getTime() - 1000)).toBe(true);
});
