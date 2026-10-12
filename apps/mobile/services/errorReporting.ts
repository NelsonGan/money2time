/**
 * Web / test / unsupported-platform fallback for error reporting.
 *
 * Re-exports the pure event-hardening helpers and provides safe no-op
 * `reportError` / `addErrorStep` so shared code (e.g. `AppErrorBoundary`) can
 * import from `~/services/errorReporting` without a platform guard. The real
 * PostHog-backed implementation lives in `errorReporting.native.ts`.
 */

export * from './errorReporting.shared';

export function reportError(_error: unknown, _context?: Record<string, unknown>): void {}

export function addErrorStep(_message: string, _properties?: Record<string, string>): void {}
