// AI auto-review of captured notifications. After each drain (launch,
// foreground, live capture) and when the user turns it on, every pending
// notification AI has not seen yet goes to the Worker in batches. Clear
// expenses and incomes are logged to the account their app or shortcut is
// linked to, clear non-payments ignored, and the rest (including payments with
// no linked account, which are never guessed) stay in To review with AI's
// opinion attached.
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CreateTransactionMeta } from '~/context/AppContext';
import { getActiveLedgerId } from '~/lib/db/ledgerScope';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { reportError } from '~/services/errorReporting';
import {
  fetchNotificationAiQuota,
  isNotificationAiAvailable,
  NOTIFICATION_AI_BATCH_SIZE,
  NotificationAiError,
  type NotificationAiQuota,
  notificationAiRemaining,
  parseNotificationAiQuota,
  reviewNotificationsWithAi,
} from '~/services/notificationAi';
import { applyNotificationAiResults } from '~/services/notificationReview';
import {
  getNotificationScanHistoryGeneration,
  readNotificationScanHistory,
} from '~/services/notificationScanHistory';
import type { Account, Category, PaymentAlertPrefs, QuickEntryPrefs } from '~/types';

import { isPayableAccount } from './lib/binding';

/** Characters of each notification sent; matches the Worker's own cap. */
const MAX_TEXT_CHARS = 800;
/** After a failed request, no run starts for this long (drains can be frequent). */
const FAILURE_COOLDOWN_MS = 2 * 60 * 1000;
/**
 * A notification in this many refused or failed requests is left for the user.
 * Offline, timeouts and a busy service never count: those only wait.
 */
const MAX_ATTEMPTS = 3;
const COUNTED_FAILURES: ReadonlySet<string> = new Set(['rejected', 'server']);

/** The Worker takes a three-letter code; a custom one ("USDT") falls back to "no currency". */
function requestCurrency(currency: string | undefined): string {
  return currency && /^[A-Za-z]{3}$/.test(currency.trim()) ? currency.trim() : 'XXX';
}

// ---------------------------------------------------------------------------
// Allowance, cached per install so the review page can show it offline.

const quotaKey = (appUserId: string) => `notification-ai-quota:${appUserId}`;
const quotas = new Map<string, NotificationAiQuota | null>();
const quotaListeners = new Set<() => void>();

export function getCachedNotificationAiQuota(appUserId: string): NotificationAiQuota | null {
  return quotas.get(appUserId) ?? null;
}

export async function loadNotificationAiQuota(
  appUserId: string,
): Promise<NotificationAiQuota | null> {
  if (quotas.has(appUserId)) return quotas.get(appUserId) ?? null;
  try {
    const raw = await AsyncStorage.getItem(quotaKey(appUserId));
    const quota = raw ? parseNotificationAiQuota(JSON.parse(raw)) : null;
    if (!quotas.has(appUserId)) quotas.set(appUserId, quota);
  } catch {
    if (!quotas.has(appUserId)) quotas.set(appUserId, null);
  }
  quotaListeners.forEach((listener) => listener());
  return quotas.get(appUserId) ?? null;
}

function saveQuota(appUserId: string, quota: NotificationAiQuota) {
  quotas.set(appUserId, quota);
  quotaListeners.forEach((listener) => listener());
  void AsyncStorage.setItem(quotaKey(appUserId), JSON.stringify(quota)).catch(() => undefined);
}

/** Ask the Worker for the current allowance (after an upgrade, or opening the page). */
export async function refreshNotificationAiQuota(
  appUserId: string,
): Promise<NotificationAiQuota | null> {
  if (!isNotificationAiAvailable()) return getCachedNotificationAiQuota(appUserId);
  try {
    const quota = await fetchNotificationAiQuota(appUserId);
    saveQuota(appUserId, quota);
    return quota;
  } catch {
    return getCachedNotificationAiQuota(appUserId);
  }
}

export function subscribeNotificationAiQuota(listener: () => void): () => void {
  quotaListeners.add(listener);
  return () => {
    quotaListeners.delete(listener);
  };
}

/** A free install with nothing left; Pro is never out (its cap is fair use). */
export function isNotificationAiExhausted(
  quota: NotificationAiQuota | null,
  isPro: boolean,
): boolean {
  return !isPro && !!quota && !quota.isPro && notificationAiRemaining(quota) <= 0;
}

// ---------------------------------------------------------------------------
// Progress, for the home banner and the review page.

export interface NotificationAiStatus {
  /** Notifications in the batch now with AI. */
  reviewing: number;
}

let status: NotificationAiStatus | null = null;
const statusListeners = new Set<() => void>();

export function getNotificationAiStatus(): NotificationAiStatus | null {
  return status;
}

function setStatus(next: NotificationAiStatus | null) {
  status = next;
  statusListeners.forEach((listener) => listener());
}

export function subscribeNotificationAiStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// The run.

export interface NotificationAiReviewDeps {
  appUserId: string;
  getCurrent: () => {
    appUserId: string;
    accounts: readonly Account[];
    categories: readonly Category[];
    quickEntryPrefs: QuickEntryPrefs;
    prefs: PaymentAlertPrefs;
    isPro: boolean;
    createTransaction: (input: CreateTransactionInput, meta?: CreateTransactionMeta) => string;
  };
}

let running: Promise<void> | null = null;
let rerun = false;
let cooldownUntil = 0;
const failedAttempts = new Map<string, number>();

/** Test hook: forget backoff state. */
export function resetNotificationAiBackoff(): void {
  cooldownUntil = 0;
  failedAttempts.clear();
}

/** Review pending notifications with AI. Concurrent calls coalesce into one more pass. */
export function runNotificationAiReview(deps: NotificationAiReviewDeps): Promise<void> {
  if (running) {
    rerun = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        rerun = false;
        try {
          await reviewOnce(deps);
        } catch (error) {
          // A failed pass still lets a rerun requested meanwhile go ahead.
          reportError(error, { scope: 'notification_ai_review' });
        }
      } while (rerun);
    } finally {
      running = null;
      setStatus(null);
    }
  })();
  return running;
}

async function reviewOnce(deps: NotificationAiReviewDeps) {
  const { appUserId } = deps;
  const first = deps.getCurrent();
  const prefs = first.prefs.aiReview;
  if (!prefs.enabled || first.appUserId !== appUserId || !isNotificationAiAvailable()) return;
  if (Date.now() < cooldownUntil) return;
  const generation = getNotificationScanHistoryGeneration(appUserId);
  // Accounts and categories belong to the open ledger: a switch mid-run stops it.
  const ledgerId = getActiveLedgerId();
  const isCurrent = () =>
    deps.getCurrent().appUserId === appUserId &&
    deps.getCurrent().prefs.aiReview.enabled &&
    getActiveLedgerId() === ledgerId &&
    getNotificationScanHistoryGeneration(appUserId) === generation;

  const accounts = new Map(
    first.accounts.filter(isPayableAccount).map((account) => [account.id, account]),
  );
  const rows = await readNotificationScanHistory(appUserId);
  const candidates = rows
    .filter(
      (row) =>
        row.result === 'pending' &&
        !row.ai &&
        row.text.trim().length > 0 &&
        // Only captures still pending in this ledger: one settled elsewhere is
        // repaired by manual review, never charged.
        paymentAlertCapturesRepository.getById(row.id)?.status === 'pending',
    )
    // Newest first: with a small allowance left, the latest matter most.
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  if (candidates.length === 0 || !isCurrent()) return;

  // A used-up free allowance pauses auto-review without touching the user's
  // switch, so upgrading resumes it; the card shows Upgrade meanwhile.
  let quota = await loadNotificationAiQuota(appUserId);
  // The saved allowance can be stale (raised on another phone, or by support):
  // ask the Worker once before pausing.
  if (isNotificationAiExhausted(quota, first.isPro)) {
    quota = await refreshNotificationAiQuota(appUserId);
    if (isNotificationAiExhausted(quota, first.isPro)) return;
  }
  // An unknown or Pro allowance lets the Worker decide; a known free one trims.
  const budget =
    quota && !quota.isPro && !first.isPro ? notificationAiRemaining(quota) : candidates.length;
  const queue = candidates.slice(0, budget);
  const totals = { reviewed: 0, expense: 0, income: 0, ignored: 0, kept: 0 };
  const reviewDeps = () => ({
    appUserId,
    generation,
    getCurrent: () => {
      const live = deps.getCurrent();
      return {
        // A ledger switch makes the identity stale, so nothing more is saved.
        appUserId: getActiveLedgerId() === ledgerId ? live.appUserId : '',
        accounts: live.accounts,
        categories: live.categories,
        quickEntryPrefs: live.quickEntryPrefs,
        createTransaction: live.createTransaction,
      };
    },
  });
  setStatus({ reviewing: queue.length });
  for (let start = 0; start < queue.length; start += NOTIFICATION_AI_BATCH_SIZE) {
    if (!isCurrent()) break;
    const batch = queue.slice(start, start + NOTIFICATION_AI_BATCH_SIZE);
    const current = deps.getCurrent();
    const categoryNames = (type: 'expense' | 'income') =>
      current.categories
        .filter((category) => category.type === type && !category.deletedAt)
        .map((category) => category.name);
    let response;
    try {
      response = await reviewNotificationsWithAi({
        appUserId,
        notifications: batch.map((row) => ({
          id: row.id,
          text: row.text.slice(0, MAX_TEXT_CHARS),
          currency: requestCurrency(
            (row.accountId ? accounts.get(row.accountId)?.currency : undefined) ??
              row.amounts?.[0]?.currency,
          ),
          source: row.sourceLabel,
        })),
        expenseCategories: categoryNames('expense'),
        incomeCategories: categoryNames('income'),
      });
    } catch (error) {
      const code = error instanceof NotificationAiError ? error.code : 'server';
      if (error instanceof NotificationAiError && error.quota) {
        quota = error.quota;
        saveQuota(appUserId, error.quota);
      }
      void trackEvent(AnalyticsEvents.NOTIFICATION_AI_REVIEW_FAILED, {
        reason: code,
        notification_count: batch.length,
      });
      if (code !== 'limit_reached') {
        cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
      }
      if (COUNTED_FAILURES.has(code)) {
        // A batch the service keeps refusing must not block later notifications.
        const givenUp = batch
          .map((row) => row.id)
          .filter((id) => {
            const attempts = (failedAttempts.get(id) ?? 0) + 1;
            failedAttempts.set(id, attempts);
            return attempts >= MAX_ATTEMPTS;
          });
        if (givenUp.length > 0) {
          givenUp.forEach((id) => failedAttempts.delete(id));
          await applyNotificationAiResults(
            givenUp.map((id) => ({ id, decision: 'unsure' as const })),
            prefs.logTypes,
            reviewDeps(),
          );
        }
      }
      break;
    }
    batch.forEach((row) => failedAttempts.delete(row.id));
    quota = response.quota;
    saveQuota(appUserId, response.quota);
    if (!isCurrent()) break;
    const applied = await applyNotificationAiResults(
      response.results,
      deps.getCurrent().prefs.aiReview.logTypes,
      reviewDeps(),
    );
    totals.reviewed += response.results.length;
    totals.expense += applied.expense;
    totals.income += applied.income;
    totals.ignored += applied.ignored;
    totals.kept += applied.kept;
    const left = queue.length - start - batch.length;
    if (left > 0) setStatus({ reviewing: left });
    if (response.skipped.length > 0) break;
  }
  if (totals.reviewed > 0) {
    void trackEvent(AnalyticsEvents.NOTIFICATION_AI_REVIEW_COMPLETED, {
      reviewed: totals.reviewed,
      expense: totals.expense,
      income: totals.income,
      ignored: totals.ignored,
      kept: totals.kept,
      log_types: prefs.logTypes,
      is_pro: quota?.isPro ?? false,
    });
  }
}
