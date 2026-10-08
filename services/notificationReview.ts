import type { CreateTransactionMeta } from '~/context/AppContext';
import { isPayableAccount } from '~/features/autoLog/lib/binding';
import { resolveAlertCategory } from '~/features/autoLog/lib/categorize';
import {
  countAccountsTowardFreeLimit,
  isNewTransactionBlockedByAccounts,
} from '~/features/transactions/lib/accountEntryGate';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import {
  type CreateTransactionInput,
  transactionsRepository,
} from '~/lib/repositories/transactionsRepository';
import type { Account, Category, QuickEntryPrefs } from '~/types';
import type { NotificationAmount } from '~/utils/notificationAmounts';
import { isValidNotificationAmount } from '~/utils/notificationAmounts';

import {
  getNotificationScanHistoryGeneration,
  readNotificationScanHistory,
  recordNotificationScan,
} from './notificationScanHistory';

export interface NotificationReviewSelection {
  amount: NotificationAmount | null;
  accountId: string | null;
}
export interface NotificationReviewDeps {
  appUserId: string;
  generation: number;
  getCurrent: () => {
    appUserId: string;
    isPro: boolean;
    accounts: readonly Account[];
    categories: readonly Category[];
    quickEntryPrefs: QuickEntryPrefs;
    createTransaction: (input: CreateTransactionInput, meta?: CreateTransactionMeta) => string;
  };
}
export class NotificationReviewAccountLimitError extends Error {
  constructor() {
    super('notification_review_account_limit');
  }
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
      if (
        isNewTransactionBlockedByAccounts(live.isPro, countAccountsTowardFreeLimit(live.accounts))
      ) {
        throw new NotificationReviewAccountLimitError();
      }
      const category = resolveAlertCategory({
        kind: action === 'income' ? 'income' : 'spend',
        scannedCategory: null,
        presetCategoryId: entry.categoryId ?? null,
        categories: live.categories,
        defaultExpenseCategoryId: live.quickEntryPrefs.defaultExpenseCategoryId,
        defaultIncomeCategoryId: live.quickEntryPrefs.defaultIncomeCategoryId,
      });
      const transactionId = live.createTransaction(
        {
          type: action,
          amount: amount.amount,
          currency: amount.currency,
          date: entry.capturedAt,
          accountId: account.id,
          categoryId: category.categoryId,
          note: entry.sourceLabel,
          sentiment: 'neutral',
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
