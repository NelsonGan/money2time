export const PRO_LIMITS = {
  FREE_MAX_ACCOUNTS: 5,
  FREE_MAX_CATEGORIES: 9,
  FREE_MAX_RECURRING_RULES: 5,
  FREE_MAX_WAGE_ENTRIES: 5,
  /** Free users can hold-to-record this many times total (lifetime, not per-day). */
  FREE_VOICE_TOTAL_USES: 15,
} as const;

export const PRO_TREND_TYPES = [
  'expense_trend',
  'income_trend',
  'category_trend',
  'expense_sentiment',
  'asset_history',
  'income_rate_history',
] as const;

export type ProTrendType = (typeof PRO_TREND_TYPES)[number];
