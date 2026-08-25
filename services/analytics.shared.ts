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
  ONBOARDING_SOURCE_SELECTED: 'Onboarding Source Selected',
  ONBOARDING_NOTIFICATIONS_ENABLED: 'Onboarding Notifications Enabled',
  ONBOARDING_NOTIFICATIONS_SKIPPED: 'Onboarding Notifications Skipped',
  ONBOARDING_BACKUP_ENABLED: 'Onboarding Backup Enabled',
  ONBOARDING_BACKUP_SKIPPED: 'Onboarding Backup Skipped',

  // Home-screen widget deep-link opens
  WIDGET_OPENED: 'Widget Opened',

  // Transactions
  VOICE_TRANSACTION_CREATED: 'Voice Transaction Created',
  AUTOLOG_TRANSACTION_CREATED: 'Autolog Transaction Created',
  BACK_TAP_TRIGGERED: 'Back Tap Triggered',
  TRANSACTION_DELETED: 'Transaction Deleted',
  TRANSACTIONS_BULK_DELETED: 'Transactions Bulk Deleted',

  // Receipt scanning
  RECEIPT_SCAN_STARTED: 'Receipt Scan Started',
  RECEIPT_SCAN_COMPLETED: 'Receipt Scan Completed',
  RECEIPT_SCAN_SAVED: 'Receipt Scan Saved',
  RECEIPT_SCAN_FAILED: 'Receipt Scan Failed',

  // Itemized receipt split (Split by Item)
  RECEIPT_SPLIT_STARTED: 'Receipt Split Started',
  RECEIPT_SPLIT_ITEMS_EDITED: 'Receipt Split Items Edited',
  RECEIPT_SPLIT_SAVED: 'Receipt Split Saved',
  RECEIPT_SPLIT_ABANDONED: 'Receipt Split Abandoned',
  RECEIPT_SPLIT_REOPENED: 'Receipt Split Reopened',

  // Split bills (Pay First)
  SPLIT_MARKED_PAID: 'Split Marked Paid',
  SPLIT_MARKED_UNPAID: 'Split Marked Unpaid',
  SETTLE_UP_OPENED: 'Settle Up Opened',
  SETTLE_UP_RECEIPT_SHARED: 'Settle Up Receipt Shared',
  SETTLE_UP_QR_SET: 'Settle Up Payment QR Set',

  // Reimbursements
  REIMBURSEMENT_FLAGGED: 'Reimbursement Flagged',
  REIMBURSEMENT_MARKED_PAID: 'Reimbursement Marked Paid',
  REIMBURSEMENT_REOPENED: 'Reimbursement Reopened',
  REIMBURSEMENT_OPENED: 'Reimbursements Opened',
  REIMBURSEMENT_COUNT_SETTING_CHANGED: 'Reimbursement Count Setting Changed',

  // Accounts
  ACCOUNT_CREATED: 'Account Created',
  ACCOUNT_DELETED: 'Account Deleted',

  // Savings goals
  GOAL_CREATED: 'Goal Created',
  GOAL_UPDATED: 'Goal Updated',
  GOAL_DEPOSIT_OPENED: 'Goal Deposit Opened',
  GOAL_WITHDRAW_OPENED: 'Goal Withdraw Opened',
  GOAL_ACHIEVED: 'Goal Achieved',
  GOAL_ARCHIVED: 'Goal Archived',
  GOAL_UNARCHIVED: 'Goal Unarchived',

  // Loans
  LOAN_CREATED: 'Loan Created',
  LOAN_PAYMENT_RECORDED: 'Loan Payment Recorded',
  LOAN_PAID_OFF: 'Loan Paid Off',
  LOAN_ARCHIVED: 'Loan Archived',
  LOAN_UNARCHIVED: 'Loan Unarchived',

  // Categories
  CATEGORY_CREATED: 'Category Created',
  CATEGORY_DELETED: 'Category Deleted',

  // Albums
  ALBUM_CREATED: 'Album Created',
  ALBUM_UPDATED: 'Album Updated',
  ALBUM_DELETED: 'Album Deleted',
  ALBUM_LOCATION_SET: 'Album Location Set',
  ALBUM_LOCATIONS_OPENED: 'Album Locations Opened',
  MAP_PIN_TAPPED: 'Map Pin Tapped',

  // Budgets
  BUDGET_TEMPLATE_CREATED: 'Budget Template Created',
  BUDGET_TEMPLATE_UPDATED: 'Budget Template Updated',
  BUDGET_TEMPLATE_DELETED: 'Budget Template Deleted',
  BUDGET_DEFAULT_CHANGED: 'Budget Default Changed',
  BUDGET_MONTH_CREATED: 'Budget Month Created',
  BUDGET_MONTH_UPDATED: 'Budget Month Updated',
  BUDGET_MONTH_DELETED: 'Budget Month Deleted',

  // Recurring rules
  RECURRING_RULE_CREATED: 'Recurring Rule Created',
  RECURRING_RULE_UPDATED: 'Recurring Rule Updated',
  RECURRING_RULE_DELETED: 'Recurring Rule Deleted',

  // Insights
  INSIGHTS_DRILLDOWN_OPENED: 'Insights Drilldown Opened',

  // Settings
  SETTINGS_UPDATED: 'Settings Updated',
  DISPLAY_MODE_TOGGLED: 'Display Mode Toggled',
  APP_ICON_CHANGED: 'App Icon Changed',
  WAGE_CONFIG_UPDATED: 'Wage Config Updated',
  MODE_SWITCHED: 'Mode Switched',
  DATA_RESET: 'Data Reset',
  DATA_IMPORTED: 'Data Imported',

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
  // Subscription → Lifetime upgrade funnel
  PRO_LIFETIME_UPGRADE_VIEWED: 'Pro Lifetime Upgrade Viewed',
  PRO_LIFETIME_UPGRADE_TAPPED: 'Pro Lifetime Upgrade Tapped',
  PRO_LIFETIME_UPGRADE_COMPLETED: 'Pro Lifetime Upgrade Completed',
  PRO_CANCEL_SUB_PROMPT_VIEWED: 'Pro Cancel Sub Prompt Viewed',
  PRO_CANCEL_SUB_PROMPT_ACTIONED: 'Pro Cancel Sub Prompt Actioned',
  PRO_REDUNDANT_SUB_WARNING_VIEWED: 'Pro Redundant Sub Warning Viewed',
  PRO_REDUNDANT_SUB_CANCEL_TAPPED: 'Pro Redundant Sub Cancel Tapped',
  // Exit-offer (last-chance) modal shown when closing the paywall
  PRO_EXIT_OFFER_VIEWED: 'Pro Exit Offer Viewed',
  PRO_EXIT_OFFER_DISMISSED: 'Pro Exit Offer Dismissed',
  PRO_EXIT_OFFER_ALL_PLANS_TAPPED: 'Pro Exit Offer All Plans Tapped',

  // Statement import
  STATEMENT_IMPORT_COMPLETED: 'Statement Import Completed',

  // Auto-backup
  AUTO_BACKUP_RUN: 'Auto Backup Run',
  AUTO_BACKUP_RESTORED: 'Auto Backup Restored',
  AUTO_BACKUP_DELETED: 'Auto Backup Deleted',
  AUTO_BACKUP_SETTING_TOGGLED: 'Auto Backup Setting Toggled',
  AUTO_BACKUP_TARGET_CHANGED: 'Auto Backup Target Changed',
  AUTO_BACKUP_FAILED: 'Auto Backup Failed',

  // Review prompt
  REVIEW_PROMPT_REQUESTED: 'Review Prompt Requested',
  REVIEW_PROMPT_SKIPPED: 'Review Prompt Skipped',
  REVIEW_PROMPT_MANUAL_OPENED: 'Review Prompt Manual Opened',
  REVIEW_PREPROMPT_SHOWN: 'Review Preprompt Shown',
  REVIEW_PREPROMPT_HAPPY: 'Review Preprompt Happy',
  REVIEW_PREPROMPT_UNHAPPY: 'Review Preprompt Unhappy',
  REVIEW_PREPROMPT_DISMISSED: 'Review Preprompt Dismissed',
  REVIEW_PREPROMPT_FEEDBACK_OPENED: 'Review Preprompt Feedback Opened',
  REVIEW_PREPROMPT_FEEDBACK_DECLINED: 'Review Preprompt Feedback Declined',

  // Cloud-backup opt-in prompt
  CLOUD_BACKUP_PROMPT_SHOWN: 'Cloud Backup Prompt Shown',
  CLOUD_BACKUP_PROMPT_CTA_TAPPED: 'Cloud Backup Prompt CTA Tapped',
  CLOUD_BACKUP_PROMPT_DISMISSED: 'Cloud Backup Prompt Dismissed',
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
