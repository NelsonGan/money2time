import {
  resolveScannedItemsToSplits,
  resolveScannedToDraft,
  type ScannedItem,
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

describe('resolveScannedItemsToSplits', () => {
  const items = (list: ScannedItem[]) => list;

  it('maps each item to an unassigned split row carrying its name and price', () => {
    const rows = resolveScannedItemsToSplits(
      items([
        { name: 'Latte', amount: 4.5 },
        { name: '2x Croissant', amount: 7 },
      ]),
      { defaultAccountId: 'a1' },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      personName: '',
      amount: '4.50',
      isSelf: false,
      note: 'Latte',
      paybackAccountId: 'a1',
    });
    expect(rows[1].note).toBe('2x Croissant');
    expect(rows[1].amount).toBe('7.00');
  });

  it('drops blank-name and non-positive rows', () => {
    const rows = resolveScannedItemsToSplits(
      items([
        { name: '  ', amount: 3 },
        { name: 'Water', amount: 0 },
        { name: 'Soda', amount: -1 },
        { name: 'Fries', amount: 2.2 },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe('Fries');
    expect(rows[0].paybackAccountId).toBeNull();
  });

  it('rounds amounts to 2 decimals', () => {
    const rows = resolveScannedItemsToSplits(items([{ name: 'Split', amount: 3.333 }]));
    expect(rows[0].amount).toBe('3.33');
  });
});
