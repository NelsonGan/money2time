export type WidgetAccess = 'free' | 'pro';
export type WidgetSize = 'small' | 'medium' | 'large';

export const WIDGET_DEEP_LINK_SCHEME = 'money2time';

export const WIDGET_IDS = {
  monthlyExpenseQuickLog: 'monthly_expense_quick_log',
  quickAddSmall: 'quick_add_small',
  weeklyExpense: 'weekly_expense',
  calendarMonth: 'calendar_month',
  savingsRate: 'savings_rate',
  savingsHistory: 'savings_history',
} as const;

export type WidgetId = (typeof WIDGET_IDS)[keyof typeof WIDGET_IDS];

export interface WidgetDefinition {
  id: WidgetId;
  title: string;
  access: WidgetAccess;
  supportedSizes: WidgetSize[];
  snapshotKey: string;
  proSource?: string;
}

export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  {
    id: WIDGET_IDS.monthlyExpenseQuickLog,
    title: 'Monthly Spend',
    access: 'free',
    supportedSizes: ['medium'],
    snapshotKey: 'monthlyExpenseQuickLog',
  },
  {
    id: WIDGET_IDS.quickAddSmall,
    title: 'Quick Add',
    access: 'free',
    supportedSizes: ['small'],
    snapshotKey: 'quickAddSmall',
  },
  {
    id: WIDGET_IDS.weeklyExpense,
    title: 'Past 7 Days',
    access: 'pro',
    supportedSizes: ['medium'],
    snapshotKey: 'weeklyExpense',
    proSource: 'widget_weekly_expense',
  },
  {
    id: WIDGET_IDS.calendarMonth,
    title: 'Calendar',
    access: 'pro',
    supportedSizes: ['large'],
    snapshotKey: 'calendarMonth',
    proSource: 'widget_calendar_month',
  },
  {
    id: WIDGET_IDS.savingsRate,
    title: 'Savings Rate',
    access: 'pro',
    supportedSizes: ['medium'],
    snapshotKey: 'savingsRate',
    proSource: 'widget_savings_rate',
  },
  {
    id: WIDGET_IDS.savingsHistory,
    title: 'Savings History',
    access: 'pro',
    supportedSizes: ['large'],
    snapshotKey: 'savingsHistory',
    proSource: 'widget_savings_history',
  },
];

export function buildQuickAddWidgetUrl(type: 'income' | 'expense') {
  return `${WIDGET_DEEP_LINK_SCHEME}://quick-add?type=${type}`;
}

export function buildWidgetProUrl(widgetId: WidgetId) {
  return `${WIDGET_DEEP_LINK_SCHEME}://pro?source=widget_${widgetId}`;
}
