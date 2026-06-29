export const PRO_LIMITS = {
  FREE_MAX_ACCOUNTS: 5,
  FREE_MAX_CATEGORIES: 9,
  FREE_MAX_RECURRING_RULES: 5,
  FREE_MAX_WAGE_ENTRIES: 5,
  /** Free users can upload this many custom account logos. */
  FREE_MAX_CUSTOM_LOGOS: 2,
  /** Free users can add this many sub-currencies for multi-currency tracking. */
  FREE_MAX_SUBCURRENCIES: 1,
  /** Free users can hold-to-record this many times total (lifetime, not per-day). */
  FREE_VOICE_TOTAL_USES: 15,
  /** Free users can create this many albums (trips). */
  FREE_MAX_ALBUMS: 3,
  /** Free users can track this many cost-per-day items. */
  FREE_MAX_ITEMS: 5,
} as const;

export const PRO_TREND_TYPES = [
  'expense_trend',
  'income_trend',
  'category_trend',
  'expense_sentiment',
  'asset_history',
] as const;

export type ProTrendType = (typeof PRO_TREND_TYPES)[number];
