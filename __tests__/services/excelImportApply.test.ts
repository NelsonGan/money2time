import { applyExcelImport, type ParsedExcelData } from '~/services/excelImportService';

jest.mock('expo-file-system/next', () => ({ File: class {} }));

// In-memory stand-ins for the repository layer: `applyExcelImport` is all
// resolve-by-name plumbing, and these record exactly what it would write.
interface FakeAccount {
  id: string;
  name: string;
  accountGroup: string | null;
  type: string;
  currency: string;
  startingBalance: number;
  includeInTotals: boolean;
}
interface FakeCategory {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  icon: string;
}

const groups: string[] = [];
const createdAccounts: FakeAccount[] = [];
const createdCategories: FakeCategory[] = [];
const createdTransactions: Record<string, unknown>[] = [];
const createdRules: Record<string, unknown>[] = [];

jest.mock('~/lib/repositories/accountGroupsRepository', () => ({
  accountGroupsRepository: {
    create: (name: string) => {
      groups.push(name);
      return `g${groups.length}`;
    },
  },
}));
jest.mock('~/lib/repositories/accountsRepository', () => ({
  accountsRepository: {
    create: (input: Omit<FakeAccount, 'id'>) => {
      const id = `a${createdAccounts.length + 1}`;
      createdAccounts.push({ id, ...input });
      return id;
    },
  },
}));
jest.mock('~/lib/repositories/categoriesRepository', () => ({
  categoriesRepository: {
    create: (input: Omit<FakeCategory, 'id'>) => {
      const id = `c${createdCategories.length + 1}`;
      createdCategories.push({ id, ...input });
      return id;
    },
  },
}));
jest.mock('~/lib/repositories/transactionsRepository', () => ({
  transactionsRepository: {
    create: (input: Record<string, unknown>) => {
      createdTransactions.push(input);
      return `t${createdTransactions.length}`;
    },
  },
}));
jest.mock('~/lib/repositories/recurringRulesRepository', () => ({
  recurringRulesRepository: {
    create: (input: Record<string, unknown>) => {
      createdRules.push(input);
    },
  },
}));

beforeEach(() => {
  groups.length = 0;
  createdAccounts.length = 0;
  createdCategories.length = 0;
  createdTransactions.length = 0;
  createdRules.length = 0;
});

function data(overrides: Partial<ParsedExcelData> = {}): ParsedExcelData {
  return {
    accounts: [],
    categories: [],
    transactions: [],
    recurringRules: [],
    skipped: 0,
    ...overrides,
  };
}

function transaction(overrides: Partial<ParsedExcelData['transactions'][number]> = {}) {
  return {
    date: '2024-05-02',
    type: 'expense' as const,
    amount: 10,
    currency: 'MYR',
    reportingAmount: null,
    reportingCurrency: null,
    account: 'Cash',
    fromAccount: '',
    toAccount: '',
    category: 'Food',
    subcategory: '',
    note: '',
    sentiment: 'neutral' as const,
    ...overrides,
  };
}

function rule(overrides: Partial<ParsedExcelData['recurringRules'][number]> = {}) {
  return {
    name: 'Rent',
    type: 'expense' as const,
    amount: 1200,
    currency: 'MYR',
    account: 'Cash',
    fromAccount: '',
    toAccount: '',
    category: 'Housing',
    pattern: 'monthly' as const,
    interval: 1,
    nextRun: '2024-06-01',
    endDate: null,
    isActive: true,
    ...overrides,
  };
}

describe('applyExcelImport', () => {
  it('creates accounts from the accounts sheet, with their groups', () => {
    const summary = applyExcelImport(
      data({
        accounts: [
          {
            name: 'Cash',
            group: 'Daily',
            type: 'debit',
            currency: 'MYR',
            startingBalance: 100,
            includeInTotals: true,
          },
        ],
      }),
      'MYR',
    );
    expect(summary.accounts).toBe(1);
    expect(groups).toEqual(['Daily']);
    expect(createdAccounts[0]).toMatchObject({
      name: 'Cash',
      accountGroup: 'Daily',
      currency: 'MYR',
      startingBalance: 100,
    });
  });

  it('creates an account referenced only by a transaction', () => {
    applyExcelImport(data({ transactions: [transaction({ account: 'Wallet' })] }), 'USD');
    expect(createdAccounts).toHaveLength(1);
    expect(createdAccounts[0]).toMatchObject({
      name: 'Wallet',
      type: 'debit',
      currency: 'USD',
      startingBalance: 0,
    });
  });

  it('reuses one account across rows, matching case-insensitively', () => {
    applyExcelImport(
      data({
        transactions: [
          transaction({ account: 'Cash' }),
          transaction({ account: 'cash' }),
          transaction({ account: ' CASH ' }),
        ],
      }),
      'MYR',
    );
    expect(createdAccounts).toHaveLength(1);
    expect(new Set(createdTransactions.map((tx) => tx.accountId)).size).toBe(1);
  });

  it('links a subcategory to its parent whatever the row order', () => {
    const summary = applyExcelImport(
      data({
        categories: [
          { name: 'Groceries', type: 'expense', parent: 'Food', icon: '' },
          { name: 'Food', type: 'expense', parent: null, icon: '🍜' },
        ],
      }),
      'MYR',
    );
    expect(summary.categories).toBe(2);
    const food = createdCategories.find((category) => category.name === 'Food');
    const groceries = createdCategories.find((category) => category.name === 'Groceries');
    expect(food?.parentId).toBeNull();
    expect(groceries?.parentId).toBe(food?.id);
  });

  it('keeps same-named expense and income categories separate', () => {
    applyExcelImport(
      data({
        categories: [
          { name: 'Other', type: 'expense', parent: null, icon: '' },
          { name: 'Other', type: 'income', parent: null, icon: '' },
        ],
      }),
      'MYR',
    );
    expect(createdCategories).toHaveLength(2);
  });

  it('creates the category pair a transaction names', () => {
    applyExcelImport(
      data({
        transactions: [transaction({ category: 'Food', subcategory: 'Groceries' })],
      }),
      'MYR',
    );
    expect(createdCategories.map((category) => category.name)).toEqual(['Food', 'Groceries']);
    expect(createdTransactions[0].categoryId).toBe(
      createdCategories.find((category) => category.name === 'Groceries')?.id,
    );
  });

  it('points a transaction at the root when it has no subcategory', () => {
    applyExcelImport(data({ transactions: [transaction({ subcategory: '' })] }), 'MYR');
    expect(createdCategories).toHaveLength(1);
    expect(createdTransactions[0].categoryId).toBe(createdCategories[0].id);
  });

  it('gives a transfer its two accounts and no category', () => {
    applyExcelImport(
      data({
        transactions: [
          transaction({
            type: 'transfer',
            account: '',
            fromAccount: 'Cash',
            toAccount: 'Savings',
            category: '',
          }),
        ],
      }),
      'MYR',
    );
    const [tx] = createdTransactions;
    expect(tx.accountId).toBeNull();
    expect(tx.fromAccountId).toBe(createdAccounts[0].id);
    expect(tx.toAccountId).toBe(createdAccounts[1].id);
    expect(tx.categoryId).toBeNull();
  });

  it('recomputes the FX rate from the amount pair', () => {
    applyExcelImport(
      data({
        transactions: [transaction({ amount: 10, reportingAmount: 2.5, reportingCurrency: 'USD' })],
      }),
      'MYR',
    );
    expect(createdTransactions[0]).toMatchObject({
      reportingAmount: 2.5,
      reportingCurrency: 'USD',
      fxRate: 0.25,
    });
  });

  it('leaves the FX snapshot empty when the sheet has no reporting amount', () => {
    applyExcelImport(data({ transactions: [transaction()] }), 'MYR');
    expect(createdTransactions[0]).toMatchObject({
      reportingAmount: null,
      reportingCurrency: null,
      fxRate: null,
    });
  });

  it('writes recurring rules, resolving both sides of a transfer', () => {
    const summary = applyExcelImport(
      data({
        recurringRules: [
          rule(),
          rule({
            name: 'Sweep',
            type: 'transfer',
            account: '',
            fromAccount: 'Cash',
            toAccount: 'Savings',
            category: '',
          }),
        ],
      }),
      'MYR',
    );
    expect(summary.recurringRules).toBe(2);
    expect(createdRules[1]).toMatchObject({
      type: 'transfer',
      accountId: null,
      fromAccountId: expect.any(String),
      toAccountId: expect.any(String),
    });
  });

  it('skips a rule the repository would silently reject', () => {
    const summary = applyExcelImport(
      data({
        recurringRules: [
          // An expense rule with no category fails the repository's own check.
          rule({ category: '' }),
          // A transfer to and from the same account is rejected too.
          rule({ type: 'transfer', account: '', fromAccount: 'Cash', toAccount: 'Cash' }),
        ],
      }),
      'MYR',
    );
    expect(summary.recurringRules).toBe(0);
    expect(summary.skipped).toBe(2);
    expect(createdRules).toHaveLength(0);
  });

  it('carries the parser’s skipped count into the summary', () => {
    const summary = applyExcelImport(data({ skipped: 3 }), 'MYR');
    expect(summary).toEqual({
      accounts: 0,
      categories: 0,
      transactions: 0,
      recurringRules: 0,
      skipped: 3,
    });
  });
});
