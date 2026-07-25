import {
  buildExcelSheets,
  excelExportFileName,
  type ExcelExportData,
  type ExcelExportLabels,
} from '~/services/excelExportService';
import type {
  Account,
  Category,
  RecurringTransactionRule,
  TransactionWithRelations,
} from '~/types';

// Native modules pulled in at module load but only used by the file-write /
// share path, which this suite doesn't exercise.
jest.mock('expo-file-system/next', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({}));

// Identity labels keep the assertions readable: a header cell shows the label
// key it came from, so a mis-wired column is obvious in the failure output.
const LABELS = new Proxy({} as ExcelExportLabels, {
  get: (_target, key) => (key === 'yes' ? 'Yes' : key === 'no' ? 'No' : String(key)),
});

function transaction(overrides: Partial<TransactionWithRelations> = {}): TransactionWithRelations {
  return {
    id: 't1',
    type: 'expense',
    amount: 12.5,
    currency: 'MYR',
    reportingCurrency: 'MYR',
    reportingAmount: 12.5,
    fxRate: 1,
    toAmount: null,
    accountAmount: null,
    date: '2024-05-02',
    accountId: 'a1',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'c1',
    note: 'Lunch',
    receiptUri: null,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'neutral',
    createdAt: '2024-05-02T10:00:00.000Z',
    updatedAt: '2024-05-02T10:00:00.000Z',
    deletedAt: null,
    accountName: 'Cash',
    categoryName: 'Food',
    ...overrides,
  };
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Cash',
    type: 'debit',
    accountGroup: 'Daily',
    creditStatementDay: null,
    creditDueDay: null,
    currency: 'MYR',
    startingBalance: 100,
    includeInTotals: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'c1',
    name: 'Food',
    type: 'expense',
    parentId: null,
    icon: '🍜',
    isDefault: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function rule(overrides: Partial<RecurringTransactionRule> = {}): RecurringTransactionRule {
  return {
    id: 'r1',
    name: 'Rent',
    type: 'expense',
    amount: 1200,
    currency: 'MYR',
    toAmount: null,
    accountId: 'a1',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'c1',
    note: null,
    recurrencePattern: 'monthly',
    recurrenceInterval: 1,
    nextRunDate: '2024-06-01',
    endDate: null,
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function data(overrides: Partial<ExcelExportData> = {}): ExcelExportData {
  return {
    transactions: [transaction()],
    accounts: [account()],
    categories: [category()],
    recurringRules: [],
    labels: LABELS,
    ...overrides,
  };
}

describe('buildExcelSheets', () => {
  it('builds a transactions, accounts and categories sheet', () => {
    expect(buildExcelSheets(data()).map((sheet) => sheet.name)).toEqual([
      'sheetTransactions',
      'sheetAccounts',
      'sheetCategories',
    ]);
  });

  it('appends the recurring sheet only when rules exist', () => {
    const withRules = buildExcelSheets(data({ recurringRules: [rule()] }));
    expect(withRules.map((sheet) => sheet.name)).toContain('sheetRecurring');
  });

  it('orders transactions oldest first, tie-broken by creation time', () => {
    const rows = buildExcelSheets(
      data({
        transactions: [
          transaction({ id: 'c', date: '2024-05-10', note: 'third' }),
          transaction({
            id: 'b',
            date: '2024-05-02',
            createdAt: '2024-05-02T12:00:00.000Z',
            note: 'second',
          }),
          transaction({
            id: 'a',
            date: '2024-05-02',
            createdAt: '2024-05-02T09:00:00.000Z',
            note: 'first',
          }),
        ],
      }),
    )[0].rows;
    expect(rows.map((row) => row[11])).toEqual(['first', 'second', 'third']);
  });

  it('splits a subcategory into its root category and leaf', () => {
    const rows = buildExcelSheets(
      data({
        transactions: [
          transaction({ categoryName: 'Groceries', categoryParentName: 'Food' }),
          transaction({ categoryName: 'Food', categoryParentName: null }),
          transaction({ categoryName: null }),
        ],
      }),
    )[0].rows;
    expect(rows.map((row) => [row[9], row[10]])).toEqual([
      ['Food', 'Groceries'],
      ['Food', ''],
      ['', ''],
    ]);
  });

  it('writes the transaction date as a date cell and keeps the FX snapshot', () => {
    const [row] = buildExcelSheets(
      data({ transactions: [transaction({ reportingCurrency: 'USD', reportingAmount: 2.8 })] }),
    )[0].rows;
    expect(row[0]).toEqual({ kind: 'date', iso: '2024-05-02' });
    expect(row[2]).toBe(12.5);
    expect(row[3]).toBe('MYR');
    expect(row[4]).toBe(2.8);
    expect(row[5]).toBe('USD');
  });

  it('flags recurring transactions with a yes/no value', () => {
    const rows = buildExcelSheets(
      data({
        transactions: [
          transaction({ recurrencePattern: 'none' }),
          transaction({ recurrencePattern: 'monthly' }),
        ],
      }),
    )[0].rows;
    expect(rows.map((row) => row[13])).toEqual(['No', 'Yes']);
  });

  it('resolves the transfer account names', () => {
    const [row] = buildExcelSheets(
      data({
        transactions: [
          transaction({
            type: 'transfer',
            accountName: null,
            fromAccountName: 'Cash',
            toAccountName: 'Savings',
          }),
        ],
      }),
    )[0].rows;
    expect([row[6], row[7], row[8]]).toEqual(['', 'Cash', 'Savings']);
  });

  it('resolves the parent name on the categories sheet', () => {
    const rows = buildExcelSheets(
      data({
        categories: [
          category({ id: 'c1', name: 'Food' }),
          category({ id: 'c2', name: 'Groceries', parentId: 'c1' }),
          category({ id: 'c3', name: 'Orphan', parentId: 'gone' }),
        ],
      }),
    )[2].rows;
    expect(rows.map((row) => row[2])).toEqual(['', 'Food', '']);
  });

  it('renders account flags as yes/no', () => {
    const rows = buildExcelSheets(
      data({
        accounts: [
          account({ id: 'a1', includeInTotals: true }),
          account({ id: 'a2', accountGroup: null, includeInTotals: false }),
        ],
      }),
    )[1].rows;
    expect(rows.map((row) => [row[1], row[5]])).toEqual([
      ['Daily', 'Yes'],
      ['', 'No'],
    ]);
  });

  it('writes both sides of a recurring transfer rule', () => {
    const rows = buildExcelSheets(
      data({
        accounts: [account({ id: 'a1', name: 'Cash' }), account({ id: 'a2', name: 'Savings' })],
        recurringRules: [
          rule({ type: 'transfer', accountId: null, fromAccountId: 'a2', toAccountId: 'a1' }),
        ],
      }),
    )[3].rows;
    // account, fromAccount, toAccount: a transfer fills only the last two, and
    // the importer needs both to rebuild the rule.
    expect([rows[0][4], rows[0][5], rows[0][6]]).toEqual(['', 'Savings', 'Cash']);
    expect(rows[0][10]).toEqual({ kind: 'date', iso: '2024-06-01' });
    expect(rows[0][11]).toBeNull();
  });

  it('handles a completely empty database', () => {
    const sheets = buildExcelSheets(
      data({ transactions: [], accounts: [], categories: [], recurringRules: [] }),
    );
    expect(sheets).toHaveLength(3);
    expect(sheets.every((sheet) => sheet.rows.length === 0)).toBe(true);
  });
});

describe('excelExportFileName', () => {
  it('stamps the local date and time into the file name', () => {
    expect(excelExportFileName(new Date(2024, 2, 5, 9, 7))).toBe('money2time-2024-03-05-0907.xlsx');
  });
});
