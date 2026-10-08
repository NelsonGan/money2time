import { PRO_LIMITS } from '~/constants/proLimits';
import type { CreateTransactionMeta } from '~/context/AppContext';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import { resolveNotificationReviews } from '~/services/notificationReview';
import {
  getNotificationScanHistoryGeneration,
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
const rows = [
  {
    id: 'one',
    capturedAt: '2026-10-08T10:57:31.298Z',
    text: 'RM0.20 sent',
    sourceLabel: 'QA Bank',
    result: 'pending' as const,
    accountId: 'a1',
    channel: 'ios_alert' as const,
    selectedAmount: { amount: 0.2, currency: 'MYR' },
  },
];
const setup = () => ({
  appUserId: 'user',
  generation: 0,
  getCurrent: () => ({
    appUserId: 'user',
    isPro: false,
    accounts: [account()],
    categories: [category(), category({ id: 'income', type: 'income' })],
    quickEntryPrefs: {
      defaultExpenseCategoryId: 'c1',
      defaultIncomeCategoryId: 'income',
    } as QuickEntryPrefs,
    createTransaction: create,
  }),
});
const create = jest.fn((_: unknown, meta?: CreateTransactionMeta) => {
  meta?.onNotificationReviewPersisted?.('tx');
  return 'tx';
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(transactionsRepository.getById).mockReturnValue(null);
  jest.mocked(readNotificationScanHistory).mockResolvedValue(rows);
  jest.mocked(getNotificationScanHistoryGeneration).mockReturnValue(0);
  jest
    .mocked(paymentAlertCapturesRepository.getById)
    .mockReturnValue({ id: 'one', status: 'pending' } as never);
});
it('creates exactly the user-selected type with the captured date and correct type category', async () => {
  await resolveNotificationReviews(['one'], 'income', setup());
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'income',
      amount: 0.2,
      currency: 'MYR',
      accountId: 'a1',
      categoryId: 'income',
      date: rows[0].capturedAt,
    }),
    expect.objectContaining({ source: 'notification_review', decision: 'confirm' }),
  );
  expect(paymentAlertCapturesRepository.update).toHaveBeenCalledWith(
    'one',
    expect.objectContaining({ status: 'logged', transactionId: 'tx' }),
  );
  expect(recordNotificationScan).toHaveBeenCalledWith(
    'user',
    expect.objectContaining({ result: 'income', transactionId: 'tx' }),
    0,
  );
});
it('ignores a notification without needing an amount or account', async () => {
  jest
    .mocked(readNotificationScanHistory)
    .mockResolvedValue([{ ...rows[0], accountId: null, selectedAmount: null }]);
  await resolveNotificationReviews(['one'], 'none', setup());
  expect(create).not.toHaveBeenCalled();
  expect(recordNotificationScan).toHaveBeenCalledWith(
    'user',
    expect.objectContaining({ result: 'none' }),
    0,
  );
});
it('does not save money without a durable capture after an interrupted queue write', async () => {
  jest.mocked(paymentAlertCapturesRepository.getById).mockReturnValue(null);
  await expect(resolveNotificationReviews(['one'], 'expense', setup())).rejects.toThrow(
    'notification_review_capture_missing',
  );
  expect(create).not.toHaveBeenCalled();
  expect(recordNotificationScan).not.toHaveBeenCalled();
});
it('does not guess an ambiguous amount or missing account', async () => {
  jest
    .mocked(readNotificationScanHistory)
    .mockResolvedValue([{ ...rows[0], selectedAmount: null }]);
  expect(await resolveNotificationReviews(['one'], 'expense', setup())).toMatchObject({
    completed: 0,
    unfinished: ['one'],
  });
  expect(create).not.toHaveBeenCalled();
});
it('keeps a failed transaction pending and allows a later retry', async () => {
  create.mockImplementationOnce(() => {
    throw new Error('disk full');
  });
  await expect(resolveNotificationReviews(['one'], 'expense', setup())).rejects.toThrow(
    'disk full',
  );
  expect(recordNotificationScan).not.toHaveBeenCalled();
  await resolveNotificationReviews(['one'], 'expense', setup());
  expect(recordNotificationScan).toHaveBeenCalled();
});
it('repairs history after a committed save without creating another transaction', async () => {
  jest
    .mocked(paymentAlertCapturesRepository.getById)
    .mockReturnValue({ status: 'logged', transactionId: 'tx', reason: 'income' } as never);
  await resolveNotificationReviews(['one'], 'expense', setup());
  expect(create).not.toHaveBeenCalled();
  expect(recordNotificationScan).toHaveBeenCalledWith(
    'user',
    expect.objectContaining({ result: 'income', transactionId: 'tx' }),
    0,
  );
});
it('cancels an old user/reset generation before any save or ignore', async () => {
  jest.mocked(getNotificationScanHistoryGeneration).mockReturnValue(1);
  await resolveNotificationReviews(['one'], 'expense', setup());
  expect(create).not.toHaveBeenCalled();
  expect(recordNotificationScan).not.toHaveBeenCalled();
});
it('bulk actions touch only the selected pending snapshot', async () => {
  jest.mocked(readNotificationScanHistory).mockResolvedValue([...rows, { ...rows[0], id: 'new' }]);
  await resolveNotificationReviews(['one'], 'none', setup());
  expect(recordNotificationScan).toHaveBeenCalledTimes(1);
  expect(recordNotificationScan).toHaveBeenCalledWith(
    'user',
    expect.objectContaining({ id: 'one' }),
    0,
  );
});
it('preserves three decimal money and rejects unsupported precision', async () => {
  const deps = setup();
  await resolveNotificationReviews(['one'], 'expense', deps, {
    one: { accountId: 'a1', amount: { amount: 0.001, currency: 'KWD' } },
  });
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ amount: 0.001, currency: 'KWD' }),
    expect.anything(),
  );
  create.mockClear();
  expect(
    await resolveNotificationReviews(['one'], 'expense', deps, {
      one: { accountId: 'a1', amount: { amount: 0.001, currency: 'MYR' } },
    }),
  ).toMatchObject({ unfinished: ['one'] });
  expect(create).not.toHaveBeenCalled();
});
it('requires a currently payable account even when a captured account has been deleted', async () => {
  const deps = setup();
  deps.getCurrent = () => ({ ...setup().getCurrent(), accounts: [] });
  expect(await resolveNotificationReviews(['one'], 'income', deps)).toMatchObject({
    completed: 0,
    unfinished: ['one'],
  });
  expect(create).not.toHaveBeenCalled();
});
it('serializes repeated concurrent taps and repairs a history failure after the commit', async () => {
  let committed = false;
  jest
    .mocked(paymentAlertCapturesRepository.getById)
    .mockImplementation(
      () =>
        (committed
          ? { status: 'logged', transactionId: 'tx', reason: 'user' }
          : { status: 'pending' }) as never,
    );
  jest.mocked(paymentAlertCapturesRepository.update).mockImplementation(() => {
    committed = true;
  });
  jest.mocked(recordNotificationScan).mockRejectedValueOnce(new Error('history unavailable'));
  const first = resolveNotificationReviews(['one'], 'expense', setup());
  const second = resolveNotificationReviews(['one'], 'income', setup());
  await expect(first).rejects.toThrow('history unavailable');
  await expect(second).resolves.toMatchObject({ completed: 1 });
  expect(create).toHaveBeenCalledTimes(1);
  expect(recordNotificationScan).toHaveBeenLastCalledWith(
    'user',
    expect.objectContaining({ result: 'expense' }),
    0,
  );
});
it('does not write after the user changes while history is loading', async () => {
  const deps = setup();
  let user = 'user';
  deps.getCurrent = () => ({ ...setup().getCurrent(), appUserId: user });
  jest.mocked(readNotificationScanHistory).mockImplementationOnce(async () => {
    user = 'other';
    return rows;
  });
  await resolveNotificationReviews(['one'], 'none', deps);
  expect(recordNotificationScan).not.toHaveBeenCalled();
  expect(paymentAlertCapturesRepository.update).not.toHaveBeenCalled();
});
it('keeps the existing free account limit while still allowing Ignore', async () => {
  const deps = setup();
  deps.getCurrent = () => ({
    ...setup().getCurrent(),
    accounts: Array.from({ length: PRO_LIMITS.FREE_MAX_ACCOUNTS + 1 }, (_, i) =>
      account({ id: i === 0 ? 'a1' : `a${i + 1}` }),
    ),
  });
  await expect(resolveNotificationReviews(['one'], 'expense', deps)).rejects.toThrow(
    'notification_review_account_limit',
  );
  expect(create).not.toHaveBeenCalled();
  await expect(resolveNotificationReviews(['one'], 'none', deps)).resolves.toMatchObject({
    completed: 1,
  });
});

it('bulk income and expense save every valid item but leave invalid entries pending', async () => {
  jest
    .mocked(readNotificationScanHistory)
    .mockResolvedValue([
      ...rows,
      { ...rows[0], id: 'two' },
      { ...rows[0], id: 'missing', selectedAmount: null },
    ]);
  const result = await resolveNotificationReviews(['one', 'two', 'missing'], 'income', setup());
  expect(result).toEqual({ completed: 2, unfinished: ['missing'] });
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls.every(([input]) => (input as { type: string }).type === 'income')).toBe(
    true,
  );
});

it('repairs the saved amount and account after a history failure instead of showing stale edits', async () => {
  jest
    .mocked(paymentAlertCapturesRepository.getById)
    .mockReturnValue({ status: 'logged', transactionId: 'tx', reason: 'income' } as never);
  jest.mocked(transactionsRepository.getById).mockReturnValue({
    type: 'income',
    amount: 15.75,
    currency: 'MYR',
    accountId: 'corrected',
  } as never);
  await resolveNotificationReviews(['one'], 'none', setup());
  expect(create).not.toHaveBeenCalled();
  expect(recordNotificationScan).toHaveBeenCalledWith(
    'user',
    expect.objectContaining({
      result: 'income',
      selectedAmount: { amount: 15.75, currency: 'MYR' },
      accountId: 'corrected',
    }),
    0,
  );
});
