/**
 * Native (iOS/Android) error reporting backed by PostHog error tracking.
 *
 * Re-exports the pure event-hardening helpers from `errorReporting.shared` and
 * adds the thin surface consumed by the app: `reportError`, for errors the app
 * catches itself (including render crashes `AppErrorBoundary` would otherwise
 * swallow). Uncaught JavaScript errors, unhandled rejections and native crashes
 * are autocaptured by the client (`services/posthog.native.ts`), and every
 * exception is attributed to the identified `m2t_<uuid>` user.
 */

import { toExceptionProperties } from './errorReporting.shared';
import { getPostHog } from './posthog';

export * from './errorReporting.shared';

/**
 * Report a caught error to PostHog. `context` keys become exception properties
 * (e.g. `componentStack` → `component_stack`). No-op when PostHog is disabled.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  try {
    getPostHog()?.captureException(error, toExceptionProperties(context));
  } catch {
    // Reporting must never throw into the code that is handling an error.
  }
}

/**
 * Record a breadcrumb attached to the next exception (`$exception_steps`), the
 * way Sentry's navigation breadcrumbs gave crash context. Local only: steps are
 * never sent on their own.
 */
export function addErrorStep(message: string, properties?: Record<string, string>): void {
  try {
    getPostHog()?.addExceptionStep(message, properties);
  } catch {
    // Breadcrumbs are best-effort.
  }
}
