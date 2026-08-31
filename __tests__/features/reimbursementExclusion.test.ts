import { buildCalendarMonthFromGrouped } from '~/features/calendar/lib/calendarBuild';
import { NO_REIMBURSEMENT } from '~/features/reimbursements/lib/reimbursementMath';
import { WIDGET_IDS } from '~/services/widgetRegistry';
import { buildMoney2TimeWidgetSnapshot } from '~/services/widgetSnapshot.shared';
import type { TransactionWithRelations, UserSettings } from '~/types';

/**
 * The exclusion is only useful if it reaches the surfaces a user actually
 * reads, so these drive two real aggregations end to end rather than the
 * predicate on its own (that is reimbursementMath.test.ts).
 */

const baseSettings: UserSettings = {
  id: 'settings',
  appUserId: 'user',
  locale: 'en',
  currencyCode: 'USD',
  currencySymbol: '$',
  displayMode: 'money',
  workdayDisplayEnabled: false,
  workingHoursPerDay: 8,
  hapticsEnabled: true,
  themeMode: 'system',
  themeColor: 'sage',
  iconStyle: 'clay',
  appIcon: 'classic',
  accountLogoCountry: null,
  subscriptionLogoCountry: null,
  profileName: null,
  profileAvatarUri: null,
  onboardingCompleted: true,
  userMode: 'power',
  weekStartsOn: 1,
  firstDayOfMonth: 1,
  firstDayOverridesJson: null,
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
  reimbursementsCountAsExpense: true,
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
    reportingCurrency: 'USD',
    reportingAmount: overrides.reportingAmount ?? overrides.amount ?? 0,
    fxRate: 1,
    toAmount: null,
    accountAmount: null,
    receiptUri: null,
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
    countsAsExpense: false,
    ...NO_REIMBURSEMENT,
    createdAt: '2026-06-03T12:00:00.000Z',
    updatedAt: '2026-06-03T12:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

// A plain lunch, a reimbursable work dinner, and the money-in row written when
// the dinner was paid back.
const ROWS: TransactionWithRelations[] = [
  transaction({ id: 'lunch', amount: 20 }),
  transaction({ id: 'dinner', amount: 80, reimbursable: true }),
  transaction({
    id: 'refund',
    type: 'income',
    amount: 80,
    reimbursementOfId: 'dinner',
  }),
];

describe('calendar totals', () => {
  const build = (reimbursementsCountAsExpense: boolean) =>
    buildCalendarMonthFromGrouped({
      monthAnchor: new Date('2026-06-03T12:00:00.000Z'),
      transactions: ROWS,
      locale: 'en',
      isTimeMode: false,
      getDisplayValueForTransaction: (tx) => tx.amount,
      todayDayKey: '2026-06-03',
      weekStartsOn: 1,
      monthCycle: 1,
      reimbursementsCountAsExpense,
    });

  it('counts the reimbursable expense and its refund by default', () => {
    const data = build(true);
    expect(data.totalExpense).toBe(100);
    expect(data.totalIncome).toBe(80);
  });

  it('leaves both halves out when reimbursements do not count', () => {
    const data = build(false);
    expect(data.totalExpense).toBe(20);
    expect(data.totalIncome).toBe(0);
  });

  // The row still has to be listed under its day, or a user would think the
  // transaction had vanished rather than been left out of the total.
  it('still shows every transaction on its day', () => {
    const data = build(false);
    const day = data.dailyByDayKey.get('2026-06-03');
    expect(day?.transactionCount).toBe(3);
  });
});

describe('widget snapshot totals', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-03T08:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const build = (reimbursementsCountAsExpense: boolean) =>
    buildMoney2TimeWidgetSnapshot({
      transactions: ROWS,
      settings: { ...baseSettings, reimbursementsCountAsExpense },
      isPro: true,
      getTrueHourlyRateForDate: () => 0,
    });

  it('counts the reimbursable expense by default', () => {
    expect(build(true).monthlyExpenseQuickLog.expenseAmount).toBe(100);
  });

  it('leaves it out when reimbursements do not count', () => {
    expect(build(false).monthlyExpenseQuickLog.expenseAmount).toBe(20);
  });

  it('leaves the refund out of the savings widget too, so income never inflates', () => {
    const counted = build(true).savingsRate;
    const excluded = build(false).savingsRate;
    expect(counted.income).toBe(80);
    expect(excluded.income).toBe(0);
    // Net is unchanged either way: the two halves cancel.
    expect(counted.income - counted.expense).toBe(excluded.income - excluded.expense);
  });

  it('keeps the widget registry ids stable', () => {
    expect(build(false).monthlyExpenseQuickLog.widgetId).toBe(WIDGET_IDS.monthlyExpenseQuickLog);
  });
});
