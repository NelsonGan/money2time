/**
 * Shared types and pure helpers for the in-app review prompt.
 *
 * Eligibility is a pure function over the persisted state so it can be
 * exhaustively unit-tested without touching native modules or storage.
 */

import { dayKeyFromDateLocal } from '~/utils/formatters';

export const REVIEW_PROMPT_STORAGE_KEY = '@m2t/review_prompt_state/v1';

export const REVIEW_PROMPT_SCHEMA_VERSION = 1;

/** Minimum days between the install date and the first prompt. */
export const MIN_DAYS_SINCE_INSTALL = 7;

/** Don't prompt within this many days of an app-version change. */
export const MIN_DAYS_SINCE_VERSION_CHANGE = 3;

/** Cooldown between successive prompts (Apple's hard cap is ~122 days; we stay well below). */
export const MIN_DAYS_BETWEEN_PROMPTS = 90;

/** Intentional transactions logged before the first prompt becomes eligible. */
export const MIN_TRANSACTIONS = 20;

/** Distinct calendar days of app activity required. */
export const MIN_ACTIVE_DAYS = 3;

export type ReviewPromptTrigger = 'transaction_milestone' | 'insights_view' | 'pro_purchase';

/** Wider trigger set used by the pre-prompt sheet — adds the user-initiated
 *  'manual' path (Settings → Rate Money2Time) on top of the automatic-trigger
 *  set. */
export type ReviewPrePromptTrigger = ReviewPromptTrigger | 'manual';

export type ReviewPromptSkipReason =
  | 'too_recent_install'
  | 'recent_version_change'
  | 'low_transaction_count'
  | 'few_active_days'
  | 'recent_prompt'
  | 'same_version_prompted'
  | 'native_unavailable';

export interface ReviewPromptState {
  schemaVersion: number;
  installedAt: string;
  appVersion: string;
  lastVersionChangeAt: string;
  activeDaysCount: number;
  lastActiveDayKey: string | null;
  transactionCount: number;
  insightsViewsCount: number;
  lastPromptAt: string | null;
  lastPromptVersion: string | null;
}

export interface EligibilityInput {
  state: ReviewPromptState;
  now: Date;
  appVersion: string;
}

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: ReviewPromptSkipReason };

export function createInitialState(now: Date, appVersion: string): ReviewPromptState {
  const iso = now.toISOString();
  return {
    schemaVersion: REVIEW_PROMPT_SCHEMA_VERSION,
    installedAt: iso,
    appVersion,
    lastVersionChangeAt: iso,
    activeDaysCount: 0,
    lastActiveDayKey: null,
    transactionCount: 0,
    insightsViewsCount: 0,
    lastPromptAt: null,
    lastPromptVersion: null,
  };
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  return Number.isFinite(new Date(value).getTime());
}

function numericField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function optionalIsoField(value: unknown): string | null {
  return isValidIsoDate(value) ? value : null;
}

function optionalStringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseStoredState(raw: string | null): ReviewPromptState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.schemaVersion !== REVIEW_PROMPT_SCHEMA_VERSION) return null;
    if (
      !isValidIsoDate(value.installedAt) ||
      typeof value.appVersion !== 'string' ||
      !isValidIsoDate(value.lastVersionChangeAt)
    ) {
      return null;
    }
    return {
      schemaVersion: REVIEW_PROMPT_SCHEMA_VERSION,
      installedAt: value.installedAt,
      appVersion: value.appVersion,
      lastVersionChangeAt: value.lastVersionChangeAt,
      activeDaysCount: numericField(value.activeDaysCount),
      lastActiveDayKey: optionalStringField(value.lastActiveDayKey),
      transactionCount: numericField(value.transactionCount),
      insightsViewsCount: numericField(value.insightsViewsCount),
      lastPromptAt: optionalIsoField(value.lastPromptAt),
      lastPromptVersion: optionalStringField(value.lastPromptVersion),
    };
  } catch {
    return null;
  }
}

export function reconcileVersion(
  state: ReviewPromptState,
  now: Date,
  appVersion: string,
): ReviewPromptState {
  if (state.appVersion === appVersion) return state;
  return {
    ...state,
    appVersion,
    lastVersionChangeAt: now.toISOString(),
  };
}

export function recordActivity(state: ReviewPromptState, now: Date): ReviewPromptState {
  const today = dayKeyFromDateLocal(now);
  if (state.lastActiveDayKey === today) return state;
  return {
    ...state,
    lastActiveDayKey: today,
    activeDaysCount: state.activeDaysCount + 1,
  };
}

function daysSince(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  // Treat an unparseable timestamp as "just happened" so a corrupted state
  // blocks the gate instead of bypassing it.
  if (!Number.isFinite(then)) return 0;
  const ms = now.getTime() - then;
  return ms / (1000 * 60 * 60 * 24);
}

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const { state, now, appVersion } = input;

  if (daysSince(state.installedAt, now) < MIN_DAYS_SINCE_INSTALL) {
    return { eligible: false, reason: 'too_recent_install' };
  }
  if (daysSince(state.lastVersionChangeAt, now) < MIN_DAYS_SINCE_VERSION_CHANGE) {
    return { eligible: false, reason: 'recent_version_change' };
  }
  if (state.transactionCount < MIN_TRANSACTIONS) {
    return { eligible: false, reason: 'low_transaction_count' };
  }
  if (state.activeDaysCount < MIN_ACTIVE_DAYS) {
    return { eligible: false, reason: 'few_active_days' };
  }
  if (state.lastPromptAt && daysSince(state.lastPromptAt, now) < MIN_DAYS_BETWEEN_PROMPTS) {
    return { eligible: false, reason: 'recent_prompt' };
  }
  if (state.lastPromptVersion === appVersion) {
    return { eligible: false, reason: 'same_version_prompted' };
  }
  return { eligible: true };
}

export function markPrompted(
  state: ReviewPromptState,
  now: Date,
  appVersion: string,
): ReviewPromptState {
  return {
    ...state,
    lastPromptAt: now.toISOString(),
    lastPromptVersion: appVersion,
  };
}
