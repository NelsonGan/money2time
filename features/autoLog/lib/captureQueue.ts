// Reading what the native capture layers queued: Android's notification
// listener (one JSON file per alert in filesDir/payment-captures, see
// plugins/withMoney2TimePaymentCapture.js) and iOS's Log Payment Alert intent
// (one atomic file per alert in the App Group, exposed as a JSON array by
// plugins/withMoney2TimeAutoLog.js).
// Everything here crosses the native boundary, so malformed input degrades to
// "nothing queued" rather than throwing. Pure; covered by
// __tests__/features/autoLog/pipeline.test.ts.

import type { PaymentAlertChannel } from '~/types';

import { iosSourceKey } from './prefs';

/** Folder under the app's document directory. MUST match the Android plugin. */
export const PAYMENT_CAPTURES_DIR = 'payment-captures';
/** Config the JS side writes for the listener, in the same folder. */
export const PAYMENT_CAPTURE_CONFIG_FILE = 'config.json';
/** Listener health, written by the listener. */
export const PAYMENT_CAPTURE_STATUS_FILE = 'status.json';
/** Apps seen posting notifications (labels only), written by the listener. */
export const PAYMENT_CAPTURE_SEEN_APPS_FILE = 'seen-apps.json';
/** Notification tag that marks the setup screen's own test alert. MUST match the plugin. */
export const PAYMENT_CAPTURE_TEST_TAG = 'm2t-payment-alert-test';

/** A queued alert, before parsing. */
export interface CaptureInput {
  id: string;
  channel: PaymentAlertChannel;
  sourceKey: string;
  sourceLabel: string | null;
  capturedAt: string;
  title: string | null;
  subtitle: string | null;
  body: string;
  extra: string[];
  nativeKey: string | null;
  presetAccountId: string | null;
  presetCategoryId: string | null;
  /** The setup screen's own test alert: previewed, never stored or logged. */
  isTest?: boolean;
}

const CAPTURE_FILE = /^(\d{10,})-[A-Za-z0-9-]+\.json$/;

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Completed capture files (no `.part`), oldest first. */
export function sortCaptureFileNames(names: readonly string[]): string[] {
  return names
    .map((name) => ({ name, match: CAPTURE_FILE.exec(name) }))
    .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]) || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}

function messagesText(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const texts = value
    .map((item) =>
      item && typeof item === 'object' ? str((item as Record<string, unknown>).text) : null,
    )
    .filter((text): text is string => text !== null);
  // Messaging style: the newest message is the alert that just arrived.
  return texts.length > 0 ? (texts[texts.length - 1] ?? null) : null;
}

/** One Android capture file. Returns null for anything that cannot be an alert. */
export function parseAndroidCaptureJson(fileName: string, json: string): CaptureInput | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const packageName = str(row.package);
  if (!packageName) return null;

  const text = str(row.text);
  const bigText = str(row.bigText);
  const lines = Array.isArray(row.lines)
    ? row.lines.filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    : [];
  const message = messagesText(row.messages);
  const body = message ?? bigText ?? text ?? (lines.length > 0 ? lines.join('\n') : null);
  if (!body) return null;

  const postedAt = typeof row.postedAt === 'number' && row.postedAt > 0 ? row.postedAt : null;
  const fromName = CAPTURE_FILE.exec(fileName);
  const millis = postedAt ?? (fromName ? Number(fromName[1]) : Date.now());
  const date = new Date(millis);
  if (!Number.isFinite(date.getTime())) return null;

  const extra = [str(row.subText), str(row.summaryText), str(row.infoText)].filter(
    (value): value is string => value !== null && value !== body,
  );
  if (bigText && text && !bigText.includes(text) && body === bigText) extra.push(text);

  return {
    id: fileName.replace(/\.json$/, ''),
    channel: 'android_notification',
    sourceKey: packageName,
    sourceLabel: str(row.appLabel),
    capturedAt: date.toISOString(),
    title: str(row.title),
    subtitle: null,
    body,
    extra,
    nativeKey: str(row.key),
    presetAccountId: null,
    presetCategoryId: null,
    isTest: row.test === true,
  };
}

/** The iOS App Group queue of alerts the Log Payment Alert intent received. */
export function parseIosPendingAlertsJson(raw: string | null | undefined): CaptureInput[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const entries: CaptureInput[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = str(row.id);
    const message = str(row.message);
    if (!id || !message) continue;
    const createdAt = str(row.createdAt);
    const from = str(row.source);
    entries.push({
      id,
      channel: 'ios_alert',
      sourceKey: iosSourceKey(from),
      sourceLabel: from,
      capturedAt:
        createdAt && !Number.isNaN(new Date(createdAt).getTime())
          ? new Date(createdAt).toISOString()
          : new Date().toISOString(),
      title: str(row.title),
      subtitle: str(row.subtitle),
      body: message,
      extra: [],
      nativeKey: null,
      presetAccountId: str(row.accountId),
      presetCategoryId: str(row.categoryId),
    });
  }
  return entries;
}

export interface SeenApp {
  package: string;
  label: string;
  lastSeenAt: number;
  count: number;
}

/** The listener's list of apps that posted notifications (labels only). */
export function parseSeenAppsJson(raw: string | null | undefined): SeenApp[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const apps: SeenApp[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const packageName = str(row.package);
    if (!packageName) continue;
    apps.push({
      package: packageName,
      label: str(row.label) ?? packageName,
      lastSeenAt: typeof row.lastSeenAt === 'number' ? row.lastSeenAt : 0,
      count: typeof row.count === 'number' ? row.count : 0,
    });
  }
  return apps.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export interface ListenerStatus {
  /**
   * As last written by the listener. A process that died while bound leaves
   * this true, so ask the native module (`getNotificationListenerState`) for
   * whether the listener is bound right now.
   */
  connected: boolean;
  connectedAt: number | null;
  /** The last notification of any app the listener saw: proof it is alive. */
  lastNotificationAt: number | null;
  /** The last payment alert it captured. */
  lastCaptureAt: number | null;
}

export function parseListenerStatusJson(raw: string | null | undefined): ListenerStatus {
  const empty: ListenerStatus = {
    connected: false,
    connectedAt: null,
    lastNotificationAt: null,
    lastCaptureAt: null,
  };
  if (!raw) return empty;
  try {
    const row = JSON.parse(raw) as Record<string, unknown>;
    const num = (value: unknown) => (typeof value === 'number' && value > 0 ? value : null);
    return {
      connected: row.connected === true,
      connectedAt: num(row.connectedAt),
      lastNotificationAt: num(row.lastNotificationAt),
      lastCaptureAt: num(row.lastCaptureAt),
    };
  } catch {
    return empty;
  }
}

/**
 * The config the listener reads: whether to capture at all, which packages to
 * keep, and whether to accept `adb shell cmd notification post` (dev builds).
 * The setup screen's own test alert is accepted whenever capture is enabled.
 * `optedOut` is set once the user turns alerts off after having used them: the
 * listener then unbinds itself whenever Android binds it (after a reboot, say)
 * and stops noting which apps post notifications.
 */
export function buildListenerConfigJson(input: {
  enabled: boolean;
  packages: readonly string[];
  allowShell: boolean;
  optedOut?: boolean;
}): string {
  return JSON.stringify({
    v: 1,
    enabled: input.enabled,
    optedOut: input.optedOut === true,
    packages: input.packages,
    allowShell: input.allowShell,
    testTag: PAYMENT_CAPTURE_TEST_TAG,
  });
}
