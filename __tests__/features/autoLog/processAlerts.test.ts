import type { CaptureInput } from '~/features/autoLog/lib/captureQueue';
import { withAlertSource } from '~/features/autoLog/lib/prefs';
import { type AlertProcessingDeps, processAlertCaptures } from '~/features/autoLog/processAlerts';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
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
  beforeEach(() => jest.clearAllMocks());

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
      expect.objectContaining({ id: 'hold', status: 'ignored', reason: 'authorization_hold' }),
    );
  });
});
