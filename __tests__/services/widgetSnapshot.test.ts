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
  onboardingCompleted: true,
  userMode: 'power',
  weekStartsOn: 1,
  autoBackupEnabled: false,
  autoBackupTarget: 'local',
  lastAutoBackupAt: null,
  lastAutoBackupError: null,
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
});
