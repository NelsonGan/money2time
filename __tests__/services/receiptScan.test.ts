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

  it('uses the Quick Entry default currency when set', () => {
    expect(
      resolveScannedToDraft(scanned({ currency: 'JPY' }), { ...BASE_CTX, defaultCurrency: 'EUR' })
        .currency,
    ).toBe('EUR');
    // Falls back to the reporting currency when the default is null/empty.
    expect(
      resolveScannedToDraft(scanned({}), { ...BASE_CTX, defaultCurrency: null }).currency,
    ).toBe('USD');
  });

  it('always uses today, ignoring the receipt date', () => {
    const today = dayKeyFromDateLocal(new Date());
    expect(resolveScannedToDraft(scanned({ date: '2020-01-01' }), BASE_CTX).date).toBe(today);
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
        { name: 'Salmon roll', quantity: 2, unitPrice: 10, lineTotal: 20, confidence: 'high' },
        { name: 'Green tea', quantity: 1, unitPrice: null, lineTotal: 4, confidence: 'low' },
      ],
      subtotal: 24,
      tax: 2,
      serviceCharge: 1,
      discount: 0,
      roundingAdjustment: 0,
      total: 27,
      itemsConfidence: 'high',
      ...partial,
    };
  }

  it('maps items, totals, and defaults into a launch seed', () => {
    const seed = resolveScannedReceiptDetail(detail(), scanned({}), BASE_CTX, 'receipts/x.jpg');
    expect(seed).not.toBeNull();
    expect(seed!.items).toHaveLength(2);
    expect(seed!.items[0]).toEqual({
      name: 'Salmon roll',
      quantity: 2,
      unitPrice: 10,
      lineTotal: 20,
      lowConfidence: undefined,
    });
    expect(seed!.items[1]!.lowConfidence).toBe(true);
    expect(seed!.tax).toBe(2);
    expect(seed!.service).toBe(1);
    expect(seed!.total).toBe(27);
    expect(seed!.merchant).toBe('Sushi Bar');
    expect(seed!.date).toBe('2026-07-01');
    expect(seed!.receiptUri).toBe('receipts/x.jpg');
    expect(seed!.accountId).toBe('a2');
  });

  it('prefers the detected receipt currency over the defaults', () => {
    expect(
      resolveScannedReceiptDetail(detail({ currency: 'MYR' }), scanned({}), BASE_CTX, null)!
        .currency,
    ).toBe('MYR');
    expect(
      resolveScannedReceiptDetail(detail({ currency: null }), scanned({}), BASE_CTX, null)!
        .currency,
    ).toBe('USD');
  });

  it('drops unnamed items and rejects a detail without a positive total', () => {
    const seed = resolveScannedReceiptDetail(
      detail({
        items: [
          { name: '   ', quantity: 1, unitPrice: null, lineTotal: 5, confidence: 'high' },
          { name: 'Bread', quantity: 0, unitPrice: null, lineTotal: 3, confidence: 'high' },
        ],
      }),
      scanned({}),
      BASE_CTX,
      null,
    );
    expect(seed!.items).toHaveLength(1);
    expect(seed!.items[0]!.quantity).toBe(1);
    expect(
      resolveScannedReceiptDetail(detail({ total: 0 }), scanned({}), BASE_CTX, null),
    ).toBeNull();
  });

  it('flags a low-confidence scan', () => {
    expect(
      resolveScannedReceiptDetail(detail({ itemsConfidence: 'low' }), scanned({}), BASE_CTX, null)!
        .lowConfidence,
    ).toBe(true);
  });
});
