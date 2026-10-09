import { Directory, File, Paths } from 'expo-file-system/next';
import { NativeModules, Platform } from 'react-native';

import { type CaptureInput, parseIosPendingAlertsJson } from '~/features/autoLog/lib/captureQueue';
import {
  type AutoLogPendingEntry,
  type AutoLogPendingScan,
  parseAutoLogPendingJson,
  parseAutoLogPendingScansJson,
  parseSharedScanFileNames,
  SHARED_SCANS_DIR,
} from '~/features/transactions/lib/autoLog';
import type { AutoLogCatalog } from '~/features/transactions/lib/autoLogCatalog';

/**
 * Bridge to the auto-log App Group store, backed by the generated
 * `Money2TimeAutoLogModule.swift` (see plugins/withMoney2TimeAutoLog.js).
 *
 * The App Intent and the app never talk directly: the app publishes a catalog
 * of accounts/categories/defaults for the intent's pickers, and the intent
 * queues taps back for the app to drain into real transactions.
 */

interface NativeAutoLogModule {
  writeCatalog?: (json: string) => Promise<void>;
  readPending?: () => Promise<string | null>;
  clearPending?: (ids: string[]) => Promise<void>;
  readPendingScans?: () => Promise<string | null>;
  clearPendingScans?: (ids: string[]) => Promise<void>;
  /** Log Notification queue (bank and wallet app notifications via Shortcuts). */
  readPendingAlerts?: () => Promise<string | null>;
  clearPendingAlerts?: (ids: string[]) => Promise<void>;
  /** Debug builds only. See `enqueueTestAutoLogTap`. */
  enqueueTestTap?: (amountRaw: string, merchant: string, card: string) => Promise<string>;
  /** Debug builds only. See `enqueueTestAutoLogAlert`. */
  enqueueTestAlert?: (source: string, title: string, message: string) => Promise<string>;
}

const nativeAutoLogModule = NativeModules.Money2TimeAutoLog as NativeAutoLogModule | undefined;

/**
 * Auto-log rides the iOS Shortcuts "Transaction" automation, which has no
 * Android or web equivalent. Also false on an iOS build that predates the
 * config plugin, so callers degrade instead of throwing.
 */
export function isAutoLogSupported(): boolean {
  return Platform.OS === 'ios' && !!nativeAutoLogModule?.writeCatalog;
}

export async function writeAutoLogCatalog(catalog: AutoLogCatalog): Promise<void> {
  if (!isAutoLogSupported() || !nativeAutoLogModule?.writeCatalog) return;
  await nativeAutoLogModule.writeCatalog(JSON.stringify(catalog));
}

export async function readAutoLogPending(): Promise<AutoLogPendingEntry[]> {
  if (!isAutoLogSupported() || !nativeAutoLogModule?.readPending) return [];
  return parseAutoLogPendingJson(await nativeAutoLogModule.readPending());
}

/** Remove drained entries. Ids that no longer exist are ignored natively. */
export async function clearAutoLogPending(ids: string[]): Promise<void> {
  if (!ids.length) return;
  if (!isAutoLogSupported() || !nativeAutoLogModule?.clearPending) return;
  await nativeAutoLogModule.clearPending(ids);
}

/**
 * Whether this build has a screenshot queue to drain: the iOS "Log Screenshot"
 * App Intent's App Group queue, or the Android share target's folder (see
 * plugins/withMoney2TimeShareScan.js). On an Android binary that predates the
 * share activity the folder simply never exists, so the drain is a cheap no-op.
 */
export function isScreenshotQueueSupported(): boolean {
  return Platform.OS === 'android' || isAutoLogSupported();
}

function sharedScansDir(): Directory {
  return new Directory(Paths.document, SHARED_SCANS_DIR);
}

/**
 * A `.part` file is a copy the share activity was still writing. One older than
 * this was orphaned (the process died mid-copy) and will never be renamed into
 * place, so the drain deletes it instead of carrying it forever.
 */
const STALE_PART_MS = 10 * 60 * 1000;

function readSharedScans(): AutoLogPendingScan[] {
  const dir = sharedScansDir();
  if (!dir.exists) return [];
  const names: string[] = [];
  for (const item of dir.list()) {
    if (!(item instanceof File)) continue;
    if (item.name.endsWith('.part')) {
      const modified = item.modificationTime;
      if (modified != null && Date.now() - modified > STALE_PART_MS) item.delete();
      continue;
    }
    names.push(item.name);
  }
  return parseSharedScanFileNames(names, dir.uri);
}

function clearSharedScans(ids: string[]) {
  const dir = sharedScansDir();
  if (!dir.exists) return;
  for (const id of ids) {
    // Ids are bare file names from the listing; refuse anything path-like so a
    // clear can never reach outside the queue folder.
    if (!id || id.includes('/')) continue;
    const file = new File(dir, id);
    if (file.exists) file.delete();
  }
}

/**
 * Screenshots waiting to be scanned, each carrying the absolute path of its
 * image. On iOS these were queued by the "Log Screenshot" App Intent in the App
 * Group container; on Android, shared to the app through the system share
 * sheet. Empty on a build that has neither, so callers degrade to a no-op.
 */
export async function readAutoLogPendingScans(): Promise<AutoLogPendingScan[]> {
  if (Platform.OS === 'android') return readSharedScans();
  if (!isAutoLogSupported() || !nativeAutoLogModule?.readPendingScans) return [];
  return parseAutoLogPendingScansJson(await nativeAutoLogModule.readPendingScans());
}

/** Remove drained screenshots, image files included. */
export async function clearAutoLogPendingScans(ids: string[]): Promise<void> {
  if (!ids.length) return;
  if (Platform.OS === 'android') {
    clearSharedScans(ids);
    return;
  }
  if (!isAutoLogSupported() || !nativeAutoLogModule?.clearPendingScans) return;
  await nativeAutoLogModule.clearPendingScans(ids);
}

/**
 * Empty pending taps, screenshots and payment alerts, image files included.
 * Android notification captures are cleared separately. Used by data resets: the queues live outside SQLite, so without this a "clean slate"
 * reset would leave pre-reset automations to drain into the wiped database.
 */
export async function clearAllAutoLogQueues(): Promise<void> {
  const [taps, scans, alerts] = await Promise.all([
    readAutoLogPending(),
    readAutoLogPendingScans(),
    readAutoLogPendingAlerts(),
  ]);
  await Promise.all([
    clearAutoLogPending(taps.map((entry) => entry.id)),
    clearAutoLogPendingScans(scans.map((entry) => entry.id)),
    clearAutoLogPendingAlerts(alerts.map((entry) => entry.id)),
  ]);
}

/** Whether this iOS build has the Log Notification action and its queue. */
export function isPaymentAlertIntentSupported(): boolean {
  return Platform.OS === 'ios' && !!nativeAutoLogModule?.readPendingAlerts;
}

/** Alerts the Log Notification action queued, oldest first. */
export async function readAutoLogPendingAlerts(): Promise<CaptureInput[]> {
  if (!isPaymentAlertIntentSupported() || !nativeAutoLogModule?.readPendingAlerts) return [];
  return parseIosPendingAlertsJson(await nativeAutoLogModule.readPendingAlerts());
}

export async function clearAutoLogPendingAlerts(ids: string[]): Promise<void> {
  if (!ids.length) return;
  if (!isPaymentAlertIntentSupported() || !nativeAutoLogModule?.clearPendingAlerts) return;
  await nativeAutoLogModule.clearPendingAlerts(ids);
}

/**
 * Debug builds only: queue an alert as if a Shortcuts automation had run Log
 * Notification. Exercises the real App Group queue without waiting for a
 * notification-triggered automation.
 */
export async function enqueueTestAutoLogAlert(
  source: string,
  title: string,
  message: string,
): Promise<boolean> {
  if (!__DEV__) return false;
  if (!isPaymentAlertIntentSupported() || !nativeAutoLogModule?.enqueueTestAlert) return false;
  await nativeAutoLogModule.enqueueTestAlert(source, title, message);
  return true;
}

const drainListeners = new Set<() => void>();

/**
 * Ask the mounted `AutoLogSync` to drain now instead of waiting for the next
 * foreground. Only the dev test button needs this: a real tap is always
 * followed by the user opening the app.
 */
function requestAutoLogDrain() {
  drainListeners.forEach((listener) => listener());
}

export function subscribeAutoLogDrain(listener: () => void) {
  drainListeners.add(listener);
  return () => {
    drainListeners.delete(listener);
  };
}

/**
 * Debug builds only: queue a tap as if the Shortcuts automation had fired.
 *
 * A simulator has no NFC, so this is the only way to
 * exercise the real path there. It goes through the same App Group queue the
 * intent writes, so the drain, the amount parsing and the defaults all run for
 * real rather than being stubbed.
 */
export async function enqueueTestAutoLogTap(
  amountRaw: string,
  merchant: string,
  card: string,
): Promise<boolean> {
  if (!__DEV__) return false;
  if (!isAutoLogSupported() || !nativeAutoLogModule?.enqueueTestTap) return false;
  await nativeAutoLogModule.enqueueTestTap(amountRaw, merchant, card);
  requestAutoLogDrain();
  return true;
}
