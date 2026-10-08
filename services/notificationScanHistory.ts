import AsyncStorage from '@react-native-async-storage/async-storage';

import { MAX_ALERT_TEXT_LENGTH } from '~/features/autoLog/lib/text';
import type { PaymentAlertChannel } from '~/types';
import { isValidNotificationAmount, type NotificationAmount } from '~/utils/notificationAmounts';

export type NotificationScanResult = 'pending' | 'expense' | 'income' | 'none' | 'failed';
export interface NotificationScanHistoryEntry {
  id: string;
  capturedAt: string;
  sourceLabel: string | null;
  text: string;
  result: NotificationScanResult;
  accountId?: string | null;
  categoryId?: string | null;
  channel?: PaymentAlertChannel;
  amounts?: NotificationAmount[];
  selectedAmount?: NotificationAmount | null;
  transactionId?: string | null;
}
const LIMIT = 10;
const keyFor = (appUserId: string) => `notification-scan-history:${appUserId}`;
const listeners = new Map<string, Set<() => void>>();
const generations = new Map<string, number>();
let updates: Promise<unknown> = Promise.resolve();

export function getNotificationScanHistoryGeneration(appUserId: string): number {
  return generations.get(appUserId) ?? 0;
}

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = updates.then(work);
  updates = next.catch(() => undefined);
  return next;
}
function parse(raw: string | null): NotificationScanHistoryEntry[] {
  try {
    const rows: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(rows)) return [];
    const valid = rows.filter(
      (row): row is NotificationScanHistoryEntry =>
        !!row &&
        typeof row.id === 'string' &&
        !!row.id &&
        typeof row.capturedAt === 'string' &&
        Number.isFinite(Date.parse(row.capturedAt)) &&
        (row.sourceLabel === null || typeof row.sourceLabel === 'string') &&
        typeof row.text === 'string' &&
        ['pending', 'expense', 'income', 'none', 'failed'].includes(row.result),
    );
    let completed = 0;
    return [...new Map(valid.map((row) => [row.id, row])).values()]
      .sort(
        (a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || b.id.localeCompare(a.id),
      )
      .filter((row) => row.result === 'pending' || completed++ < LIMIT)
      .map((row) => ({
        id: row.id,
        capturedAt: row.capturedAt,
        sourceLabel: row.sourceLabel,
        text: row.text.slice(0, MAX_ALERT_TEXT_LENGTH),
        result: row.result,
        ...(row.accountId === null || typeof row.accountId === 'string'
          ? { accountId: row.accountId }
          : {}),
        ...(row.categoryId === null || typeof row.categoryId === 'string'
          ? { categoryId: row.categoryId }
          : {}),
        ...(row.channel === 'ios_alert' || row.channel === 'android_notification'
          ? { channel: row.channel }
          : {}),
        ...(Array.isArray(row.amounts)
          ? { amounts: row.amounts.filter(isValidNotificationAmount).slice(0, 30) }
          : {}),
        ...(row.selectedAmount === null || isValidNotificationAmount(row.selectedAmount)
          ? { selectedAmount: row.selectedAmount }
          : {}),
        ...(row.transactionId === null || typeof row.transactionId === 'string'
          ? { transactionId: row.transactionId }
          : {}),
      }));
  } catch {
    return [];
  }
}
export function readNotificationScanHistory(
  appUserId: string,
): Promise<NotificationScanHistoryEntry[]> {
  return serialize(async () => parse(await AsyncStorage.getItem(keyFor(appUserId))));
}
export function recordNotificationScan(
  appUserId: string,
  entry: NotificationScanHistoryEntry,
  generation = getNotificationScanHistoryGeneration(appUserId),
): Promise<void> {
  return serialize(async () => {
    if (generation !== getNotificationScanHistoryGeneration(appUserId)) return;
    const previous = parse(await AsyncStorage.getItem(keyFor(appUserId)));
    if (generation !== getNotificationScanHistoryGeneration(appUserId)) return;
    // A queue retry must never reopen a review that the user already finished.
    if (
      entry.result === 'pending' &&
      previous.some(
        (row) => row.id === entry.id && ['income', 'expense', 'none'].includes(row.result),
      )
    )
      return;
    const next = parse(JSON.stringify([...previous.filter((row) => row.id !== entry.id), entry]));
    await AsyncStorage.setItem(keyFor(appUserId), JSON.stringify(next));
    if (generation !== getNotificationScanHistoryGeneration(appUserId)) return;
    listeners.get(appUserId)?.forEach((listener) => listener());
  });
}
export function clearNotificationScanHistory(appUserId: string): Promise<void> {
  // Cancel in-flight scans immediately, before the queued storage deletion.
  generations.set(appUserId, getNotificationScanHistoryGeneration(appUserId) + 1);
  return serialize(async () => {
    await AsyncStorage.removeItem(keyFor(appUserId));
    listeners.get(appUserId)?.forEach((listener) => listener());
  });
}
export function subscribeNotificationScanHistory(
  appUserId: string,
  listener: () => void,
): () => void {
  const set = listeners.get(appUserId) ?? new Set<() => void>();
  listeners.set(appUserId, set);
  set.add(listener);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(appUserId);
  };
}
