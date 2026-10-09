import { Directory, File, Paths } from 'expo-file-system/next';
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

import {
  buildListenerConfigJson,
  type CaptureInput,
  type ListenerStatus,
  parseAndroidCaptureJson,
  parseListenerStatusJson,
  parseSeenAppsJson,
  PAYMENT_CAPTURE_CONFIG_FILE,
  PAYMENT_CAPTURE_SEEN_APPS_FILE,
  PAYMENT_CAPTURE_STATUS_FILE,
  PAYMENT_CAPTURES_DIR,
  type SeenApp,
  sortCaptureFileNames,
} from '~/features/autoLog/lib/captureQueue';
import {
  clearAutoLogPendingAlerts,
  isPaymentAlertIntentSupported,
  readAutoLogPendingAlerts,
} from '~/services/autoLog';

/**
 * Bridge to the platforms' payment-alert capture: Android's notification
 * listener (plugins/withMoney2TimePaymentCapture.js), which writes one JSON
 * file per alert, and iOS's Log Notification Shortcuts action
 * (plugins/withMoney2TimeAutoLog.js), which queues into the App Group. Both
 * capture raw text only; features/autoLog parses it.
 */

interface NativePaymentCaptureModule {
  getAccessState?: () => Promise<{ granted: boolean; connected?: boolean }>;
  openAccessSettings?: () => Promise<void>;
  requestRebind?: () => Promise<void>;
  requestUnbind?: () => Promise<void>;
  /** Resolves `posted`, or `direct` when money2time's own notifications are blocked. */
  postTestAlert?: (
    title: string,
    body: string,
    channelName: string,
  ) => Promise<'posted' | 'direct'>;
  getAppInfo?: (
    packages: string[],
  ) => Promise<{ package: string; label: string; iconUri: string | null }[]>;
}

const nativeModule = NativeModules.Money2TimePaymentCapture as
  | NativePaymentCaptureModule
  | undefined;

/** Event the Android module emits when the listener writes a capture. */
const CAPTURE_QUEUED_EVENT = 'Money2TimePaymentCaptureQueued';

/** Android build with the notification listener compiled in. */
export function isNotificationCaptureSupported(): boolean {
  return Platform.OS === 'android' && !!nativeModule?.getAccessState;
}

/** Whether this build can capture payment alerts at all, on either platform. */
export function isPaymentAlertCaptureSupported(): boolean {
  return isNotificationCaptureSupported() || isPaymentAlertIntentSupported();
}

function capturesDir(): Directory {
  return new Directory(Paths.document, PAYMENT_CAPTURES_DIR);
}

function readText(name: string): string | null {
  try {
    const file = new File(capturesDir(), name);
    return file.exists ? file.textSync() : null;
  } catch {
    return null;
  }
}

/** A `.part` older than this was orphaned by a killed process. */
const STALE_PART_MS = 10 * 60 * 1000;

function readAndroidCaptures(): CaptureInput[] {
  const dir = capturesDir();
  if (!dir.exists) return [];
  const names: string[] = [];
  for (const item of dir.list()) {
    if (!(item instanceof File)) continue;
    if (item.name.endsWith('.part')) {
      const modified = item.modificationTime;
      if (modified != null && Date.now() - modified > STALE_PART_MS) {
        try {
          item.delete();
        } catch {
          // The listener may have renamed or removed it since the listing; the next drain retries.
        }
      }
      continue;
    }
    names.push(item.name);
  }
  const captures: CaptureInput[] = [];
  for (const name of sortCaptureFileNames(names)) {
    let json: string;
    try {
      json = new File(dir, name).textSync();
    } catch {
      // An I/O failure must retain the alert for the next drain.
      continue;
    }
    const capture = json ? parseAndroidCaptureJson(name, json) : null;
    if (capture) {
      captures.push(capture);
    } else {
      // A completed malformed capture cannot become valid on a later drain.
      try {
        new File(capturesDir(), name).delete();
      } catch {
        // Ignore; the next drain retries.
      }
    }
  }
  return captures;
}

/** Everything the native layers queued, oldest first. */
export async function readQueuedCaptures(): Promise<CaptureInput[]> {
  if (Platform.OS === 'android') return readAndroidCaptures();
  if (Platform.OS === 'ios') return readAutoLogPendingAlerts();
  return [];
}

/** Remove drained captures from the native queues. */
export async function clearQueuedCaptures(captures: readonly CaptureInput[]): Promise<void> {
  if (captures.length === 0) return;
  if (Platform.OS === 'android') {
    const dir = capturesDir();
    if (!dir.exists) return;
    for (const capture of captures) {
      if (capture.channel !== 'android_notification' || capture.id.includes('/')) continue;
      try {
        const file = new File(dir, `${capture.id}.json`);
        if (file.exists) file.delete();
      } catch {
        // Ignore; it is recognized as a repeat next time.
      }
    }
    return;
  }
  if (Platform.OS === 'ios') {
    await clearAutoLogPendingAlerts(
      captures.filter((capture) => capture.channel === 'ios_alert').map((capture) => capture.id),
    );
  }
}

/** Empty the Android capture folder (full data reset). */
export function clearAndroidCaptureQueue(): void {
  if (Platform.OS !== 'android') return;
  try {
    const dir = capturesDir();
    if (!dir.exists) return;
    for (const item of dir.list()) {
      if (item instanceof File && /^\d{10,}-.*\.json(\.part)?$/.test(item.name)) item.delete();
    }
  } catch {
    // Best effort.
  }
}

/**
 * Tell the listener what to keep. Written on every change of the watched
 * apps, and with `enabled` while setup runs so its own test alert is captured.
 */
export function writeListenerConfig(input: {
  enabled: boolean;
  packages: readonly string[];
  allowShell: boolean;
  optedOut?: boolean;
}): void {
  if (Platform.OS !== 'android') return;
  try {
    const dir = capturesDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, PAYMENT_CAPTURE_CONFIG_FILE);
    file.write(buildListenerConfigJson(input));
  } catch {
    // The listener treats a missing config as "capture nothing", which is safe.
  }
}

export function readListenerStatus(): ListenerStatus {
  return parseListenerStatusJson(readText(PAYMENT_CAPTURE_STATUS_FILE));
}

export function readSeenApps(): SeenApp[] {
  return parseSeenAppsJson(readText(PAYMENT_CAPTURE_SEEN_APPS_FILE));
}

export interface NotificationListenerState {
  /** Notification access is switched on for money2time in Android settings. */
  granted: boolean;
  /** The listener is bound in this process right now. */
  connected: boolean;
}

export async function getNotificationListenerState(): Promise<NotificationListenerState> {
  if (!isNotificationCaptureSupported() || !nativeModule?.getAccessState) {
    return { granted: false, connected: false };
  }
  try {
    const state = await nativeModule.getAccessState();
    return { granted: state.granted === true, connected: state.connected === true };
  } catch {
    return { granted: false, connected: false };
  }
}

export async function getNotificationAccessGranted(): Promise<boolean> {
  return (await getNotificationListenerState()).granted;
}

export async function openNotificationAccessSettings(): Promise<void> {
  await nativeModule?.openAccessSettings?.();
}

export async function rebindNotificationListener(): Promise<void> {
  try {
    await nativeModule?.requestRebind?.();
  } catch {
    // Not granted, or the system refused; the health banner says so.
  }
}

export async function unbindNotificationListener(): Promise<void> {
  try {
    await nativeModule?.requestUnbind?.();
  } catch {
    // Already unbound.
  }
}

/**
 * Post the setup screen's own test alert, which the listener captures like a
 * bank's (tagged, so it is previewed and never logged). When money2time's own
 * notifications are blocked the module queues the test directly instead, so
 * the preview still runs; the listener itself is then only proven by a real
 * alert.
 */
export async function postNotificationTestAlert(
  title: string,
  body: string,
  channelName: string,
): Promise<boolean> {
  if (!nativeModule?.postTestAlert) return false;
  try {
    await nativeModule.postTestAlert(title, body, channelName);
    return true;
  } catch {
    return false;
  }
}

export interface InstalledAppInfo {
  package: string;
  label: string;
  iconUri: string | null;
}

/** Labels and icons for packages the app can see (installed and declared, or seen notifying). */
export async function getInstalledAppInfo(
  packages: readonly string[],
): Promise<InstalledAppInfo[]> {
  if (!nativeModule?.getAppInfo || packages.length === 0) return [];
  try {
    return await nativeModule.getAppInfo([...packages]);
  } catch {
    return [];
  }
}

/** Called when the listener writes a capture while the app is running. */
export function subscribeCaptureQueued(listener: () => void): () => void {
  if (Platform.OS !== 'android') return () => undefined;
  const subscription = DeviceEventEmitter.addListener(CAPTURE_QUEUED_EVENT, listener);
  return () => subscription.remove();
}
