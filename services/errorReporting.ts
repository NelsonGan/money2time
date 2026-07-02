/**
 * Web / test / unsupported-platform fallback for error reporting.
 *
 * Re-exports the pure event-hardening helpers and provides safe no-op
 * `reportError` / `setErrorUser` so shared code (e.g. `AppErrorBoundary`) can
 * import from `~/services/errorReporting` without a platform guard. The real
 * Sentry-backed implementation lives in `errorReporting.native.ts`.
 */

export * from './errorReporting.shared';

export function reportError(_error: unknown, _context?: Record<string, unknown>): void {}

export function setErrorUser(_appUserId: string | null): void {}
