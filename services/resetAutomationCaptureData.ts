import { clearAllAutoLogQueues } from './autoLog';
import { reportError } from './errorReporting';
import { clearNotificationScanHistory } from './notificationScanHistory';
import { clearAndroidCaptureQueue } from './paymentCapture';

/** Invalidate in-flight reviews and clear capture storage outside the replaced database. */
export function resetAutomationCaptureData(appUserId?: string): void {
  if (appUserId)
    void clearNotificationScanHistory(appUserId).catch((error) =>
      reportError(error, { scope: 'notification_scan_history_reset' }),
    );
  try {
    clearAndroidCaptureQueue();
  } catch (error) {
    reportError(error, { scope: 'reset_android_capture_queue' });
  }
  void clearAllAutoLogQueues().catch((error) =>
    reportError(error, { scope: 'reset_autolog_queues' }),
  );
}
