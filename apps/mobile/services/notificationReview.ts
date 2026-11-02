import type { CreateTransactionMeta } from '~/context/AppContext';
import { isPayableAccount } from '~/features/autoLog/lib/binding';
import { resolveAlertCategory } from '~/features/autoLog/lib/categorize';
import { matchCategoryByKeywords } from '~/features/transactions/utils/categoryKeywords';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import {
  type CreateTransactionInput,
  transactionsRepository,
} from '~/lib/repositories/transactionsRepository';
import type { Account, Category, NotificationAiLogTypes, QuickEntryPrefs } from '~/types';
import type { NotificationAmount } from '~/utils/notificationAmounts';
import { isValidNotificationAmount } from '~/utils/notificationAmounts';

import type { NotificationAiResult } from './notificationAi.shared';
import {
  getNotificationScanHistoryGeneration,
  type NotificationScanHistoryEntry,
  readNotificationScanHistory,
  recordNotificationScan,
} from './notificationScanHistory';

export interface NotificationReviewSelection {
  amount: NotificationAmount | null;
  accountId: string | null;
  editedInput?: CreateTransactionInput;
}
export interface NotificationReviewDeps {
  appUserId: string;
  generation: number;
  getCurrent: () => {
    appUserId: string;
    accounts: readonly Account[];
    categories: readonly Category[];
    quickEntryPrefs: QuickEntryPrefs;
    createTransaction: (input: CreateTransactionInput, meta?: CreateTransactionMeta) => string;
  };
}
let decisions: Promise<unknown> = Promise.resolve();

/** Serialize decisions; a committed capture is the durable idempotency guard. */
export function resolveNotificationReviews(
  ids: readonly string[],
  action: 'income' | 'expense' | 'none',
  deps: NotificationReviewDeps,
  selections: Readonly<Record<string, NotificationReviewSelection>> = {},
): Promise<{ completed: number; unfinished: string[] }> {
  const work = decisions.then(async () => {
    const current = () => deps.getCurrent();
    const isCurrent = () =>
      current().appUserId === deps.appUserId &&
      getNotificationScanHistoryGeneration(deps.appUserId) === deps.generation;
    const result = { completed: 0, unfinished: [] as string[] };
    if (!isCurrent()) return result;
    const rows = await readNotificationScanHistory(deps.appUserId);
    if (!isCurrent()) return result;
    for (const id of new Set(ids)) {
      if (!isCurrent()) break;
      const entry = rows.find((row) => row.id === id && row.result === 'pending');
      if (!entry) continue;
      const stored = paymentAlertCapturesRepository.getById(id);
      // History is written before acknowledging the native queue. If the DB
      // write was interrupted, let the queue retry before resolving this item:
      // a missing capture cannot provide the durable guard against duplicates.
      if (!stored) throw new Error('notification_review_capture_missing');
      // The expense and capture link are committed together before history.
      // Repair a storage failure/relaunch without writing the money twice.
      if (stored?.status === 'logged' && stored.transactionId) {
        const saved = transactionsRepository.getById(stored.transactionId);
        await recordNotificationScan(
          deps.appUserId,
          {
            ...entry,
            result:
              saved?.type === 'income' || (!saved && stored.reason === 'income')
                ? 'income'
                : 'expense',
            ...(saved
              ? {
                  selectedAmount: { amount: saved.amount, currency: saved.currency },
                  accountId: saved.accountId,
                }
              : {}),
            transactionId: stored.transactionId,
          },
          deps.generation,
        );
        result.completed++;
        continue;
      }
      if (stored?.status === 'ignored' || stored?.status === 'dismissed') {
        await recordNotificationScan(deps.appUserId, { ...entry, result: 'none' }, deps.generation);
        result.completed++;
        continue;
      }
      if (action === 'none') {
        paymentAlertCapturesRepository.update(id, {
          status: 'ignored',
          reason: 'user',
          title: null,
          body: null,
        });
        await recordNotificationScan(deps.appUserId, { ...entry, result: 'none' }, deps.generation);
        result.completed++;
        continue;
      }
      const selected = selections[id];
      const amount = selected
        ? selected.amount
        : (entry.selectedAmount ?? (entry.amounts?.length === 1 ? entry.amounts[0] : null));
      const accountId = selected ? selected.accountId : entry.accountId;
      const live = current();
      const account = live.accounts.find((item) => item.id === accountId && isPayableAccount(item));
      if (!isValidNotificationAmount(amount) || !account) {
        result.unfinished.push(id);
        continue;
      }
      const edited = selected?.editedInput;
      if (
        edited &&
        (edited.type !== action ||
          (edited.categoryId != null &&
            !live.categories.some(
              (item) => item.id === edited.categoryId && item.type === action && !item.deletedAt,
            )))
      ) {
        result.unfinished.push(id);
        continue;
      }
      const categoryId = edited
        ? edited.categoryId
        : suggestNotificationCategory(entry, action, live.categories, live.quickEntryPrefs);
      const transactionId = live.createTransaction(
        {
          ...(edited ?? {}),
          type: action,
          amount: amount.amount,
          currency: amount.currency,
          date: edited?.date ?? entry.capturedAt,
          accountId: account.id,
          categoryId,
          note: edited ? edited.note : entry.sourceLabel,
          sentiment: edited?.sentiment ?? 'neutral',
        },
        {
          source: 'notification_review',
          channel: entry.channel,
          decision: 'confirm',
          onNotificationReviewPersisted: (persistedId) =>
            paymentAlertCapturesRepository.update(id, {
              status: 'logged',
              reason: action === 'income' ? 'income' : 'user',
              transactionId: persistedId,
              title: null,
              body: null,
            }),
        },
      );
      await recordNotificationScan(
        deps.appUserId,
        { ...entry, result: action, selectedAmount: amount, accountId: account.id, transactionId },
        deps.generation,
      );
      result.completed++;
    }
    return result;
  });
  decisions = work.catch(() => undefined);
  return work;
}

/** Same keyword mapping as Apple Pay; only category suggestions, never money/direction inference. */
export function suggestNotificationCategory(
  entry: NotificationScanHistoryEntry,
  type: 'income' | 'expense',
  categories: readonly Category[],
  prefs: QuickEntryPrefs,
): string | null {
  const candidates = categories.filter((item) => item.type === type && !item.deletedAt);
  const explicit = candidates.find((item) => item.id === entry.categoryId);
  if (explicit) return explicit.id;
  const keyword = matchCategoryByKeywords(entry.text, candidates, prefs.categoryMap ?? {});
  return resolveAlertCategory({
    kind: type === 'income' ? 'income' : 'spend',
    scannedCategory: null,
    presetCategoryId: keyword?.categoryId ?? null,
    categories: candidates,
    defaultExpenseCategoryId: prefs.defaultExpenseCategoryId,
    defaultIncomeCategoryId: prefs.defaultIncomeCategoryId,
  }).categoryId;
}

export interface NotificationAiApplySummary {
  expense: number;
  income: number;
  ignored: number;
  /** Left for the user: AI was unsure, or the type is not set to log automatically. */
  kept: number;
}

/** The local amount candidate matching AI's amount; AI may only pick, never invent, money. */
export function matchAiAmount(
  entry: NotificationScanHistoryEntry,
  result: Pick<NotificationAiResult, 'amount' | 'currency'>,
): NotificationAmount | null {
  if (typeof result.amount !== 'number') return null;
  const matches = (entry.amounts ?? []).filter(
    (candidate) => Math.abs(candidate.amount - (result.amount as number)) < 0.0005,
  );
  return matches.find((candidate) => candidate.currency === result.currency) ?? matches[0] ?? null;
}

/**
 * Carry out AI auto-review results: log the clear expenses and incomes the user
 * allows, ignore the clear non-payments, and leave the rest pending with AI's
 * opinion attached so they are never sent again. Shares the decision queue and
 * capture guard with manual review.
 */
export function applyNotificationAiResults(
  results: readonly NotificationAiResult[],
  logTypes: NotificationAiLogTypes,
  deps: NotificationReviewDeps,
  now: () => Date = () => new Date(),
): Promise<NotificationAiApplySummary> {
  const work = decisions.then(async () => {
    const summary: NotificationAiApplySummary = { expense: 0, income: 0, ignored: 0, kept: 0 };
    const isCurrent = () =>
      deps.getCurrent().appUserId === deps.appUserId &&
      getNotificationScanHistoryGeneration(deps.appUserId) === deps.generation;
    if (!isCurrent()) return summary;
    const rows = await readNotificationScanHistory(deps.appUserId);
    for (const result of results) {
      if (!isCurrent()) break;
      const entry = rows.find((row) => row.id === result.id && row.result === 'pending');
      if (!entry || entry.ai) continue;
      const reviewedAt = now().toISOString();
      const stored = paymentAlertCapturesRepository.getById(entry.id);
      const keep = async (amount: NotificationAmount | null) => {
        summary.kept++;
        await recordNotificationScan(
          deps.appUserId,
          {
            ...entry,
            ...(amount ? { selectedAmount: amount } : {}),
            ai: { decision: result.decision, applied: false, seen: true, reviewedAt },
          },
          deps.generation,
        );
      };
      // Settled elsewhere (an interrupted save, a sweep): bring history in line
      // with the capture, as manual review does, so it is never sent again.
      if (stored && stored.status !== 'pending') {
        const saved = stored.transactionId
          ? transactionsRepository.getById(stored.transactionId)
          : null;
        await recordNotificationScan(
          deps.appUserId,
          stored.status === 'logged'
            ? {
                ...entry,
                result:
                  saved?.type === 'income' || stored.reason === 'income' ? 'income' : 'expense',
                transactionId: stored.transactionId,
              }
            : { ...entry, result: 'none' },
          deps.generation,
        );
        continue;
      }
      if (!stored) {
        await keep(null);
        continue;
      }
      if (result.decision === 'ignore') {
        paymentAlertCapturesRepository.update(entry.id, {
          status: 'ignored',
          reason: 'auto',
          title: null,
          body: null,
        });
        await recordNotificationScan(
          deps.appUserId,
          {
            ...entry,
            result: 'none',
            ai: {
              decision: 'ignore',
              ...(result.reason ? { reason: result.reason } : {}),
              applied: true,
              seen: false,
              reviewedAt,
            },
          },
          deps.generation,
        );
        summary.ignored++;
        continue;
      }
      const amount = result.decision === 'unsure' ? null : matchAiAmount(entry, result);
      const type = result.decision;
      if (type === 'unsure' || (logTypes !== 'both' && logTypes !== type)) {
        await keep(amount);
        continue;
      }
      const live = deps.getCurrent();
      const account = live.accounts.find(
        (item) => item.id === entry.accountId && isPayableAccount(item),
      );
      if (!amount || !account) {
        await keep(amount);
        continue;
      }
      const named = result.category
        ? live.categories.find(
            (item) => item.name === result.category && item.type === type && !item.deletedAt,
          )
        : undefined;
      const categoryId =
        named?.id ??
        suggestNotificationCategory(entry, type, live.categories, live.quickEntryPrefs);
      const note = result.note?.trim() || entry.sourceLabel;
      const transactionId = live.createTransaction(
        {
          type,
          amount: amount.amount,
          currency: amount.currency,
          date: entry.capturedAt,
          accountId: account.id,
          categoryId,
          note,
          sentiment: 'neutral',
        },
        {
          source: 'notification_review',
          channel: entry.channel,
          decision: 'ai',
          onNotificationReviewPersisted: (persistedId) =>
            paymentAlertCapturesRepository.update(entry.id, {
              status: 'logged',
              reason: type === 'income' ? 'income' : 'auto',
              transactionId: persistedId,
              title: null,
              body: null,
            }),
        },
      );
      await recordNotificationScan(
        deps.appUserId,
        {
          ...entry,
          result: type,
          selectedAmount: amount,
          accountId: account.id,
          categoryId,
          transactionId,
          ai: { decision: type, applied: true, seen: false, reviewedAt },
        },
        deps.generation,
      );
      summary[type]++;
    }
    return summary;
  });
  decisions = work.catch(() => undefined);
  return work;
}

/**
 * Undo an AI auto-review: remove the transaction it logged (if any) and put the
 * notification back in To review. AI is not asked again; the user decides.
 */
export function undoNotificationAiReview(
  id: string,
  deps: NotificationReviewDeps & { deleteTransaction: (id: string) => void },
): Promise<boolean> {
  const work = decisions.then(async () => {
    const isCurrent = () =>
      deps.getCurrent().appUserId === deps.appUserId &&
      getNotificationScanHistoryGeneration(deps.appUserId) === deps.generation;
    if (!isCurrent()) return false;
    const rows = await readNotificationScanHistory(deps.appUserId);
    const entry = rows.find((row) => row.id === id);
    if (!entry || entry.result === 'pending' || !entry.ai?.applied) return false;
    const stored = paymentAlertCapturesRepository.getById(id);
    if (!stored) throw new Error('notification_review_capture_missing');
    // Detach first: the delete's deferred cleanup only dismisses captures
    // still linked to the deleted transaction.
    paymentAlertCapturesRepository.update(id, {
      status: 'pending',
      reason: 'mode_review',
      transactionId: null,
    });
    const transactionId = entry.transactionId ?? stored.transactionId;
    if (transactionId && transactionsRepository.getById(transactionId)) {
      deps.deleteTransaction(transactionId);
    }
    await recordNotificationScan(
      deps.appUserId,
      {
        ...entry,
        result: 'pending',
        transactionId: null,
        ai: { ...entry.ai, applied: false, seen: true, undone: true },
      },
      deps.generation,
      true,
    );
    return true;
  });
  decisions = work.catch(() => undefined);
  return work;
}
