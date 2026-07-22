import {
  resolveScannedReceiptDetail,
  resolveScannedToDraft,
  type ScannedReceiptDetail,
  type ScannedTransaction,
} from '~/services/receiptScan';
import type { Account, Category } from '~/types';
import { dayKeyFromDateLocal } from '~/utils/formatters';

function cat(partial: Partial<Category> & { id: string; name: string }): Category {
  return {
    sortOrder: 0,
    type: 'expense',
    parentId: null,
    icon: '🧾',
    isDefault: false,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    ...partial,
  };
}

function acct(partial: Partial<Account> & { id: string; name: string }): Account {
  return {
    sortOrder: 0,
    type: 'debit',
    accountGroup: null,
    creditStatementDay: null,
    creditDueDay: null,
    currency: 'USD',
    startingBalance: 0,
    includeInTotals: true,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    ...partial,
  };
}

const FOOD = cat({ id: 'c_food', name: 'Food' });
const OTHER = cat({ id: 'c_other', name: 'Other' });
const SALARY = cat({ id: 'c_salary', name: 'Salary', type: 'income' });
const OTHER_INCOME = cat({ id: 'c_other_inc', name: 'Other', type: 'income' });

const ACCOUNTS = [
  acct({ id: 'a1', name: 'Cash', sortOrder: 1 }),
  acct({ id: 'a2', name: 'Card', sortOrder: 0 }),
];

function scanned(partial: Partial<ScannedTransaction>): ScannedTransaction {
  return {
    type: 'expense',
    amount: 12.5,
    currency: 'USD',
    date: '2026-05-04',
    category: 'Food',
    note: 'Joes Diner',
    sentiment: 'neutral',
    ...partial,
  };
}

const BASE_CTX = {
  categories: [FOOD, OTHER, SALARY, OTHER_INCOME],
  accounts: ACCOUNTS,
  reportingCurrency: 'USD',
};

describe('resolveScannedToDraft', () => {
  it('maps an exact category name (case-insensitive) to its id', () => {
    const draft = resolveScannedToDraft(scanned({ category: 'food' }), BASE_CTX);
    expect(draft.categoryId).toBe('c_food');
    expect(draft.type).toBe('expense');
    expect(draft.amount).toBe(12.5);
  });

  it('falls back to the "Other" category when the name is unknown', () => {
    const draft = resolveScannedToDraft(
      scanned({ category: 'Nonexistent', note: 'xyzzy' }),
      BASE_CTX,
    );
    expect(draft.categoryId).toBe('c_other');
  });

  it('prefers the user default expense category over the generic fallback', () => {
    const draft = resolveScannedToDraft(scanned({ category: 'Nonexistent', note: 'xyzzy' }), {
      ...BASE_CTX,
      defaultExpenseCategoryId: 'c_food',
    });
    expect(draft.categoryId).toBe('c_food');
  });

  it('resolves income categories for income rows', () => {
    const draft = resolveScannedToDraft(scanned({ type: 'income', category: 'Salary' }), BASE_CTX);
    expect(draft.type).toBe('income');
    expect(draft.categoryId).toBe('c_salary');
  });

  it('uses the reporting currency by default, ignoring any detected code', () => {
    expect(resolveScannedToDraft(scanned({ currency: 'eur' }), BASE_CTX).currency).toBe('USD');
    expect(resolveScannedToDraft(scanned({ currency: 'JPY' }), BASE_CTX).currency).toBe('USD');
    expect(resolveScannedToDraft(scanned({ currency: '$$$' }), BASE_CTX).currency).toBe('USD');
    expect(
      resolveScannedToDraft(scanned({ currency: 'GBP' }), { ...BASE_CTX, reportingCurrency: 'SGD' })
        .currency,
    ).toBe('SGD');
  });

  it('uses the Quick Entry default currency when set and enabled', () => {
    expect(
      resolveScannedToDraft(scanned({ currency: 'JPY' }), {
        ...BASE_CTX,
        defaultCurrency: 'EUR',
        fxCurrencies: ['EUR'],
      }).currency,
    ).toBe('EUR');
    // An account's own currency also counts as enabled.
    expect(
      resolveScannedToDraft(scanned({}), {
        ...BASE_CTX,
        accounts: [acct({ id: 'a3', name: 'Yen wallet', currency: 'JPY' })],
        defaultCurrency: 'JPY',
      }).currency,
    ).toBe('JPY');
    // Falls back to the reporting currency when the default is null/empty.
    expect(
      resolveScannedToDraft(scanned({}), { ...BASE_CTX, defaultCurrency: null }).currency,
    ).toBe('USD');
  });

  it('ignores a stale default currency that is no longer enabled', () => {
    // Quick add persists the last-used entry currency, so a code can linger
    // after its sub-currency was removed (e.g. JPY from a trip). The scan must
    // agree with the settings UI — which shows "match the account currency" —
    // and fall back to the reporting currency, not record in the stale code.
    expect(
      resolveScannedToDraft(scanned({}), { ...BASE_CTX, defaultCurrency: 'JPY' }).currency,
    ).toBe('USD');
    expect(
      resolveScannedToDraft(scanned({}), {
        ...BASE_CTX,
        defaultCurrency: 'JPY',
        fxCurrencies: ['EUR'],
      }).currency,
    ).toBe('USD');
  });

  it('uses the worker-validated receipt date as-is', () => {
    // The 30-day window is enforced on the Worker, not here — whatever date it
    // sends is trusted.
    expect(resolveScannedToDraft(scanned({ date: '2026-05-04' }), BASE_CTX).date).toBe(
      '2026-05-04',
    );
  });

  it('falls back to today when no date was sent (older workers)', () => {
    const today = dayKeyFromDateLocal(new Date());
    expect(resolveScannedToDraft(scanned({ date: null }), BASE_CTX).date).toBe(today);
  });

  it('uses the simple-mode wallet as the account when provided', () => {
    const draft = resolveScannedToDraft(scanned({}), {
      ...BASE_CTX,
      simpleWalletId: 'wallet-1',
      defaultAccountId: 'a1',
    });
    expect(draft.accountId).toBe('wallet-1');
  });

  it('uses the default account when set and present', () => {
    const draft = resolveScannedToDraft(scanned({}), { ...BASE_CTX, defaultAccountId: 'a1' });
    expect(draft.accountId).toBe('a1');
  });

  it('falls back to the lowest-sortOrder account otherwise', () => {
    const draft = resolveScannedToDraft(scanned({}), BASE_CTX);
    expect(draft.accountId).toBe('a2');
  });

  it('posts to the detected account on an exact name match (screenshot mode)', () => {
    const draft = resolveScannedToDraft(scanned({ account: 'Cash' }), {
      ...BASE_CTX,
      defaultAccountId: 'a2',
    });
    expect(draft.accountId).toBe('a1');
  });

  it('matches the detected account name case-insensitively with whitespace tolerance', () => {
    const draft = resolveScannedToDraft(scanned({ account: '  cAsH ' }), BASE_CTX);
    expect(draft.accountId).toBe('a1');
  });

  it('falls back to the default account when no account was detected', () => {
    expect(
      resolveScannedToDraft(scanned({ account: '' }), { ...BASE_CTX, defaultAccountId: 'a1' })
        .accountId,
    ).toBe('a1');
    expect(
      resolveScannedToDraft(scanned({}), { ...BASE_CTX, defaultAccountId: 'a1' }).accountId,
    ).toBe('a1');
  });

  it('falls back to the default account when the detected name matches nothing', () => {
    // e.g. the account was renamed between catalog and response, or the model
    // hallucinated a name despite the prompt.
    const draft = resolveScannedToDraft(scanned({ account: 'Old Visa' }), {
      ...BASE_CTX,
      defaultAccountId: 'a1',
    });
    expect(draft.accountId).toBe('a1');
  });

  it('ignores the detected account in simple mode — everything posts to the wallet', () => {
    const draft = resolveScannedToDraft(scanned({ account: 'Cash' }), {
      ...BASE_CTX,
      simpleWalletId: 'wallet-1',
    });
    expect(draft.accountId).toBe('wallet-1');
  });

  it('nulls an empty note', () => {
    const draft = resolveScannedToDraft(scanned({ note: '   ' }), BASE_CTX);
    expect(draft.note).toBeNull();
  });
});

describe('resolveScannedReceiptDetail', () => {
  function detail(partial: Partial<ScannedReceiptDetail> = {}): ScannedReceiptDetail {
    return {
      merchant: 'Sushi Bar',
      date: '2026-07-01',
      currency: null,
      items: [
        { name: 'Salmon roll', quantity: 2, lineTotal: 20, confidence: 'high' },
        { name: 'Green tea', quantity: 1, lineTotal: 4, confidence: 'low' },
      ],
      itemsConfidence: 'high',
      ...partial,
    };
  }

  it('maps items and defaults into a launch seed', () => {
    const seed = resolveScannedReceiptDetail(detail(), scanned({}), BASE_CTX, 'receipts/x.jpg');
    expect(seed.items).toHaveLength(2);
    expect(seed.items[0]).toEqual({
      name: 'Salmon roll',
      quantity: 2,
      lineTotal: 20,
      lowConfidence: undefined,
    });
    expect(seed.items[1]!.lowConfidence).toBe(true);
    expect(seed.merchant).toBe('Sushi Bar');
    expect(seed.receiptUri).toBe('receipts/x.jpg');
    expect(seed.accountId).toBe('a2');
  });

  it('seeds the split with the worker-validated receipt date', () => {
    const seed = resolveScannedReceiptDetail(
      detail({ date: '2026-07-01' }),
      scanned({}),
      BASE_CTX,
      null,
    );
    expect(seed.date).toBe('2026-07-01');
  });

  it('falls back to the transaction date, then null, when the detail has none', () => {
    expect(
      resolveScannedReceiptDetail(
        detail({ date: null }),
        scanned({ date: '2026-07-02' }),
        BASE_CTX,
        null,
      ).date,
    ).toBe('2026-07-02');
    // Older workers may send neither — null lets the editor fall back to today.
    expect(
      resolveScannedReceiptDetail(detail({ date: null }), scanned({ date: null }), BASE_CTX, null)
        .date,
    ).toBeNull();
  });

  it('ignores a stale default currency when no receipt currency was detected', () => {
    expect(
      resolveScannedReceiptDetail(
        detail({ currency: null }),
        scanned({}),
        {
          ...BASE_CTX,
          defaultCurrency: 'JPY',
        },
        null,
      ).currency,
    ).toBe('USD');
  });

  it('prefers the detected receipt currency over the defaults', () => {
    expect(
      resolveScannedReceiptDetail(detail({ currency: 'MYR' }), scanned({}), BASE_CTX, null)
        .currency,
    ).toBe('MYR');
    expect(
      resolveScannedReceiptDetail(detail({ currency: null }), scanned({}), BASE_CTX, null).currency,
    ).toBe('USD');
  });

  it('drops unnamed and zero-quantity items', () => {
    const seed = resolveScannedReceiptDetail(
      detail({
        items: [
          { name: '   ', quantity: 1, lineTotal: 5, confidence: 'high' },
          { name: 'Bread', quantity: 0, lineTotal: 3, confidence: 'high' },
        ],
      }),
      scanned({}),
      BASE_CTX,
      null,
    );
    expect(seed.items).toHaveLength(1);
    expect(seed.items[0]!.quantity).toBe(1);
  });

  it('flags a low-confidence scan', () => {
    expect(
      resolveScannedReceiptDetail(detail({ itemsConfidence: 'low' }), scanned({}), BASE_CTX, null)
        .lowConfidence,
    ).toBe(true);
  });
});
