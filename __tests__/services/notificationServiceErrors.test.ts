import { isTransientNotificationServiceError } from '~/services/notifications.shared';

/**
 * Regression guard for Sentry MONEY2TIME-R.
 *
 * iOS tears down the app's XPC connection to the user-notifications daemon
 * when it suspends the app mid-call. Every report had the app in the
 * background, and the identical call succeeds on the next foreground sync, so
 * the failure is noise rather than a bug. Anything outside that exact shape is
 * a real scheduling problem and must keep reaching Sentry.
 */
describe('isTransientNotificationServiceError', () => {
  const real =
    'Failed to schedule notification, Error Domain=NSCocoaErrorDomain Code=4097 ' +
    '"connection to service named com.apple.usernotifications.listener" ' +
    'UserInfo={NSDebugDescription=connection to service named com.apple.usernotifications.listener}';

  it('matches the XPC teardown seen in production', () => {
    expect(isTransientNotificationServiceError(new Error(real))).toBe(true);
    // Reported as a bare string or a non-Error object by some call paths.
    expect(isTransientNotificationServiceError(real)).toBe(true);
    expect(isTransientNotificationServiceError({ message: real })).toBe(true);
  });

  it('does not swallow a genuinely bad request', () => {
    // MONEY2TIME-3P: a day the month does not have. A real bug, and one that
    // leaves the reminder unscheduled until the code is fixed.
    expect(
      isTransientNotificationServiceError(
        new Error('The day parameter for month 8 must be between 1 and 30. Found: 31'),
      ),
    ).toBe(false);
  });

  it('does not swallow other Cocoa errors', () => {
    // Out of space (MONEY2TIME-16) is a different, non-transient condition and
    // must not be hidden by a domain-only match.
    expect(
      isTransientNotificationServiceError(
        new Error('Error Domain=NSCocoaErrorDomain Code=640 "volume is out of space"'),
      ),
    ).toBe(false);
  });

  it('handles values that carry no message', () => {
    expect(isTransientNotificationServiceError(undefined)).toBe(false);
    expect(isTransientNotificationServiceError(null)).toBe(false);
    expect(isTransientNotificationServiceError({})).toBe(false);
    expect(isTransientNotificationServiceError(4097)).toBe(false);
  });
});
