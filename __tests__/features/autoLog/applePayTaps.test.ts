import type { AutoLogPendingEntry } from '~/features/transactions/lib/autoLog';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { PaymentAlertCapture } from '~/types';

const listSince = jest.fn<PaymentAlertCapture[], [string]>();
const insert = jest.fn();
const update = jest.fn();
const reportError = jest.fn();

jest.mock('~/lib/repositories/paymentAlertCapturesRepository', () => ({
  paymentAlertCapturesRepository: {
    listSince: (since: string) => listSince(since),
    insert: (input: unknown) => insert(input),
    update: (id: string, input: unknown) => update(id, input),
  },
}));
jest.mock('~/services/errorReporting', () => ({
  reportError: (error: unknown, context: unknown) => reportError(error, context),
}));

import { checkApplePayTap, recordApplePayTap } from '~/features/autoLog/applePayTaps';

const TAP_AT = '2026-10-04T08:00:00.000Z';

function tap(overrides: Partial<AutoLogPendingEntry> = {}): AutoLogPendingEntry {
  return {
    id: 'tap-1',
    createdAt: TAP_AT,
    amountRaw: 'RM12.30',
    merchant: 'KFC',
    cardName: 'Maybank Visa',
    accountId: 'visa',
    categoryId: null,
    provisional: false,
    ...overrides,
  };
}

function draft(overrides: Partial<CreateTransactionInput> = {}): CreateTransactionInput {
  return {
    type: 'expense',
    amount: 12.3,
    currency: 'MYR',
    date: TAP_AT,
    accountId: 'visa',
    categoryId: 'food',
    note: 'KFC',
    sentiment: 'neutral',
    ...overrides,
  } as CreateTransactionInput;
}

function capture(overrides: Partial<PaymentAlertCapture> = {}): PaymentAlertCapture {
  return {
    id: 'alert-1',
    channel: 'ios_alert',
    sourceKey: 'maybank',
    sourceLabel: 'Maybank',
    capturedAt: '2026-10-04T08:03:00.000Z',
    nativeKey: null,
    title: null,
    body: 'RM12.30 spent at KFC',
    status: 'logged',
    reason: 'auto',
    resolution: {
      parse: {
        kind: 'spend',
        amount: 12.3,
        currency: 'MYR',
        currencyToken: 'RM',
        secondary: null,
        counterparty: 'KFC',
        counterpartyLeadIn: 'at',
        confidence: 'high',
        signals: [],
        parserVersion: 1,
      },
      accountId: 'visa',
      certainty: 'certain',
      bindingReason: 'source_single',
      identifier: null,
      candidateAccountIds: ['visa'],
      categoryId: 'food',
      categoryOrigin: 'keyword',
      draftType: 'expense',
      transferFromAccountId: null,
      transferToAccountId: null,
    },
    parserVersion: 1,
    transactionId: 'tx-alert',
    duplicateOf: null,
    dedupeKey: 'abc',
    createdAt: '2026-10-04T08:03:00.000Z',
    updatedAt: '2026-10-04T08:03:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  listSince.mockReset();
  insert.mockReset();
  update.mockReset();
  reportError.mockReset();
});

describe('checkApplePayTap', () => {
  it('logs a tap no alert has seen', () => {
    listSince.mockReturnValue([]);
    expect(checkApplePayTap(tap(), draft())).toEqual({ action: 'log', supersedesCaptureId: null });
  });

  it('skips a tap the bank alert already logged', () => {
    listSince.mockReturnValue([capture()]);
    expect(checkApplePayTap(tap(), draft())).toEqual({
      action: 'skip',
      twinCaptureId: 'alert-1',
      transactionId: 'tx-alert',
    });
  });

  it('pairs a currency-symbol-only alert using the currency it actually logged', () => {
    const previous = capture();
    previous.resolution = {
      ...previous.resolution!,
      currency: 'MYR',
      parse: { ...previous.resolution!.parse, currency: null },
    };
    listSince.mockReturnValue([previous]);
    expect(checkApplePayTap(tap(), draft()).action).toBe('skip');
  });

  it('logs over a bank alert still waiting in review, and hands back its id', () => {
    listSince.mockReturnValue([capture({ status: 'pending', transactionId: null })]);
    expect(checkApplePayTap(tap(), draft())).toEqual({
      action: 'log',
      supersedesCaptureId: 'alert-1',
    });
  });

  it('logs when the amount differs or the alert is too far away in time', () => {
    listSince.mockReturnValue([
      capture({
        id: 'other-amount',
        resolution: {
          ...capture().resolution!,
          parse: { ...capture().resolution!.parse, amount: 9.9 },
        },
      }),
      capture({ id: 'too-late', capturedAt: '2026-10-04T08:40:00.000Z' }),
    ]);
    expect(checkApplePayTap(tap(), draft()).action).toBe('log');
  });

  it('does not log the same tap again after native acknowledgement fails', () => {
    listSince.mockReturnValue([
      capture({ id: 'apple_pay-tap-1', channel: 'apple_pay', sourceKey: 'apple_pay' }),
    ]);
    expect(checkApplePayTap(tap(), draft())).toEqual({
      action: 'skip',
      twinCaptureId: 'apple_pay-tap-1',
      transactionId: 'tx-alert',
    });
  });

  it('never treats two Apple Pay taps as one payment', () => {
    listSince.mockReturnValue([
      capture({ id: 'apple_pay-tap-0', channel: 'apple_pay', sourceKey: 'apple_pay' }),
    ]);
    expect(checkApplePayTap(tap(), draft())).toEqual({ action: 'log', supersedesCaptureId: null });
  });

  it('falls back to logging when the alert store cannot be read', () => {
    listSince.mockImplementation(() => {
      throw new Error('db closed');
    });
    expect(checkApplePayTap(tap(), draft())).toEqual({ action: 'log', supersedesCaptureId: null });
    expect(reportError).toHaveBeenCalled();
  });
});

describe('recordApplePayTap', () => {
  it('stores a logged tap so a later alert recognizes it', () => {
    recordApplePayTap(tap(), draft(), {
      status: 'logged',
      transactionId: 'tx-tap',
      supersedesCaptureId: null,
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'apple_pay-tap-1',
        channel: 'apple_pay',
        sourceKey: 'apple_pay',
        status: 'logged',
        transactionId: 'tx-tap',
        capturedAt: TAP_AT,
      }),
    );
    const stored = insert.mock.calls[0][0] as { resolution: { parse: { amount: number } } };
    expect(stored.resolution.parse.amount).toBe(12.3);
    expect(update).not.toHaveBeenCalled();
  });

  it('marks the alert it replaced as a duplicate of the tap', () => {
    recordApplePayTap(tap(), draft(), {
      status: 'logged',
      transactionId: 'tx-tap',
      supersedesCaptureId: 'alert-1',
    });
    expect(update).toHaveBeenCalledWith('alert-1', {
      status: 'duplicate',
      reason: 'duplicate',
      duplicateOf: 'apple_pay-tap-1',
    });
  });

  it('records a skipped tap as a duplicate pointing at the alert', () => {
    recordApplePayTap(tap(), draft(), {
      status: 'duplicate',
      transactionId: 'tx-alert',
      duplicateOf: 'alert-1',
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'duplicate',
        duplicateOf: 'alert-1',
        transactionId: 'tx-alert',
      }),
    );
  });
});
