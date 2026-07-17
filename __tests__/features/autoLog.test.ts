import {
  AUTOLOG_UPSERT_WINDOW_SECONDS,
  type AutoLogPendingEntry,
  type AutoLogResolveContext,
  parseAutoLogAmount,
  parseAutoLogPendingJson,
  parseAutoLogPendingScansJson,
  resolveAutoLogEntry,
  selectDrainableAutoLogEntries,
} from '~/features/transactions/lib/autoLog';
import type { Account, Category } from '~/types';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Main',
    sortOrder: 0,
    type: 'debit',
    accountGroup: null,
    logoId: null,
    creditStatementDay: null,
    creditDueDay: null,
    currency: 'USD',
    startingBalance: 0,
    includeInTotals: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'c1',
    name: 'Food',
    sortOrder: 0,
    type: 'expense',
    parentId: null,
    icon: '🍔',
    isDefault: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function entry(overrides: Partial<AutoLogPendingEntry> = {}): AutoLogPendingEntry {
  return {
    id: 'e1',
    createdAt: '2026-07-15T10:30:00.000Z',
    amountRaw: '$12.34',
    merchant: 'Starbucks',
    cardName: 'Amex',
    accountId: null,
    categoryId: null,
    provisional: false,
    ...overrides,
  };
}

function ctx(overrides: Partial<AutoLogResolveContext> = {}): AutoLogResolveContext {
  return {
    accounts: [account()],
    categories: [category()],
    isSimpleMode: false,
    simpleWalletId: null,
    defaultAccountId: null,
    defaultExpenseCategoryId: null,
    reportingCurrency: 'USD',
    ...overrides,
  };
}

describe('parseAutoLogAmount', () => {
  it('parses a plain en-US amount', () => {
    expect(parseAutoLogAmount('12.34')).toEqual({ amount: 12.34, currency: null });
  });

  it('parses grouped en-US amounts', () => {
    expect(parseAutoLogAmount('£1,234.56')).toEqual({ amount: 1234.56, currency: 'GBP' });
    expect(parseAutoLogAmount('$1,234.00')).toEqual({ amount: 1234, currency: null });
  });

  it('parses comma-decimal (de/fr) amounts', () => {
    expect(parseAutoLogAmount('€12,34')).toEqual({ amount: 12.34, currency: 'EUR' });
    expect(parseAutoLogAmount('1.234,56')).toEqual({ amount: 1234.56, currency: null });
    expect(parseAutoLogAmount('1.234.567,89')).toEqual({ amount: 1234567.89, currency: null });
  });

  it('treats a lone separator with three trailing digits as a thousands mark', () => {
    expect(parseAutoLogAmount('1,234')?.amount).toBe(1234);
    expect(parseAutoLogAmount('1.234')?.amount).toBe(1234);
  });

  it('treats a lone separator with fewer than three trailing digits as a decimal', () => {
    expect(parseAutoLogAmount('12,5')?.amount).toBe(12.5);
    expect(parseAutoLogAmount('12,50')?.amount).toBe(12.5);
  });

  it('reads an explicit ISO code in either position', () => {
    expect(parseAutoLogAmount('SGD 12.34')).toEqual({ amount: 12.34, currency: 'SGD' });
    expect(parseAutoLogAmount('12.34 USD')).toEqual({ amount: 12.34, currency: 'USD' });
  });

  it('ignores three-letter tokens that are not real currencies', () => {
    expect(parseAutoLogAmount('XYZ 12.34')).toEqual({ amount: 12.34, currency: null });
  });

  it('resolves unambiguous symbols', () => {
    expect(parseAutoLogAmount('RM12.34')?.currency).toBe('MYR');
    expect(parseAutoLogAmount('₹500')?.currency).toBe('INR');
    expect(parseAutoLogAmount('R$12,34')?.currency).toBe('BRL');
  });

  it('refuses to guess an ambiguous symbol, leaving the account currency to win', () => {
    // `$` spans USD/CAD/AUD/SGD; `¥` spans JPY/CNY; `kr` spans SEK/NOK/DKK.
    expect(parseAutoLogAmount('$12.34')?.currency).toBeNull();
    expect(parseAutoLogAmount('¥1,234')?.currency).toBeNull();
    expect(parseAutoLogAmount('12,50 kr')?.currency).toBeNull();
  });

  it('logs a refund as a positive magnitude', () => {
    expect(parseAutoLogAmount('-$12.34')?.amount).toBe(12.34);
  });

  it('rejects unusable input', () => {
    expect(parseAutoLogAmount('')).toBeNull();
    expect(parseAutoLogAmount('abc')).toBeNull();
    expect(parseAutoLogAmount('$')).toBeNull();
    expect(parseAutoLogAmount('$0.00')).toBeNull();
  });
});

describe('parseAutoLogPendingJson', () => {
  it('reads a well-formed queue', () => {
    const json = JSON.stringify([entry({ id: 'e1' }), entry({ id: 'e2', provisional: true })]);
    const parsed = parseAutoLogPendingJson(json);
    expect(parsed.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(parsed[1].provisional).toBe(true);
  });

  it('degrades to empty rather than throwing on a malformed blob', () => {
    // A half-written or corrupt App Group value must not break a foreground.
    expect(parseAutoLogPendingJson(null)).toEqual([]);
    expect(parseAutoLogPendingJson('')).toEqual([]);
    expect(parseAutoLogPendingJson('not json')).toEqual([]);
    expect(parseAutoLogPendingJson('{"not":"an array"}')).toEqual([]);
    expect(parseAutoLogPendingJson('[1, null, "x"]')).toEqual([]);
  });

  it('drops entries missing the fields a transaction cannot be built without', () => {
    const json = JSON.stringify([
      { amountRaw: '$1.00' },
      { id: 'e2' },
      { id: '', amountRaw: '$1.00' },
      { id: 'ok', amountRaw: '$1.00' },
    ]);
    expect(parseAutoLogPendingJson(json).map((e) => e.id)).toEqual(['ok']);
  });

  it('defaults optional fields rather than dropping the entry', () => {
    const json = JSON.stringify([{ id: 'e1', amountRaw: '$1.00' }]);
    expect(parseAutoLogPendingJson(json)[0]).toMatchObject({
      merchant: null,
      cardName: null,
      accountId: null,
      categoryId: null,
      provisional: false,
    });
    expect(parseAutoLogPendingJson(json)[0].createdAt).toEqual(expect.any(String));
  });
});

describe('parseAutoLogPendingScansJson', () => {
  it('reads a well-formed queue', () => {
    const json = JSON.stringify([
      { id: 's1', createdAt: '2026-07-15T12:00:00.000Z', path: '/group/autolog-scans/s1.png' },
      { id: 's2', createdAt: '2026-07-15T12:01:00.000Z', path: '/group/autolog-scans/s2.jpg' },
    ]);
    const parsed = parseAutoLogPendingScansJson(json);
    expect(parsed.map((e) => e.id)).toEqual(['s1', 's2']);
    expect(parsed[0].path).toBe('/group/autolog-scans/s1.png');
  });

  it('degrades to empty rather than throwing on a malformed blob', () => {
    expect(parseAutoLogPendingScansJson(null)).toEqual([]);
    expect(parseAutoLogPendingScansJson('')).toEqual([]);
    expect(parseAutoLogPendingScansJson('not json')).toEqual([]);
    expect(parseAutoLogPendingScansJson('{"not":"an array"}')).toEqual([]);
    expect(parseAutoLogPendingScansJson('[1, null, "x"]')).toEqual([]);
  });

  it('drops entries missing the id or path the drain cannot work without', () => {
    const json = JSON.stringify([
      { path: '/a.png' },
      { id: 's2' },
      { id: '', path: '/a.png' },
      { id: 'ok', path: '/a.png' },
    ]);
    expect(parseAutoLogPendingScansJson(json).map((e) => e.id)).toEqual(['ok']);
  });

  it('defaults a missing createdAt rather than dropping the entry', () => {
    const json = JSON.stringify([{ id: 's1', path: '/a.png' }]);
    expect(parseAutoLogPendingScansJson(json)[0].createdAt).toEqual(expect.any(String));
  });
});

describe('selectDrainableAutoLogEntries', () => {
  const now = new Date('2026-07-15T12:00:00.000Z');
  const secondsAgo = (n: number) => new Date(now.getTime() - n * 1000).toISOString();

  it('drains a settled entry immediately', () => {
    const entries = [entry({ id: 'e1', provisional: false, createdAt: secondsAgo(1) })];
    expect(selectDrainableAutoLogEntries(entries, now).map((e) => e.id)).toEqual(['e1']);
  });

  it('holds a provisional entry while the prompt could still be answered', () => {
    // Draining now would race the user's pick and silently discard it.
    const entries = [
      entry({ id: 'e1', provisional: true, createdAt: secondsAgo(5) }),
      entry({ id: 'e2', provisional: true, createdAt: secondsAgo(AUTOLOG_UPSERT_WINDOW_SECONDS) }),
    ];
    expect(selectDrainableAutoLogEntries(entries, now)).toEqual([]);
  });

  it('drains a provisional entry once the prompt window has passed', () => {
    // An ignored prompt must still leave a logged transaction.
    const entries = [
      entry({
        id: 'e1',
        provisional: true,
        createdAt: secondsAgo(AUTOLOG_UPSERT_WINDOW_SECONDS + 1),
      }),
    ];
    expect(selectDrainableAutoLogEntries(entries, now).map((e) => e.id)).toEqual(['e1']);
  });

  it('drains rather than strands an entry with an unreadable timestamp', () => {
    const entries = [entry({ id: 'e1', provisional: true, createdAt: 'not-a-date' })];
    expect(selectDrainableAutoLogEntries(entries, now).map((e) => e.id)).toEqual(['e1']);
  });
});

describe('resolveAutoLogEntry', () => {
  it('always logs an expense with the merchant as the note', () => {
    const result = resolveAutoLogEntry(entry(), ctx());
    expect(result).toMatchObject({ type: 'expense', amount: 12.34, note: 'Starbucks' });
  });

  it('dates the transaction from the tap, as a local day key', () => {
    const result = resolveAutoLogEntry(entry({ createdAt: '2026-07-15T10:30:00.000Z' }), ctx());
    expect(result?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('drops an entry whose amount cannot be parsed', () => {
    expect(resolveAutoLogEntry(entry({ amountRaw: 'n/a' }), ctx())).toBeNull();
  });

  it('drops an empty or zero amount rather than posting a bogus row', () => {
    // The native intent now gates these out before they queue (an empty Amount
    // is what iOS hands over for some Wallet transactions; $0.00 is an auth
    // hold), but the drain stays the backstop for any that predate that gate.
    expect(resolveAutoLogEntry(entry({ amountRaw: '' }), ctx())).toBeNull();
    expect(resolveAutoLogEntry(entry({ amountRaw: '$0.00' }), ctx())).toBeNull();
  });

  it('nulls the note when the merchant is missing or blank', () => {
    expect(resolveAutoLogEntry(entry({ merchant: null }), ctx())?.note).toBeNull();
    expect(resolveAutoLogEntry(entry({ merchant: '   ' }), ctx())?.note).toBeNull();
  });

  describe('account precedence', () => {
    const accounts = [
      account({ id: 'a1', name: 'First', sortOrder: 0 }),
      account({ id: 'a2', name: 'Saved', sortOrder: 1 }),
      account({ id: 'a3', name: 'Tied', sortOrder: 2 }),
    ];

    it('honours the account the automation tied to the card', () => {
      const result = resolveAutoLogEntry(
        entry({ accountId: 'a3' }),
        ctx({ accounts, defaultAccountId: 'a2' }),
      );
      expect(result?.accountId).toBe('a3');
    });

    it('falls back to the saved default when no account was tied', () => {
      const result = resolveAutoLogEntry(entry(), ctx({ accounts, defaultAccountId: 'a2' }));
      expect(result?.accountId).toBe('a2');
    });

    it('falls back to the saved default when the tied account no longer exists', () => {
      const result = resolveAutoLogEntry(
        entry({ accountId: 'deleted' }),
        ctx({ accounts, defaultAccountId: 'a2' }),
      );
      expect(result?.accountId).toBe('a2');
    });

    it('falls back to the first account by sort order when there is no default', () => {
      const result = resolveAutoLogEntry(entry(), ctx({ accounts }));
      expect(result?.accountId).toBe('a1');
    });

    it('forces the simple wallet in simple mode, ignoring the tied account', () => {
      const result = resolveAutoLogEntry(
        entry({ accountId: 'a3' }),
        ctx({ accounts, isSimpleMode: true, simpleWalletId: 'wallet' }),
      );
      expect(result?.accountId).toBe('wallet');
    });
  });

  describe('category precedence', () => {
    const categories = [
      category({ id: 'c1', name: 'Food', sortOrder: 0 }),
      category({ id: 'c2', name: 'Transport', sortOrder: 1 }),
      category({ id: 'c3', name: 'Other', sortOrder: 2 }),
      category({ id: 'i1', name: 'Salary', type: 'income' }),
    ];

    it('honours a category answered at the prompt', () => {
      const result = resolveAutoLogEntry(
        entry({ categoryId: 'c2' }),
        ctx({ categories, defaultExpenseCategoryId: 'c1' }),
      );
      expect(result?.categoryId).toBe('c2');
    });

    it('falls back to the default when the prompt went unanswered', () => {
      const result = resolveAutoLogEntry(
        entry(),
        ctx({ categories, defaultExpenseCategoryId: 'c1' }),
      );
      expect(result?.categoryId).toBe('c1');
    });

    it('falls back to "Other" when there is no default', () => {
      expect(resolveAutoLogEntry(entry(), ctx({ categories }))?.categoryId).toBe('c3');
    });

    it('rejects an income category and falls back', () => {
      const result = resolveAutoLogEntry(entry({ categoryId: 'i1' }), ctx({ categories }));
      expect(result?.categoryId).toBe('c3');
    });

    it('rejects a stale category and falls back', () => {
      const result = resolveAutoLogEntry(entry({ categoryId: 'gone' }), ctx({ categories }));
      expect(result?.categoryId).toBe('c3');
    });

    it('leaves the category null when the user has no expense categories', () => {
      expect(resolveAutoLogEntry(entry(), ctx({ categories: [] }))?.categoryId).toBeNull();
    });
  });

  describe('currency', () => {
    it('trusts a currency the amount identified beyond doubt', () => {
      const result = resolveAutoLogEntry(
        entry({ amountRaw: '€12,34' }),
        ctx({ accounts: [account({ currency: 'MYR' })] }),
      );
      expect(result?.currency).toBe('EUR');
    });

    it("uses the account's currency when the symbol was ambiguous", () => {
      const result = resolveAutoLogEntry(
        entry({ amountRaw: '$12.34' }),
        ctx({ accounts: [account({ currency: 'SGD' })], reportingCurrency: 'USD' }),
      );
      expect(result?.currency).toBe('SGD');
    });

    it('falls back to the reporting currency when there is no account', () => {
      const result = resolveAutoLogEntry(
        entry({ amountRaw: '$12.34' }),
        ctx({ accounts: [], reportingCurrency: 'MYR' }),
      );
      expect(result?.currency).toBe('MYR');
    });
  });
});
