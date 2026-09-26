/**
 * Shared types and event name constants for product analytics.
 *
 * Event names follow a consistent `Category Action` naming convention
 * so they sort naturally inside Mixpanel. GA4 receives a namespaced snake-case
 * form produced by `toGa4EventName`.
 *
 * Every event goes to GA4, which is free and unsampled. Mixpanel bills per
 * event, so it only receives the events in `MIXPANEL_EVENTS`: installs,
 * activation, product-usage milestones, and every step of the path to a Pro
 * purchase. Everything else is per-use telemetry that GA4 answers on its own. A
 * new event has to be placed in one of the two groups below, and that placement
 * is the decision about whether it is worth paying for.
 */

import type { RevenueCatPeriodType } from './revenueCat.shared';

// Event name constants

/**
 * Sent to Mixpanel and GA4. Keep this list to events that answer "where do new
 * users come from, do they activate, which features do they take up, and what
 * gets them to pay", and that fire a bounded number of times per user. A per-use
 * event for a frequent action does not belong here even if the feature matters:
 * its first use arrives as `Feature First Used`, every use is in GA4, and the Pro
 * gate it eventually hits already arrives as `Pro Paywall Viewed` with the gate
 * as its `source`.
 */
export const MIXPANEL_EVENTS = {
  // Install and activation. One-off per user.
  /** A fresh install's first launch. Replaces Mixpanel's automatic `$ae_first_open`. */
  FIRST_APP_OPEN: 'First App Open',
  ONBOARDING_STARTED: 'Onboarding Started',
  ONBOARDING_COMPLETED: 'Onboarding Completed',
  ONBOARDING_SOURCE_SELECTED: 'Onboarding Source Selected',
  ONBOARDING_NOTIFICATIONS_ENABLED: 'Onboarding Notifications Enabled',
  ONBOARDING_NOTIFICATIONS_SKIPPED: 'Onboarding Notifications Skipped',
  ONBOARDING_BACKUP_ENABLED: 'Onboarding Backup Enabled',
  ONBOARDING_BACKUP_SKIPPED: 'Onboarding Backup Skipped',
  /** The first expense or income a user logs: the activation moment for a tracker. */
  FIRST_TRANSACTION_CREATED: 'First Transaction Created',
  /** Setting a wage is what unlocks the time view, the app's core idea. */
  WAGE_CONFIG_UPDATED: 'Wage Config Updated',

  // Product usage, as milestones rather than per use: each fires at most once
  // per feature or threshold, and only on installs tracked from their first
  // launch (see `UsageState`), so a "first" is never a first since an update.
  /** The first use of a product feature (`ProductFeature`) on this install. */
  FEATURE_FIRST_USED: 'Feature First Used',
  /** The install's logged expenses and incomes reached a `TRANSACTION_MILESTONES` count. */
  TRANSACTION_MILESTONE_REACHED: 'Transaction Milestone Reached',

  // The path to a Pro purchase. `Pro Paywall Viewed` is the top of the funnel
  // and its `source` names the gate or call to action that opened it.
  PRO_PAYWALL_VIEWED: 'Pro Paywall Viewed',
  /** The paywall finished loading with nothing to buy: a purchase is impossible. */
  PRO_PLANS_UNAVAILABLE: 'Pro Plans Unavailable',
  PRO_PURCHASE_STARTED: 'Pro Purchase Started',
  PRO_PURCHASE_COMPLETED: 'Pro Purchase Completed',
  PRO_PURCHASE_PENDING: 'Pro Purchase Pending',
  PRO_PURCHASE_CANCELLED: 'Pro Purchase Cancelled',
  PRO_PURCHASE_FAILED: 'Pro Purchase Failed',
  PRO_RESTORE_STARTED: 'Pro Restore Started',
  PRO_RESTORE_COMPLETED: 'Pro Restore Completed',
  PRO_RESTORE_FAILED: 'Pro Restore Failed',
  /**
   * A limit that blocks the user without opening the paywall. Gates that open
   * it straight away are recorded by `Pro Paywall Viewed` alone.
   */
  PRO_LIMIT_HIT: 'Pro Limit Hit',
  PRO_CANCEL_SUB_PROMPT_ACTIONED: 'Pro Cancel Sub Prompt Actioned',
  PRO_REDUNDANT_SUB_CANCEL_TAPPED: 'Pro Redundant Sub Cancel Tapped',
} as const;

/** Per-use product telemetry and data maintenance, which only GA4 receives. */
export const GA4_ONLY_EVENTS = {
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
  RECEIPT_SPLIT_SAVED: 'Receipt Split Saved',
  RECEIPT_SPLIT_ABANDONED: 'Receipt Split Abandoned',
  RECEIPT_SPLIT_REOPENED: 'Receipt Split Reopened',

  // Split bills (Pay First)
  /** A transaction gained a share owed by someone else, on create or on edit. */
  SPLIT_BILL_CREATED: 'Split Bill Created',
  SPLIT_MARKED_PAID: 'Split Marked Paid',
  SPLIT_MARKED_UNPAID: 'Split Marked Unpaid',
  SETTLE_UP_RECEIPT_SHARED: 'Settle Up Receipt Shared',
  SETTLE_UP_QR_SET: 'Settle Up Payment QR Set',

  // Reimbursements
  REIMBURSEMENT_FLAGGED: 'Reimbursement Flagged',
  REIMBURSEMENT_MARKED_PAID: 'Reimbursement Marked Paid',
  REIMBURSEMENT_REOPENED: 'Reimbursement Reopened',
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

  // Budgets
  BUDGET_TEMPLATE_CREATED: 'Budget Template Created',
  BUDGET_TEMPLATE_UPDATED: 'Budget Template Updated',
  BUDGET_TEMPLATE_DELETED: 'Budget Template Deleted',
  BUDGET_DEFAULT_CHANGED: 'Budget Default Changed',
  BUDGET_MONTH_CREATED: 'Budget Month Created',
  BUDGET_MONTH_UPDATED: 'Budget Month Updated',
  BUDGET_MONTH_DELETED: 'Budget Month Deleted',

  // Items (owned things priced by cost per day)
  ITEM_CREATED: 'Item Created',

  // Recurring rules
  RECURRING_RULE_CREATED: 'Recurring Rule Created',
  RECURRING_RULE_UPDATED: 'Recurring Rule Updated',
  RECURRING_RULE_DELETED: 'Recurring Rule Deleted',

  // Tutorials. `source` says whether a website link or the settings list
  // opened them, which the screen view alone cannot.
  TUTORIAL_LIST_OPENED: 'Tutorial List Opened',
  TUTORIAL_OPENED: 'Tutorial Opened',

  // Settings with a product question behind them
  DISPLAY_MODE_TOGGLED: 'Display Mode Toggled',
  APP_ICON_CHANGED: 'App Icon Changed',

  // Data management
  /** `scope` tells a full reset (which replays onboarding) from the narrower ones. */
  DATA_RESET: 'Data Reset',
  DATA_IMPORTED: 'Data Imported',
  STATEMENT_IMPORT_COMPLETED: 'Statement Import Completed',

  // Auto-backup
  AUTO_BACKUP_RESTORED: 'Auto Backup Restored',
  AUTO_BACKUP_DELETED: 'Auto Backup Deleted',
  AUTO_BACKUP_SETTING_TOGGLED: 'Auto Backup Setting Toggled',
  AUTO_BACKUP_TARGET_CHANGED: 'Auto Backup Target Changed',
  AUTO_BACKUP_FAILED: 'Auto Backup Failed',

  // Review prompt
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

export const AnalyticsEvents = { ...MIXPANEL_EVENTS, ...GA4_ONLY_EVENTS } as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

const MIXPANEL_EVENT_NAMES: ReadonlySet<string> = new Set(Object.values(MIXPANEL_EVENTS));

/** Whether Mixpanel receives this event. GA4 receives every event. */
export function isMixpanelEvent(eventName: AnalyticsEventName): boolean {
  return MIXPANEL_EVENT_NAMES.has(eventName);
}

// Common property types

export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole days between the install and `now`, counted in 24-hour periods so day
 * 0 is the first 24 hours whatever the time zone. Null when the install date is
 * unknown or unreadable, and never negative, so a clock that moved backwards
 * reads as day 0 rather than as a date before the install.
 */
export function daysSinceInstall(
  firstAppOpen: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!firstAppOpen) return null;
  const installedAt = Date.parse(firstAppOpen);
  if (!Number.isFinite(installedAt)) return null;
  return Math.max(0, Math.floor((now - installedAt) / DAY_MS));
}

// Product usage milestones

/**
 * The event that marks a real use of each feature reported by
 * `Feature First Used`. Features are capabilities, not screens: opening a
 * screen is already a GA4 `screen_view`.
 */
const FEATURE_BY_EVENT = {
  [GA4_ONLY_EVENTS.RECEIPT_SCAN_COMPLETED]: 'receipt_scan',
  [GA4_ONLY_EVENTS.VOICE_TRANSACTION_CREATED]: 'voice_entry',
  [GA4_ONLY_EVENTS.AUTOLOG_TRANSACTION_CREATED]: 'autolog',
  [GA4_ONLY_EVENTS.BACK_TAP_TRIGGERED]: 'back_tap',
  [GA4_ONLY_EVENTS.WIDGET_OPENED]: 'widget',
  [GA4_ONLY_EVENTS.LIVE_EARNINGS_STARTED]: 'live_earnings',
  [GA4_ONLY_EVENTS.DISPLAY_MODE_TOGGLED]: 'time_display',
  [GA4_ONLY_EVENTS.SPLIT_BILL_CREATED]: 'split_bill',
  [GA4_ONLY_EVENTS.RECEIPT_SPLIT_SAVED]: 'split_by_item',
  [GA4_ONLY_EVENTS.SETTLE_UP_RECEIPT_SHARED]: 'settle_up_share',
  [GA4_ONLY_EVENTS.REIMBURSEMENT_FLAGGED]: 'reimbursements',
  [GA4_ONLY_EVENTS.RECURRING_RULE_CREATED]: 'recurring',
  [GA4_ONLY_EVENTS.GOAL_CREATED]: 'goals',
  [GA4_ONLY_EVENTS.LOAN_CREATED]: 'loans',
  [GA4_ONLY_EVENTS.BUDGET_TEMPLATE_CREATED]: 'budgets',
  [GA4_ONLY_EVENTS.ALBUM_CREATED]: 'albums',
  [GA4_ONLY_EVENTS.ITEM_CREATED]: 'items',
} as const satisfies Partial<Record<AnalyticsEventName, string>>;

export type ProductFeature = (typeof FEATURE_BY_EVENT)[keyof typeof FEATURE_BY_EVENT];

const PRODUCT_FEATURES: ReadonlySet<string> = new Set(Object.values(FEATURE_BY_EVENT));

/** The feature an event is a use of, or null when it is not one. */
export function featureUsedBy(
  eventName: AnalyticsEventName,
  properties?: AnalyticsProperties,
): ProductFeature | null {
  const feature: ProductFeature | undefined = (
    FEATURE_BY_EVENT as Partial<Record<AnalyticsEventName, ProductFeature>>
  )[eventName];
  if (!feature) return null;
  // Three of these events also fire for something that is not a use: switching
  // back to money, unflagging a reimbursement, and the live-earnings reminder
  // notification, which opens through the widget link.
  if (feature === 'time_display' && properties?.mode !== 'time') return null;
  if (feature === 'reimbursements' && properties?.reimbursable !== true) return null;
  if (feature === 'widget' && properties?.source === 'schedule') return null;
  return feature;
}

/** Logged expense and income counts that `Transaction Milestone Reached` reports. */
export const TRANSACTION_MILESTONES: readonly number[] = [10, 50, 100, 250, 500, 1000];

/**
 * What analytics remembers about this install's product usage, on the device.
 *
 * `fromInstall` is set by `First App Open`, so it is true only on installs
 * tracked since their first launch, and only those send `Feature First Used`
 * and `Transaction Milestone Reached`. On an install that predates them, the
 * first use seen after updating is not a first use, and a transaction count
 * would start from zero. Every install still lists its features on the
 * Mixpanel profile (`features_used`), which is not billed.
 */
export interface UsageState {
  fromInstall: boolean;
  features: ProductFeature[];
  /** Expenses and incomes logged in the app, counted only when `fromInstall`. */
  loggedTransactions: number;
}

export const USAGE_STATE_STORAGE_KEY = '@m2t/analytics_usage/v1';

export const EMPTY_USAGE_STATE: UsageState = {
  fromInstall: false,
  features: [],
  loggedTransactions: 0,
};

/**
 * Read a stored `UsageState`. Anything unreadable falls back to the empty
 * state, whose `fromInstall: false` sends no events rather than wrong ones.
 */
export function parseUsageState(raw: string | null): UsageState {
  if (!raw) return EMPTY_USAGE_STATE;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_USAGE_STATE;
  }
  if (!value || typeof value !== 'object') return EMPTY_USAGE_STATE;
  const { fromInstall, features, loggedTransactions } = value as Record<string, unknown>;
  return {
    fromInstall: fromInstall === true,
    features: Array.isArray(features)
      ? features.filter(
          (feature): feature is ProductFeature =>
            typeof feature === 'string' && PRODUCT_FEATURES.has(feature),
        )
      : [],
    loggedTransactions:
      typeof loggedTransactions === 'number' && Number.isFinite(loggedTransactions)
        ? Math.max(0, Math.floor(loggedTransactions))
        : 0,
  };
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
    const name = toGa4PropertyName(rawName, GA4_USER_PROPERTY_NAME_LIMIT);
    result[name] = String(rawValue).slice(0, GA4_USER_PROPERTY_VALUE_LIMIT);
  }
  return result;
}

/**
 * Mixpanel People (user profile) properties. Unlike event properties these are
 * a last-write-wins store on the profile: a key we stop sending keeps whatever
 * value it last had. So anything that must be *current* has to be written on
 * every sync, never conditionally — see `buildProAnalyticsProfile`. Profile
 * updates are not billed as Mixpanel events, which makes the profile the place
 * for state (plan, install date) rather than an event every time it changes.
 */
export type AnalyticsUserProperties = Record<string, string | number | boolean>;

// Super-property keys set once per session / user

/**
 * Stable user state, on every Mixpanel event and mirrored to GA4 user
 * properties. The visible screen is not one: `trackEvent` stamps
 * `current_screen` on each event instead (see `RETIRED_SUPER_PROPERTIES` in the
 * native module).
 */
export interface AnalyticsSuperProperties {
  is_pro?: boolean;
  pro_plan?: ProPlan;
  pro_period_type?: ProPeriodType;
  currency_code?: string;
  locale?: string;
  theme_mode?: string;
  theme_color?: string;
  display_mode?: 'money' | 'time';
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
 * Where the active entitlement is in its billing life, straight from the
 * store: `trial` is a free trial that has not charged yet. `none` means no
 * active entitlement, and `unknown` an active one the store did not describe.
 */
export type ProPeriodType = RevenueCatPeriodType | 'none' | 'unknown';

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
  periodType?: RevenueCatPeriodType | null;
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
 * `is_pro`, `pro_plan`, `pro_period_type` and `pro_renewing` are written
 * unconditionally, because they must reflect *now* and a People profile never
 * forgets a key we stop sending. The three historical fields are written only
 * when known, and are deliberately allowed to go stale: once a subscription
 * lapses, "the plan they last held" and "when it ran out" are the interesting
 * facts, and blanking them would throw away the churn analysis they exist for.
 */
export function buildProAnalyticsProfile(source: ProAnalyticsSource): ProAnalyticsProfile {
  const { isPro, activatedAt, activeProductIdentifier, expirationDate } = source;
  const plan = resolveProPlan(isPro, activeProductIdentifier);
  // A trial that has not converted yet reads as Pro everywhere else, so this is
  // the only place a trial user can be told apart from a paying one.
  const periodType: ProPeriodType = isPro ? (source.periodType ?? 'unknown') : 'none';

  const userProperties: AnalyticsUserProperties = {
    is_pro: isPro,
    pro_plan: plan,
    pro_period_type: periodType,
    pro_renewing: source.hasRenewingSubscription ?? false,
  };

  if (activeProductIdentifier) userProperties.pro_product_id = activeProductIdentifier;
  if (activatedAt) userProperties.pro_since = activatedAt;
  if (expirationDate) userProperties.pro_expires_at = expirationDate;

  return {
    userProperties,
    superProperties: { is_pro: isPro, pro_plan: plan, pro_period_type: periodType },
    signature: JSON.stringify(userProperties),
  };
}
