// Types and errors for AI notification review (the receipt-scanner Worker's
// POST /notifications and /notifications/quota). See notificationAi.native.ts.
import { PRO_LIMITS } from '~/constants/proLimits';

import type { NotificationAiDecision, NotificationAiIgnoreReason } from './notificationScanHistory';

/** Free AI notification reviews: a lifetime total, enforced by the Worker. */
export const FREE_NOTIFICATION_AI_REVIEWS = PRO_LIMITS.FREE_MAX_NOTIFICATION_AI_REVIEWS;
/** Most notifications the Worker accepts in one request. */
export const NOTIFICATION_AI_BATCH_SIZE = 20;

export interface NotificationAiQuota {
  used: number;
  limit: number;
  isPro: boolean;
  /** The Worker's metering window, e.g. '100year' (free, lifetime) or 'month'. */
  interval: string;
}

export interface NotificationAiInput {
  id: string;
  text: string;
  /** The account's currency, used when the text names none. */
  currency: string;
  source: string | null;
}

export interface NotificationAiRequest {
  appUserId: string;
  notifications: NotificationAiInput[];
  expenseCategories: string[];
  incomeCategories: string[];
}

export interface NotificationAiResult {
  id: string;
  decision: NotificationAiDecision;
  amount?: number;
  currency?: string;
  category?: string;
  note?: string;
  reason?: NotificationAiIgnoreReason;
}

export interface NotificationAiResponse {
  results: NotificationAiResult[];
  /** Ids the Worker did not review because the allowance ran out mid-batch. */
  skipped: string[];
  quota: NotificationAiQuota;
}

export type NotificationAiErrorCode =
  | 'not_available'
  | 'limit_reached'
  | 'capacity'
  | 'network'
  /** The service refused the request itself (a 4xx): retrying will not help. */
  | 'rejected'
  | 'server';

export class NotificationAiError extends Error {
  readonly code: NotificationAiErrorCode;
  readonly quota?: NotificationAiQuota;
  constructor(code: NotificationAiErrorCode, message: string, quota?: NotificationAiQuota) {
    super(message);
    this.name = 'NotificationAiError';
    this.code = code;
    this.quota = quota;
  }
}

const DECISIONS: readonly NotificationAiDecision[] = ['expense', 'income', 'ignore', 'unsure'];

export function parseNotificationAiQuota(value: unknown): NotificationAiQuota | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.used !== 'number' || typeof row.limit !== 'number') return null;
  return {
    used: Math.max(0, row.used),
    limit: Math.max(0, row.limit),
    isPro: row.isPro === true,
    interval: typeof row.interval === 'string' ? row.interval : '',
  };
}

/** The Worker's answer, keeping only well-formed results for requested ids. */
export function parseNotificationAiResponse(
  value: unknown,
  requestedIds: readonly string[],
): NotificationAiResponse {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const quota = parseNotificationAiQuota(row.quota);
  if (!quota || !Array.isArray(row.results)) {
    throw new NotificationAiError('server', 'Unexpected response from the review service.');
  }
  const wanted = new Set(requestedIds);
  const results = row.results.flatMap((item): NotificationAiResult[] => {
    if (!item || typeof item !== 'object') return [];
    const result = item as Record<string, unknown>;
    const decision = DECISIONS.find((name) => name === result.decision);
    if (typeof result.id !== 'string' || !wanted.has(result.id) || !decision) return [];
    return [
      {
        id: result.id,
        decision,
        ...(typeof result.amount === 'number' ? { amount: result.amount } : {}),
        ...(typeof result.currency === 'string' ? { currency: result.currency } : {}),
        ...(typeof result.category === 'string' ? { category: result.category } : {}),
        ...(typeof result.note === 'string' ? { note: result.note } : {}),
        ...(typeof result.reason === 'string'
          ? { reason: result.reason as NotificationAiIgnoreReason }
          : {}),
      },
    ];
  });
  const skipped = Array.isArray(row.skipped)
    ? row.skipped.filter((id): id is string => typeof id === 'string' && wanted.has(id))
    : [];
  return { results, skipped, quota };
}

/** Reviews left in the current window; Infinity for Pro (fair-use cap aside). */
export function notificationAiRemaining(quota: NotificationAiQuota | null): number {
  if (!quota) return FREE_NOTIFICATION_AI_REVIEWS;
  return Math.max(0, quota.limit - quota.used);
}
