import {
  toAccount,
  toAccountGroup,
  toCategory,
  toItem,
  toMonthlyWageSettings,
  toReceiptSplit,
  toReceiptSplitItem,
  toReceiptSplitItemShare,
  toRecurringRule,
  toSettings,
  toTransaction,
  toTransactionSplit,
} from '~/lib/repositories/mappers';

const STAMPS = {
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
  deletedAt: null,
};

describe('toAccount', () => {
  it('passes through known account types', () => {
    const row: any = {
      id: 'a1',
      name: 'Wallet',
      sortOrder: 3,
      type: 'credit',
      accountGroup: 'Personal',
      creditStatementDay: 10,
      creditDueDay: 25,
      currency: 'USD',
      startingBalance: 100,
      includeInTotals: true,
      ...STAMPS,
    };
    expect(toAccount(row).type).toBe('credit');
  });

  it.each(['cash', 'bank', 'wallet', 'savings', 'other', 'invalid'])(
    'maps legacy/unknown type %s → debit',
    (legacy) => {
      const row: any = {
        id: 'x',
        name: 'x',
        type: legacy,
        currency: 'USD',
        startingBalance: 0,
        includeInTotals: true,
        accountGroup: null,
        creditStatementDay: null,
        creditDueDay: null,
        sortOrder: null,
        ...STAMPS,
      };
      expect(toAccount(row).type).toBe('debit');
    },
  );

  it('defaults sortOrder to 0 when null', () => {
    const row: any = {
      id: 'a',
      name: 'a',
      type: 'debit',
      sortOrder: null,
      accountGroup: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'USD',
      startingBalance: 0,
      includeInTotals: true,
      ...STAMPS,
    };
    expect(toAccount(row).sortOrder).toBe(0);
  });

  it('maps cardColor, defaulting missing/null to null', () => {
    const base: any = {
      id: 'a',
      name: 'a',
      type: 'debit',
      sortOrder: 0,
      accountGroup: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'USD',
      startingBalance: 0,
      includeInTotals: true,
      ...STAMPS,
    };
    expect(toAccount({ ...base, cardColor: 'midnight' }).cardColor).toBe('midnight');
    expect(toAccount({ ...base, cardColor: null }).cardColor).toBeNull();
    expect(toAccount(base).cardColor).toBeNull();
  });
});

describe('toAccountGroup', () => {
  it('maps account group rows', () => {
    const row: any = { id: 'g1', name: 'Personal', sortOrder: 2, ...STAMPS };
    expect(toAccountGroup(row)).toEqual({
      id: 'g1',
      name: 'Personal',
      sortOrder: 2,
      ...STAMPS,
    });
  });

  it('defaults sortOrder when null', () => {
    const row: any = { id: 'g1', name: 'Personal', sortOrder: null, ...STAMPS };
    expect(toAccountGroup(row).sortOrder).toBe(0);
  });
});

describe('toCategory', () => {
  it('maps income type correctly', () => {
    const row: any = {
      id: 'c1',
      name: 'Salary',
      sortOrder: 1,
      type: 'income',
      parentId: null,
      icon: '💼',
      isDefault: false,
      ...STAMPS,
    };
    expect(toCategory(row).type).toBe('income');
  });

  it('defaults unknown type to expense', () => {
    const row: any = {
      id: 'c1',
      name: 'Misc',
      sortOrder: 0,
      type: 'unknown',
      parentId: null,
      icon: '🧾',
      isDefault: false,
      ...STAMPS,
    };
    expect(toCategory(row).type).toBe('expense');
  });
});

describe('toTransaction', () => {
  it('maps known transaction types', () => {
    expect(
      toTransaction({
        id: 't1',
        type: 'income',
        amount: 100,
        currency: 'USD',
        date: '2026-05-13',
        accountId: 'a',
        fromAccountId: null,
        toAccountId: null,
        categoryId: 'c',
        note: null,
        recurrencePattern: 'monthly',
        recurrenceInterval: 2,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        sentiment: 'happy',
        ...STAMPS,
      } as any).type,
    ).toBe('income');
  });

  it('defaults unknown transaction type to expense', () => {
    expect(
      toTransaction({
        id: 't1',
        type: 'mystery',
        amount: 0,
        currency: 'USD',
        date: '2026-05-13',
        accountId: null,
        fromAccountId: null,
        toAccountId: null,
        categoryId: null,
        note: null,
        recurrencePattern: 'monthly',
        recurrenceInterval: 1,
        recurrenceEndDate: null,
        recurrenceParentId: null,
        sentiment: null,
        ...STAMPS,
      } as any).type,
    ).toBe('expense');
  });

  it('defaults unknown sentiment to neutral', () => {
    const tx = toTransaction({
      id: 't',
      type: 'expense',
      amount: 0,
      currency: 'USD',
      date: '2026-05-13',
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      note: null,
      recurrencePattern: 'none',
      recurrenceInterval: 1,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: 'bogus',
      ...STAMPS,
    } as any);
    expect(tx.sentiment).toBe('neutral');
  });

  it('clamps recurrenceInterval to a minimum of 1', () => {
    const tx = toTransaction({
      id: 't',
      type: 'expense',
      amount: 0,
      currency: 'USD',
      date: '2026-05-13',
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      note: null,
      recurrencePattern: 'monthly',
      recurrenceInterval: 0,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: 'neutral',
      ...STAMPS,
    } as any);
    expect(tx.recurrenceInterval).toBe(1);
  });

  it('defaults unknown recurrencePattern to none', () => {
    const tx = toTransaction({
      id: 't',
      type: 'expense',
      amount: 0,
      currency: 'USD',
      date: '2026-05-13',
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      note: null,
      recurrencePattern: 'eternal',
      recurrenceInterval: 1,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: 'neutral',
      ...STAMPS,
    } as any);
    expect(tx.recurrencePattern).toBe('none');
  });

  it('carries the receipt relative path through, defaulting missing to null', () => {
    const base = {
      id: 't',
      type: 'expense',
      amount: 0,
      currency: 'USD',
      date: '2026-05-13',
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      note: null,
      recurrencePattern: 'none',
      recurrenceInterval: 1,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: 'neutral',
      ...STAMPS,
    };
    expect(toTransaction({ ...base, receiptUri: 'receipts/9f3c.jpg' } as any).receiptUri).toBe(
      'receipts/9f3c.jpg',
    );
    expect(toTransaction(base as any).receiptUri).toBeNull();
  });
});

describe('toTransactionSplit', () => {
  it('coerces isSelf to a boolean', () => {
    const row: any = {
      id: 's1',
      transactionId: 't',
      personName: 'Alice',
      amount: 10,
      isSelf: 1,
      paybackAccountId: null,
      paidAt: null,
      paidTransactionId: null,
      sortOrder: null,
      ...STAMPS,
    };
    expect(toTransactionSplit(row).isSelf).toBe(true);
  });
});

describe('toReceiptSplit', () => {
  it('maps the header with items and defaults an unknown source to manual', () => {
    const shareRow: any = {
      id: 'sh1',
      receiptSplitId: 'rs1',
      itemId: 'ri1',
      personName: 'Sarah',
      isSelf: 0,
      weight: null,
      ...STAMPS,
    };
    const share = toReceiptSplitItemShare(shareRow);
    expect(share).toEqual({
      id: 'sh1',
      itemId: 'ri1',
      personName: 'Sarah',
      isSelf: false,
      weight: 1,
    });

    const itemRow: any = {
      id: 'ri1',
      receiptSplitId: 'rs1',
      name: 'Salmon roll',
      quantity: null,
      lineTotal: 40,
      sortOrder: null,
      ...STAMPS,
    };
    const item = toReceiptSplitItem(itemRow, [share]);
    expect(item.quantity).toBe(1);
    expect(item.sortOrder).toBe(0);
    expect(item.shares).toEqual([share]);

    const headerRow: any = {
      id: 'rs1',
      transactionId: 'tx1',
      currency: 'USD',
      merchant: 'Sushi Bar',
      receiptDate: null,
      source: 'bogus',
      receiptImageUri: null,
      ...STAMPS,
    };
    const split = toReceiptSplit(headerRow, [item]);
    expect(split.source).toBe('manual');
    expect(split.merchant).toBe('Sushi Bar');
    expect(split.items).toEqual([item]);
  });

  it('preserves a scan source', () => {
    const headerRow: any = {
      id: 'rs1',
      transactionId: 'tx1',
      currency: 'USD',
      merchant: null,
      receiptDate: '2026-07-01',
      source: 'scan',
      receiptImageUri: 'receipts/abc.jpg',
      ...STAMPS,
    };
    const split = toReceiptSplit(headerRow, []);
    expect(split.source).toBe('scan');
    expect(split.receiptImageUri).toBe('receipts/abc.jpg');
  });
});

describe('toRecurringRule', () => {
  it('keeps daily / weekly / monthly / yearly patterns', () => {
    const baseRow: any = {
      id: 'r',
      name: 'Test',
      type: 'expense',
      amount: 1,
      currency: 'USD',
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      note: null,
      recurrenceInterval: 1,
      nextRunDate: '2026-06-01',
      endDate: null,
      isActive: true,
      ...STAMPS,
    };
    expect(toRecurringRule({ ...baseRow, recurrencePattern: 'daily' }).recurrencePattern).toBe(
      'daily',
    );
    expect(toRecurringRule({ ...baseRow, recurrencePattern: 'weekly' }).recurrencePattern).toBe(
      'weekly',
    );
    expect(toRecurringRule({ ...baseRow, recurrencePattern: 'yearly' }).recurrencePattern).toBe(
      'yearly',
    );
    expect(toRecurringRule({ ...baseRow, recurrencePattern: 'monthly' }).recurrencePattern).toBe(
      'monthly',
    );
  });

  it('defaults unknown pattern to monthly', () => {
    const rule = toRecurringRule({
      id: 'r',
      name: 'x',
      type: 'expense',
      amount: 1,
      currency: 'USD',
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      note: null,
      recurrencePattern: 'random',
      recurrenceInterval: 1,
      nextRunDate: '2026-06-01',
      endDate: null,
      isActive: true,
      ...STAMPS,
    } as any);
    expect(rule.recurrencePattern).toBe('monthly');
  });

  it('maps income type', () => {
    const rule = toRecurringRule({
      id: 'r',
      name: 'x',
      type: 'income',
      amount: 1,
      currency: 'USD',
      accountId: null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
      note: null,
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
      nextRunDate: '2026-06-01',
      endDate: null,
      isActive: true,
      ...STAMPS,
    } as any);
    expect(rule.type).toBe('income');
  });
});

describe('toSettings', () => {
  const baseRow: any = {
    id: 's',
    appUserId: 'u',
    locale: 'en',
    currencyCode: 'USD',
    currencySymbol: '$',
    displayMode: 'money',
    hapticsEnabled: true,
    themeMode: 'system',
    themeColor: 'rosewood',
    onboardingCompleted: true,
    userMode: 'power',
    ...STAMPS,
  };

  it('maps known display, theme, and user mode values', () => {
    const settings = toSettings({ ...baseRow, displayMode: 'time' });
    expect(settings.displayMode).toBe('time');
  });

  it('defaults unknown display mode to money', () => {
    const settings = toSettings({ ...baseRow, displayMode: 'invalid' });
    expect(settings.displayMode).toBe('money');
  });

  it('migrates the legacy "berry" theme color to rosewood', () => {
    const settings = toSettings({ ...baseRow, themeColor: 'berry' });
    expect(settings.themeColor).toBe('rosewood');
  });

  it('defaults unknown theme color to rosewood', () => {
    const settings = toSettings({ ...baseRow, themeColor: 'nonexistent' });
    expect(settings.themeColor).toBe('rosewood');
  });

  it('defaults unknown user mode to power', () => {
    const settings = toSettings({ ...baseRow, userMode: 'something' });
    expect(settings.userMode).toBe('power');
  });

  it('defaults missing hapticsEnabled to true', () => {
    const settings = toSettings({ ...baseRow, hapticsEnabled: null });
    expect(settings.hapticsEnabled).toBe(true);
  });
});

describe('toMonthlyWageSettings', () => {
  const baseRow: any = {
    id: 'w',
    month: '2026-05',
    wageType: 'monthly',
    wageAmount: 5000,
    hoursWorkedPerWeek: 40,
    workdaysPerWeek: 5,
    commuteMinutesPerWorkday: 0,
    baseHourlyRate: 0,
    trueHourlyRate: 0,
    ...STAMPS,
  };

  it.each(['hourly', 'monthly', 'yearly'])('keeps wage type %s', (wt) => {
    const result = toMonthlyWageSettings({ ...baseRow, wageType: wt });
    expect(result.wageType).toBe(wt);
  });

  it('defaults unknown wage type to monthly', () => {
    expect(toMonthlyWageSettings({ ...baseRow, wageType: 'weekly' }).wageType).toBe('monthly');
  });
});

describe('toItem', () => {
  const baseRow: any = {
    id: 'i1',
    name: 'Espresso machine',
    iconId: 'espresso-machine',
    purchasePrice: 365,
    currency: 'USD',
    purchaseDate: '2024-01-01',
    endDate: null,
    salePrice: null,
    note: null,
    sortOrder: 2,
    ...STAMPS,
  };

  it('maps a row to a domain item', () => {
    expect(toItem(baseRow)).toEqual({
      id: 'i1',
      name: 'Espresso machine',
      iconId: 'espresso-machine',
      purchasePrice: 365,
      currency: 'USD',
      purchaseDate: '2024-01-01',
      endDate: null,
      salePrice: null,
      note: null,
      sortOrder: 2,
      ...STAMPS,
    });
  });

  it('coerces nullish optional fields', () => {
    const result = toItem({
      ...baseRow,
      iconId: null,
      salePrice: null,
      note: null,
      sortOrder: null,
    });
    expect(result.iconId).toBeNull();
    expect(result.salePrice).toBeNull();
    expect(result.sortOrder).toBe(0);
  });
});
