import {
  type CaptureInput,
  parseAndroidCaptureJson,
  parseIosPendingAlertsJson,
} from '~/features/autoLog/lib/captureQueue';
import { withAlertSource } from '~/features/autoLog/lib/prefs';
import {
  type AlertProcessingDeps,
  analyzeNotificationCapture,
  processAlertCaptures,
} from '~/features/autoLog/processAlerts';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { recordNotificationScan } from '~/services/notificationScanHistory';
import { ReceiptScanError, scanNotification } from '~/services/receiptScan';
import type { QuickEntryPrefs, TransactionWithRelations } from '~/types';

import { account, alertParse, category, prefs, source } from './helpers';

jest.mock('~/lib/repositories/paymentAlertCapturesRepository', () => ({
  paymentAlertCapturesRepository: {
    getById: jest.fn(() => null),
    insert: jest.fn(() => true),
    update: jest.fn(),
    listSince: jest.fn(() => []),
    listLoggedTransactionIds: jest.fn(() => []),
  },
}));
jest.mock('~/services/errorReporting', () => ({ reportError: jest.fn() }));
jest.mock('~/services/notificationScanHistory', () => ({
  recordNotificationScan: jest.fn(async () => undefined),
}));
jest.mock('~/services/receiptScan', () => ({
  ...jest.requireActual('~/services/receiptScan'),
  scanNotification: jest.fn(),
}));
const scanned = (
  type: 'income' | 'expense' = 'expense',
  amount = 25,
  note = 'SHELL',
  categoryName = 'Food',
) => ({
  notificationDecision: 'transaction' as const,
  transactions: [
    {
      type,
      amount,
      currency: 'MYR',
      date: null,
      category: categoryName,
      note,
      sentiment: 'neutral' as const,
      secondary: null,
    },
  ],
  quota: { used: 1, limit: 50, isPro: false },
});

const capture: CaptureInput = {
  id: 'capture',
  channel: 'android_notification',
  sourceKey: 'com.example.bank',
  sourceLabel: 'Bank',
  capturedAt: '2026-10-05T12:00:00.000Z',
  title: null,
  subtitle: null,
  body: 'You spent RM25.00 at SHELL.',
  extra: [],
  nativeKey: null,
  presetAccountId: null,
  presetCategoryId: null,
};
const deps = (): AlertProcessingDeps => ({
  appUserId: 'test-user',
  accounts: [account()],
  categories: [category()],
  transactions: [],
  prefs: withAlertSource(prefs(), source({ accountId: 'a1' })),
  reportingCurrency: 'MYR',
  quickEntryPrefs: {
    autoLogUsageCount: 0,
    autoLogAutoCategorize: false,
    defaultExpenseCategoryId: 'c1',
  } as QuickEntryPrefs,
  isPro: true,
  createTransaction: jest.fn((_, meta) => {
    meta?.onAutoLogPersisted?.('transaction');
    return 'transaction';
  }),
});

describe('automatic alert persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(scanNotification).mockReset().mockResolvedValue(scanned());
  });

  it('creates an expense and acknowledges its capture only after saving the transaction link', async () => {
    const input = deps();
    const result = await processAlertCaptures([capture], input);
    expect(input.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'expense', accountId: 'a1', categoryId: 'c1', amount: 25 }),
      expect.objectContaining({
        source: 'autolog',
        channel: 'android_notification',
        decision: 'auto',
        autoLogIsPro: true,
      }),
    );
    expect(paymentAlertCapturesRepository.update).toHaveBeenCalledWith(
      'capture',
      expect.objectContaining({ status: 'logged', transactionId: 'transaction' }),
    );
    expect(result.captureIds).toEqual(['capture']);
  });

  it('keeps the native alert queued if the initial database lookup fails', async () => {
    jest.mocked(paymentAlertCapturesRepository.getById).mockImplementationOnce(() => {
      throw new Error('DB unavailable');
    });
    const input = deps();
    expect((await processAlertCaptures([capture], input)).captureIds).toEqual([]);
    expect(input.createTransaction).not.toHaveBeenCalled();
  });

  it('keeps the native alert queued if capture storage fails', async () => {
    jest.mocked(paymentAlertCapturesRepository.insert).mockImplementationOnce(() => {
      throw new Error('DB unavailable');
    });
    const input = deps();
    expect((await processAlertCaptures([capture], input)).captureIds).toEqual([]);
    expect(input.createTransaction).not.toHaveBeenCalled();
  });

  it('retries a failed automatic log without asking for review', async () => {
    const input = deps();
    jest.mocked(input.createTransaction).mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    expect((await processAlertCaptures([capture], input)).captureIds).toEqual([]);
    jest
      .mocked(paymentAlertCapturesRepository.getById)
      .mockReturnValueOnce({ id: capture.id, status: 'failed' } as NonNullable<
        ReturnType<typeof paymentAlertCapturesRepository.getById>
      >);
    jest.mocked(paymentAlertCapturesRepository.insert).mockReturnValueOnce(false);
    expect((await processAlertCaptures([capture], input)).captureIds).toEqual(['capture']);
    expect(input.createTransaction).toHaveBeenCalledTimes(2);
  });

  it('acknowledges an already logged capture without logging twice', async () => {
    jest
      .mocked(paymentAlertCapturesRepository.getById)
      .mockReturnValueOnce({ id: capture.id, status: 'logged' } as NonNullable<
        ReturnType<typeof paymentAlertCapturesRepository.getById>
      >);
    const input = deps();
    expect((await processAlertCaptures([capture], input)).captureIds).toEqual(['capture']);
    expect(input.createTransaction).not.toHaveBeenCalled();
  });
  it('logs only the completed charge following a pre-authorization hold', async () => {
    const input = deps();
    jest
      .mocked(scanNotification)
      .mockResolvedValueOnce({
        notificationDecision: 'ignore',
        transactions: [],
        quota: { used: 0, limit: 50, isPro: false },
      })
      .mockResolvedValueOnce(scanned('expense', 250, 'HILTON KL'));
    const result = await processAlertCaptures(
      [
        {
          ...capture,
          id: 'hold',
          body: 'A pre-authorization of RM300.00 was authorised at HILTON KL on card ending 1234.',
        },
        { ...capture, id: 'charge', body: 'You spent RM250.00 at HILTON KL.' },
      ],
      input,
    );
    expect(input.createTransaction).toHaveBeenCalledTimes(1);
    expect(input.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 250 }),
      expect.any(Object),
    );
    expect(result).toMatchObject({ logged: 1, ignored: 1, captureIds: ['hold', 'charge'] });
    expect(paymentAlertCapturesRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'hold', status: 'ignored', reason: 'no_amount' }),
    );
  });
});

describe('scanner notification transformation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(scanNotification).mockReset().mockResolvedValue(scanned());
  });
  it('scans the setup sample body without its synthetic test label', async () => {
    const input = deps();
    await analyzeNotificationCapture({ ...capture, isTest: true, title: 'Money2Time test' }, input);
    expect(scanNotification).toHaveBeenCalledWith(expect.objectContaining({ text: capture.body }));
    expect(input.createTransaction).not.toHaveBeenCalled();
  });
  it('logs income and uses an income category instead of expense defaults', async () => {
    const input = deps();
    input.categories = [category(), category({ id: 'salary', type: 'income', name: 'Salary' })];
    jest.mocked(scanNotification).mockResolvedValue(scanned('income', 3500, 'ACME', 'Salary'));
    const summary = await processAlertCaptures([{ ...capture, body: 'Salary credited.' }], input);
    expect(input.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'income',
        amount: 3500,
        categoryId: 'salary',
        accountId: 'a1',
      }),
      expect.any(Object),
    );
    expect(summary.logged).toBe(1);
    expect(scanNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        appUserId: 'test-user',
        categories: ['Food'],
        incomeCategories: ['Salary'],
      }),
    );
  });
  it('discards unrelated text even when it contains payment keywords and money', async () => {
    const input = deps();
    jest.mocked(scanNotification).mockResolvedValue({
      notificationDecision: 'ignore',
      transactions: [],
      quota: { used: 0, limit: 50, isPro: false },
    });
    const summary = await processAlertCaptures(
      [{ ...capture, body: 'You spent RM25! Get RM5 cashback on your next purchase.' }],
      input,
    );
    expect(input.createTransaction).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ ignored: 1, captureIds: [capture.id] });
  });
  it.each(['network', 'capacity', 'server', 'limit_reached'] as const)(
    'retains the queue on a %s scanner failure',
    async (code) => {
      const input = deps();
      jest.mocked(scanNotification).mockRejectedValue(new ReceiptScanError(code, 'unavailable'));
      const summary = await processAlertCaptures([capture], input);
      expect(summary.captureIds).toEqual([]);
      expect(input.createTransaction).not.toHaveBeenCalled();
      expect(paymentAlertCapturesRepository.insert).not.toHaveBeenCalled();
    },
  );
  it.each(['disabled', 'account_missing', 'allowance_exhausted'])(
    'does not upload notifications when %s',
    async (condition) => {
      const input = deps();
      if (condition === 'disabled') input.prefs.alertsEnabled = false;
      if (condition === 'account_missing') input.accounts = [];
      if (condition === 'allowance_exhausted') {
        input.isPro = false;
        input.quickEntryPrefs.autoLogUsageCount = 999;
      }
      const summary = await processAlertCaptures([capture], input);
      expect(scanNotification).not.toHaveBeenCalled();
      expect(input.createTransaction).not.toHaveBeenCalled();
      expect(summary.captureIds).toEqual([capture.id]);
    },
  );
  it('stops an offline batch after the first failure and retains all unprocessed alerts', async () => {
    const input = deps();
    jest.mocked(scanNotification).mockRejectedValue(new ReceiptScanError('network', 'offline'));
    const summary = await processAlertCaptures([capture, { ...capture, id: 'second' }], input);
    expect(scanNotification).toHaveBeenCalledTimes(1);
    expect(summary.captureIds).toEqual([]);
  });
  it('does not turn a failed scanner into a keyword expense', async () => {
    const input = deps();
    jest.mocked(scanNotification).mockRejectedValue(new Error('offline'));
    await processAlertCaptures([capture], input);
    expect(input.createTransaction).not.toHaveBeenCalled();
  });
  it('does not scan an already acknowledged capture again', async () => {
    const input = deps();
    jest
      .mocked(paymentAlertCapturesRepository.getById)
      .mockReturnValueOnce({ status: 'logged' } as never);
    await processAlertCaptures([capture], input);
    expect(scanNotification).not.toHaveBeenCalled();
  });
});

describe('network boundary and retry safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(scanNotification).mockReset().mockResolvedValue(scanned());
  });
  it.each(['expense', 'income'] as const)(
    'records the detected %s with notification text',
    async (type) => {
      jest.mocked(scanNotification).mockResolvedValueOnce(scanned(type));
      await processAlertCaptures([capture], deps());
      expect(recordNotificationScan).toHaveBeenCalledWith(
        'test-user',
        expect.objectContaining({ id: capture.id, text: capture.body, result: type }),
      );
    },
  );
  it('records no transaction for a scanner discard', async () => {
    jest.mocked(scanNotification).mockResolvedValueOnce({
      notificationDecision: 'ignore',
      transactions: [],
      quota: { used: 0, limit: 50, isPro: false },
    });
    await processAlertCaptures([capture], deps());
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'test-user',
      expect.objectContaining({ result: 'none' }),
    );
  });
  it('records a scan error without acknowledging the queued notification', async () => {
    jest
      .mocked(scanNotification)
      .mockRejectedValueOnce(new ReceiptScanError('network', 'Network unavailable'));
    const summary = await processAlertCaptures([capture], deps());
    expect(recordNotificationScan).toHaveBeenCalledWith(
      'test-user',
      expect.objectContaining({ result: 'failed' }),
    );
    expect(summary.captureIds).toEqual([]);
  });
  it('still saves the transaction when history storage fails', async () => {
    jest.mocked(recordNotificationScan).mockRejectedValueOnce(new Error('disk unavailable'));
    const input = deps();
    const summary = await processAlertCaptures([capture], input);
    expect(input.createTransaction).toHaveBeenCalledTimes(1);
    expect(summary.captureIds).toEqual(['capture']);
  });
  it('does not put setup test alerts into real notification history', async () => {
    await analyzeNotificationCapture({ ...capture, isTest: true }, deps());
    expect(recordNotificationScan).not.toHaveBeenCalled();
  });
  it('scans configured notifications without a separate legacy opt-in', async () => {
    const input = deps();
    input.prefs = JSON.parse(
      JSON.stringify({ ...input.prefs, notificationScanningEnabled: false }),
    );
    const summary = await processAlertCaptures([capture], input);
    expect(scanNotification).toHaveBeenCalledTimes(1);
    expect(input.createTransaction).toHaveBeenCalledTimes(1);
    expect(summary.captureIds).toEqual(['capture']);
  });
  it('rechecks the master switch after a slow classification', async () => {
    const input = deps();
    input.getCurrent = () => input;
    jest.mocked(scanNotification).mockImplementationOnce(async () => {
      input.prefs = { ...input.prefs, alertsEnabled: false };
      return scanned();
    });
    const summary = await processAlertCaptures([capture], input);
    expect(input.createTransaction).not.toHaveBeenCalled();
    expect(summary.captureIds).toEqual([capture.id]);
  });
  it('does not duplicate a manual entry made while the scanner is running', async () => {
    const input = deps();
    input.getCurrent = () => input;
    jest.mocked(scanNotification).mockImplementationOnce(async () => {
      input.transactions = [
        {
          id: 'manual',
          type: 'expense',
          amount: 25,
          currency: 'MYR',
          accountId: 'a1',
          date: '2026-10-05T12:00:00.000Z',
          note: 'SHELL',
          recurrenceParentId: null,
        } as TransactionWithRelations,
      ];
      return scanned();
    });
    const summary = await processAlertCaptures([capture], input);
    expect(input.createTransaction).not.toHaveBeenCalled();
    expect(summary.duplicates).toBe(1);
  });
  it('does not use a legacy scan toggle to block an iOS shortcut during inference', async () => {
    const input = deps();
    input.getCurrent = () => input;
    jest.mocked(scanNotification).mockImplementationOnce(async () => {
      input.prefs = JSON.parse(
        JSON.stringify({ ...input.prefs, notificationScanningEnabled: false }),
      );
      return scanned();
    });
    const summary = await processAlertCaptures(
      [{ ...capture, channel: 'ios_alert', presetAccountId: input.accounts[0].id }],
      input,
    );
    expect(input.createTransaction).toHaveBeenCalledTimes(1);
    expect(summary.captureIds).toEqual(['capture']);
  });
  it('reuses a validated saved classification after a transaction write failure', async () => {
    const input = deps();
    jest.mocked(paymentAlertCapturesRepository.getById).mockReturnValueOnce({
      status: 'failed',
      resolution: { parse: { ...alertParse(), scanCurrency: 'MYR' } },
    } as never);
    jest.mocked(paymentAlertCapturesRepository.insert).mockReturnValueOnce(false);
    const summary = await processAlertCaptures([capture], input);
    expect(scanNotification).not.toHaveBeenCalled();
    expect(summary.logged).toBe(1);
  });
  it('keeps a capture queued when its selected account currency changes during inference', async () => {
    const input = deps();
    input.getCurrent = () => input;
    jest.mocked(scanNotification).mockImplementationOnce(async () => {
      input.accounts = [account({ currency: 'USD' })];
      return scanned();
    });
    const summary = await processAlertCaptures(
      [{ ...capture, body: 'You spent $25 at SHELL.' }],
      input,
    );
    expect(input.createTransaction).not.toHaveBeenCalled();
    expect(summary.captureIds).toEqual([]);
  });
  it('rescans a saved classification when the account currency has changed', async () => {
    const input = deps();
    input.accounts = [account({ currency: 'USD' })];
    jest.mocked(paymentAlertCapturesRepository.getById).mockReturnValueOnce({
      status: 'failed',
      resolution: { parse: { ...alertParse(), scanCurrency: 'MYR' } },
    } as never);
    jest.mocked(paymentAlertCapturesRepository.insert).mockReturnValueOnce(false);
    const result = scanned();
    result.transactions[0]!.currency = 'USD';
    jest.mocked(scanNotification).mockResolvedValueOnce(result);
    await processAlertCaptures([{ ...capture, body: 'You spent $25 at SHELL.' }], input);
    expect(scanNotification).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD' }));
    expect(input.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USD' }),
      expect.any(Object),
    );
  });
  it('rescans saved classifications whose currency context was not recorded', async () => {
    const input = deps();
    jest.mocked(paymentAlertCapturesRepository.getById).mockReturnValueOnce({
      status: 'failed',
      resolution: { parse: alertParse() },
    } as never);
    await processAlertCaptures([capture], input);
    expect(scanNotification).toHaveBeenCalledTimes(1);
  });
  it('uses live capture status when a linked transaction is deleted during inference', async () => {
    const input = deps();
    let stored = {
      id: 'previous',
      channel: capture.channel,
      sourceKey: capture.sourceKey,
      capturedAt: capture.capturedAt,
      nativeKey: null,
      dedupeKey: null,
      status: 'logged',
      transactionId: 'deleted-transaction',
      resolution: { parse: alertParse(), currency: 'MYR', accountId: 'a1' },
    };
    // A prior alert from a different app also announced this payment.
    stored.sourceKey = 'another.bank';
    jest
      .mocked(paymentAlertCapturesRepository.listSince)
      .mockImplementation(() => [stored] as never);
    jest.mocked(scanNotification).mockImplementationOnce(async () => {
      stored = { ...stored, status: 'dismissed', transactionId: '' };
      return scanned();
    });
    try {
      const summary = await processAlertCaptures([capture], input);
      expect(input.createTransaction).toHaveBeenCalledTimes(1);
      expect(summary.duplicates).toBe(0);
    } finally {
      jest.mocked(paymentAlertCapturesRepository.listSince).mockImplementation(() => []);
    }
  });
  it('scans a complete multiline native body longer than one native field', async () => {
    const parsed = parseAndroidCaptureJson(
      'capture.json',
      JSON.stringify({
        package: 'com.example.bank',
        lines: [capture.body + 'x'.repeat(1200), 'x'.repeat(1200)],
      }),
    )!;
    expect(parsed.body.length).toBeGreaterThan(2000);
    const input = deps();
    const summary = await processAlertCaptures([parsed], input);
    expect(scanNotification).toHaveBeenCalledTimes(1);
    expect(summary.logged).toBe(1);
  });
  it('does not truncate an oversized notification into a completed payment', async () => {
    const input = deps();
    await processAlertCaptures(
      [{ ...capture, body: capture.body + 'x'.repeat(12001) + 'This payment was declined.' }],
      input,
    );
    expect(scanNotification).not.toHaveBeenCalled();
    expect(input.createTransaction).not.toHaveBeenCalled();
  });
  it.each(['android_notification', 'ios_alert'] as const)(
    'discards a %s field at the native truncation boundary without uploading',
    async (channel) => {
      const input = deps();
      const summary = await processAlertCaptures(
        [{ ...capture, channel, presetAccountId: 'a1', body: capture.body.padEnd(2000, 'x') }],
        input,
      );
      expect(scanNotification).not.toHaveBeenCalled();
      expect(input.createTransaction).not.toHaveBeenCalled();
      expect(summary.ignored).toBe(1);
      expect(summary.captureIds).toEqual(['capture']);
    },
  );
  it.each(['android_notification', 'ios_alert'] as const)(
    'retains %s truncation evidence before trimming whitespace',
    async (channel) => {
      const input = deps();
      const body = capture.body.padEnd(2000, ' ');
      const parsed =
        channel === 'android_notification'
          ? parseAndroidCaptureJson(
              'capture.json',
              JSON.stringify({ package: 'com.example.bank', text: body }),
            )!
          : parseIosPendingAlertsJson(
              JSON.stringify([{ id: 'capture', message: body, accountId: 'a1' }]),
            )[0]!;
      expect(parsed.body.length).toBeLessThan(2000);
      const summary = await processAlertCaptures([parsed], input);
      expect(scanNotification).not.toHaveBeenCalled();
      expect(input.createTransaction).not.toHaveBeenCalled();
      expect(summary.ignored).toBe(1);
    },
  );
});
