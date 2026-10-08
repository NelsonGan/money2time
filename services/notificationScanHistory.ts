import AsyncStorage from '@react-native-async-storage/async-storage';

import { MAX_ALERT_TEXT_LENGTH } from '~/features/autoLog/lib/text';

export type NotificationScanResult = 'expense' | 'income' | 'none' | 'failed';
export interface NotificationScanHistoryEntry {
  id: string;
  capturedAt: string;
  sourceLabel: string | null;
  text: string;
  result: NotificationScanResult;
}
const LIMIT = 10;
const keyFor = (appUserId: string) => `notification-scan-history:${appUserId}`;
const listeners = new Map<string, Set<() => void>>();
let updates: Promise<unknown> = Promise.resolve();

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
        ['expense', 'income', 'none', 'failed'].includes(row.result),
    );
    return [...new Map(valid.map((row) => [row.id, row])).values()]
      .sort(
        (a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || b.id.localeCompare(a.id),
      )
      .slice(0, LIMIT)
      .map((row) => ({
        id: row.id,
        capturedAt: row.capturedAt,
        sourceLabel: row.sourceLabel,
        text: row.text.slice(0, MAX_ALERT_TEXT_LENGTH),
        result: row.result,
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
): Promise<void> {
  return serialize(async () => {
    const previous = parse(await AsyncStorage.getItem(keyFor(appUserId)));
    const next = parse(JSON.stringify([...previous.filter((row) => row.id !== entry.id), entry]));
    await AsyncStorage.setItem(keyFor(appUserId), JSON.stringify(next));
    listeners.get(appUserId)?.forEach((listener) => listener());
  });
}
export function clearNotificationScanHistory(appUserId: string): Promise<void> {
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
