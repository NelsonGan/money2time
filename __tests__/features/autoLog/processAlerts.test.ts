import type { CaptureInput } from '~/features/autoLog/lib/captureQueue';
import { withAlertSource } from '~/features/autoLog/lib/prefs';
import { type AlertProcessingDeps, processAlertCaptures } from '~/features/autoLog/processAlerts';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { invalidatePaymentAlertProcessing } from '~/services/paymentAlertsBridge';
import { scanPaymentAlert } from '~/services/paymentAlertScan';
import type { QuickEntryPrefs } from '~/types';

import { account, category, prefs, source } from './helpers';

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
jest.mock('~/services/paymentAlertScan', () => ({
  ...jest.requireActual('~/services/paymentAlertScan'),
  scanPaymentAlert: jest.fn(),
}));

const scanned = (overrides = {}) => ({
  type: 'expense',
  amount: 25,
  currency: 'MYR',
  date: null,
  category: 'Food',
  note: 'SHELL',
  sentiment: 'neutral',
  ...overrides,
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
  accounts: [account()],
  categories: [category()],
  transactions: [],
  prefs: withAlertSource(prefs(), source({ accountId: 'a1' })),
  reportingCurrency: 'MYR',
  appUserId: 'user',
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
    jest
      .mocked(scanPaymentAlert)
      .mockResolvedValue(scanned() as Awaited<ReturnType<typeof scanPaymentAlert>>);
  });

  it('sends notification details and both category types to the receipt worker', async () => {
    const input = deps();
    input.categories = [
      ...input.categories,
      category({ id: 'salary', name: 'Salary', type: 'income' }),
    ];
    await processAlertCaptures(
      [{ ...capture, title: 'Payment', subtitle: 'Card', extra: ['Details'] }],
      input,
    );
    expect(scanPaymentAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        appUserId: 'user',
        currency: 'MYR',
        categories: ['Food'],
        incomeCategories: ['Salary'],
        notification: expect.objectContaining({
          title: 'Payment',
          subtitle: 'Card',
          body: capture.body,
          extra: ['Details'],
          source: 'Bank',
          capturedAt: capture.capturedAt,
        }),
      }),
    );
  });

  it('logs income to the selected account using an income category', async () => {
    const input = deps();
    input.categories = [
      ...input.categories,
      category({ id: 'salary', name: 'Salary', type: 'income' }),
    ];
    jest
      .mocked(scanPaymentAlert)
      .mockResolvedValueOnce(
        scanned({ type: 'income', amount: 3500, category: 'Salary', note: 'Employer' }) as Awaited<
          ReturnType<typeof scanPaymentAlert>
        >,
      );
    await processAlertCaptures([{ ...capture, body: 'Salary credited.' }], input);
    expect(input.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'income',
        amount: 3500,
        accountId: 'a1',
        categoryId: 'salary',
        date: capture.capturedAt,
      }),
      expect.any(Object),
    );
  });

  it('uses the worker result even when notification wording has no local payment keywords', async () => {
    const input = deps();
    await processAlertCaptures(
      [{ ...capture, body: 'Your morning coffee: twenty-five ringgit.' }],
      input,
    );
    expect(input.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25 }),
      expect.any(Object),
    );
  });

  it('acknowledges promotional notifications without creating a transaction', async () => {
    const input = deps();
    jest.mocked(scanPaymentAlert).mockResolvedValueOnce(null);
    const result = await processAlertCaptures(
      [{ ...capture, body: 'Spend RM50 to get 20% cashback!' }],
      input,
    );
    expect(result).toMatchObject({ ignored: 1, captureIds: [capture.id] });
    expect(input.createTransaction).not.toHaveBeenCalled();
  });

  it('keeps a network failure queued and continues with other notifications', async () => {
    const input = deps();
    jest.mocked(scanPaymentAlert).mockRejectedValueOnce(new Error('offline'));
    const result = await processAlertCaptures([capture, { ...capture, id: 'second' }], input);
    expect(result.captureIds).toEqual(['second']);
    expect(result.logged).toBe(1);
    expect(paymentAlertCapturesRepository.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: capture.id }),
    );
  });

  it.each(['disabled', 'missing_account', 'limit'])(
    'does not upload notification text when blocked by %s',
    async (reason) => {
      const input = deps();
      if (reason === 'disabled') input.prefs.alertsEnabled = false;
      if (reason === 'missing_account') input.accounts = [];
      if (reason === 'limit') {
        input.isPro = false;
        input.quickEntryPrefs.autoLogUsageCount = 100;
      }
      await processAlertCaptures([capture], input);
      expect(scanPaymentAlert).not.toHaveBeenCalled();
      expect(input.createTransaction).not.toHaveBeenCalled();
    },
  );

  it('does not create income already entered manually', async () => {
    const input = deps();
    jest
      .mocked(scanPaymentAlert)
      .mockResolvedValueOnce(
        scanned({ type: 'income', category: 'Salary', note: 'Employer' }) as Awaited<
          ReturnType<typeof scanPaymentAlert>
        >,
      );
    input.transactions = [
      {
        id: 'manual',
        type: 'income',
        amount: 25,
        currency: 'MYR',
        date: capture.capturedAt,
        accountId: 'a1',
        note: 'Employer',
      },
    ] as unknown as AlertProcessingDeps['transactions'];
    expect((await processAlertCaptures([capture], input)).duplicates).toBe(1);
    expect(input.createTransaction).not.toHaveBeenCalled();
  });

  it('reuses a parsed result after a failed save without spending inference quota again', async () => {
    const input = deps();
    jest.mocked(input.createTransaction).mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    await processAlertCaptures([capture], input);
    const stored = jest.mocked(paymentAlertCapturesRepository.insert).mock.calls[0]![0];
    jest
      .mocked(paymentAlertCapturesRepository.getById)
      .mockReturnValueOnce({ ...stored, status: 'failed' } as unknown as NonNullable<
        ReturnType<typeof paymentAlertCapturesRepository.getById>
      >);
    await processAlertCaptures([capture], input);
    expect(scanPaymentAlert).toHaveBeenCalledTimes(1);
    expect(input.createTransaction).toHaveBeenCalledTimes(2);
  });

  it('rechecks source opt-in after a slow worker response', async () => {
    const input = deps();
    input.getCurrent = () => input;
    jest.mocked(scanPaymentAlert).mockImplementationOnce(async () => {
      input.prefs = { ...input.prefs, alertsEnabled: false };
      return scanned() as Awaited<ReturnType<typeof scanPaymentAlert>>;
    });
    await processAlertCaptures([capture], input);
    expect(input.createTransaction).not.toHaveBeenCalled();
  });

  it('does not recreate transactions after a data reset or restore during inference', async () => {
    const input = deps();
    jest.mocked(scanPaymentAlert).mockImplementationOnce(async () => {
      invalidatePaymentAlertProcessing();
      return scanned() as Awaited<ReturnType<typeof scanPaymentAlert>>;
    });
    const result = await processAlertCaptures([capture], input);
    expect(input.createTransaction).not.toHaveBeenCalled();
    expect(paymentAlertCapturesRepository.insert).not.toHaveBeenCalled();
    expect(result.captureIds).toEqual([]);
  });

  it('does not log to an account deleted while parsing the notification', async () => {
    const input = deps();
    input.getCurrent = () => input;
    jest.mocked(scanPaymentAlert).mockImplementationOnce(async () => {
      input.accounts = [];
      return scanned() as Awaited<ReturnType<typeof scanPaymentAlert>>;
    });
    await processAlertCaptures([capture], input);
    expect(input.createTransaction).not.toHaveBeenCalled();
  });

  it('sees an Apple Pay capture committed during inference', async () => {
    const input = deps();
    jest.mocked(scanPaymentAlert).mockImplementationOnce(async () => {
      jest.mocked(paymentAlertCapturesRepository.listSince).mockReturnValueOnce([
        {
          id: 'apple_pay-tap',
          channel: 'apple_pay',
          sourceKey: 'apple_pay',
          capturedAt: capture.capturedAt,
          status: 'logged',
          transactionId: 'tap-transaction',
          resolution: {
            accountId: 'a1',
            currency: 'MYR',
            parse: {
              kind: 'spend',
              amount: 25,
              currency: 'MYR',
              counterparty: 'SHELL',
            },
          },
        },
      ] as unknown as ReturnType<typeof paymentAlertCapturesRepository.listSince>);
      return scanned() as Awaited<ReturnType<typeof scanPaymentAlert>>;
    });
    expect((await processAlertCaptures([capture], input)).duplicates).toBe(1);
    expect(input.createTransaction).not.toHaveBeenCalled();
  });

  it('honors a Pro upgrade while inference is in flight', async () => {
    const input = deps();
    input.isPro = false;
    input.quickEntryPrefs.autoLogUsageCount = 99;
    input.getCurrent = () => input;
    jest.mocked(scanPaymentAlert).mockImplementationOnce(async () => {
      input.isPro = true;
      return scanned() as Awaited<ReturnType<typeof scanPaymentAlert>>;
    });
    expect(
      (
        await processAlertCaptures(
          [capture, { ...capture, id: 'second', capturedAt: '2026-10-05T13:00:00.000Z' }],
          input,
        )
      ).logged,
    ).toBe(2);
  });

  it('reparses ambiguous currency when the selected account currency changes during inference', async () => {
    const input = deps();
    input.getCurrent = () => input;
    jest
      .mocked(scanPaymentAlert)
      .mockImplementationOnce(async () => {
        input.accounts = [account({ currency: 'USD' })];
        return scanned() as Awaited<ReturnType<typeof scanPaymentAlert>>;
      })
      .mockResolvedValueOnce(
        scanned({ currency: 'USD' }) as Awaited<ReturnType<typeof scanPaymentAlert>>,
      );
    await processAlertCaptures([capture], input);
    expect(scanPaymentAlert).toHaveBeenCalledTimes(2);
    expect(input.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USD' }),
      expect.any(Object),
    );
  });

  it('counts saves in a batch even before updated preferences reach the next render', async () => {
    const input = deps();
    input.isPro = false;
    input.quickEntryPrefs.autoLogUsageCount = 99;
    input.getCurrent = () => input;
    expect(
      (
        await processAlertCaptures(
          [capture, { ...capture, id: 'second', capturedAt: '2026-10-05T13:00:00.000Z' }],
          input,
        )
      ).logged,
    ).toBe(1);
    expect(scanPaymentAlert).toHaveBeenCalledTimes(1);
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
      .mocked(scanPaymentAlert)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        scanned({ amount: 250, note: 'HILTON KL' }) as Awaited<ReturnType<typeof scanPaymentAlert>>,
      );
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
      expect.objectContaining({ id: 'hold', status: 'ignored' }),
    );
  });
});
