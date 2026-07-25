import { buildExcelSheets } from '~/services/excelExportService';
import {
  parseExcelWorkbook,
  resolveColumns,
  toDayKey,
  toNumber,
} from '~/services/excelImportService';
import {
  ENGLISH_EXCEL_LABELS,
  type ExcelExportLabels,
  TRANSACTION_COLUMNS,
} from '~/services/excelWorkbookSchema';
import type {
  Account,
  Category,
  RecurringTransactionRule,
  TransactionWithRelations,
} from '~/types';
import { buildXlsx } from '~/utils/xlsx';
import { readXlsx, type XlsxReadCell, type XlsxWorkbook } from '~/utils/xlsxReader';

// Native modules pulled in at module load but only used by the file-reading
// and sharing paths, which this suite doesn't exercise.
jest.mock('expo-file-system/next', () => ({ File: class {}, Paths: {} }));
jest.mock('expo-sharing', () => ({}));

const EN = ENGLISH_EXCEL_LABELS;

/** A stand-in for a device running in another language. */
const JA: ExcelExportLabels = {
  ...EN,
  sheetTransactions: '取引',
  sheetAccounts: '口座',
  sheetCategories: 'カテゴリ',
  sheetRecurring: '定期',
  date: '日付',
  type: '種類',
  amount: '金額',
  currency: '通貨',
  account: '口座',
  category: 'カテゴリ',
  note: 'メモ',
  name: '名前',
  yes: 'はい',
  no: 'いいえ',
};

function workbook(sheets: { name: string; rows: XlsxReadCell[][] }[]): XlsxWorkbook {
  return { sheets };
}

function parse(sheets: { name: string; rows: XlsxReadCell[][] }[], labels: ExcelExportLabels = EN) {
  return parseExcelWorkbook(workbook(sheets), { labels, fallbackCurrency: 'MYR' });
}

const TX_HEADER = TRANSACTION_COLUMNS.map((column) => EN[column]);

function txSheet(rows: XlsxReadCell[][], name = EN.sheetTransactions) {
  return { name, rows: [TX_HEADER, ...rows] };
}

describe('toNumber', () => {
  it('passes through real numbers', () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber(0)).toBe(0);
    expect(toNumber(-3)).toBe(-3);
  });

  it('parses plain and group-separated numeric text', () => {
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber('1,234.56')).toBe(1234.56);
    expect(toNumber(' 42 ')).toBe(42);
  });

  it('parses dot-grouped, comma-decimal numbers', () => {
    expect(toNumber('1.234,56')).toBe(1234.56);
    expect(toNumber('-1.234.567,89')).toBe(-1234567.89);
  });

  it('rejects anything that is not a number', () => {
    expect(toNumber('abc')).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(true)).toBeNull();
  });
});

describe('toDayKey', () => {
  it('accepts the day keys the reader produces', () => {
    expect(toDayKey('2024-05-02')).toBe('2024-05-02');
    expect(toDayKey('2024-05-02T10:00:00.000Z')).toBe('2024-05-02');
  });

  it('accepts year-first slash dates and raw serials', () => {
    expect(toDayKey('2024/5/2')).toBe('2024-05-02');
    expect(toDayKey(45414)).toBe('2024-05-02');
    expect(toDayKey('45414')).toBe('2024-05-02');
  });

  it('refuses ambiguous day/month orderings rather than guessing', () => {
    expect(toDayKey('03/05/2024')).toBeNull();
    expect(toDayKey('5 May 2024')).toBeNull();
  });

  it('returns null for empty and unparseable values', () => {
    expect(toDayKey(null)).toBeNull();
    expect(toDayKey('')).toBeNull();
    expect(toDayKey('soon')).toBeNull();
  });
});

describe('resolveColumns', () => {
  it('maps headers by name, in any order', () => {
    const { indexByField, matchedHeader } = resolveColumns(
      [EN.amount, EN.date, EN.note],
      TRANSACTION_COLUMNS,
      [EN],
    );
    expect(matchedHeader).toBe(true);
    expect(indexByField.amount).toBe(0);
    expect(indexByField.date).toBe(1);
    expect(indexByField.note).toBe(2);
  });

  it('matches English headers even when the device runs another language', () => {
    const { matchedHeader, indexByField } = resolveColumns(TX_HEADER, TRANSACTION_COLUMNS, [
      JA,
      EN,
    ]);
    expect(matchedHeader).toBe(true);
    expect(indexByField.date).toBe(0);
  });

  it('falls back to the exporter’s column order for unrecognized headers', () => {
    const { indexByField, matchedHeader } = resolveColumns(
      ['Fecha', 'Tipo', 'Importe'],
      TRANSACTION_COLUMNS,
      [EN],
    );
    expect(matchedHeader).toBe(false);
    expect(indexByField.date).toBe(0);
    expect(indexByField.type).toBe(1);
    expect(indexByField.amount).toBe(2);
  });
});

describe('parseExcelWorkbook', () => {
  it('reads the transactions sheet the exporter writes', () => {
    const parsed = parse([
      txSheet([
        [
          '2024-05-02',
          'expense',
          12.5,
          'MYR',
          2.8,
          'USD',
          'Cash',
          '',
          '',
          'Food',
          'Groceries',
          'Lunch',
          'happy',
          'No',
        ],
      ]),
    ]);

    expect(parsed.transactions).toEqual([
      {
        date: '2024-05-02',
        type: 'expense',
        amount: 12.5,
        currency: 'MYR',
        reportingAmount: 2.8,
        reportingCurrency: 'USD',
        account: 'Cash',
        fromAccount: '',
        toAccount: '',
        category: 'Food',
        subcategory: 'Groceries',
        note: 'Lunch',
        sentiment: 'happy',
      },
    ]);
    expect(parsed.skipped).toBe(0);
  });

  it('skips rows with no usable date or amount and counts them', () => {
    const parsed = parse([
      txSheet([
        ['2024-05-02', 'expense', 10, 'MYR'],
        ['not a date', 'expense', 10, 'MYR'],
        ['2024-05-03', 'expense', 'abc', 'MYR'],
        [null, null, null, null],
      ]),
    ]);
    expect(parsed.transactions).toHaveLength(1);
    // The fully-blank row is ignored outright, not reported as a failure.
    expect(parsed.skipped).toBe(2);
  });

  it('normalizes a stray negative amount, since Type carries the direction', () => {
    const parsed = parse([txSheet([['2024-05-02', 'expense', -10, 'MYR']])]);
    expect(parsed.transactions[0].amount).toBe(10);
  });

  it('falls back to the reporting currency for a blank currency cell', () => {
    const parsed = parse([txSheet([['2024-05-02', 'expense', 10, '']])]);
    expect(parsed.transactions[0].currency).toBe('MYR');
  });

  it('defaults an unknown type and sentiment instead of dropping the row', () => {
    const parsed = parse([
      txSheet([['2024-05-02', 'nonsense', 10, 'MYR', null, null, 'Cash', '', '', '', '', '', 'x']]),
    ]);
    expect(parsed.transactions[0].type).toBe('expense');
    expect(parsed.transactions[0].sentiment).toBe('neutral');
  });

  it('reads a sheet whose headers and tab name are in an unknown language', () => {
    const parsed = parse([
      {
        name: 'Hoja 1',
        rows: [
          ['Fecha', 'Tipo', 'Importe', 'Moneda'],
          ['2024-05-02', 'expense', 10, 'EUR'],
        ],
      },
    ]);
    // Positional fallback, and the unrecognized header row is still skipped.
    expect(parsed.transactions).toEqual([
      expect.objectContaining({ date: '2024-05-02', amount: 10, currency: 'EUR' }),
    ]);
    expect(parsed.skipped).toBe(0);
  });

  it('reads a headerless transactions sheet', () => {
    const parsed = parse([{ name: 'Sheet1', rows: [['2024-05-02', 'expense', 10, 'MYR']] }]);
    expect(parsed.transactions).toHaveLength(1);
  });

  it('reads accounts, categories and recurring rules', () => {
    const parsed = parse([
      txSheet([]),
      {
        name: EN.sheetAccounts,
        rows: [
          ['Name', 'Group', 'Type', 'Currency', 'Starting balance', 'Include in totals'],
          ['Cash', 'Daily', 'debit', 'MYR', 100, 'Yes'],
          ['Card', '', 'credit', 'USD', 0, 'No'],
        ],
      },
      {
        name: EN.sheetCategories,
        rows: [
          ['Name', 'Type', 'Parent', 'Icon'],
          ['Food', 'expense', '', '🍜'],
          ['Groceries', 'expense', 'Food', ''],
          ['Salary', 'income', '', '💰'],
        ],
      },
      {
        name: EN.sheetRecurring,
        rows: [
          [
            'Name',
            'Type',
            'Amount',
            'Currency',
            'Account',
            'From account',
            'To account',
            'Category',
            'Pattern',
            'Interval',
            'Next run',
            'End date',
            'Active',
          ],
          [
            'Rent',
            'expense',
            1200,
            'MYR',
            'Cash',
            '',
            '',
            'Housing',
            'monthly',
            1,
            '2024-06-01',
            '',
            'Yes',
          ],
          [
            'Sweep',
            'transfer',
            50,
            'MYR',
            '',
            'Cash',
            'Card',
            '',
            'weekly',
            2,
            '2024-06-02',
            '2025-01-01',
            'No',
          ],
        ],
      },
    ]);

    expect(parsed.accounts).toEqual([
      {
        name: 'Cash',
        group: 'Daily',
        type: 'debit',
        currency: 'MYR',
        startingBalance: 100,
        includeInTotals: true,
      },
      {
        name: 'Card',
        group: null,
        type: 'credit',
        currency: 'USD',
        startingBalance: 0,
        includeInTotals: false,
      },
    ]);
    expect(parsed.categories).toEqual([
      { name: 'Food', type: 'expense', parent: null, icon: '🍜' },
      { name: 'Groceries', type: 'expense', parent: 'Food', icon: '' },
      { name: 'Salary', type: 'income', parent: null, icon: '💰' },
    ]);
    expect(parsed.recurringRules).toEqual([
      expect.objectContaining({
        name: 'Rent',
        type: 'expense',
        account: 'Cash',
        pattern: 'monthly',
        interval: 1,
        nextRun: '2024-06-01',
        endDate: null,
        isActive: true,
      }),
      expect.objectContaining({
        name: 'Sweep',
        type: 'transfer',
        fromAccount: 'Cash',
        toAccount: 'Card',
        pattern: 'weekly',
        interval: 2,
        endDate: '2025-01-01',
        isActive: false,
      }),
    ]);
  });

  it('tolerates a workbook with only a transactions sheet', () => {
    const parsed = parse([txSheet([['2024-05-02', 'expense', 10, 'MYR']])]);
    expect(parsed.accounts).toEqual([]);
    expect(parsed.categories).toEqual([]);
    expect(parsed.recurringRules).toEqual([]);
    expect(parsed.transactions).toHaveLength(1);
  });

  it('reads localized headers and Yes/No values', () => {
    const localizedHeader = TRANSACTION_COLUMNS.map((column) => JA[column]);
    const parsed = parse(
      [
        {
          name: JA.sheetTransactions,
          rows: [
            localizedHeader,
            [
              '2024-05-02',
              'expense',
              10,
              'JPY',
              null,
              null,
              '財布',
              '',
              '',
              '食費',
              '',
              '',
              'neutral',
              'はい',
            ],
          ],
        },
      ],
      JA,
    );
    expect(parsed.transactions).toEqual([
      expect.objectContaining({ account: '財布', category: '食費', currency: 'JPY' }),
    ]);
  });

  it('returns empty results for a workbook with no recognizable rows', () => {
    const parsed = parse([{ name: 'Notes', rows: [['just', 'some', 'text']] }]);
    expect(parsed.transactions).toEqual([]);
    expect(parsed.skipped).toBe(0);
  });
});

/**
 * The whole point of the feature: a workbook this app exports must come back
 * through the reader and parser as the same data. Anything that drifts between
 * the two column layouts shows up here first.
 */
describe('export -> xlsx -> import round trip', () => {
  const transactions: TransactionWithRelations[] = [
    {
      id: 't1',
      type: 'expense',
      amount: 12.5,
      currency: 'MYR',
      reportingCurrency: 'USD',
      reportingAmount: 2.8,
      fxRate: 0.224,
      toAmount: null,
      accountAmount: null,
      date: '2024-05-02',
      accountId: 'a1',
      fromAccountId: null,
      toAccountId: null,
      categoryId: 'c2',
      note: 'Lunch & coffee',
      receiptUri: null,
      recurrencePattern: 'none',
      recurrenceInterval: 1,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: 'happy',
      createdAt: '2024-05-02T10:00:00.000Z',
      updatedAt: '2024-05-02T10:00:00.000Z',
      deletedAt: null,
      accountName: 'Cash',
      categoryName: 'Groceries',
      categoryParentName: 'Food',
    },
    {
      id: 't2',
      type: 'transfer',
      amount: 200,
      currency: 'MYR',
      reportingCurrency: null,
      reportingAmount: null,
      fxRate: null,
      toAmount: null,
      accountAmount: null,
      date: '2024-05-03',
      accountId: null,
      fromAccountId: 'a1',
      toAccountId: 'a2',
      categoryId: null,
      note: '',
      receiptUri: null,
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: 'neutral',
      createdAt: '2024-05-03T10:00:00.000Z',
      updatedAt: '2024-05-03T10:00:00.000Z',
      deletedAt: null,
      accountName: null,
      fromAccountName: 'Cash',
      toAccountName: 'Savings',
      categoryName: null,
    },
  ];

  const accounts: Account[] = [
    {
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
    },
    {
      id: 'a2',
      name: 'Savings',
      type: 'debit',
      accountGroup: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'USD',
      startingBalance: 0,
      includeInTotals: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
    },
  ];

  const categories: Category[] = [
    {
      id: 'c1',
      name: 'Food',
      type: 'expense',
      parentId: null,
      icon: '🍜',
      isDefault: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
    },
    {
      id: 'c2',
      name: 'Groceries',
      type: 'expense',
      parentId: 'c1',
      icon: '',
      isDefault: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
    },
  ];

  const recurringRules: RecurringTransactionRule[] = [
    {
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
    },
    {
      id: 'r2',
      name: 'Sweep to savings',
      type: 'transfer',
      amount: 50,
      currency: 'MYR',
      toAmount: null,
      accountId: null,
      fromAccountId: 'a1',
      toAccountId: 'a2',
      categoryId: null,
      note: null,
      recurrencePattern: 'weekly',
      recurrenceInterval: 2,
      nextRunDate: '2024-06-02',
      endDate: '2025-01-01',
      isActive: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
    },
  ];

  function roundTrip(labels: ExcelExportLabels) {
    const bytes = buildXlsx(
      buildExcelSheets({ transactions, accounts, categories, recurringRules, labels }),
    );
    return parseExcelWorkbook(readXlsx(bytes), { labels, fallbackCurrency: 'MYR' });
  }

  it('preserves every transaction field', () => {
    const parsed = roundTrip(EN);
    expect(parsed.skipped).toBe(0);
    expect(parsed.transactions).toEqual([
      {
        date: '2024-05-02',
        type: 'expense',
        amount: 12.5,
        currency: 'MYR',
        reportingAmount: 2.8,
        reportingCurrency: 'USD',
        account: 'Cash',
        fromAccount: '',
        toAccount: '',
        category: 'Food',
        subcategory: 'Groceries',
        note: 'Lunch & coffee',
        sentiment: 'happy',
      },
      {
        date: '2024-05-03',
        type: 'transfer',
        amount: 200,
        currency: 'MYR',
        reportingAmount: null,
        reportingCurrency: null,
        account: '',
        fromAccount: 'Cash',
        toAccount: 'Savings',
        category: '',
        subcategory: '',
        note: '',
        sentiment: 'neutral',
      },
    ]);
  });

  it('preserves accounts and categories', () => {
    const parsed = roundTrip(EN);
    expect(parsed.accounts).toEqual([
      {
        name: 'Cash',
        group: 'Daily',
        type: 'debit',
        currency: 'MYR',
        startingBalance: 100,
        includeInTotals: true,
      },
      {
        name: 'Savings',
        group: null,
        type: 'debit',
        currency: 'USD',
        startingBalance: 0,
        includeInTotals: false,
      },
    ]);
    expect(parsed.categories).toEqual([
      { name: 'Food', type: 'expense', parent: null, icon: '🍜' },
      { name: 'Groceries', type: 'expense', parent: 'Food', icon: '' },
    ]);
  });

  it('preserves recurring rules, including both sides of a transfer', () => {
    const parsed = roundTrip(EN);
    expect(parsed.recurringRules).toEqual([
      {
        name: 'Rent',
        type: 'expense',
        amount: 1200,
        currency: 'MYR',
        account: 'Cash',
        fromAccount: '',
        toAccount: '',
        category: 'Food',
        pattern: 'monthly',
        interval: 1,
        nextRun: '2024-06-01',
        endDate: null,
        isActive: true,
      },
      {
        name: 'Sweep to savings',
        type: 'transfer',
        amount: 50,
        currency: 'MYR',
        account: '',
        fromAccount: 'Cash',
        toAccount: 'Savings',
        category: '',
        pattern: 'weekly',
        interval: 2,
        nextRun: '2024-06-02',
        endDate: '2025-01-01',
        isActive: false,
      },
    ]);
  });

  it('round-trips a workbook exported in another language', () => {
    expect(roundTrip(JA).transactions).toEqual(roundTrip(EN).transactions);
  });

  it('imports an English workbook on a device running another language', () => {
    const bytes = buildXlsx(
      buildExcelSheets({ transactions, accounts, categories, recurringRules, labels: EN }),
    );
    // Device labels are Japanese; the sheet is English. Header matching against
    // English keeps this exact rather than falling back to column order.
    const parsed = parseExcelWorkbook(readXlsx(bytes), {
      labels: JA,
      fallbackCurrency: 'MYR',
    });
    expect(parsed.transactions).toEqual(roundTrip(EN).transactions);
    expect(parsed.accounts).toHaveLength(2);
    expect(parsed.recurringRules).toHaveLength(2);
  });

  it('omits the recurring sheet when there are no rules, and still parses', () => {
    const bytes = buildXlsx(
      buildExcelSheets({ transactions, accounts, categories, recurringRules: [], labels: EN }),
    );
    const parsed = parseExcelWorkbook(readXlsx(bytes), { labels: EN, fallbackCurrency: 'MYR' });
    expect(parsed.recurringRules).toEqual([]);
    expect(parsed.transactions).toHaveLength(2);
  });
});
