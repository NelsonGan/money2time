import AsyncStorage from '@react-native-async-storage/async-storage';

import { MAX_ALERT_TEXT_LENGTH } from '~/features/autoLog/lib/text';
import type { PaymentAlertChannel } from '~/types';
import { isValidNotificationAmount, type NotificationAmount } from '~/utils/notificationAmounts';

export type NotificationScanResult = 'pending' | 'expense' | 'income' | 'none' | 'failed';
export type NotificationAiDecision = 'expense' | 'income' | 'ignore' | 'unsure';
export type NotificationAiIgnoreReason =
  | 'otp'
  | 'promotion'
  | 'balance'
  | 'not_completed'
  | 'own_transfer'
  | 'not_money';
const AI_DECISIONS: readonly NotificationAiDecision[] = ['expense', 'income', 'ignore', 'unsure'];
const AI_REASONS: readonly NotificationAiIgnoreReason[] = [
  'otp',
  'promotion',
  'balance',
  'not_completed',
  'own_transfer',
  'not_money',
];
/** What AI auto-review said about a notification. Its presence means it was sent once. */
export interface NotificationAiReview {
  decision: NotificationAiDecision;
  reason?: NotificationAiIgnoreReason;
  /** AI's decision was carried out (logged or ignored) rather than left for the user. */
  applied: boolean;
  /** The user has seen this result on the review page; until then it is "Done by AI". */
  seen: boolean;
  /** The user undid AI's result; it no longer offers an opinion. */
  undone?: boolean;
  reviewedAt: string;
}
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
  ai?: NotificationAiReview;
}
const LIMIT = 10;
/** Unseen AI results kept past LIMIT: the newest this many, for this long. */
const UNSEEN_AI_LIMIT = 40;
const UNSEEN_AI_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

function parseAi(raw: unknown): NotificationAiReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const decision = AI_DECISIONS.find((value) => value === row.decision);
  if (!decision || typeof row.reviewedAt !== 'string') return null;
  const reason = AI_REASONS.find((value) => value === row.reason);
  return {
    decision,
    ...(reason ? { reason } : {}),
    applied: row.applied === true,
    seen: row.seen !== false,
    ...(row.undone === true ? { undone: true } : {}),
    reviewedAt: row.reviewedAt,
  };
}

/**
 * An AI result still waiting in "Done by AI": kept past the history cap until
 * seen, or until it is three days old (a user who never opens the page).
 */
export function isUnseenAiResult(
  entry: NotificationScanHistoryEntry,
  now: number = Date.now(),
): boolean {
  return (
    entry.result !== 'pending' &&
    !!entry.ai?.applied &&
    !entry.ai.seen &&
    now - Date.parse(entry.ai.reviewedAt) < UNSEEN_AI_MAX_AGE_MS
  );
}
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
    let unseen = 0;
    const now = Date.now();
    return [...new Map(valid.map((row) => [row.id, row])).values()]
      .sort(
        (a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || b.id.localeCompare(a.id),
      )
      .filter((row) => {
        if (row.result === 'pending') return true;
        const ai = parseAi(row.ai);
        if (ai && isUnseenAiResult({ ...row, ai }, now) && unseen < UNSEEN_AI_LIMIT) {
          unseen++;
          return true;
        }
        return completed++ < LIMIT;
      })
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
        ...(parseAi(row.ai) ? { ai: parseAi(row.ai) as NotificationAiReview } : {}),
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
  /** Undo only: put a finished review back to pending on purpose. */
  reopen = false,
): Promise<void> {
  return serialize(async () => {
    if (generation !== getNotificationScanHistoryGeneration(appUserId)) return;
    const previous = parse(await AsyncStorage.getItem(keyFor(appUserId)));
    if (generation !== getNotificationScanHistoryGeneration(appUserId)) return;
    // A queue retry must never reopen a review that the user already finished.
    if (
      !reopen &&
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
/** Move "Done by AI" results to Recent once the user has seen them. */
export function markNotificationAiResultsSeen(
  appUserId: string,
  ids: readonly string[],
  generation = getNotificationScanHistoryGeneration(appUserId),
): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return serialize(async () => {
    if (generation !== getNotificationScanHistoryGeneration(appUserId)) return;
    const previous = parse(await AsyncStorage.getItem(keyFor(appUserId)));
    const wanted = new Set(ids);
    let changed = false;
    const next = previous.map((row) => {
      if (!wanted.has(row.id) || !row.ai || row.ai.seen) return row;
      changed = true;
      return { ...row, ai: { ...row.ai, seen: true } };
    });
    if (!changed || generation !== getNotificationScanHistoryGeneration(appUserId)) return;
    await AsyncStorage.setItem(keyFor(appUserId), JSON.stringify(parse(JSON.stringify(next))));
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
