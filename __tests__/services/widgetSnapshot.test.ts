import { WIDGET_IDS } from '~/services/widgetRegistry';
import { buildMoney2TimeWidgetSnapshot } from '~/services/widgetSnapshot.shared';
import type { TransactionWithRelations, UserSettings } from '~/types';

const baseSettings: UserSettings = {
  id: 'settings',
  appUserId: 'user',
  locale: 'en',
  currencyCode: 'USD',
  currencySymbol: '$',
  displayMode: 'money',
  hapticsEnabled: true,
  themeMode: 'system',
  themeColor: 'sage',
  accountLogoCountry: null,
  profileName: null,
  profileAvatarUri: null,
  onboardingCompleted: true,
  userMode: 'power',
  weekStartsOn: 1,
  biometricLockEnabled: false,
  biometricLockDelaySeconds: 0,
  autoBackupEnabled: false,
  autoBackupTarget: 'local',
  lastAutoBackupAt: null,
  lastAutoBackupError: null,
  autoFxRefreshEnabled: true,
  lastRateFetchAt: null,
  lastRateFetchError: null,
  fxCurrenciesJson: null,
  firstAppOpen: '2026-06-01T00:00:00.000Z',
  paymentQrUri: null,
  defaultPaybackAccountId: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  deletedAt: null,
};

function transaction(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: overrides.id ?? 'tx',
    type: overrides.type ?? 'expense',
    amount: overrides.amount ?? 0,
    currency: 'USD',
    reportingCurrency: overrides.reportingCurrency ?? 'USD',
    reportingAmount: overrides.reportingAmount ?? overrides.amount ?? 0,
    fxRate: overrides.fxRate ?? 1,
    toAmount: overrides.toAmount ?? null,
    accountAmount: overrides.accountAmount ?? null,
    receiptUri: overrides.receiptUri ?? null,
    date: overrides.date ?? '2026-06-03T12:00:00.000Z',
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
    splitMethod: null,
    createdAt: '2026-06-03T12:00:00.000Z',
    updatedAt: '2026-06-03T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('buildMoney2TimeWidgetSnapshot', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-03T08:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds the free monthly expense quick-log snapshot from current-month expenses', () => {
    const snapshot = buildMoney2TimeWidgetSnapshot({
      transactions: [
        transaction({ id: 'expense-1', amount: 30 }),
        transaction({ id: 'expense-2', amount: 45.5 }),
        transaction({ id: 'income', type: 'income', amount: 1000 }),
        transaction({ id: 'last-month', amount: 90, date: '2026-05-31T12:00:00.000Z' }),
        transaction({ id: 'deleted', amount: 500, deletedAt: '2026-06-03T12:00:00.000Z' }),
      ],
      settings: baseSettings,
      isPro: false,
      getTrueHourlyRateForDate: () => 15,
    });

    expect(snapshot.monthlyExpenseQuickLog).toMatchObject({
      widgetId: WIDGET_IDS.monthlyExpenseQuickLog,
      monthKey: '2026-06',
      expenseAmount: 75.5,
      expenseLabel: '$75.5',
      timeEquivalentLabel: '5h 2m of work',
      hasHourlyRate: true,
      incomeUrl: 'money2time://quick-add?type=income',
      expenseUrl: 'money2time://quick-add?type=expense',
    });
  });

  it('includes pro-only widget unlock urls while marking the current user tier', () => {
    const snapshot = buildMoney2TimeWidgetSnapshot({
      transactions: [],
      settings: baseSettings,
      isPro: false,
      getTrueHourlyRateForDate: () => 0,
    });

    expect(snapshot.isPro).toBe(false);
    expect(snapshot.widgets.some((widget) => widget.access === 'pro')).toBe(true);
    expect(snapshot.proUnlockUrlByWidgetId[WIDGET_IDS.weeklyExpense]).toBe(
      'money2time://pro?source=widget_weekly_expense',
    );
    expect(snapshot.proUnlockUrlByWidgetId[WIDGET_IDS.calendarMonth]).toBe(
      'money2time://pro?source=widget_calendar_month',
    );
    expect(snapshot.monthlyExpenseQuickLog.timeEquivalentLabel).toBe('Set hourly value in app');
  });

  it('builds the past-7-days expense bars ending on today', () => {
    const snapshot = buildMoney2TimeWidgetSnapshot({
      transactions: [
        transaction({ id: 'today', amount: 20, date: '2026-06-03T09:00:00.000Z' }),
        transaction({ id: 'today-2', amount: 5, date: '2026-06-03T12:00:00.000Z' }),
        transaction({ id: 'two-days-ago', amount: 60, date: '2026-06-01T12:00:00.000Z' }),
        transaction({
          id: 'income',
          type: 'income',
          amount: 999,
          date: '2026-06-03T12:00:00.000Z',
        }),
        transaction({ id: 'too-old', amount: 40, date: '2026-05-26T12:00:00.000Z' }),
        transaction({ id: 'deleted', amount: 70, deletedAt: '2026-06-03T12:00:00.000Z' }),
      ],
      settings: baseSettings,
      isPro: true,
      getTrueHourlyRateForDate: () => 15,
    });

    const weekly = snapshot.weeklyExpense;
    expect(weekly.days).toHaveLength(7);
    expect(weekly.days[6].dayKey).toBe('2026-06-03');
    expect(weekly.days[6].isToday).toBe(true);
    expect(weekly.days[6].amount).toBe(25);
    expect(weekly.days[4].amount).toBe(60);
    expect(weekly.totalAmount).toBe(85);
    expect(weekly.maxAmount).toBe(60);
    expect(weekly.totalLabel).toBe('$85');
  });

  it('builds the current-month calendar grid with per-day income and expense', () => {
    const snapshot = buildMoney2TimeWidgetSnapshot({
      transactions: [
        transaction({ id: 'exp', amount: 30, date: '2026-06-03T09:00:00.000Z' }),
        transaction({ id: 'inc', type: 'income', amount: 200, date: '2026-06-10T09:00:00.000Z' }),
        transaction({ id: 'other-month', amount: 99, date: '2026-05-15T09:00:00.000Z' }),
      ],
      settings: baseSettings,
      isPro: true,
      getTrueHourlyRateForDate: () => 15,
    });

    const calendar = snapshot.calendarMonth;
    expect(calendar.monthKey).toBe('2026-06');
    expect(calendar.days).toHaveLength(30);
    // June 1 2026 is a Monday; weekStartsOn Monday -> no leading spacers.
    expect(calendar.leadingSpacers).toBe(0);
    expect(calendar.weekdayLabels).toHaveLength(7);

    const june3 = calendar.days.find((day) => day.dayNumber === 3);
    expect(june3?.expense).toBe(30);
    expect(june3?.isToday).toBe(true);
    expect(june3?.incomeStronger).toBe(false);

    const june10 = calendar.days.find((day) => day.dayNumber === 10);
    expect(june10?.income).toBe(200);
    expect(june10?.incomeStronger).toBe(true);
    expect(june10?.isFuture).toBe(true);

    expect(calendar.totalIncome).toBe(200);
    expect(calendar.totalExpense).toBe(30);
  });

  it('builds the savings-rate snapshot from current-month income and expense', () => {
    const snapshot = buildMoney2TimeWidgetSnapshot({
      transactions: [
        transaction({ id: 'inc', type: 'income', amount: 1000 }),
        transaction({ id: 'exp-1', amount: 200 }),
        transaction({ id: 'exp-2', amount: 120 }),
        transaction({
          id: 'other-month',
          type: 'income',
          amount: 5000,
          date: '2026-05-10T12:00:00.000Z',
        }),
        transaction({ id: 'deleted', amount: 999, deletedAt: '2026-06-03T12:00:00.000Z' }),
      ],
      settings: baseSettings,
      isPro: true,
      getTrueHourlyRateForDate: () => 20,
    });

    expect(snapshot.savingsRate).toMatchObject({
      widgetId: WIDGET_IDS.savingsRate,
      monthKey: '2026-06',
      income: 1000,
      expense: 320,
      saved: 680,
      rateLabel: '68%',
      savedCaption: 'Saved',
      savedLabel: '$680',
      expenseLabel: '$320',
      isPositive: true,
      hasIncome: true,
    });
    expect(snapshot.proUnlockUrlByWidgetId[WIDGET_IDS.savingsRate]).toBe(
      'money2time://pro?source=widget_savings_rate',
    );
  });

  it('marks the savings-rate snapshot as overspent when expenses exceed income', () => {
    const snapshot = buildMoney2TimeWidgetSnapshot({
      transactions: [
        transaction({ id: 'inc', type: 'income', amount: 100 }),
        transaction({ id: 'exp', amount: 124 }),
      ],
      settings: baseSettings,
      isPro: true,
      getTrueHourlyRateForDate: () => 20,
    });

    expect(snapshot.savingsRate).toMatchObject({
      saved: -24,
      rateLabel: '−24%',
      savedCaption: 'Overspent',
      savedLabel: '$24',
      isPositive: false,
      hasIncome: true,
    });
  });

  it('shows a placeholder savings rate when there is no income', () => {
    const snapshot = buildMoney2TimeWidgetSnapshot({
      transactions: [transaction({ id: 'exp', amount: 50 })],
      settings: baseSettings,
      isPro: true,
      getTrueHourlyRateForDate: () => 20,
    });

    expect(snapshot.savingsRate.rateLabel).toBe('—');
    expect(snapshot.savingsRate.hasIncome).toBe(false);
    expect(snapshot.savingsRate.savingsRate).toBe(0);
  });

  it('excludes savings-filtered categories (and their children) from the savings widgets', () => {
    const snapshot = buildMoney2TimeWidgetSnapshot({
      transactions: [
        transaction({ id: 'inc', type: 'income', amount: 1000, categoryId: 'salary' }),
        transaction({ id: 'exp-keep', amount: 300, categoryId: 'food' }),
        // Excluded directly by id, and via a child of an excluded parent.
        transaction({ id: 'exp-drop', amount: 200, categoryId: 'rent' }),
        transaction({ id: 'exp-drop-child', amount: 150, categoryId: 'rent-sub' }),
      ],
      settings: baseSettings,
      isPro: true,
      getTrueHourlyRateForDate: () => 20,
      categories: [
        { id: 'salary', parentId: null, name: 'Salary', icon: '💼' },
        { id: 'food', parentId: null, name: 'Food', icon: '🍜' },
        { id: 'rent', parentId: null, name: 'Rent', icon: '🏠' },
        { id: 'rent-sub', parentId: 'rent', name: 'Utilities', icon: '💡' },
      ],
      excludedSavingsExpenseCategoryIds: ['rent'],
    });

    // Only the $300 food expense counts → saved 700, rate 70%.
    expect(snapshot.savingsRate).toMatchObject({ income: 1000, expense: 300, saved: 700 });
    const currentMonth = snapshot.savingsHistory.months[0];
    expect(currentMonth).toMatchObject({ income: 1000, expense: 300, saved: 700 });
  });
});
