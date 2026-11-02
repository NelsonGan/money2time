import {
  resetNotificationAiBackoff,
  runNotificationAiReview,
} from '~/features/autoLog/notificationAiReview';
import { getActiveLedgerId } from '~/lib/db/ledgerScope';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { trackEvent } from '~/services/analytics';
import {
  fetchNotificationAiQuota,
  NotificationAiError,
  reviewNotificationsWithAi,
} from '~/services/notificationAi';
import { applyNotificationAiResults } from '~/services/notificationReview';
import {
  type NotificationScanHistoryEntry,
  readNotificationScanHistory,
} from '~/services/notificationScanHistory';
import type { NotificationAiReviewPrefs, QuickEntryPrefs } from '~/types';

import { account, category, prefs } from './helpers';

const storage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => void storage.set(key, value)),
}));
jest.mock('~/services/notificationAi', () => {
  const actual = jest.requireActual('~/services/notificationAi.shared');
  return {
    ...actual,
    isNotificationAiAvailable: () => true,
    reviewNotificationsWithAi: jest.fn(),
    fetchNotificationAiQuota: jest.fn(),
  };
});
jest.mock('~/services/notificationReview', () => ({
  applyNotificationAiResults: jest.fn(async () => ({
    expense: 1,
    income: 0,
    ignored: 0,
    kept: 0,
  })),
}));
jest.mock('~/services/notificationScanHistory', () => ({
  readNotificationScanHistory: jest.fn(),
  getNotificationScanHistoryGeneration: jest.fn(() => 0),
}));
jest.mock('~/services/analytics', () => ({
  AnalyticsEvents: jest.requireActual('~/services/analytics.shared').AnalyticsEvents,
  trackEvent: jest.fn(),
}));
jest.mock('~/services/errorReporting', () => ({ reportError: jest.fn() }));
jest.mock('~/lib/db/ledgerScope', () => ({ getActiveLedgerId: jest.fn(() => 'ledger-1') }));
jest.mock('~/lib/repositories/paymentAlertCapturesRepository', () => ({
  paymentAlertCapturesRepository: { getById: jest.fn() },
}));

const row = (id: string, minute: number, overrides: Partial<NotificationScanHistoryEntry> = {}) =>
  ({
    id,
    capturedAt: new Date(Date.UTC(2026, 10, 2, 8, minute)).toISOString(),
    sourceLabel: 'Maybank',
    text: `RM${minute}.00 paid`,
    result: 'pending',
    accountId: 'a1',
    ...overrides,
  }) as NotificationScanHistoryEntry;

let userCount = 0;
function deps(aiReview: Partial<NotificationAiReviewPrefs> = {}, isPro = false) {
  // A fresh install id per test keeps the module's cached allowance apart.
  const appUserId = `user-${++userCount}`;
  return {
    appUserId,
    getCurrent: () => ({
      appUserId,
      accounts: [account(), account({ id: 'a2', name: 'GrabPay' })],
      categories: [category(), category({ id: 'salary', name: 'Salary', type: 'income' })],
      quickEntryPrefs: {} as QuickEntryPrefs,
      prefs: prefs({
        aiReview: { enabled: true, logTypes: 'both', accountIds: null, ...aiReview },
      }),
      isPro,
      createTransaction: jest.fn(),
    }),
  };
}
const quota = (used: number, isPro = false) => ({ used, limit: 40, isPro, interval: '100year' });

beforeEach(() => {
  jest.clearAllMocks();
  storage.clear();
  resetNotificationAiBackoff();
  jest.mocked(getActiveLedgerId).mockReturnValue('ledger-1');
  jest
    .mocked(paymentAlertCapturesRepository.getById)
    .mockImplementation((id: string) => ({ id, status: 'pending' }) as never);
  jest.mocked(reviewNotificationsWithAi).mockImplementation(async (request) => ({
    results: request.notifications.map((item) => ({ id: item.id, decision: 'expense' as const })),
    skipped: [],
    quota: quota(request.notifications.length),
  }));
});

it('does nothing while auto-review is off', async () => {
  jest.mocked(readNotificationScanHistory).mockResolvedValue([row('1', 1)]);
  await runNotificationAiReview(deps({ enabled: false }));
  expect(reviewNotificationsWithAi).not.toHaveBeenCalled();
});

it('sends only pending, unreviewed notifications from covered accounts, newest first', async () => {
  jest
    .mocked(readNotificationScanHistory)
    .mockResolvedValue([
      row('new', 30),
      row('old', 1),
      row('done', 2, { result: 'expense' }),
      row('seen', 3, { ai: { decision: 'unsure', applied: false, seen: true, reviewedAt: '' } }),
      row('other-account', 4, { accountId: 'a2' }),
      row('no-account', 5, { accountId: null }),
      row('settled', 6),
    ]);
  // Its capture was saved before history caught up: repaired, never charged.
  jest
    .mocked(paymentAlertCapturesRepository.getById)
    .mockImplementation(
      (id: string) => ({ id, status: id === 'settled' ? 'logged' : 'pending' }) as never,
    );
  await runNotificationAiReview(deps({ accountIds: ['a1'] }));
  const request = jest.mocked(reviewNotificationsWithAi).mock.calls[0][0];
  expect(request.notifications.map((item) => item.id)).toEqual(['new', 'old']);
  expect(request.notifications[1]).toEqual({
    id: 'old',
    text: 'RM1.00 paid',
    currency: 'MYR',
    source: 'Maybank',
  });
  expect(request.expenseCategories).toEqual(['Food']);
  expect(request.incomeCategories).toEqual(['Salary']);
  expect(applyNotificationAiResults).toHaveBeenCalledWith(
    expect.any(Array),
    'both',
    expect.objectContaining({ generation: 0 }),
  );
  expect(trackEvent).toHaveBeenCalledWith(
    'Notification AI Review Completed',
    expect.objectContaining({ reviewed: 2, expense: 1 }),
  );
});

it('sends at most 20 per request', async () => {
  jest
    .mocked(readNotificationScanHistory)
    .mockResolvedValue(Array.from({ length: 25 }, (_, i) => row(String(i), i)));
  await runNotificationAiReview(deps({}, true));
  const sizes = jest
    .mocked(reviewNotificationsWithAi)
    .mock.calls.map(([request]) => request.notifications.length);
  expect(sizes).toEqual([20, 5]);
});

it('trims a free batch to what is left, then pauses until an upgrade', async () => {
  const run = deps();
  storage.set(`notification-ai-quota:${run.appUserId}`, JSON.stringify(quota(38)));
  jest
    .mocked(readNotificationScanHistory)
    .mockResolvedValue([row('1', 1), row('2', 2), row('3', 3)]);
  jest.mocked(reviewNotificationsWithAi).mockImplementation(async (request) => ({
    results: request.notifications.map((item) => ({ id: item.id, decision: 'ignore' as const })),
    skipped: [],
    quota: quota(40),
  }));
  await runNotificationAiReview(run);
  const request = jest.mocked(reviewNotificationsWithAi).mock.calls[0][0];
  expect(request.notifications.map((item) => item.id)).toEqual(['3', '2']);

  // Used up: nothing more is sent on a free plan, but the switch is untouched.
  jest.mocked(reviewNotificationsWithAi).mockClear();
  jest.mocked(fetchNotificationAiQuota).mockResolvedValue(quota(40));
  jest.mocked(readNotificationScanHistory).mockResolvedValue([row('4', 4)]);
  await runNotificationAiReview(run);
  expect(reviewNotificationsWithAi).not.toHaveBeenCalled();
});

it('resumes after an upgrade without the user turning it back on', async () => {
  const run = deps({}, true);
  storage.set(`notification-ai-quota:${run.appUserId}`, JSON.stringify(quota(40)));
  jest.mocked(readNotificationScanHistory).mockResolvedValue([row('1', 1)]);
  await runNotificationAiReview(run);
  expect(reviewNotificationsWithAi).toHaveBeenCalledTimes(1);
});

it('does not call AI at all when a free allowance is already used up', async () => {
  const run = deps();
  storage.set(`notification-ai-quota:${run.appUserId}`, JSON.stringify(quota(40)));
  jest.mocked(fetchNotificationAiQuota).mockResolvedValue(quota(40));
  jest.mocked(readNotificationScanHistory).mockResolvedValue([row('1', 1)]);
  await runNotificationAiReview(run);
  expect(reviewNotificationsWithAi).not.toHaveBeenCalled();
});

it('records the failure and keeps the new allowance when the Worker says the limit is reached', async () => {
  jest.mocked(readNotificationScanHistory).mockResolvedValue([row('1', 1)]);
  jest
    .mocked(reviewNotificationsWithAi)
    .mockRejectedValue(new NotificationAiError('limit_reached', 'limit', quota(40)));
  const run = deps();
  await runNotificationAiReview(run);
  expect(storage.get(`notification-ai-quota:${run.appUserId}`)).toContain('"used":40');
  expect(applyNotificationAiResults).not.toHaveBeenCalled();
  expect(trackEvent).toHaveBeenCalledWith('Notification AI Review Failed', {
    reason: 'limit_reached',
    notification_count: 1,
  });
});

it('leaves items for next time after a network failure', async () => {
  jest.mocked(readNotificationScanHistory).mockResolvedValue([row('1', 1)]);
  jest
    .mocked(reviewNotificationsWithAi)
    .mockRejectedValue(new NotificationAiError('network', 'offline'));
  await runNotificationAiReview(deps());
  expect(applyNotificationAiResults).not.toHaveBeenCalled();
});

it('waits after a failure, and leaves a notification for the user after three', async () => {
  const run = deps();
  jest.mocked(readNotificationScanHistory).mockResolvedValue([row('bad', 1)]);
  jest.mocked(reviewNotificationsWithAi).mockRejectedValue(new NotificationAiError('server', 'x'));
  await runNotificationAiReview(run);
  // Cooling down: the next drain sends nothing.
  await runNotificationAiReview(run);
  expect(reviewNotificationsWithAi).toHaveBeenCalledTimes(1);

  for (let attempt = 2; attempt <= 3; attempt++) {
    resetCooldownOnly();
    await runNotificationAiReview(run);
  }
  expect(reviewNotificationsWithAi).toHaveBeenCalledTimes(3);
  expect(applyNotificationAiResults).toHaveBeenCalledWith(
    [{ id: 'bad', decision: 'unsure' }],
    'both',
    expect.anything(),
  );
  jest.spyOn(Date, 'now').mockRestore();
});

it('stops saving when the ledger changes mid-run', async () => {
  jest.mocked(readNotificationScanHistory).mockResolvedValue([row('1', 1)]);
  jest.mocked(reviewNotificationsWithAi).mockImplementation(async (request) => {
    jest.mocked(getActiveLedgerId).mockReturnValue('ledger-2');
    return {
      results: request.notifications.map((item) => ({ id: item.id, decision: 'expense' as const })),
      skipped: [],
      quota: quota(1),
    };
  });
  await runNotificationAiReview(deps());
  expect(applyNotificationAiResults).not.toHaveBeenCalled();
});

/** Ends the cooldown but keeps the per-notification failure counts. */
function resetCooldownOnly() {
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60 * 1000);
}

it('checks a saved used-up allowance with the Worker before pausing', async () => {
  const run = deps();
  storage.set(`notification-ai-quota:${run.appUserId}`, JSON.stringify(quota(40)));
  jest.mocked(fetchNotificationAiQuota).mockResolvedValue(quota(10));
  jest.mocked(readNotificationScanHistory).mockResolvedValue([row('1', 1)]);
  await runNotificationAiReview(run);
  expect(reviewNotificationsWithAi).toHaveBeenCalledTimes(1);
});
