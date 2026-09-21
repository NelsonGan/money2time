/**
 * The asymmetry between swallowing a schedule failure and swallowing a cancel.
 *
 * `notifications.native` swallows the transient iOS XPC teardown (Sentry
 * MONEY2TIME-R) because every caller is a whole-schedule sync that re-runs on
 * the next foreground. `cancelLiveEarningsStart` is the exception: it is the
 * guard that stops the live-earnings reminder and push-to-start being armed at
 * once, and on the push path `syncLiveEarningsAutoStart` has already registered
 * the schedule by the time it runs. A cancel that quietly does nothing there
 * leaves a "start your shift" notification for a card the Worker already
 * raised, with nothing recorded anywhere.
 */

const scheduleNotificationAsync = jest.fn();
const cancelScheduledNotificationAsync = jest.fn();

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (...args: unknown[]) => scheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) =>
    cancelScheduledNotificationAsync(...args),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  SchedulableTriggerInputTypes: {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
  },
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  setNotificationChannelAsync: jest.fn(),
}));

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const XPC_TEARDOWN = new Error(
  'Failed to schedule notification, Error Domain=NSCocoaErrorDomain Code=4097 ' +
    '"connection to service named com.apple.usernotifications.listener"',
);

describe('transient notification failures', () => {
  beforeEach(() => {
    scheduleNotificationAsync.mockReset().mockResolvedValue(undefined);
    cancelScheduledNotificationAsync.mockReset().mockResolvedValue(undefined);
  });

  it('swallows the XPC teardown on an ordinary schedule', async () => {
    scheduleNotificationAsync.mockRejectedValue(XPC_TEARDOWN);
    const { scheduleDailyCheckin } = require('~/services/notifications.native');

    // The next foreground sync schedules it again, so this must not reject.
    await expect(scheduleDailyCheckin(9, 0)).resolves.toBeUndefined();
  });

  it('still throws a genuine scheduling bug', async () => {
    scheduleNotificationAsync.mockRejectedValue(
      new Error('The day parameter for month 8 must be between 1 and 30. Found: 31'),
    );
    const { scheduleDailyCheckin } = require('~/services/notifications.native');

    await expect(scheduleDailyCheckin(9, 0)).rejects.toThrow('day parameter');
  });

  it('swallows the XPC teardown on an ordinary cancel', async () => {
    cancelScheduledNotificationAsync.mockRejectedValue(XPC_TEARDOWN);
    const { cancelDailyCheckin } = require('~/services/notifications.native');

    await expect(cancelDailyCheckin()).resolves.toBeUndefined();
  });

  it('does NOT swallow it when cancelling the live-earnings reminders', async () => {
    cancelScheduledNotificationAsync.mockRejectedValue(XPC_TEARDOWN);
    const { cancelLiveEarningsStart } = require('~/services/notifications.native');

    // Arming push-to-start on top of a reminder that is still live is the one
    // state syncLiveEarningsAutoStart exists to prevent - it must be visible.
    await expect(cancelLiveEarningsStart()).rejects.toThrow('Code=4097');
  });
});
