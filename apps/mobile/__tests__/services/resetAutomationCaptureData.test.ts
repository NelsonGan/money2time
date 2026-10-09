import { clearAllAutoLogQueues } from '~/services/autoLog';
import { reportError } from '~/services/errorReporting';
import { clearNotificationScanHistory } from '~/services/notificationScanHistory';
import { clearAndroidCaptureQueue } from '~/services/paymentCapture';
import { resetAutomationCaptureData } from '~/services/resetAutomationCaptureData';

jest.mock('~/services/autoLog', () => ({ clearAllAutoLogQueues: jest.fn(async () => undefined) }));
jest.mock('~/services/paymentCapture', () => ({ clearAndroidCaptureQueue: jest.fn() }));
jest.mock('~/services/notificationScanHistory', () => ({
  clearNotificationScanHistory: jest.fn(async () => undefined),
}));
jest.mock('~/services/errorReporting', () => ({ reportError: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
it('invalidates local review history before clearing either native queue', () => {
  resetAutomationCaptureData('user');
  expect(clearNotificationScanHistory).toHaveBeenCalledWith('user');
  expect(clearAndroidCaptureQueue).toHaveBeenCalledTimes(1);
  expect(clearAllAutoLogQueues).toHaveBeenCalledTimes(1);
  expect(jest.mocked(clearNotificationScanHistory).mock.invocationCallOrder[0]).toBeLessThan(
    jest.mocked(clearAllAutoLogQueues).mock.invocationCallOrder[0],
  );
});
it('clears native queues even before the user identity is available', () => {
  resetAutomationCaptureData();
  expect(clearNotificationScanHistory).not.toHaveBeenCalled();
  expect(clearAndroidCaptureQueue).toHaveBeenCalledTimes(1);
  expect(clearAllAutoLogQueues).toHaveBeenCalledTimes(1);
});
it('continues all cleanup when one platform storage fails and reports failures', async () => {
  jest.mocked(clearAndroidCaptureQueue).mockImplementationOnce(() => {
    throw new Error('android disk');
  });
  jest.mocked(clearAllAutoLogQueues).mockRejectedValueOnce(new Error('ios disk'));
  jest.mocked(clearNotificationScanHistory).mockRejectedValueOnce(new Error('history disk'));
  expect(() => resetAutomationCaptureData('user')).not.toThrow();
  await Promise.resolve();
  expect(clearAllAutoLogQueues).toHaveBeenCalledTimes(1);
  expect(clearNotificationScanHistory).toHaveBeenCalledWith('user');
  expect(reportError).toHaveBeenCalledTimes(3);
});
