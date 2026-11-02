// Payment-alert preferences (`settings.auto_log_prefs_json`): which sources are
// watched and how each one logs. Pure; covered by
// __tests__/features/autoLog/pipeline.test.ts. A corrupt blob must never brick a
// launch, so parsing validates every field and falls back field by field.

import type {
  NotificationAiReviewPrefs,
  PaymentAlertChannel,
  PaymentAlertPrefs,
  PaymentAlertSource,
} from '~/types';

import { containsWords } from './text';

export const DEFAULT_PAYMENT_ALERT_PREFS: PaymentAlertPrefs = {
  version: 1,
  alertsEnabled: false,
  sources: {},
  ignorePhrases: [],
  aiReview: { enabled: false, logTypes: 'both', accountIds: null },
};

function parseAiReview(raw: unknown): NotificationAiReviewPrefs {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: row.enabled === true,
    logTypes: row.logTypes === 'expense' || row.logTypes === 'income' ? row.logTypes : 'both',
    accountIds: Array.isArray(row.accountIds) ? asStringList(row.accountIds) : null,
  };
}

/** Whether AI auto-review covers notifications logged into this account. */
export function aiReviewCoversAccount(
  prefs: NotificationAiReviewPrefs,
  accountId: string | null | undefined,
): boolean {
  return !!accountId && (prefs.accountIds === null || prefs.accountIds.includes(accountId));
}

const CHANNELS: readonly PaymentAlertChannel[] = ['android_notification', 'ios_alert', 'apple_pay'];

export function paymentAlertSourceKey(channel: PaymentAlertChannel, sourceKey: string): string {
  return `${channel}:${sourceKey}`;
}

/**
 * Source key for an iOS automation: the "From" value as typed, folded so
 * "Maybank", "maybank " and "MAYBANK" are one source. Alerts sent without a
 * From share one catch-all source.
 */
export function iosSourceKey(from: string | null | undefined): string {
  const folded = (from ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return folded || 'ios';
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function parseSource(raw: unknown): PaymentAlertSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const channel = CHANNELS.find((value) => value === row.channel);
  const sourceKey = asString(row.sourceKey);
  if (!channel || !sourceKey) return null;
  return {
    channel,
    sourceKey,
    label: asString(row.label) ?? sourceKey,
    enabled: row.enabled !== false,
    accountId: asString(row.accountId),
    ignorePhrases: asStringList(row.ignorePhrases),
    addedAt: asString(row.addedAt) ?? new Date(0).toISOString(),
  };
}

export function parsePaymentAlertPrefs(json: string | null | undefined): PaymentAlertPrefs {
  if (!json) return DEFAULT_PAYMENT_ALERT_PREFS;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return DEFAULT_PAYMENT_ALERT_PREFS;
  }
  if (!raw || typeof raw !== 'object') return DEFAULT_PAYMENT_ALERT_PREFS;
  const row = raw as Record<string, unknown>;
  const sources: Record<string, PaymentAlertSource> = {};
  if (row.sources && typeof row.sources === 'object') {
    for (const value of Object.values(row.sources as Record<string, unknown>)) {
      const source = parseSource(value);
      if (source) sources[paymentAlertSourceKey(source.channel, source.sourceKey)] = source;
    }
  }
  return {
    version: 1,
    alertsEnabled: row.alertsEnabled === true,
    sources,
    ignorePhrases: asStringList(row.ignorePhrases),
    aiReview: parseAiReview(row.aiReview),
  };
}

export function serializePaymentAlertPrefs(prefs: PaymentAlertPrefs): string {
  return JSON.stringify(prefs);
}

export function findAlertSource(
  prefs: PaymentAlertPrefs,
  channel: PaymentAlertChannel,
  sourceKey: string,
): PaymentAlertSource | null {
  return prefs.sources[paymentAlertSourceKey(channel, sourceKey)] ?? null;
}

export function withAlertSource(
  prefs: PaymentAlertPrefs,
  source: PaymentAlertSource,
): PaymentAlertPrefs {
  return {
    ...prefs,
    sources: {
      ...prefs.sources,
      [paymentAlertSourceKey(source.channel, source.sourceKey)]: source,
    },
  };
}

export function withoutAlertSource(
  prefs: PaymentAlertPrefs,
  channel: PaymentAlertChannel,
  sourceKey: string,
): PaymentAlertPrefs {
  const sources = { ...prefs.sources };
  delete sources[paymentAlertSourceKey(channel, sourceKey)];
  return { ...prefs, sources };
}

export function newAlertSource(
  input: Pick<PaymentAlertSource, 'channel' | 'sourceKey' | 'label'> &
    Partial<Pick<PaymentAlertSource, 'accountId'>>,
  now: string,
): PaymentAlertSource {
  return {
    channel: input.channel,
    sourceKey: input.sourceKey,
    label: input.label,
    enabled: true,
    accountId: input.accountId ?? null,
    ignorePhrases: [],
    addedAt: now,
  };
}

/** Whether a global or per-source ignore phrase appears in the alert. */
export function matchesIgnorePhrase(
  prefs: PaymentAlertPrefs,
  source: PaymentAlertSource | null,
  lowerText: string,
): boolean {
  const phrases = [...prefs.ignorePhrases, ...(source?.ignorePhrases ?? [])];
  return phrases.some((phrase) => containsWords(lowerText, phrase));
}

/** Android packages the native listener should capture. */
export function androidCapturePackages(prefs: PaymentAlertPrefs): string[] {
  if (!prefs.alertsEnabled) return [];
  return Object.values(prefs.sources)
    .filter((source) => source.channel === 'android_notification' && source.enabled)
    .map((source) => source.sourceKey)
    .sort();
}
