/**
 * Shared types and event name constants for product analytics.
 *
 * Event names follow a consistent `Category Action` naming convention
 * so they sort naturally inside Mixpanel. GA4 receives a namespaced snake-case
 * form produced by `toGa4EventName`.
 */

import { sha256 } from 'js-sha256';

// Event name constants

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

  // Live-earnings Live Activity (Lock Screen / Dynamic Island)
  LIVE_EARNINGS_STARTED: 'Live Earnings Started',
  LIVE_EARNINGS_STOPPED: 'Live Earnings Stopped',

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

  // Tutorials
  TUTORIAL_LIST_OPENED: 'Tutorial List Opened',
  TUTORIAL_OPENED: 'Tutorial Opened',

  // Settings
  SETTINGS_UPDATED: 'Settings Updated',
  DISPLAY_MODE_TOGGLED: 'Display Mode Toggled',
  APP_ICON_CHANGED: 'App Icon Changed',
  WAGE_CONFIG_UPDATED: 'Wage Config Updated',
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
  // Statement import
  STATEMENT_IMPORT_COMPLETED: 'Statement Import Completed',

  // Auto-backup
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

// Common property types

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

/** Half of anonymous app users receive their complete analytics event stream. */
export const ANALYTICS_SAMPLE_RATE = 0.5;

/**
 * Version the hash input so the selected cohort cannot change accidentally.
 * Deliberately keep this stable if the implementation is refactored.
 */
const ANALYTICS_SAMPLE_NAMESPACE = 'money2time-analytics-sample-v1';
const UINT32_RANGE = 0x1_0000_0000;

/** A deterministic number in [0, 1) for an anonymous app user. */
export function getAnalyticsSampleFraction(appUserId: string): number {
  const digest = sha256(`${ANALYTICS_SAMPLE_NAMESPACE}:${appUserId.trim()}`);
  return Number.parseInt(digest.slice(0, 8), 16) / UINT32_RANGE;
}

/**
 * Select a stable user cohort rather than independently dropping events. This
 * preserves complete funnels, retention paths, and per-user sequences.
 */
export function isUserInAnalyticsSample(
  appUserId: string,
  sampleRate = ANALYTICS_SAMPLE_RATE,
): boolean {
  if (!appUserId.trim() || !Number.isFinite(sampleRate) || sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  return getAnalyticsSampleFraction(appUserId) < sampleRate;
}

const GA4_EVENT_NAME_LIMIT = 40;
const GA4_PARAMETER_NAME_LIMIT = 40;
const GA4_PARAMETER_VALUE_LIMIT = 100;
const GA4_USER_PROPERTY_NAME_LIMIT = 24;
const GA4_USER_PROPERTY_VALUE_LIMIT = 36;
const GA4_MAX_PARAMETERS_PER_EVENT = 25;

function toSnakeCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Map a Mixpanel display name to a valid, clearly namespaced GA4 custom name. */
export function toGa4EventName(eventName: string): string {
  const normalized = toSnakeCase(eventName) || 'event';
  return `m2t_${normalized}`.slice(0, GA4_EVENT_NAME_LIMIT);
}

function toGa4PropertyName(name: string, limit: number): string {
  let normalized = toSnakeCase(name) || 'property';
  if (!/^[a-z]/.test(normalized) || /^(firebase|google|ga)_/.test(normalized)) {
    normalized = `m2t_${normalized}`;
  }
  return normalized.slice(0, limit);
}

export type Ga4EventParameters = Record<string, string | number>;

/** Remove unsupported values and enforce GA4's standard property limits. */
export function toGa4EventParameters(properties?: AnalyticsProperties): Ga4EventParameters {
  const result: Ga4EventParameters = {};
  if (!properties) return result;

  for (const [rawName, rawValue] of Object.entries(properties)) {
    if (rawValue == null || Object.keys(result).length >= GA4_MAX_PARAMETERS_PER_EVENT) continue;
    // Sampling is a Mixpanel-only implementation detail. GA4 receives the
    // complete population and must never be mistaken for sampled data.
    if (toSnakeCase(rawName) === 'sample_rate') continue;
    const name = toGa4PropertyName(rawName, GA4_PARAMETER_NAME_LIMIT);
    if (typeof rawValue === 'string') {
      result[name] = rawValue.slice(0, GA4_PARAMETER_VALUE_LIMIT);
    } else if (typeof rawValue === 'boolean') {
      result[name] = rawValue ? 1 : 0;
    } else if (Number.isFinite(rawValue)) {
      result[name] = rawValue;
    }
  }

  return result;
}

export type Ga4UserProperties = Record<string, string>;

/** GA4 user properties accept strings and have tighter 24/36 character limits. */
export function toGa4UserProperties(
  properties: Record<string, string | number | boolean | null | undefined>,
): Ga4UserProperties {
  const result: Ga4UserProperties = {};
  for (const [rawName, rawValue] of Object.entries(properties)) {
    if (rawValue == null || Object.keys(result).length >= 25) continue;
    if (toSnakeCase(rawName) === 'sample_rate') continue;
    const name = toGa4PropertyName(rawName, GA4_USER_PROPERTY_NAME_LIMIT);
    result[name] = String(rawValue).slice(0, GA4_USER_PROPERTY_VALUE_LIMIT);
  }
  return result;
}

/**
 * Mixpanel People (user profile) properties. Unlike event properties these are
 * a last-write-wins store on the profile: a key we stop sending keeps whatever
 * value it last had. So anything that must be *current* has to be written on
 * every sync, never conditionally — see `buildProAnalyticsProfile`.
 */
export type AnalyticsUserProperties = Record<string, string | number | boolean>;

// Super-property keys set once per session / user

export interface AnalyticsSuperProperties {
  is_pro?: boolean;
  pro_plan?: ProPlan;
  currency_code?: string;
  locale?: string;
  theme_mode?: string;
  theme_color?: string;
  display_mode?: 'money' | 'time';
  current_screen?: string;
}

// Pro subscription profile

/**
 * Which Pro plan the user is on. `other` covers an active entitlement whose
 * product identifier we don't recognise (a promo/test product, or a new SKU
 * added in RevenueCat before this mapping caught up) — it reads as Pro, just
 * not as one of the three shipping plans.
 */
export type ProPlan = 'free' | 'monthly' | 'annual' | 'lifetime' | 'other';

/**
 * Resolve the plan from the store product identifier. Matches by substring
 * rather than an exact SKU list on purpose: the identifiers differ between the
 * App Store and Play, and per-region/promo variants get suffixed, so an exact
 * list would silently degrade real subscribers to `other`.
 */
export function resolveProPlan(
  isPro: boolean,
  activeProductIdentifier: string | null | undefined,
): ProPlan {
  if (!isPro) return 'free';
  const id = activeProductIdentifier?.toLowerCase() ?? '';
  if (id.includes('lifetime')) return 'lifetime';
  if (id.includes('annual') || id.includes('year')) return 'annual';
  if (id.includes('month')) return 'monthly';
  return 'other';
}

export interface ProAnalyticsSource {
  isPro: boolean;
  activatedAt?: string | null;
  activeProductIdentifier?: string | null;
  expirationDate?: string | null;
  hasRenewingSubscription?: boolean;
}

export interface ProAnalyticsProfile {
  /** Written to the Mixpanel People profile — the answer to "who is Pro today". */
  userProperties: AnalyticsUserProperties;
  /** Registered as super-properties so every *event* is segmentable by Pro. */
  superProperties: AnalyticsSuperProperties;
  /**
   * Stable fingerprint of the above. Pro state is re-fetched on every
   * foreground, which hands us a fresh object each time; comparing this instead
   * of the object keeps us from re-sending an identical profile on every
   * resume.
   */
  signature: string;
}

/**
 * Build the Mixpanel profile for a user's Pro state.
 *
 * `is_pro`, `pro_plan` and `pro_renewing` are written unconditionally, because
 * they must reflect *now* and a People profile never forgets a key we stop
 * sending. The three historical fields are written only when known, and are
 * deliberately allowed to go stale: once a subscription lapses, "the plan they
 * last held" and "when it ran out" are the interesting facts, and blanking them
 * would throw away the churn analysis they exist for.
 */
export function buildProAnalyticsProfile(source: ProAnalyticsSource): ProAnalyticsProfile {
  const { isPro, activatedAt, activeProductIdentifier, expirationDate } = source;
  const plan = resolveProPlan(isPro, activeProductIdentifier);

  const userProperties: AnalyticsUserProperties = {
    is_pro: isPro,
    pro_plan: plan,
    pro_renewing: source.hasRenewingSubscription ?? false,
  };

  if (activeProductIdentifier) userProperties.pro_product_id = activeProductIdentifier;
  if (activatedAt) userProperties.pro_since = activatedAt;
  if (expirationDate) userProperties.pro_expires_at = expirationDate;

  return {
    userProperties,
    superProperties: { is_pro: isPro, pro_plan: plan },
    signature: JSON.stringify(userProperties),
  };
}
