import type { Category, TransactionWithRelations, UserSettings, WeekStartsOn } from '~/types';
import {
  addMonthsAtMonthStart,
  amountToHoursByRate,
  dayKeyFromDateLocal,
  dayKeyFromIsoLocal,
  formatCompactCurrency,
  formatCompactNumber,
  formatHours,
  monthKeyFromDateLocal,
  monthKeyFromIsoLocal,
  normalizeMoneyAmount,
  startOfMonthDate,
} from '~/utils/formatters';

import {
  buildQuickAddWidgetUrl,
  buildWidgetProUrl,
  WIDGET_DEFINITIONS,
  WIDGET_IDS,
  type WidgetDefinition,
} from './widgetRegistry';

export interface MonthlyExpenseQuickLogSnapshot {
  widgetId: typeof WIDGET_IDS.monthlyExpenseQuickLog;
  title: string;
  monthKey: string;
  expenseAmount: number;
  expenseLabel: string;
  timeEquivalentLabel: string;
  hasHourlyRate: boolean;
  incomeUrl: string;
  expenseUrl: string;
}

export interface QuickAddSmallSnapshot {
  widgetId: typeof WIDGET_IDS.quickAddSmall;
  title: string;
  monthKey: string;
  expenseAmount: number;
  expenseLabel: string;
  timeEquivalentLabel: string;
  hasHourlyRate: boolean;
  incomeUrl: string;
  expenseUrl: string;
}

export interface WeeklyExpenseDay {
  dayKey: string;
  weekdayLabel: string;
  amount: number;
  /** Compact, currency-symbol-free label for the tiny per-bar value (e.g. "42", "1.2K"). */
  barLabel: string;
  isToday: boolean;
}

export interface WeeklyExpenseSnapshot {
  widgetId: typeof WIDGET_IDS.weeklyExpense;
  title: string;
  days: WeeklyExpenseDay[];
  totalAmount: number;
  totalLabel: string;
  maxAmount: number;
}

export interface CalendarDaySnapshot {
  dayKey: string;
  dayNumber: number;
  income: number;
  expense: number;
  incomeLabel: string;
  expenseLabel: string;
  hasActivity: boolean;
  incomeStronger: boolean;
  intensity: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface CalendarMonthSnapshot {
  widgetId: typeof WIDGET_IDS.calendarMonth;
  title: string;
  monthKey: string;
  monthLabel: string;
  weekdayLabels: string[];
  leadingSpacers: number;
  days: CalendarDaySnapshot[];
  totalIncome: number;
  totalExpense: number;
  incomeLabel: string;
  expenseLabel: string;
}

export interface SavingsRateSnapshot {
  widgetId: typeof WIDGET_IDS.savingsRate;
  title: string;
  monthKey: string;
  monthLabel: string;
  income: number;
  expense: number;
  /** income − expense; negative when the month is overspent. */
  saved: number;
  /** saved / income as a fraction; 0 when there is no income. */
  savingsRate: number;
  /** "68%", "−24%", or "—" when there is no income yet. */
  rateLabel: string;
  incomeLabel: string;
  expenseLabel: string;
  /** Compact saved amount, always non-negative (paired with savedCaption). */
  savedLabel: string;
  /** "Saved" or "Overspent". */
  savedCaption: string;
  /** Whether the month is net-positive (saved ≥ 0). */
  isPositive: boolean;
  /** Whether any income exists this month (rate is meaningful). */
  hasIncome: boolean;
  /** "≈ 167h of work kept" / "behind"; empty when no hourly rate is set. */
  timeEquivalentLabel: string;
}

export interface SavingsHistoryMonth {
  monthKey: string;
  /** Short month label, e.g. "Jun". */
  monthLabel: string;
  income: number;
  expense: number;
  /** income − expense; negative when overspent. */
  saved: number;
  /** saved / income as a fraction; 0 when there is no income. */
  savingsRate: number;
  /** "68%", "−24%", or "—" when there is no income. */
  rateLabel: string;
  /** Compact saved amount, always non-negative; "—" when the month has no activity. */
  savedLabel: string;
  isPositive: boolean;
  hasIncome: boolean;
  hasActivity: boolean;
}

export interface SavingsHistorySnapshot {
  widgetId: typeof WIDGET_IDS.savingsHistory;
  title: string;
  /** Most-recent month first. */
  months: SavingsHistoryMonth[];
  /** Average rate across months that have income; "—" when none. */
  averageRateLabel: string;
  /** Net saved across the whole window (income − expense); can be negative. */
  totalSaved: number;
  /** Compact total saved, always non-negative; color conveys the sign. */
  totalSavedLabel: string;
  /** Whether the window total is net-positive. */
  totalIsPositive: boolean;
}

export interface Money2TimeWidgetSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  isPro: boolean;
  locale: string;
  currencySymbol: string;
  widgets: WidgetDefinition[];
  monthlyExpenseQuickLog: MonthlyExpenseQuickLogSnapshot;
  quickAddSmall: QuickAddSmallSnapshot;
  weeklyExpense: WeeklyExpenseSnapshot;
  calendarMonth: CalendarMonthSnapshot;
  savingsRate: SavingsRateSnapshot;
  savingsHistory: SavingsHistorySnapshot;
  proUnlockUrlByWidgetId: Record<string, string>;
}

function buildTimeEquivalentLabel(amount: number, trueHourlyRate: number) {
  if (trueHourlyRate <= 0) return 'Set hourly value in app';
  return `${formatHours(amountToHoursByRate(amount, trueHourlyRate))} of work`;
}

function startOfDayLocal(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

const weekdayNarrowFormatterByLocale = new Map<string, Intl.DateTimeFormat>();

function getWeekdayNarrowFormatter(locale: string): Intl.DateTimeFormat {
  const cached = weekdayNarrowFormatterByLocale.get(locale);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
  } catch {
    formatter = new Intl.DateTimeFormat('en', { weekday: 'narrow' });
  }
  weekdayNarrowFormatterByLocale.set(locale, formatter);
  return formatter;
}

const monthLabelFormatterByLocale = new Map<string, Intl.DateTimeFormat>();

function getMonthLabelFormatter(locale: string): Intl.DateTimeFormat {
  const cached = monthLabelFormatterByLocale.get(locale);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
  } catch {
    formatter = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
  }
  monthLabelFormatterByLocale.set(locale, formatter);
  return formatter;
}

const shortMonthFormatterByLocale = new Map<string, Intl.DateTimeFormat>();

function getShortMonthFormatter(locale: string): Intl.DateTimeFormat {
  const cached = shortMonthFormatterByLocale.get(locale);
  if (cached) return cached;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
  } catch {
    formatter = new Intl.DateTimeFormat('en', { month: 'short' });
  }
  shortMonthFormatterByLocale.set(locale, formatter);
  return formatter;
}

const SAVINGS_HISTORY_MONTHS = 6;

function buildSavingsHistorySnapshot(
  transactions: TransactionWithRelations[],
  settings: UserSettings,
  includeInSavings: SavingsIncludePredicate,
): SavingsHistorySnapshot {
  const anchor = startOfMonthDate(new Date());
  const incomeByMonth = new Map<string, number>();
  const expenseByMonth = new Map<string, number>();

  // Month keys for the window, most-recent first.
  const monthDates = Array.from({ length: SAVINGS_HISTORY_MONTHS }, (_, index) =>
    addMonthsAtMonthStart(anchor, -index),
  );
  const monthKeys = new Set(monthDates.map((date) => monthKeyFromDateLocal(date)));

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'income' && transaction.type !== 'expense') continue;
    const monthKey = monthKeyFromIsoLocal(transaction.date);
    if (!monthKeys.has(monthKey)) continue;
    if (!includeInSavings(transaction)) continue;
    if (transaction.type === 'income') {
      incomeByMonth.set(monthKey, (incomeByMonth.get(monthKey) ?? 0) + transaction.amount);
    } else {
      expenseByMonth.set(monthKey, (expenseByMonth.get(monthKey) ?? 0) + transaction.amount);
    }
  }

  const shortMonthFormatter = getShortMonthFormatter(settings.locale);

  let rateSum = 0;
  let rateCount = 0;
  let totalSaved = 0;
  const months: SavingsHistoryMonth[] = monthDates.map((date) => {
    const monthKey = monthKeyFromDateLocal(date);
    const income = normalizeMoneyAmount(incomeByMonth.get(monthKey) ?? 0);
    const expense = normalizeMoneyAmount(expenseByMonth.get(monthKey) ?? 0);
    const saved = normalizeMoneyAmount(income - expense);
    const hasIncome = income > 0;
    const hasActivity = income > 0 || expense > 0;
    const savingsRate = hasIncome ? saved / income : 0;
    const isPositive = saved >= 0;
    totalSaved += saved;

    let rateLabel: string;
    if (!hasIncome) {
      rateLabel = '—';
    } else {
      // No sign — the text color (green/red) conveys positive vs negative.
      rateLabel = `${Math.abs(Math.round(savingsRate * 100))}%`;
      rateSum += savingsRate;
      rateCount += 1;
    }

    return {
      monthKey,
      monthLabel: shortMonthFormatter.format(date),
      income,
      expense,
      saved,
      savingsRate,
      rateLabel,
      savedLabel: hasActivity
        ? formatCompactCurrency(Math.abs(saved), settings.currencySymbol)
        : '—',
      isPositive,
      hasIncome,
      hasActivity,
    };
  });

  let averageRateLabel = '—';
  if (rateCount > 0) {
    const avgPercent = Math.round((rateSum / rateCount) * 100);
    averageRateLabel = `${avgPercent < 0 ? '−' : ''}${Math.abs(avgPercent)}%`;
  }

  totalSaved = normalizeMoneyAmount(totalSaved);

  return {
    widgetId: WIDGET_IDS.savingsHistory,
    title: 'Savings History',
    months,
    averageRateLabel,
    totalSaved,
    totalSavedLabel: formatCompactCurrency(Math.abs(totalSaved), settings.currencySymbol),
    totalIsPositive: totalSaved >= 0,
  };
}

function buildWeeklyExpenseSnapshot(
  transactions: TransactionWithRelations[],
  settings: UserSettings,
): WeeklyExpenseSnapshot {
  const today = startOfDayLocal(new Date());
  const dayBuckets = new Map<string, number>();
  const orderedDayKeys: string[] = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dayKey = dayKeyFromDateLocal(addDays(today, -offset));
    orderedDayKeys.push(dayKey);
    dayBuckets.set(dayKey, 0);
  }

  const firstDayKey = orderedDayKeys[0];
  const lastDayKey = orderedDayKeys[orderedDayKeys.length - 1];

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'expense') continue;
    const dayKey = dayKeyFromIsoLocal(transaction.date);
    if (dayKey < firstDayKey || dayKey > lastDayKey) continue;
    dayBuckets.set(dayKey, (dayBuckets.get(dayKey) ?? 0) + transaction.amount);
  }

  const narrowFormatter = getWeekdayNarrowFormatter(settings.locale);
  const todayDayKey = dayKeyFromDateLocal(today);

  let totalAmount = 0;
  let maxAmount = 0;
  const days: WeeklyExpenseDay[] = orderedDayKeys.map((dayKey, index) => {
    const amount = normalizeMoneyAmount(dayBuckets.get(dayKey) ?? 0);
    totalAmount += amount;
    if (amount > maxAmount) maxAmount = amount;
    return {
      dayKey,
      weekdayLabel: narrowFormatter.format(addDays(today, index - 6)),
      amount,
      barLabel: amount > 0 ? formatCompactNumber(amount) : '',
      isToday: dayKey === todayDayKey,
    };
  });

  totalAmount = normalizeMoneyAmount(totalAmount);

  return {
    widgetId: WIDGET_IDS.weeklyExpense,
    title: 'Past 7 Days',
    days,
    totalAmount,
    totalLabel: formatCompactCurrency(totalAmount, settings.currencySymbol),
    maxAmount,
  };
}

function buildCalendarMonthSnapshot(
  transactions: TransactionWithRelations[],
  settings: UserSettings,
): CalendarMonthSnapshot {
  const today = startOfDayLocal(new Date());
  const todayDayKey = dayKeyFromDateLocal(today);
  const year = today.getFullYear();
  const monthIndex = today.getMonth();
  const monthKey = monthKeyFromDateLocal(today);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weekStartsOn: WeekStartsOn = settings.weekStartsOn ?? 1;

  const incomeByDay = new Map<string, number>();
  const expenseByDay = new Map<string, number>();
  let totalIncome = 0;
  let totalExpense = 0;

  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'income' && transaction.type !== 'expense') continue;
    const dayKey = dayKeyFromIsoLocal(transaction.date);
    if (monthKeyFromIsoLocal(transaction.date) !== monthKey) continue;
    if (transaction.type === 'income') {
      incomeByDay.set(dayKey, (incomeByDay.get(dayKey) ?? 0) + transaction.amount);
      totalIncome += transaction.amount;
    } else {
      expenseByDay.set(dayKey, (expenseByDay.get(dayKey) ?? 0) + transaction.amount);
      totalExpense += transaction.amount;
    }
  }

  let maxAbsNet = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayKey = `${monthKey}-${String(day).padStart(2, '0')}`;
    const net = Math.abs((incomeByDay.get(dayKey) ?? 0) - (expenseByDay.get(dayKey) ?? 0));
    if (net > maxAbsNet) maxAbsNet = net;
  }

  const days: CalendarDaySnapshot[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayKey = `${monthKey}-${String(day).padStart(2, '0')}`;
    const income = normalizeMoneyAmount(incomeByDay.get(dayKey) ?? 0);
    const expense = normalizeMoneyAmount(expenseByDay.get(dayKey) ?? 0);
    const hasActivity = income > 0 || expense > 0;
    const net = income - expense;
    const intensity =
      hasActivity && maxAbsNet > 0 ? Math.max(0.18, Math.min(0.85, Math.abs(net) / maxAbsNet)) : 0;
    days.push({
      dayKey,
      dayNumber: day,
      income,
      expense,
      incomeLabel: income > 0 ? formatCompactNumber(income) : '',
      expenseLabel: expense > 0 ? formatCompactNumber(expense) : '',
      hasActivity,
      incomeStronger: income > expense,
      intensity,
      isToday: dayKey === todayDayKey,
      isFuture: dayKey > todayDayKey,
    });
  }

  // Column index of the 1st (weekStartsOn is the leftmost column).
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const leadingSpacers = (firstWeekday - weekStartsOn + 7) % 7;

  const narrowFormatter = getWeekdayNarrowFormatter(settings.locale);
  // 2024-01-07 is a Sunday; shift by weekStartsOn to order from the first column.
  const sunday = new Date(2024, 0, 7);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
    narrowFormatter.format(addDays(sunday, weekStartsOn + index)),
  );

  totalIncome = normalizeMoneyAmount(totalIncome);
  totalExpense = normalizeMoneyAmount(totalExpense);

  return {
    widgetId: WIDGET_IDS.calendarMonth,
    title: 'Calendar',
    monthKey,
    monthLabel: getMonthLabelFormatter(settings.locale).format(today),
    weekdayLabels,
    leadingSpacers,
    days,
    totalIncome,
    totalExpense,
    incomeLabel: formatCompactCurrency(totalIncome, settings.currencySymbol),
    expenseLabel: formatCompactCurrency(totalExpense, settings.currencySymbol),
  };
}

/** Predicate: returns true when a transaction should count toward savings. */
export type SavingsIncludePredicate = (transaction: TransactionWithRelations) => boolean;

/**
 * Mirrors the Insights "Savings rate" filter: income/expense transactions whose
 * category (or its parent/root category) is excluded are dropped from the
 * savings calculation. Other categories and uncategorized transactions count.
 */
export function buildSavingsIncludePredicate(
  categories: Pick<Category, 'id' | 'parentId'>[],
  excludedSavingsIncomeCategoryIds: string[],
  excludedSavingsExpenseCategoryIds: string[],
): SavingsIncludePredicate {
  const incomeSet = new Set(excludedSavingsIncomeCategoryIds);
  const expenseSet = new Set(excludedSavingsExpenseCategoryIds);
  if (incomeSet.size === 0 && expenseSet.size === 0) return () => true;

  const rootById = new Map(
    categories.map((category) => [category.id, category.parentId ?? category.id]),
  );
  return (transaction) => {
    const categoryId = transaction.categoryId;
    if (!categoryId) return true;
    const rootId = rootById.get(categoryId) ?? categoryId;
    if (transaction.type === 'income') {
      return !(incomeSet.has(categoryId) || incomeSet.has(rootId));
    }
    return !(expenseSet.has(categoryId) || expenseSet.has(rootId));
  };
}

/** Reads the two savings-exclusion lists out of `settings.insightsPrefsJson`. */
export function parseSavingsExclusions(insightsPrefsJson: string | null | undefined): {
  income: string[];
  expense: string[];
} {
  if (!insightsPrefsJson) return { income: [], expense: [] };
  try {
    const parsed = JSON.parse(insightsPrefsJson) as Record<string, unknown>;
    const toList = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    return {
      income: toList(parsed.excludedSavingsIncomeCategoryIds),
      expense: toList(parsed.excludedSavingsExpenseCategoryIds),
    };
  } catch {
    return { income: [], expense: [] };
  }
}

function buildSavingsRateSnapshot(
  transactions: TransactionWithRelations[],
  settings: UserSettings,
  monthKey: string,
  hourlyRate: number,
  includeInSavings: SavingsIncludePredicate,
): SavingsRateSnapshot {
  let income = 0;
  let expense = 0;
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.type !== 'income' && transaction.type !== 'expense') continue;
    if (monthKeyFromIsoLocal(transaction.date) !== monthKey) continue;
    if (!includeInSavings(transaction)) continue;
    if (transaction.type === 'income') income += transaction.amount;
    else expense += transaction.amount;
  }

  income = normalizeMoneyAmount(income);
  expense = normalizeMoneyAmount(expense);
  const saved = normalizeMoneyAmount(income - expense);
  const hasIncome = income > 0;
  const savingsRate = hasIncome ? saved / income : 0;
  const isPositive = saved >= 0;

  let rateLabel: string;
  if (!hasIncome) {
    rateLabel = '—';
  } else {
    const percent = Math.round(savingsRate * 100);
    rateLabel = `${percent < 0 ? '−' : ''}${Math.abs(percent)}%`;
  }

  let timeEquivalentLabel = '';
  if (hourlyRate > 0 && saved !== 0) {
    const hours = formatHours(amountToHoursByRate(Math.abs(saved), hourlyRate));
    timeEquivalentLabel = `≈ ${hours} of work ${isPositive ? 'kept' : 'behind'}`;
  }

  return {
    widgetId: WIDGET_IDS.savingsRate,
    title: 'Savings Rate',
    monthKey,
    monthLabel: getMonthLabelFormatter(settings.locale).format(
      new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)) - 1, 1),
    ),
    income,
    expense,
    saved,
    savingsRate,
    rateLabel,
    incomeLabel: formatCompactCurrency(income, settings.currencySymbol),
    expenseLabel: formatCompactCurrency(expense, settings.currencySymbol),
    savedLabel: formatCompactCurrency(Math.abs(saved), settings.currencySymbol),
    savedCaption: isPositive ? 'Saved' : 'Overspent',
    isPositive,
    hasIncome,
    timeEquivalentLabel,
  };
}

export function buildMoney2TimeWidgetSnapshot({
  transactions,
  settings,
  isPro,
  getTrueHourlyRateForDate,
  categories = [],
  excludedSavingsIncomeCategoryIds = [],
  excludedSavingsExpenseCategoryIds = [],
}: {
  transactions: TransactionWithRelations[];
  settings: UserSettings;
  isPro: boolean;
  getTrueHourlyRateForDate: (dateIso: string) => number;
  /** Used to resolve a transaction's root category for the savings filter. */
  categories?: Pick<Category, 'id' | 'parentId'>[];
  /** Insights "Savings rate" category exclusions; applied to the savings widgets. */
  excludedSavingsIncomeCategoryIds?: string[];
  excludedSavingsExpenseCategoryIds?: string[];
}): Money2TimeWidgetSnapshot {
  const includeInSavings = buildSavingsIncludePredicate(
    categories,
    excludedSavingsIncomeCategoryIds,
    excludedSavingsExpenseCategoryIds,
  );
  const monthKey = monthKeyFromDateLocal(new Date());
  const expenseAmount = normalizeMoneyAmount(
    transactions.reduce((total, transaction) => {
      if (transaction.deletedAt) return total;
      if (transaction.type !== 'expense') return total;
      if (monthKeyFromIsoLocal(transaction.date) !== monthKey) return total;
      return total + transaction.amount;
    }, 0),
  );
  const hourlyRate = getTrueHourlyRateForDate(`${monthKey}-15T12:00:00`);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    isPro,
    locale: settings.locale,
    currencySymbol: settings.currencySymbol,
    widgets: WIDGET_DEFINITIONS,
    monthlyExpenseQuickLog: {
      widgetId: WIDGET_IDS.monthlyExpenseQuickLog,
      title: 'Monthly Spend',
      monthKey,
      expenseAmount,
      expenseLabel: formatCompactCurrency(expenseAmount, settings.currencySymbol),
      timeEquivalentLabel: buildTimeEquivalentLabel(expenseAmount, hourlyRate),
      hasHourlyRate: hourlyRate > 0,
      incomeUrl: buildQuickAddWidgetUrl('income'),
      expenseUrl: buildQuickAddWidgetUrl('expense'),
    },
    quickAddSmall: {
      widgetId: WIDGET_IDS.quickAddSmall,
      title: 'Quick Add',
      monthKey,
      expenseAmount,
      expenseLabel: formatCompactCurrency(expenseAmount, settings.currencySymbol),
      timeEquivalentLabel: buildTimeEquivalentLabel(expenseAmount, hourlyRate),
      hasHourlyRate: hourlyRate > 0,
      incomeUrl: buildQuickAddWidgetUrl('income'),
      expenseUrl: buildQuickAddWidgetUrl('expense'),
    },
    weeklyExpense: buildWeeklyExpenseSnapshot(transactions, settings),
    calendarMonth: buildCalendarMonthSnapshot(transactions, settings),
    savingsRate: buildSavingsRateSnapshot(
      transactions,
      settings,
      monthKey,
      hourlyRate,
      includeInSavings,
    ),
    savingsHistory: buildSavingsHistorySnapshot(transactions, settings, includeInSavings),
    proUnlockUrlByWidgetId: Object.fromEntries(
      WIDGET_DEFINITIONS.filter((definition) => definition.access === 'pro').map((definition) => [
        definition.id,
        buildWidgetProUrl(definition.id),
      ]),
    ),
  };
}

const SAMPLE_BAR_AMOUNTS = [42, 18, 67, 9, 88, 124, 53];
const SAMPLE_INCOME_BY_DAY: Record<number, number> = { 3: 1200, 10: 60, 17: 30, 24: 2400 };
const SAMPLE_EXPENSE_BY_DAY: Record<number, number> = {
  2: 24,
  5: 88,
  6: 132,
  12: 9,
  15: 210,
  18: 64,
  22: 77,
  25: 53,
  27: 119,
};

function sampleTransaction(
  id: string,
  type: 'income' | 'expense',
  amount: number,
  date: Date,
): TransactionWithRelations {
  return {
    id,
    type,
    amount,
    currency: 'USD',
    date: date.toISOString(),
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
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
    deletedAt: null,
  } as TransactionWithRelations;
}

/**
 * Illustrative snapshot used by the preview screen (when the user has no data
 * yet) and as the native widget-gallery placeholder, so the widgets always
 * render populated instead of an empty "set up" state.
 */
export function buildSampleWidgetSnapshot(settings: UserSettings): Money2TimeWidgetSnapshot {
  const today = startOfDayLocal(new Date());
  const year = today.getFullYear();
  const month = today.getMonth();
  const transactions: TransactionWithRelations[] = [];

  SAMPLE_BAR_AMOUNTS.forEach((amount, index) => {
    transactions.push(
      sampleTransaction(`sample-bar-${index}`, 'expense', amount, addDays(today, index - 6)),
    );
  });
  Object.entries(SAMPLE_INCOME_BY_DAY).forEach(([day, amount]) => {
    transactions.push(
      sampleTransaction(
        `sample-inc-${day}`,
        'income',
        amount,
        new Date(year, month, Number(day), 12),
      ),
    );
  });
  Object.entries(SAMPLE_EXPENSE_BY_DAY).forEach(([day, amount]) => {
    transactions.push(
      sampleTransaction(
        `sample-exp-${day}`,
        'expense',
        amount,
        new Date(year, month, Number(day), 12),
      ),
    );
  });

  // Prior months so the savings-history widget renders a populated multi-row trend.
  const SAMPLE_PRIOR_MONTHS: { income: number; expense: number }[] = [
    { income: 3200, expense: 2100 },
    { income: 3000, expense: 2750 },
    { income: 3000, expense: 3900 }, // overspent — negative savings rate
    { income: 2900, expense: 1450 },
    { income: 3100, expense: 2480 },
  ];
  SAMPLE_PRIOR_MONTHS.forEach(({ income, expense }, index) => {
    const offset = -(index + 1);
    transactions.push(
      sampleTransaction(
        `sample-hist-inc-${index}`,
        'income',
        income,
        new Date(year, month + offset, 15, 12),
      ),
    );
    transactions.push(
      sampleTransaction(
        `sample-hist-exp-${index}`,
        'expense',
        expense,
        new Date(year, month + offset, 16, 12),
      ),
    );
  });

  return buildMoney2TimeWidgetSnapshot({
    transactions,
    settings,
    isPro: true,
    getTrueHourlyRateForDate: () => 15,
  });
}
