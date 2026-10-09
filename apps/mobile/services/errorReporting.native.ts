/**
 * Native (iOS/Android) error reporting backed by Sentry.
 *
 * Re-exports the pure event-hardening helpers from `errorReporting.shared` and
 * adds the thin Sentry surface consumed by the app: `reportError` (used by
 * `AppErrorBoundary` to capture render crashes that would otherwise be swallowed
 * by the boundary) and `setErrorUser` (ties errors to the anonymous app user id).
 */

import * as Sentry from '@sentry/react-native';

export * from './errorReporting.shared';

/**
 * Report a caught error to Sentry. `context` is attached under the `react`
 * context (e.g. `componentStack`). No-op when Sentry has no DSN configured.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error, context ? { contexts: { react: context } } : undefined);
}

/** Attribute subsequent errors to the anonymous app user id (m2t_<uuid>). */
export function setErrorUser(appUserId: string | null): void {
  Sentry.setUser(appUserId ? { id: appUserId } : null);
}
