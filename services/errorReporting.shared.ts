/**
 * Sentry event hardening for a finance app.
 *
 * Two concerns, both kept as pure, side-effect-light functions so they can be
 * unit-tested without importing the Sentry SDK:
 *
 *  1. PII scrubbing — defense-in-depth on top of `sendDefaultPii: false`, so
 *     that even if something attaches a user object or request payload, only an
 *     anonymous id ever leaves the device. Financial data (amounts, notes,
 *     account names) must never ride along on an error.
 *  2. Volume cap + dedupe — a render loop firing the error boundary hundreds of
 *     times must not burn the Sentry quota. We dedupe identical errors and cap
 *     the number sent per rolling time window.
 *
 * The Sentry `ErrorEvent` / `Breadcrumb` types are structural supersets of the
 * minimal shapes below, so `beforeSend` / `beforeBreadcrumb` can pass their
 * events straight through.
 */

interface MinimalUser {
  id?: string | number;
}

interface MinimalEvent {
  message?: string;
  user?: MinimalUser | null;
  request?: unknown;
  exception?: { values?: Array<{ type?: string; value?: string }> };
}

interface MinimalBreadcrumb {
  category?: string;
}

/** Max distinct events sent to Sentry per rolling window before we start dropping. */
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

function dedupeKey(event: MinimalEvent): string {
  const first = event.exception?.values?.[0];
  if (first?.type || first?.value) {
    return `${first?.type ?? ''}:${first?.value ?? ''}`;
  }
  return event.message ?? 'unknown';
}

/**
 * Strip PII that could ride along on an event. Keeps only a stable anonymous
 * user id (the `m2t_<uuid>` we already use for analytics) and drops request
 * payloads entirely.
 */
export function scrubEvent<T extends MinimalEvent>(event: T): T {
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined;
  }
  if ('request' in event) {
    delete event.request;
  }
  return event;
}

/**
 * Sentry `beforeSend` hook: dedupe identical errors, cap volume per window, and
 * scrub PII. Returns `null` to drop the event.
 */
export function beforeSendEvent<T extends MinimalEvent>(
  event: T,
  now: number = Date.now(),
): T | null {
  if (now - windowStart > RATE_WINDOW_MS) {
    resetErrorReportingWindow(now);
  }

  const key = dedupeKey(event);
  if (seenKeys.has(key)) return null;
  if (sentInWindow >= MAX_EVENTS_PER_WINDOW) return null;

  seenKeys.add(key);
  sentInWindow += 1;
  return scrubEvent(event);
}

/**
 * Sentry `beforeBreadcrumb` hook: drop `console` breadcrumbs, which can capture
 * anything the app logs (potentially financial data). Navigation / http / touch
 * breadcrumbs are kept for crash context.
 */
export function beforeBreadcrumbFilter<T extends MinimalBreadcrumb>(breadcrumb: T): T | null {
  if (breadcrumb.category === 'console') return null;
  return breadcrumb;
}
