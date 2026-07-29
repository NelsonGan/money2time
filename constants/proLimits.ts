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
  /** Free users can create this many budget templates. */
  FREE_MAX_BUDGET_TEMPLATES: 1,
  /** Free users can have this many non-archived savings goals at once. */
  FREE_MAX_SAVINGS_GOALS: 2,
  /** Free users can attach this many receipt images in total (across all transactions). */
  FREE_MAX_RECEIPTS: 30,
  /** Free users can scan this many receipts in total — lifetime, not per month (server-enforced). */
  FREE_MAX_RECEIPT_SCANS: 20,
  /**
   * Pro users can scan this many receipts per calendar month (server-enforced).
   * The paywall advertises Pro scans as unlimited; this fair-use cap only
   * surfaces in the limit-reached alert if a Pro user actually hits it.
   */
  PRO_MAX_RECEIPT_SCANS: 500,
  /** Free users can have this many unsettled split bills at once (counted per transaction). */
  FREE_MAX_UNSETTLED_SPLIT_BILLS: 3,
  /**
   * Free users can have this many open reimbursement claims at once. Higher
   * than the split-bill cap because claims arrive in bursts (one business trip
   * is a dozen receipts), and clearing one frees a slot.
   */
  FREE_MAX_PENDING_REIMBURSEMENTS: 10,
  /**
   * Free users can auto-log this many tap-to-pay transactions from the iOS
   * Shortcuts automation (lifetime, not per-month). Enforced in the App Intent
   * via the catalog's `remaining`, never at drain time — a transaction that has
   * already been captured must not be dropped on the way in.
   */
  FREE_MAX_AUTO_LOGS: 100,
} as const;

export const PRO_TREND_TYPES = [
  'expense_trend',
  'income_trend',
  'category_trend',
  'expense_sentiment',
  'asset_history',
] as const;

export type ProTrendType = (typeof PRO_TREND_TYPES)[number];
