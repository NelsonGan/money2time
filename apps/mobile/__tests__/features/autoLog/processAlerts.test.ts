import type { CaptureInput } from '~/features/autoLog/lib/captureQueue';
import { withAlertSource } from '~/features/autoLog/lib/prefs';
import { type AlertProcessingDeps, processAlertCaptures } from '~/features/autoLog/processAlerts';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import {
  getNotificationScanHistoryGeneration,
  recordNotificationScan,
} from '~/services/notificationScanHistory';
import type { QuickEntryPrefs } from '~/types';

import { account, category, prefs, source } from './helpers';

jest.mock('~/lib/repositories/paymentAlertCapturesRepository', () => ({
  paymentAlertCapturesRepository: {
    getById: jest.fn(() => null),
    insert: jest.fn(() => true),
    update: jest.fn(),
  },
}));
jest.mock('~/services/errorReporting', () => ({ reportError: jest.fn() }));
jest.mock('~/services/notificationScanHistory', () => ({
  recordNotificationScan: jest.fn(async () => undefined),
  getNotificationScanHistoryGeneration: jest.fn(() => 0),
}));
jest.mock('~/services/receiptScan', () => ({
  scanReceipt: jest.fn(() => {
    throw new Error('AI must never run');
  }),
}));
const capture: CaptureInput = {
  id: 'capture',
  channel: 'android_notification',
  sourceKey: 'com.example.bank',
  sourceLabel: 'Bank',
  capturedAt: '2026-10-08T10:57:31.298Z',
  title: null,
  subtitle: null,
  body: 'You have successfully transferred RM 0.20 to ALEX TAN.',
  extra: [],
  nativeKey: null,
  presetAccountId: null,
  presetCategoryId: null,
};
const deps = (): AlertProcessingDeps => ({
  appUserId: 'test-user',
  accounts: [account()],
  categories: [category()],
  prefs: withAlertSource(prefs(), source({ accountId: 'a1' })),
  reportingCurrency: 'MYR',
  quickEntryPrefs: { autoLogUsageCount: 9999, defaultExpenseCategoryId: 'c1' } as QuickEntryPrefs,
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(paymentAlertCapturesRepository.getById).mockReturnValue(null);
  jest.mocked(getNotificationScanHistoryGeneration).mockReturnValue(0);
});
it('queues a local amount for review without creating a transaction or using AI/quotas', async () => {
  const current = deps();
  const summary = await processAlertCaptures([capture], current);
  expect(recordNotificationScan).toHaveBeenCalledWith(
    'test-user',
    expect.objectContaining({
      result: 'pending',
      amounts: [{ amount: 0.2, currency: 'MYR' }],
      accountId: 'a1',
    }),
    0,
  );
  expect(summary).toMatchObject({ logged: 0, pending: 1, captureIds: ['capture'] });
  expect(paymentAlertCapturesRepository.insert).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'pending', body: null }),
  );
});
it('keeps promotions and notifications without monetary amounts reviewable', async () => {
  await processAlertCaptures(
    [
      { ...capture, body: 'Get RM5 cashback on your next purchase' },
      { ...capture, id: 'otp', body: 'Your OTP is 123456' },
    ],
    deps(),
  );
  expect(recordNotificationScan).toHaveBeenNthCalledWith(
    1,
    'test-user',
    expect.objectContaining({ result: 'pending', amounts: [{ amount: 5, currency: 'MYR' }] }),
    0,
  );
  expect(recordNotificationScan).toHaveBeenNthCalledWith(
    2,
    'test-user',
    expect.objectContaining({ result: 'pending', amounts: [] }),
    0,
  );
});
it('honors Android source controls and excludes setup samples', async () => {
  const current = deps();
  current.prefs = { ...current.prefs, alertsEnabled: false };
  const summary = await processAlertCaptures([capture], current);
  expect(recordNotificationScan).not.toHaveBeenCalled();
  expect(summary.ignored).toBe(1);
  await processAlertCaptures([{ ...capture, isTest: true }], deps());
  expect(recordNotificationScan).not.toHaveBeenCalled();
});
it('accepts configured iOS shortcuts and keeps a missing account correctable', async () => {
  const current = deps();
  current.prefs = { ...current.prefs, alertsEnabled: false };
  await processAlertCaptures(
    [{ ...capture, channel: 'ios_alert', presetAccountId: 'missing' }],
    current,
  );
  expect(recordNotificationScan).toHaveBeenCalledWith(
    'test-user',
    expect.objectContaining({ result: 'pending', accountId: null }),
    0,
  );
});
it('leaves the native capture queued on storage failure', async () => {
  jest.mocked(recordNotificationScan).mockRejectedValueOnce(new Error('disk'));
  const summary = await processAlertCaptures([capture], deps());
  expect(summary.captureIds).toEqual([]);
  expect(paymentAlertCapturesRepository.insert).not.toHaveBeenCalled();
});
it('does not publish queue work from before reset or identity changes', async () => {
  const current = deps();
  current.scanGeneration = 0;
  jest.mocked(getNotificationScanHistoryGeneration).mockReturnValue(1);
  expect((await processAlertCaptures([capture], current)).captureIds).toEqual([]);
  jest.mocked(getNotificationScanHistoryGeneration).mockReturnValue(0);
  current.getCurrent = () => ({ ...current, appUserId: 'restored' });
  expect((await processAlertCaptures([capture], current)).captureIds).toEqual([]);
  expect(recordNotificationScan).not.toHaveBeenCalled();
});
