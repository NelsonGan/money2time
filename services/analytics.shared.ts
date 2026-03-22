/**
 * Shared types and event name constants for Mixpanel analytics.
 *
 * Event names follow a consistent `Category Action` naming convention
 * so they sort naturally inside the Mixpanel dashboard.
 */

// ---------------------------------------------------------------------------
// Event name constants
// ---------------------------------------------------------------------------

export const AnalyticsEvents = {
  // Onboarding
  ONBOARDING_STARTED: 'Onboarding Started',
  ONBOARDING_COMPLETED: 'Onboarding Completed',
  ONBOARDING_SKIPPED: 'Onboarding Skipped',
  ONBOARDING_MODE_SELECTED: 'Onboarding Mode Selected',
  ONBOARDING_IMPORT_STARTED: 'Onboarding Import Started',
  ONBOARDING_IMPORT_COMPLETED: 'Onboarding Import Completed',
  ONBOARDING_IMPORT_FAILED: 'Onboarding Import Failed',
  ONBOARDING_NOTIFICATIONS_ENABLED: 'Onboarding Notifications Enabled',
  ONBOARDING_NOTIFICATIONS_SKIPPED: 'Onboarding Notifications Skipped',

  // Navigation / screen views
  TAB_VIEWED: 'Tab Viewed',
  SCREEN_VIEWED: 'Screen Viewed',

  // Transactions
  TRANSACTION_CREATED: 'Transaction Created',
  TRANSACTION_UPDATED: 'Transaction Updated',
  TRANSACTION_DELETED: 'Transaction Deleted',
  TRANSACTIONS_BULK_DELETED: 'Transactions Bulk Deleted',

  // Accounts
  ACCOUNT_CREATED: 'Account Created',
  ACCOUNT_DELETED: 'Account Deleted',

  // Categories
  CATEGORY_CREATED: 'Category Created',
  CATEGORY_DELETED: 'Category Deleted',

  // Recurring rules
  RECURRING_RULE_CREATED: 'Recurring Rule Created',
  RECURRING_RULE_UPDATED: 'Recurring Rule Updated',
  RECURRING_RULE_DELETED: 'Recurring Rule Deleted',

  // Insights
  INSIGHTS_DRILLDOWN_OPENED: 'Insights Drilldown Opened',

  // Settings
  SETTINGS_UPDATED: 'Settings Updated',
  DISPLAY_MODE_TOGGLED: 'Display Mode Toggled',
  WAGE_CONFIG_UPDATED: 'Wage Config Updated',
  MODE_SWITCHED: 'Mode Switched',
  DATA_RESET: 'Data Reset',
  DATA_IMPORTED: 'Data Imported',

  // Tutorial
  TUTORIAL_STARTED: 'Tutorial Started',
  TUTORIAL_COMPLETED: 'Tutorial Completed',
  TUTORIAL_SKIPPED: 'Tutorial Skipped',

  // Pro
  PRO_PAYWALL_VIEWED: 'Pro Paywall Viewed',
  PRO_PURCHASE_STARTED: 'Pro Purchase Started',
  PRO_PURCHASE_COMPLETED: 'Pro Purchase Completed',
  PRO_PURCHASE_PENDING: 'Pro Purchase Pending',
  PRO_PURCHASE_CANCELLED: 'Pro Purchase Cancelled',
  PRO_PURCHASE_FAILED: 'Pro Purchase Failed',
  PRO_RESTORE_STARTED: 'Pro Restore Started',
  PRO_RESTORE_COMPLETED: 'Pro Restore Completed',
  PRO_LIMIT_HIT: 'Pro Limit Hit',
} as const;

// ---------------------------------------------------------------------------
// Common property types
// ---------------------------------------------------------------------------

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

// ---------------------------------------------------------------------------
// Super-property keys set once per session / user
// ---------------------------------------------------------------------------

export interface AnalyticsSuperProperties {
  user_mode?: 'simple' | 'power';
  currency_code?: string;
  locale?: string;
  theme_mode?: string;
  theme_color?: string;
  display_mode?: 'money' | 'time';
  current_screen?: string;
}
