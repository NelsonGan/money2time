/**
 * PostHog `$exception` hardening for a finance app.
 *
 * Two concerns, both kept as pure, side-effect-light functions so they can be
 * unit-tested without importing the PostHog SDK:
 *
 *  1. PII scrubbing — only the exception itself and controlled context keys
 *     leave the device. Financial data (amounts, notes, account names) must
 *     never ride along on an error, so context values are reduced to short
 *     scalars and anything that looks like free text is dropped.
 *  2. Volume cap + dedupe — a render loop firing the error boundary hundreds of
 *     times must not burn the 100K-exception free tier. We dedupe identical
 *     errors and cap the number sent per rolling time window.
 */

interface ExceptionEntry {
  type?: unknown;
  value?: unknown;
}

interface MinimalCaptureResult {
  event: string;
  properties?: Record<string, unknown>;
}

/** Max distinct exceptions sent per rolling window before we start dropping. */
export const MAX_EVENTS_PER_WINDOW = 25;
/** Rolling window length; the cap + dedupe set reset once this elapses. */
export const RATE_WINDOW_MS = 5 * 60_000;

let windowStart = 0;
let sentInWindow = 0;
const seenKeys = new Set<string>();

/** Reset the rate-limit window (exposed for tests and app-foreground resets). */
export function resetErrorReportingWindow(now: number = Date.now()): void {
  windowStart = now;
  sentInWindow = 0;
  seenKeys.clear();
}

function dedupeKey(properties: Record<string, unknown>): string {
  const list = properties.$exception_list;
  const first = Array.isArray(list) ? (list[0] as ExceptionEntry | undefined) : undefined;
  const type = typeof first?.type === 'string' ? first.type : '';
  const value = typeof first?.value === 'string' ? first.value : '';
  if (type || value) return `${type}:${value}`;
  return typeof properties.$exception_message === 'string'
    ? properties.$exception_message
    : 'unknown';
}

/** Context keys PostHog itself needs on an exception, plus our own stack field. */
const KEPT_EXCEPTION_KEYS = /^\$|^component_stack$/;
/** Our own context values are identifiers, scopes and flags, never free text. */
const CONTEXT_VALUE_LIMIT = 120;

/**
 * Keep PostHog's own `$` properties and short scalar context, and drop anything
 * else, so a stray object or long string cannot carry user data out.
 */
export function scrubExceptionProperties(
  properties: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (KEPT_EXCEPTION_KEYS.test(key)) {
      result[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (typeof value === 'string' && value.length <= CONTEXT_VALUE_LIMIT) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * `before_send` hook for `$exception`: dedupe identical errors, cap volume per
 * window, and scrub context. Returns `null` to drop the event.
 */
export function beforeSendException<T extends MinimalCaptureResult>(
  event: T,
  now: number = Date.now(),
): T | null {
  if (now - windowStart > RATE_WINDOW_MS) {
    resetErrorReportingWindow(now);
  }

  const properties = event.properties ?? {};
  const key = dedupeKey(properties);
  if (seenKeys.has(key)) return null;
  if (sentInWindow >= MAX_EVENTS_PER_WINDOW) return null;

  seenKeys.add(key);
  sentInWindow += 1;
  return { ...event, properties: scrubExceptionProperties(properties) } as T;
}

/**
 * Turn `reportError`'s free-form context into exception properties: snake-case
 * keys, scalar values only. `componentStack` becomes `component_stack`.
 */
export function toExceptionProperties(
  context?: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  if (!context) return result;
  for (const [rawKey, value] of Object.entries(context)) {
    const key = rawKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return result;
}
