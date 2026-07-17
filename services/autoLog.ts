import { NativeModules, Platform } from 'react-native';

import {
  type AutoLogPendingEntry,
  type AutoLogPendingScan,
  parseAutoLogPendingJson,
  parseAutoLogPendingScansJson,
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
  /** Debug builds only. See `enqueueTestAutoLogTap`. */
  enqueueTestTap?: (amountRaw: string, merchant: string, card: string) => Promise<string>;
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
 * Screenshots queued by the "Log Screenshot" App Intent, each carrying the
 * absolute path of its image in the App Group container. Empty on a build
 * whose native module predates the intent, so callers degrade to a no-op.
 */
export async function readAutoLogPendingScans(): Promise<AutoLogPendingScan[]> {
  if (!isAutoLogSupported() || !nativeAutoLogModule?.readPendingScans) return [];
  return parseAutoLogPendingScansJson(await nativeAutoLogModule.readPendingScans());
}

/** Remove drained screenshots — the native side also deletes their image files. */
export async function clearAutoLogPendingScans(ids: string[]): Promise<void> {
  if (!ids.length) return;
  if (!isAutoLogSupported() || !nativeAutoLogModule?.clearPendingScans) return;
  await nativeAutoLogModule.clearPendingScans(ids);
}

const drainListeners = new Set<() => void>();

/**
 * Ask the mounted `AutoLogSync` to drain now instead of waiting for the next
 * foreground. Only the dev test button needs this: a real tap is always
 * followed by the user opening the app.
 */
export function requestAutoLogDrain() {
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
 * A simulator has no NFC and no Shortcuts app, so this is the only way to
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
