import { PRO_LIMITS } from '~/constants/proLimits';
import { resolveAlertCategory } from '~/features/autoLog/lib/categorize';
import { autoLogAllowance, decideCapture, type DecisionInput } from '~/features/autoLog/lib/decide';
import { alertDedupeKey, type CaptureRef, findDuplicate } from '~/features/autoLog/lib/dedupe';
import { parsePaymentAlert } from '~/features/autoLog/lib/parser';

import { account, category, source } from './helpers';

const spend = parsePaymentAlert({ body: "You've spent RM25.00 at STARBUCKS KLCC." });

function decision(overrides: Partial<DecisionInput> = {}) {
  return decideCapture({
    parse: spend,
    certainty: 'certain',
    duplicate: { kind: 'none', supersedesCaptureId: null },
    source: source(),
    captureEnabled: true,
    ignoredByPhrase: false,
    autoLogsRemaining: null,
    ...overrides,
  });
}

describe('decideCapture', () => {
  it('logs a confident spend from an auto source with a certain account', () => {
    expect(decision()).toEqual({ action: 'log', reason: 'auto' });
  });

  it('ignores alerts without a selected account', () => {
    expect(decision({ certainty: 'likely' })).toEqual({
      action: 'ignore',
      reason: 'account_uncertain',
    });
  });

  it('ignores an unconfigured source', () => {
    expect(decision({ source: null }).action).toBe('ignore');
  });
  it('stops automatically logging once the free allowance is used', () => {
    expect(decision({ autoLogsRemaining: 0 })).toEqual({
      action: 'ignore',
      reason: 'limit_reached',
    });
    expect(decision({ autoLogsRemaining: 3 }).action).toBe('log');
  });

  it('counts down the free allowance, and has none over the free account limit', () => {
    const accounts = (count: number) =>
      Array.from({ length: count }, (_, index) => account({ id: `a${index}` }));
    expect(autoLogAllowance({ isPro: true, accounts: accounts(20), usedAutoLogs: 999 })).toBeNull();
    expect(
      autoLogAllowance({
        isPro: false,
        accounts: accounts(PRO_LIMITS.FREE_MAX_ACCOUNTS),
        usedAutoLogs: 2,
      }),
    ).toBe(PRO_LIMITS.FREE_MAX_AUTO_LOGS - 2);
    expect(
      autoLogAllowance({
        isPro: false,
        accounts: accounts(PRO_LIMITS.FREE_MAX_ACCOUNTS),
        usedAutoLogs: PRO_LIMITS.FREE_MAX_AUTO_LOGS + 5,
      }),
    ).toBe(0);
    expect(
      autoLogAllowance({
        isPro: false,
        accounts: accounts(PRO_LIMITS.FREE_MAX_ACCOUNTS + 1),
        usedAutoLogs: 0,
      }),
    ).toBe(0);
    // Savings goals have their own limit and take no account slot.
    expect(
      autoLogAllowance({
        isPro: false,
        accounts: [
          ...accounts(PRO_LIMITS.FREE_MAX_ACCOUNTS),
          account({ id: 'goal', type: 'goal' }),
        ],
        usedAutoLogs: 0,
      }),
    ).toBe(PRO_LIMITS.FREE_MAX_AUTO_LOGS);
  });

  it('ignores codes, promotions, declines, balances and alerts without money', () => {
    for (const body of [
      'Your OTP is 123456. Do not share.',
      'Get 10% cashback when you spend RM50!',
      'Your card was declined at SHELL for RM80.00.',
      'Your statement is ready. Outstanding balance RM1,234.56.',
      'Your new device has been registered.',
    ]) {
      expect(decision({ parse: parsePaymentAlert({ body }) }).action).toBe('ignore');
    }
  });

  it('never auto-logs money in, refunds or top-ups', () => {
    for (const body of [
      'You have received RM50.00 from AHMAD.',
      'Refund of RM25.00 from SHOPEE has been credited.',
      'Reload of RM100.00 successful.',
    ]) {
      expect(decision({ parse: parsePaymentAlert({ body }) }).action).toBe('ignore');
    }
  });

  it('skips both certain and possible duplicates', () => {
    expect(
      decision({ duplicate: { kind: 'certain', ofCaptureId: 'x', ofTransactionId: null } }).action,
    ).toBe('duplicate');
    expect(
      decision({ duplicate: { kind: 'possible', ofCaptureId: null, ofTransactionId: 't' } }),
    ).toEqual({ action: 'duplicate', reason: 'duplicate' });
  });

  it('ignores a disabled source and an ignore phrase', () => {
    expect(decision({ source: source({ enabled: false }) }).reason).toBe('source_disabled');
    expect(decision({ ignoredByPhrase: true }).reason).toBe('ignore_phrase');
  });
});

describe('findDuplicate', () => {
  const base = {
    id: 'new',
    channel: 'android_notification' as const,
    sourceKey: 'com.example.wallet',
    capturedAt: '2026-10-03T12:05:00.000Z',
    nativeKey: 'key-1',
    dedupeKey: 'abc',
    kind: 'spend' as const,
    amount: 25,
    currency: 'MYR',
    counterparty: 'STARBUCKS',
    accountId: 'a1',
  };
  const captureRef = (overrides: Partial<CaptureRef>): CaptureRef => ({
    id: 'old',
    channel: 'android_notification',
    sourceKey: 'com.example.bank',
    capturedAt: '2026-10-03T12:00:00.000Z',
    nativeKey: null,
    dedupeKey: 'zzz',
    status: 'logged',
    kind: 'spend',
    amount: 25,
    currency: 'MYR',
    transactionId: 'tx-1',
    accountId: 'a1',
    counterparty: 'STARBUCKS',
    ...overrides,
  });

  it('treats the same text from the same source as one alert', () => {
    const verdict = findDuplicate(
      base,
      [
        captureRef({
          dedupeKey: 'abc',
          sourceKey: base.sourceKey,
          capturedAt: '2026-10-03T12:04:00.000Z',
        }),
      ],
      [],
      new Set(),
    );
    expect(verdict.kind).toBe('certain');
  });

  it('pairs the same payment announced by the bank and the wallet', () => {
    const verdict = findDuplicate(base, [captureRef({})], [], new Set());
    expect(verdict).toEqual({ kind: 'certain', ofCaptureId: 'old', ofTransactionId: 'tx-1' });
  });

  it('pairs a bank alert with the Apple Pay tap it describes, within 15 minutes', () => {
    const tap = captureRef({
      channel: 'apple_pay',
      sourceKey: 'apple_pay',
      capturedAt: '2026-10-03T11:52:00.000Z',
    });
    expect(findDuplicate(base, [tap], [], new Set()).kind).toBe('certain');
    const late = captureRef({
      channel: 'apple_pay',
      sourceKey: 'apple_pay',
      capturedAt: '2026-10-03T11:30:00.000Z',
    });
    expect(findDuplicate(base, [late], [], new Set()).kind).toBe('none');
  });

  it('lets an updated notification supersede its pending earlier version', () => {
    const earlier = captureRef({
      sourceKey: base.sourceKey,
      nativeKey: 'key-1',
      status: 'pending',
    });
    expect(findDuplicate(base, [earlier], [], new Set())).toEqual({
      kind: 'none',
      supersedesCaptureId: 'old',
    });
  });

  it('flags a decline arriving for a payment already logged', () => {
    const earlier = captureRef({ sourceKey: base.sourceKey, nativeKey: 'key-1' });
    expect(findDuplicate({ ...base, kind: 'declined' }, [earlier], [], new Set()).kind).toBe(
      'reversal',
    );
  });

  it('recognizes a possible duplicate payment the user already typed in', () => {
    const typed = {
      id: 't',
      type: 'expense',
      amount: 25,
      currency: 'MYR',
      date: '2026-10-03T11:10:00.000Z',
      note: 'STARBUCKS',
      accountId: 'a1',
      recurrenceParentId: null,
    };
    expect(findDuplicate(base, [], [typed], new Set()).kind).toBe('possible');
    expect(findDuplicate(base, [], [typed], new Set(['t'])).kind).toBe('none');
  });

  it('recognizes a possible duplicate subscription a recurring rule already logged', () => {
    const recurring = {
      id: 'r',
      type: 'expense',
      amount: 25,
      currency: 'MYR',
      date: '2026-10-02',
      note: 'Starbucks card reload',
      accountId: 'a1',
      recurrenceParentId: 'rule-1',
    };
    expect(findDuplicate(base, [], [recurring], new Set()).kind).toBe('possible');
  });

  it('keeps separate purchases with the same amount in different accounts or merchants', () => {
    expect(findDuplicate(base, [captureRef({ accountId: 'other' })], [], new Set()).kind).toBe(
      'none',
    );
    expect(findDuplicate(base, [captureRef({ counterparty: 'SHELL' })], [], new Set()).kind).toBe(
      'none',
    );
  });

  it('keeps distinct amounts separate, including three-decimal currencies', () => {
    const incoming = { ...base, currency: 'KWD', amount: 1.25 };
    expect(
      findDuplicate(incoming, [captureRef({ currency: 'KWD', amount: 1.255 })], [], new Set()).kind,
    ).toBe('none');
    expect(
      findDuplicate({ ...base, amount: 25.01 }, [captureRef({ amount: 25 })], [], new Set()).kind,
    ).toBe('none');
  });

  it('still matches the same money despite floating-point rounding', () => {
    expect(
      findDuplicate({ ...base, amount: 0.1 + 0.2 }, [captureRef({ amount: 0.3 })], [], new Set())
        .kind,
    ).toBe('certain');
  });

  it('does not drop an identical purchase later that day or one following a failed save', () => {
    expect(
      findDuplicate(
        base,
        [captureRef({ dedupeKey: 'abc', capturedAt: '2026-10-03T08:00:00.000Z' })],
        [],
        new Set(),
      ).kind,
    ).toBe('none');
    expect(
      findDuplicate(base, [captureRef({ dedupeKey: 'abc', status: 'failed' })], [], new Set()).kind,
    ).toBe('none');
  });

  it('requires account, currency and merchant evidence for a manual or recurring match', () => {
    const typed = {
      id: 't',
      type: 'expense',
      amount: 25,
      currency: 'MYR',
      date: base.capturedAt,
      note: 'SHELL',
      accountId: 'a1',
      recurrenceParentId: null,
    };
    expect(findDuplicate(base, [], [typed], new Set()).kind).toBe('none');
    expect(
      findDuplicate(base, [], [{ ...typed, note: 'STARBUCKS', accountId: 'other' }], new Set())
        .kind,
    ).toBe('none');
    expect(
      findDuplicate(
        base,
        [],
        [{ ...typed, note: 'STARBUCKS', currency: 'USD', recurrenceParentId: 'rule' }],
        new Set(),
      ).kind,
    ).toBe('none');
  });

  it('matches merchant names written in Chinese', () => {
    const incoming = { ...base, counterparty: '星巴克' };
    expect(
      findDuplicate(incoming, [captureRef({ counterparty: '星巴克' })], [], new Set()).kind,
    ).toBe('certain');
    expect(
      findDuplicate(incoming, [captureRef({ counterparty: '麦当劳' })], [], new Set()).kind,
    ).toBe('none');
  });

  it('builds a stable key from the channel, source and text', () => {
    expect(alertDedupeKey('ios_alert', 'maybank', 'x')).toBe(
      alertDedupeKey('ios_alert', 'maybank', 'x'),
    );
    expect(alertDedupeKey('ios_alert', 'maybank', 'x')).not.toBe(
      alertDedupeKey('ios_alert', 'cimb', 'x'),
    );
  });
});

describe('resolveAlertCategory', () => {
  const categories = [
    category({ id: 'food' }),
    category({ id: 'other', name: 'Other' }),
    category({ id: 'income', name: 'Salary', type: 'income' }),
  ];
  const input = {
    kind: 'spend' as const,
    counterparty: 'SHELL',
    presetCategoryId: null,
    categories,
    defaultExpenseCategoryId: null,
    autoCategorizeByMerchant: true,
  };
  it('honors an explicit category before a keyword match', () => {
    expect(
      resolveAlertCategory({ ...input, presetCategoryId: 'other' }, { keyword: () => 'food' }),
    ).toEqual({ categoryId: 'other', origin: 'preset' });
  });
  it('falls back to an expense category when keywords do not match', () => {
    expect(resolveAlertCategory(input, { keyword: () => null })).toEqual({
      categoryId: 'other',
      origin: 'fallback',
    });
  });
  it('rejects income and deleted category matches for spending', () => {
    expect(resolveAlertCategory(input, { keyword: () => 'income' }).categoryId).toBe('other');
    expect(
      resolveAlertCategory(
        {
          ...input,
          categories: [category({ id: 'deleted', deletedAt: '2026-01-01' }), categories[1]!],
        },
        { keyword: () => 'deleted' },
      ).categoryId,
    ).toBe('other');
  });
});
