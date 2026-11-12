import {
  createTransactionAssembler,
  toAccount,
  toAccountGroup,
  toBudgetTemplate,
  toCategory,
  toItem,
  toMonthlyWageSettings,
  toPeriodBudget,
  toReceiptSplit,
  toReceiptSplitItem,
  toReceiptSplitItemShare,
  toRecurringRule,
  toSettings,
  toTransaction,
  toTransactionSplit,
  toTransactionWithRelationsFromRaw,
  TRANSACTION_COMMON_COLUMNS_SQL,
  TRANSACTION_RAW_COLUMNS_SQL,
  TRANSACTION_SPARSE_COLUMNS_SQL,
  TRANSACTION_SPARSE_FILTER_SQL,
  type TransactionRelationLookups,
  transactionRelations,
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

  it('passes through the goal type and maps goal fields', () => {
    const row: any = {
      id: 'g1',
      name: 'Japan trip',
      sortOrder: 0,
      type: 'goal',
      accountGroup: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'USD',
      startingBalance: 250,
      includeInTotals: true,
      goalTargetAmount: 5000,
      goalTargetDate: '2027-06-01',
      goalEmoji: '🎌',
      goalCoverUri: 'goal-covers/9f3c.jpg',
      goalAchievedAt: null,
      goalArchivedAt: null,
      ...STAMPS,
    };
    const account = toAccount(row);
    expect(account.type).toBe('goal');
    expect(account.goalTargetAmount).toBe(5000);
    expect(account.goalTargetDate).toBe('2027-06-01');
    expect(account.goalEmoji).toBe('🎌');
    expect(account.goalCoverUri).toBe('goal-covers/9f3c.jpg');
    expect(account.goalAchievedAt).toBeNull();
    expect(account.goalArchivedAt).toBeNull();
  });

  it('reads a goal saved before the cover column as having no cover', () => {
    const row: any = {
      id: 'g2',
      name: 'Camera',
      sortOrder: 0,
      type: 'goal',
      accountGroup: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'USD',
      startingBalance: 0,
      includeInTotals: true,
      goalTargetAmount: 1200,
      goalTargetDate: null,
      goalEmoji: null,
      goalCoverUri: null,
      goalAchievedAt: null,
      goalArchivedAt: null,
      ...STAMPS,
    };
    expect(toAccount(row).goalCoverUri).toBeNull();
  });

  it('maps the card design, and reads a row from before the column as the plain card', () => {
    const base: any = {
      id: 'a1',
      name: 'Everyday',
      sortOrder: 0,
      type: 'debit',
      accountGroup: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'USD',
      startingBalance: 0,
      includeInTotals: true,
      ...STAMPS,
    };
    expect(toAccount({ ...base, cardDesign: 'marble/black' }).cardDesign).toBe('marble/black');
    expect(toAccount(base).cardDesign).toBeNull();
  });

  it('passes through the loan type and maps loan fields', () => {
    const row: any = {
      id: 'l1',
      name: 'Car loan',
      sortOrder: 0,
      type: 'loan',
      accountGroup: 'Loans',
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'MYR',
      startingBalance: 42180,
      includeInTotals: true,
      loanOriginalPrincipal: 80000,
      loanMonthlyPayment: 1250,
      loanPaymentDay: 15,
      loanInterestRate: 4.5,
      loanInterestModel: 'reducing',
      loanTotalRepayable: 90000,
      loanLedgerAnchorDate: '2026-08-15',
      loanRateChangesJson:
        '[{"from":"2026-08-15","annualRatePercent":4.5},{"from":"2026-09-02","annualRatePercent":4.75}]',
      loanPaidOffAt: null,
      loanArchivedAt: null,
      ...STAMPS,
    };
    const account = toAccount(row);
    expect(account.type).toBe('loan');
    expect(account.loanInterestModel).toBe('reducing');
    expect(account.loanOriginalPrincipal).toBe(80000);
    expect(account.loanMonthlyPayment).toBe(1250);
    expect(account.loanPaymentDay).toBe(15);
    expect(account.loanInterestRate).toBe(4.5);
    // Carried in its own right: instalment x term would read 90,000 here only
    // by coincidence, and on a rounded instalment it would not read it at all.
    expect(account.loanTotalRepayable).toBe(90000);
    expect(account.loanLedgerAnchorDate).toBe('2026-08-15');
    expect(account.loanRateChanges).toEqual([
      { from: '2026-08-15', annualRatePercent: 4.5 },
      { from: '2026-09-02', annualRatePercent: 4.75 },
    ]);
    expect(account.loanPaidOffAt).toBeNull();
    expect(account.loanArchivedAt).toBeNull();
    // A row from before migration 080 has no archive stamp: a live account.
    expect(account.archivedAt).toBeNull();
  });

  it('maps the archive stamp of an everyday account', () => {
    const row: any = {
      id: 'card',
      name: 'Old card',
      type: 'credit',
      currency: 'MYR',
      startingBalance: 0,
      includeInTotals: true,
      archivedAt: '2026-11-07T00:00:00.000Z',
      ...STAMPS,
    };
    expect(toAccount(row).archivedAt).toBe('2026-11-07T00:00:00.000Z');
  });

  it('reads an absent or unrecognized interest model as null', () => {
    const base: any = {
      id: 'l2',
      name: 'Old loan',
      sortOrder: 0,
      type: 'loan',
      accountGroup: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'MYR',
      startingBalance: 1000,
      includeInTotals: true,
      ...STAMPS,
    };
    // A loan saved before the column, which reads as flat downstream.
    expect(toAccount({ ...base, loanInterestModel: null }).loanInterestModel).toBeNull();
    // Anything else in the column is data corruption, not a third model.
    expect(toAccount({ ...base, loanInterestModel: 'daily' }).loanInterestModel).toBeNull();
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

  it('keeps "no stored reporting choice" distinct from an explicit off', () => {
    // Null means "created before the setting existed", which the editor reads
    // as off. It must stay null rather than being flattened to false, so a
    // later backfill (or a report on how many loans have opted in) can still
    // tell the two apart.
    const row: any = {
      id: 'loan',
      name: 'Car loan',
      type: 'loan',
      sortOrder: 0,
      accountGroup: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'USD',
      startingBalance: 12000,
      includeInTotals: true,
      ...STAMPS,
    };
    const account = toAccount(row);
    expect(account.loanCountAsExpense).toBeNull();
    expect(account.loanPaymentCategoryId).toBeNull();
  });

  it('maps a stored reporting choice through', () => {
    const row: any = {
      id: 'loan',
      name: 'Car loan',
      type: 'loan',
      sortOrder: 0,
      accountGroup: null,
      creditStatementDay: null,
      creditDueDay: null,
      currency: 'USD',
      startingBalance: 12000,
      includeInTotals: true,
      loanCountAsExpense: false,
      loanPaymentCategoryId: 'bills',
      ...STAMPS,
    };
    const account = toAccount(row);
    expect(account.loanCountAsExpense).toBe(false);
    expect(account.loanPaymentCategoryId).toBe('bills');
  });

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

describe('budget currencies', () => {
  const budgetRow: any = {
    id: 'b1',
    period: 'month',
    month: '2026-07',
    templateId: null,
    templateName: null,
    templateEmoji: null,
    totalAmount: 100000,
    countUnbudgeted: true,
    ...STAMPS,
  };

  it('reads a budget from before currencies as the main currency', () => {
    expect(toPeriodBudget(budgetRow, [])).toMatchObject({ currency: null, fxRate: null });
    expect(
      toBudgetTemplate({ id: 't1', name: 'Monthly', totalAmount: 1, ...STAMPS } as any, []),
    ).toMatchObject({ currency: null });
  });

  it('maps a budget in another currency with its frozen rate', () => {
    expect(toPeriodBudget({ ...budgetRow, currency: 'JPY', fxRate: 0.03 }, [])).toMatchObject({
      currency: 'JPY',
      fxRate: 0.03,
    });
    // A rate that is no rate reads as none, so the latest one is used.
    expect(toPeriodBudget({ ...budgetRow, currency: 'JPY', fxRate: 0 }, []).fxRate).toBeNull();
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

  it('leaves a row with no stamp uncounted', () => {
    const transaction = toTransaction({
      id: 't1',
      type: 'transfer',
      amount: 100,
      currency: 'USD',
      date: '2026-05-13',
      accountId: null,
      fromAccountId: 'a',
      toAccountId: 'b',
      categoryId: null,
      note: null,
      recurrencePattern: 'none',
      recurrenceInterval: 1,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: 'neutral',
      ...STAMPS,
    } as any);
    expect(transaction.countsAsExpense).toBe(false);
  });

  it('maps a stamped repayment transfer', () => {
    const transaction = toTransaction({
      id: 't1',
      type: 'transfer',
      amount: 1250,
      currency: 'USD',
      date: '2026-05-13',
      accountId: null,
      fromAccountId: 'checking',
      toAccountId: 'car-loan',
      categoryId: 'bills',
      note: null,
      recurrencePattern: 'none',
      recurrenceInterval: 1,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: 'neutral',
      countsAsExpense: 1,
      ...STAMPS,
    } as any);
    expect(transaction.countsAsExpense).toBe(true);
    expect(transaction.categoryId).toBe('bills');
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
  it("reads a transfer rule's fee, and no fee on any other rule", () => {
    const row: any = {
      id: 'r',
      name: 'Top up',
      type: 'transfer',
      amount: 200,
      currency: 'MYR',
      accountId: null,
      fromAccountId: 'card',
      toAccountId: 'wallet',
      categoryId: null,
      note: null,
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
      nextRunDate: '2026-06-01',
      endDate: null,
      isActive: true,
      feeAmount: 2,
      feeCurrency: 'MYR',
      feeSide: 'to',
      feeCategoryId: 'fees',
      ...STAMPS,
    };
    expect(toRecurringRule(row)).toMatchObject({
      feeAmount: 2,
      feeCurrency: 'MYR',
      feeSide: 'to',
      feeCategoryId: 'fees',
    });
    const none = { feeAmount: null, feeCurrency: null, feeSide: null, feeCategoryId: null };
    expect(toRecurringRule({ ...row, type: 'expense' })).toMatchObject(none);
    expect(toRecurringRule({ ...row, feeAmount: 0 })).toMatchObject(none);
    // Saved before migration 088: no fee columns at all.
    expect(
      toRecurringRule({
        ...row,
        feeAmount: undefined,
        feeCurrency: undefined,
        feeSide: undefined,
        feeCategoryId: undefined,
      }),
    ).toMatchObject(none);
    // An unknown side reads as the from account, as a saved fee's does.
    expect(toRecurringRule({ ...row, feeSide: 'sideways' }).feeSide).toBe('from');
  });

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

  it('keeps a valid anchor day and drops anything else', () => {
    const row: any = {
      id: 'r',
      name: 'Rent',
      type: 'expense',
      amount: 1,
      currency: 'USD',
      recurrencePattern: 'monthly',
      recurrenceInterval: 1,
      nextRunDate: '2026-06-30',
      endDate: null,
      isActive: true,
      ...STAMPS,
    };
    expect(toRecurringRule({ ...row, anchorDay: 31 }).anchorDay).toBe(31);
    expect(toRecurringRule({ ...row, anchorDay: null }).anchorDay).toBeNull();
    expect(toRecurringRule(row).anchorDay).toBeNull();
    expect(toRecurringRule({ ...row, anchorDay: 0 }).anchorDay).toBeNull();
    expect(toRecurringRule({ ...row, anchorDay: 32 }).anchorDay).toBeNull();
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

  it('reads the flat icon style', () => {
    const settings = toSettings({ ...baseRow, iconStyle: 'flat' });
    expect(settings.iconStyle).toBe('flat');
  });

  it('defaults a missing or unknown icon style to clay', () => {
    expect(toSettings({ ...baseRow }).iconStyle).toBe('clay');
    expect(toSettings({ ...baseRow, iconStyle: 'nonexistent' }).iconStyle).toBe('clay');
  });

  it('reads a picked app icon', () => {
    expect(toSettings({ ...baseRow, appIcon: 'chill' }).appIcon).toBe('chill');
  });

  it('defaults a missing or retired app icon to the shipped one', () => {
    expect(toSettings({ ...baseRow }).appIcon).toBe('classic');
    expect(toSettings({ ...baseRow, appIcon: 'someIconWeRetired' }).appIcon).toBe('classic');
  });

  it.each(['simple', 'power', 'something'])(
    'does not expose retired user mode (%s)',
    (userMode) => {
      expect(toSettings({ ...baseRow, userMode })).not.toHaveProperty('userMode');
    },
  );

  it('defaults missing hapticsEnabled to true', () => {
    const settings = toSettings({ ...baseRow, hapticsEnabled: null });
    expect(settings.hapticsEnabled).toBe(true);
  });

  it('shows the transaction account unless it was switched off', () => {
    expect(toSettings({ ...baseRow }).showTransactionAccount).toBe(true);
    expect(toSettings({ ...baseRow, showTransactionAccount: false }).showTransactionAccount).toBe(
      false,
    );
  });

  it('shows picker balances and the default tabs unless changed', () => {
    expect(toSettings({ ...baseRow }).showAccountPickerBalances).toBe(true);
    expect(toSettings({ ...baseRow }).navTabsJson).toBeNull();
    expect(
      toSettings({ ...baseRow, showAccountPickerBalances: false }).showAccountPickerBalances,
    ).toBe(false);
    expect(toSettings({ ...baseRow, navTabsJson: '["calendar"]' }).navTabsJson).toBe(
      '["calendar"]',
    );
  });

  it('shows assets-page balances unless the eye hid them', () => {
    expect(toSettings({ ...baseRow }).hideAccountBalances).toBe(false);
    expect(toSettings({ ...baseRow, hideAccountBalances: true }).hideAccountBalances).toBe(true);
  });

  it('tints recurring entries only once the user turned it on', () => {
    expect(toSettings({ ...baseRow }).highlightRecurringTransactions).toBe(false);
    expect(
      toSettings({ ...baseRow, highlightRecurringTransactions: true })
        .highlightRecurringTransactions,
    ).toBe(true);
  });

  it('maps working-day preferences with migration-safe defaults', () => {
    expect(toSettings({ ...baseRow }).workdayDisplayEnabled).toBe(false);
    expect(toSettings({ ...baseRow }).workingHoursPerDay).toBe(8);
    expect(
      toSettings({
        ...baseRow,
        workdayDisplayEnabled: true,
        workingHoursPerDay: 7.5,
      }),
    ).toMatchObject({ workdayDisplayEnabled: true, workingHoursPerDay: 7.5 });
  });

  it('normalizes out-of-range working hours per day', () => {
    expect(toSettings({ ...baseRow, workingHoursPerDay: 0 }).workingHoursPerDay).toBe(8);
    expect(toSettings({ ...baseRow, workingHoursPerDay: 30 }).workingHoursPerDay).toBe(24);
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

describe('toTransactionWithRelationsFromRaw', () => {
  // The raw loader reads columns by position, so derive the positions from the
  // SQL itself: a column added to one and not the other shows up here.
  const columns = TRANSACTION_RAW_COLUMNS_SQL.split(',').map((column) =>
    column.trim().replace(/^t\./, ''),
  );
  const camel = (column: string) =>
    column.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  const RELATIONS = {
    accountName: 'Wallet',
    fromAccountName: 'Savings',
    toAccountName: 'Card',
    categoryName: 'Lunch',
    categoryIcon: 'meal',
    categoryParentId: 'c-food',
    categoryParentName: 'Food',
    instalmentCount: 12,
  };
  const relationValues = [
    RELATIONS.accountName,
    RELATIONS.fromAccountName,
    RELATIONS.toAccountName,
    RELATIONS.categoryName,
    RELATIONS.categoryIcon,
    RELATIONS.categoryParentId,
    RELATIONS.categoryParentName,
    RELATIONS.instalmentCount,
  ];

  function rawFor(row: Record<string, unknown>) {
    return columns.map((column) => {
      const key = camel(column);
      expect(key in row).toBe(true);
      return row[key] as string | number | null;
    });
  }

  it('builds the same transaction as the Drizzle path, plus the relation names', () => {
    const row: any = {
      id: 't1',
      type: 'expense',
      amount: 12.5,
      currency: 'MYR',
      reportingCurrency: 'MYR',
      reportingAmount: 12.5,
      fxRate: 1,
      toAmount: null,
      accountAmount: null,
      date: '2026-05-13T04:00:00.000Z',
      accountId: 'a1',
      fromAccountId: null,
      toAccountId: null,
      categoryId: 'c-lunch',
      note: 'noodles',
      details: 'Team lunch after the quarterly review',
      receiptUri: 'receipts/1.jpg',
      recurrencePattern: 'monthly',
      recurrenceInterval: 2,
      recurrenceEndDate: '2027-01-01',
      recurrenceParentId: 'r1',
      sentiment: 'happy',
      reimbursable: 1,
      reimbursedAt: '2026-05-20T00:00:00.000Z',
      reimbursementAccountId: 'a2',
      reimbursementTransactionId: 't9',
      reimbursementOfId: null,
      countsAsExpense: 1,
      dayOrder: 1234,
      instalmentRuleId: 'plan1',
      instalmentNumber: 4,
      createdBy: 'user-mei',
      memberId: 'user-nelson',
      albumGroupId: null,
      feeOfId: 't7',
      ...STAMPS,
    };
    expect(toTransactionWithRelationsFromRaw([...rawFor(row), ...relationValues])).toEqual({
      ...toTransaction(row),
      ...RELATIONS,
    });
  });

  it('normalizes missing and out-of-range values the same way', () => {
    const row: any = {
      id: 't2',
      type: 'not-a-type',
      amount: 3,
      currency: 'USD',
      reportingCurrency: null,
      reportingAmount: null,
      fxRate: null,
      toAmount: null,
      accountAmount: null,
      date: '2026-05-13',
      accountId: null,
      fromAccountId: 'a1',
      toAccountId: 'a2',
      categoryId: null,
      note: null,
      details: null,
      receiptUri: null,
      recurrencePattern: null,
      recurrenceInterval: 0,
      recurrenceEndDate: null,
      recurrenceParentId: null,
      sentiment: null,
      reimbursable: 0,
      reimbursedAt: null,
      reimbursementAccountId: null,
      reimbursementTransactionId: null,
      reimbursementOfId: null,
      countsAsExpense: 0,
      dayOrder: null,
      instalmentRuleId: null,
      instalmentNumber: null,
      createdBy: null,
      memberId: null,
      albumGroupId: null,
      feeOfId: null,
      ...STAMPS,
    };
    const nullRelations = relationValues.map(() => null);
    expect(toTransactionWithRelationsFromRaw([...rawFor(row), ...nullRelations])).toEqual({
      ...toTransaction(row),
      accountName: null,
      fromAccountName: null,
      toAccountName: null,
      categoryName: null,
      categoryIcon: null,
      categoryParentId: null,
      categoryParentName: null,
      instalmentCount: null,
    });
  });
});

describe('createTransactionAssembler', () => {
  type RawValue = string | number | null;
  const names = (sql: string) => sql.split(',').map((column) => column.trim().replace(/^t\./, ''));
  const rawColumns = names(TRANSACTION_RAW_COLUMNS_SQL);
  const commonColumns = names(TRANSACTION_COMMON_COLUMNS_SQL);
  // `t.id` leads the sparse query so its rows can be matched to the common ones.
  const sparseColumns = names(TRANSACTION_SPARSE_COLUMNS_SQL).slice(1);
  // What the filter calls "not set": `t.column IS NOT <the default>`.
  const sparseDefaults = new Map<string, RawValue>(
    TRANSACTION_SPARSE_FILTER_SQL.split(' OR ').map((term) => {
      const match = /^t\.(\w+) IS NOT (.+)$/.exec(term);
      if (!match) throw new Error(`Unreadable filter term: ${term}`);
      const [, column, literal] = match as unknown as [string, string, string];
      if (literal === 'NULL') return [column, null];
      return [column, literal.startsWith("'") ? literal.slice(1, -1) : Number(literal)];
    }),
  );

  const lookups: TransactionRelationLookups = {
    accountNames: new Map([
      ['a1', 'Wallet'],
      ['a2', 'Card'],
    ]),
    categories: new Map([
      ['c-lunch', { name: 'Lunch', icon: 'meal', parentId: 'c-food', parentName: 'Food' }],
      ['c-food', { name: 'Food', icon: 'meal', parentId: null, parentName: null }],
    ]),
    instalmentCounts: new Map([['plan1', 12]]),
  };

  /** The full raw row a common row and its sparse values stand for. */
  function fullRow(values: Record<string, RawValue>) {
    const relations = transactionRelations(
      {
        accountId: values.account_id as string | null,
        fromAccountId: values.from_account_id as string | null,
        toAccountId: values.to_account_id as string | null,
        categoryId: values.category_id as string | null,
        instalmentRuleId: values.instalment_rule_id as string | null,
      },
      lookups,
    );
    return [
      ...rawColumns.map((column) => values[column] ?? null),
      relations.accountName,
      relations.fromAccountName,
      relations.toAccountName,
      relations.categoryName,
      relations.categoryIcon,
      relations.categoryParentId,
      relations.categoryParentName,
      relations.instalmentCount,
    ];
  }

  const common: Record<string, RawValue> = {
    id: 't1',
    type: 'expense',
    amount: 12.5,
    currency: 'MYR',
    reporting_currency: 'MYR',
    reporting_amount: 12.5,
    fx_rate: 1,
    date: '2026-05-13T04:00:00.000Z',
    account_id: 'a1',
    from_account_id: null,
    to_account_id: null,
    category_id: 'c-lunch',
    note: 'noodles',
    created_at: '2026-05-13T04:00:00.000Z',
    updated_at: '2026-05-14T04:00:00.000Z',
  };
  const commonRow = (values: Record<string, RawValue>) =>
    commonColumns.map((column) => values[column] ?? null);

  it('reads every raw column in exactly one of the two parts', () => {
    expect([...commonColumns, ...sparseColumns].sort()).toEqual([...rawColumns].sort());
    expect(commonColumns[0]).toBe('id');
    expect([...sparseDefaults.keys()]).toEqual(sparseColumns);
    expect(Object.keys(common)).toEqual(commonColumns);
  });

  it('builds a row with no sparse values as the raw mapper would, key for key', () => {
    const defaults = Object.fromEntries(sparseDefaults);
    const built = createTransactionAssembler(lookups, new Map())(commonRow(common));
    const expected = toTransactionWithRelationsFromRaw(fullRow({ ...defaults, ...common }));
    expect(built).toEqual(expected);
    expect(Object.keys(built)).toEqual(Object.keys(expected));
    expect(built.accountName).toBe('Wallet');
    expect(built.categoryParentName).toBe('Food');
  });

  it('builds a transfer with no sparse values the same way', () => {
    const transfer = {
      ...common,
      id: 't2',
      type: 'transfer',
      reporting_currency: null,
      reporting_amount: null,
      fx_rate: null,
      account_id: null,
      from_account_id: 'a1',
      to_account_id: 'a2',
      category_id: null,
      note: null,
    };
    const built = createTransactionAssembler(lookups, new Map())(commonRow(transfer));
    expect(built).toEqual(
      toTransactionWithRelationsFromRaw(
        fullRow({ ...Object.fromEntries(sparseDefaults), ...transfer }),
      ),
    );
    expect(built.fromAccountName).toBe('Wallet');
    expect(built.toAccountName).toBe('Card');
  });

  it('gives a row its sparse values and the names they point at', () => {
    const sparse: Record<string, RawValue> = {
      to_amount: 55,
      account_amount: 50,
      receipt_uri: 'receipts/1.jpg',
      recurrence_pattern: 'monthly',
      recurrence_interval: 2,
      recurrence_end_date: '2027-01-01',
      recurrence_parent_id: 'r1',
      sentiment: 'happy',
      reimbursable: 1,
      reimbursed_at: '2026-05-20T00:00:00.000Z',
      reimbursement_account_id: 'a2',
      reimbursement_transaction_id: 't9',
      reimbursement_of_id: 't8',
      counts_as_expense: 1,
      day_order: 1234.5,
      deleted_at: null,
      details: 'Team lunch',
      instalment_rule_id: 'plan1',
      instalment_number: 4,
      created_by: 'user-mei',
      member_id: 'user-nelson',
      fee_of_id: 't7',
      album_group_id: 'album-1',
    };
    expect(Object.keys(sparse)).toEqual(sparseColumns);
    const sparseById = new Map([['t1', ['t1', ...sparseColumns.map((column) => sparse[column])]]]);
    const assemble = createTransactionAssembler(lookups, sparseById as Map<string, RawValue[]>);
    const built = assemble(commonRow(common));
    expect(built).toEqual(toTransactionWithRelationsFromRaw(fullRow({ ...sparse, ...common })));
    expect(built.instalmentCount).toBe(12);
    expect(built.sentiment).toBe('happy');
    // The row after a sparse one starts clean.
    const plain = assemble(commonRow({ ...common, id: 't3' }));
    expect(plain.sentiment).toBe('neutral');
    expect(plain.receiptUri).toBeNull();
    expect(plain.instalmentCount).toBeNull();
  });
});

describe('transactionRelations', () => {
  const lookups: TransactionRelationLookups = {
    accountNames: new Map([['a1', 'Wallet']]),
    categories: new Map([
      ['c1', { name: 'Coffee', icon: 'cup', parentId: 'c0', parentName: 'Food' }],
    ]),
    instalmentCounts: new Map([['plan1', 6]]),
  };
  const none = {
    accountId: null,
    fromAccountId: null,
    toAccountId: null,
    categoryId: null,
    instalmentRuleId: null,
  };

  it('names what a transaction points at', () => {
    expect(
      transactionRelations(
        { ...none, accountId: 'a1', categoryId: 'c1', instalmentRuleId: 'plan1' },
        lookups,
      ),
    ).toEqual({
      accountName: 'Wallet',
      fromAccountName: null,
      toAccountName: null,
      categoryName: 'Coffee',
      categoryIcon: 'cup',
      categoryParentId: 'c0',
      categoryParentName: 'Food',
      instalmentCount: 6,
    });
  });

  it('gives null for a row that is gone, and for an empty id', () => {
    const relations = transactionRelations(
      {
        accountId: '',
        fromAccountId: 'deleted-account',
        toAccountId: 'a1',
        categoryId: 'no-such-category',
        instalmentRuleId: 'deleted-plan',
      },
      lookups,
    );
    expect(relations).toEqual({
      accountName: null,
      fromAccountName: null,
      toAccountName: 'Wallet',
      categoryName: null,
      categoryIcon: null,
      categoryParentId: null,
      categoryParentName: null,
      instalmentCount: null,
    });
  });
});
