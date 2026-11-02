import type { CreateTransactionMeta } from '~/context/AppContext';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import {
  applyNotificationAiResults,
  matchAiAmount,
  undoNotificationAiReview,
} from '~/services/notificationReview';
import {
  getNotificationScanHistoryGeneration,
  type NotificationScanHistoryEntry,
  readNotificationScanHistory,
  recordNotificationScan,
} from '~/services/notificationScanHistory';
import type { QuickEntryPrefs } from '~/types';

import { account, category } from '../features/autoLog/helpers';

jest.mock('~/services/notificationScanHistory', () => ({
  readNotificationScanHistory: jest.fn(),
  recordNotificationScan: jest.fn(async () => undefined),
  getNotificationScanHistoryGeneration: jest.fn(() => 0),
}));
jest.mock('~/lib/repositories/paymentAlertCapturesRepository', () => ({
  paymentAlertCapturesRepository: { getById: jest.fn(), update: jest.fn() },
}));
jest.mock('~/lib/repositories/transactionsRepository', () => ({
  transactionsRepository: { getById: jest.fn(() => null) },
}));

const NOW = new Date('2026-11-02T09:00:00.000Z');
const pending = (
  overrides: Partial<NotificationScanHistoryEntry> = {},
): NotificationScanHistoryEntry => ({
  id: 'one',
  capturedAt: '2026-11-02T08:00:00.000Z',
  text: 'Payment of RM14.50 at STARBUCKS completed. Balance RM900.00',
  sourceLabel: 'Maybank',
  result: 'pending',
  accountId: 'a1',
  channel: 'android_notification',
  amounts: [
    { amount: 14.5, currency: 'MYR' },
    { amount: 900, currency: 'MYR' },
  ],
  selectedAmount: null,
  ...overrides,
});
const create = jest.fn((_: unknown, meta?: CreateTransactionMeta) => {
  meta?.onNotificationReviewPersisted?.('tx');
  return 'tx';
});
const deleteTransaction = jest.fn();
const deps = () => ({
  appUserId: 'user',
  generation: 0,
  getCurrent: () => ({
    appUserId: 'user',
    accounts: [account()],
    categories: [
      category(),
      category({ id: 'coffee', name: 'Coffee' }),
      category({ id: 'salary', name: 'Salary', type: 'income' }),
    ],
    quickEntryPrefs: {
      defaultExpenseCategoryId: 'c1',
      defaultIncomeCategoryId: 'salary',
    } as QuickEntryPrefs,
    createTransaction: create,
  }),
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readNotificationScanHistory).mockResolvedValue([pending()]);
  jest.mocked(getNotificationScanHistoryGeneration).mockReturnValue(0);
  jest
    .mocked(paymentAlertCapturesRepository.getById)
    .mockReturnValue({ id: 'one', status: 'pending', transactionId: null } as never);
  jest.mocked(transactionsRepository.getById).mockReturnValue(null);
});

describe('applyNotificationAiResults', () => {
  it('logs a clear expense with the matched local amount, AI category and merchant note', async () => {
    const summary = await applyNotificationAiResults(
      [
        {
          id: 'one',
          decision: 'expense',
          amount: 14.5,
          currency: 'MYR',
          category: 'Coffee',
          note: 'STARBUCKS',
        },
      ],
      'both',
      deps(),
      () => NOW,
    );
    expect(summary).toEqual({ expense: 1, income: 0, ignored: 0, kept: 0 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        amount: 14.5,
        currency: 'MYR',
        accountId: 'a1',
        categoryId: 'coffee',
        note: 'STARBUCKS',
        date: '2026-11-02T08:00:00.000Z',
      }),
      expect.objectContaining({ source: 'notification_review', decision: 'ai' }),
    );
    expect(paymentAlertCapturesRepository.update).toHaveBeenCalledWith(
      'one',
      expect.objectContaining({ status: 'logged', transactionId: 'tx' }),
    );
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        result: 'expense',
        transactionId: 'tx',
        ai: { decision: 'expense', applied: true, seen: false, reviewedAt: NOW.toISOString() },
      }),
      0,
    );
  });

  it('ignores a clear non-payment and keeps the reason', async () => {
    const summary = await applyNotificationAiResults(
      [{ id: 'one', decision: 'ignore', reason: 'otp' }],
      'both',
      deps(),
      () => NOW,
    );
    expect(summary.ignored).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(paymentAlertCapturesRepository.update).toHaveBeenCalledWith(
      'one',
      expect.objectContaining({ status: 'ignored' }),
    );
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        result: 'none',
        ai: expect.objectContaining({ decision: 'ignore', reason: 'otp', applied: true }),
      }),
      0,
    );
  });

  it('leaves an unsure notification pending, marked so it is never sent again', async () => {
    const summary = await applyNotificationAiResults(
      [{ id: 'one', decision: 'unsure' }],
      'both',
      deps(),
      () => NOW,
    );
    expect(summary.kept).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(paymentAlertCapturesRepository.update).not.toHaveBeenCalled();
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        result: 'pending',
        ai: expect.objectContaining({ decision: 'unsure', applied: false, seen: true }),
      }),
      0,
    );
  });

  it('keeps income for the user when only expenses are set to log, preselecting the amount', async () => {
    const summary = await applyNotificationAiResults(
      [{ id: 'one', decision: 'income', amount: 14.5, currency: 'MYR' }],
      'expense',
      deps(),
      () => NOW,
    );
    expect(summary.kept).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        result: 'pending',
        selectedAmount: { amount: 14.5, currency: 'MYR' },
        ai: expect.objectContaining({ decision: 'income', applied: false }),
      }),
      0,
    );
  });

  it('never guesses an account: keeps a payment with none, with AI amount and category', async () => {
    jest
      .mocked(readNotificationScanHistory)
      .mockResolvedValue([pending({ accountId: null, channel: 'ios_alert' })]);
    const summary = await applyNotificationAiResults(
      [{ id: 'one', decision: 'expense', amount: 14.5, currency: 'MYR', category: 'Coffee' }],
      'both',
      deps(),
      () => NOW,
    );
    expect(summary).toEqual({ expense: 0, income: 0, ignored: 0, kept: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        result: 'pending',
        accountId: null,
        categoryId: 'coffee',
        selectedAmount: { amount: 14.5, currency: 'MYR' },
        ai: expect.objectContaining({ decision: 'expense', applied: false, seen: true }),
      }),
      0,
    );
  });

  it('still ignores a clear non-payment that has no account', async () => {
    jest.mocked(readNotificationScanHistory).mockResolvedValue([pending({ accountId: null })]);
    const summary = await applyNotificationAiResults(
      [{ id: 'one', decision: 'ignore', reason: 'promotion' }],
      'both',
      deps(),
      () => NOW,
    );
    expect(summary.ignored).toBe(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('never logs an amount that is not in the notification text', async () => {
    const summary = await applyNotificationAiResults(
      [{ id: 'one', decision: 'expense', amount: 15, currency: 'MYR' }],
      'both',
      deps(),
      () => NOW,
    );
    expect(summary.kept).toBe(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('brings history in line with a capture settled elsewhere, without saving again', async () => {
    jest
      .mocked(paymentAlertCapturesRepository.getById)
      .mockReturnValue({ id: 'one', status: 'ignored' } as never);
    const summary = await applyNotificationAiResults(
      [{ id: 'one', decision: 'expense', amount: 14.5, currency: 'MYR' }],
      'both',
      deps(),
      () => NOW,
    );
    expect(summary).toEqual({ expense: 0, income: 0, ignored: 0, kept: 0 });
    expect(create).not.toHaveBeenCalled();
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ result: 'none' }),
      0,
    );
    expect(jest.mocked(recordNotificationScan).mock.calls[0][1]).not.toHaveProperty('ai');
  });

  it('repairs a logged capture to its saved transaction', async () => {
    jest
      .mocked(paymentAlertCapturesRepository.getById)
      .mockReturnValue({ id: 'one', status: 'logged', transactionId: 'tx9' } as never);
    jest.mocked(transactionsRepository.getById).mockReturnValue({ type: 'income' } as never);
    await applyNotificationAiResults(
      [{ id: 'one', decision: 'expense', amount: 14.5 }],
      'both',
      deps(),
    );
    expect(create).not.toHaveBeenCalled();
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ result: 'income', transactionId: 'tx9' }),
      0,
    );
  });

  it('skips notifications AI has already reviewed', async () => {
    jest.mocked(readNotificationScanHistory).mockResolvedValue([
      pending({
        ai: { decision: 'unsure', applied: false, seen: true, reviewedAt: NOW.toISOString() },
      }),
    ]);
    await applyNotificationAiResults(
      [{ id: 'one', decision: 'expense', amount: 14.5 }],
      'both',
      deps(),
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('matchAiAmount', () => {
  it('prefers the candidate in the same currency', () => {
    const entry = pending({
      amounts: [
        { amount: 12, currency: 'USD' },
        { amount: 12, currency: 'MYR' },
      ],
    });
    expect(matchAiAmount(entry, { amount: 12, currency: 'MYR' })).toEqual({
      amount: 12,
      currency: 'MYR',
    });
  });
});

describe('undoNotificationAiReview', () => {
  const logged = pending({
    result: 'expense',
    transactionId: 'tx',
    selectedAmount: { amount: 14.5, currency: 'MYR' },
    ai: { decision: 'expense', applied: true, seen: false, reviewedAt: NOW.toISOString() },
  });

  it('detaches the capture before deleting the transaction, then reopens the review', async () => {
    jest.mocked(readNotificationScanHistory).mockResolvedValue([logged]);
    jest
      .mocked(paymentAlertCapturesRepository.getById)
      .mockReturnValue({ id: 'one', status: 'logged', transactionId: 'tx' } as never);
    jest.mocked(transactionsRepository.getById).mockReturnValue({ id: 'tx' } as never);
    const order: string[] = [];
    jest
      .mocked(paymentAlertCapturesRepository.update)
      .mockImplementation(() => void order.push('detach'));
    deleteTransaction.mockImplementation(() => void order.push('delete'));

    const undone = await undoNotificationAiReview('one', { ...deps(), deleteTransaction });

    expect(undone).toBe(true);
    expect(order).toEqual(['detach', 'delete']);
    expect(paymentAlertCapturesRepository.update).toHaveBeenCalledWith('one', {
      status: 'pending',
      reason: 'mode_review',
      transactionId: null,
    });
    expect(deleteTransaction).toHaveBeenCalledWith('tx');
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({
        result: 'pending',
        transactionId: null,
        ai: expect.objectContaining({ applied: false, seen: true, undone: true }),
      }),
      0,
      true,
    );
  });

  it('reopens an AI-ignored notification without deleting anything', async () => {
    jest.mocked(readNotificationScanHistory).mockResolvedValue([
      pending({
        result: 'none',
        ai: { decision: 'ignore', applied: true, seen: false, reviewedAt: NOW.toISOString() },
      }),
    ]);
    const undone = await undoNotificationAiReview('one', { ...deps(), deleteTransaction });
    expect(undone).toBe(true);
    expect(deleteTransaction).not.toHaveBeenCalled();
  });

  it('refuses to undo a manual decision', async () => {
    jest
      .mocked(readNotificationScanHistory)
      .mockResolvedValue([pending({ result: 'expense', transactionId: 'tx' })]);
    const undone = await undoNotificationAiReview('one', { ...deps(), deleteTransaction });
    expect(undone).toBe(false);
    expect(paymentAlertCapturesRepository.update).not.toHaveBeenCalled();
  });
});
