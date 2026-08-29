import type { LiveEarningsSchedule } from '~/types';

/**
 * Which of the two auto-start mechanisms gets armed, and - just as important -
 * that the other one is disarmed at the same time.
 *
 * A shift can be started for the user in one of two ways: an APNs
 * push-to-start the Worker sends (iOS 17.2+, the real feature), or a local
 * notification they have to tap (everything older). Arming both would notify
 * someone about a card already sitting on their Lock Screen; arming neither
 * silently drops the feature. So every state below asserts on both halves.
 */

const liveActivity = {
  isLiveActivityAvailable: true,
  getLiveActivityStatus: jest.fn(async () => ({ supported: true, enabled: true })),
  getLiveActivityPushToStartToken: jest.fn(async (): Promise<string | null> => 'ab'.repeat(64)),
};
const push = {
  registerLiveEarningsSchedule: jest.fn(
    async (_appUserId: string, _registration: Record<string, unknown>) => {},
  ),
  unregisterLiveEarningsSchedule: jest.fn(async (_appUserId: string, _token?: string) => {}),
};
const notifications = {
  scheduleLiveEarningsStart: jest.fn(
    async (_schedule: LiveEarningsSchedule, _options: { pushStartArmed: boolean }) => {},
  ),
};

// The factories reach the doubles above lazily - through a getter and inside
// arrow bodies - because ts-jest hoists the mocked module's `require` above
// these declarations, and touching them at factory time would be a TDZ error.
jest.mock('~/services/liveActivity', () => ({
  get isLiveActivityAvailable() {
    return liveActivity.isLiveActivityAvailable;
  },
  getLiveActivityStatus: () => liveActivity.getLiveActivityStatus(),
  getLiveActivityPushToStartToken: () => liveActivity.getLiveActivityPushToStartToken(),
}));
jest.mock('~/services/liveEarningsPush', () => ({
  registerLiveEarningsSchedule: (appUserId: string, registration: Record<string, unknown>) =>
    push.registerLiveEarningsSchedule(appUserId, registration),
  unregisterLiveEarningsSchedule: (appUserId: string, token?: string) =>
    push.unregisterLiveEarningsSchedule(appUserId, token),
}));
jest.mock('~/services/notifications', () => ({
  scheduleLiveEarningsStart: (
    schedule: LiveEarningsSchedule,
    options: { pushStartArmed: boolean },
  ) => notifications.scheduleLiveEarningsStart(schedule, options),
}));

// eslint-disable-next-line import/first
import { syncLiveEarningsAutoStart } from '~/features/widgets/lib/syncLiveEarningsAutoStart';

const SCHEDULE: LiveEarningsSchedule = {
  enabled: true,
  days: [1, 2, 3, 4, 5],
  hour: 9,
  minute: 0,
  hours: 8,
};

function run(overrides: Partial<Parameters<typeof syncLiveEarningsAutoStart>[0]> = {}) {
  return syncLiveEarningsAutoStart({
    schedule: SCHEDULE,
    isPro: true,
    hourlyRate: 45,
    currencySymbol: 'RM',
    accent: { accentLightHex: 0x1f8a6f, accentDarkHex: 0x34c99a },
    appUserId: 'user-1',
    ...overrides,
  });
}

/** What the reminder scheduler was last told: armed means it cancels. */
const reminderArmed = () =>
  notifications.scheduleLiveEarningsStart.mock.calls.at(-1)?.[1].pushStartArmed === false;

describe('live-earnings auto start', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    liveActivity.isLiveActivityAvailable = true;
    liveActivity.getLiveActivityStatus.mockResolvedValue({ supported: true, enabled: true });
    liveActivity.getLiveActivityPushToStartToken.mockResolvedValue('ab'.repeat(64));
  });

  it('registers the shift when the device can be pushed to, and cancels the reminder', async () => {
    await expect(run()).resolves.toBe('push');

    expect(push.registerLiveEarningsSchedule).toHaveBeenCalledTimes(1);
    expect(reminderArmed()).toBe(false);
  });

  it('sends everything the card will show, prerendered', async () => {
    await run();
    const [appUserId, registration] = push.registerLiveEarningsSchedule.mock.calls[0];

    expect(appUserId).toBe('user-1');
    expect(registration).toMatchObject({
      days: [1, 2, 3, 4, 5],
      hour: 9,
      minute: 0,
      durationMinutes: 480,
      hourlyRate: 45,
      currencySymbol: 'RM',
      // The card opens at zero: a scheduled shift has accrued nothing yet.
      zeroText: 'RM0.00',
      accentLightHex: 0x1f8a6f,
    });
    // The zone travels with the registration, because only the device knows it.
    expect(typeof registration.timeZone).toBe('string');
    expect(registration.timeZone).not.toBe('');
  });

  it('falls back to the reminder when iOS mints no push-to-start token', async () => {
    liveActivity.getLiveActivityPushToStartToken.mockResolvedValue(null);

    await expect(run()).resolves.toBe('reminder');
    expect(push.registerLiveEarningsSchedule).not.toHaveBeenCalled();
    expect(reminderArmed()).toBe(true);
    // And anything this device armed earlier is cleared, because a reminder
    // beside a live server schedule is the one state that must not exist. (The
    // call is free when nothing is armed - the push service checks first.)
    expect(push.unregisterLiveEarningsSchedule).toHaveBeenCalledTimes(1);
  });

  it('disarms both when the user switches the schedule off', async () => {
    await expect(run({ schedule: { ...SCHEDULE, enabled: false } })).resolves.toBe('off');

    // Unnamed: the push service clears the token it remembers arming, which is
    // the only one still known once iOS stops offering one.
    expect(push.unregisterLiveEarningsSchedule).toHaveBeenCalledTimes(1);
    expect(push.unregisterLiveEarningsSchedule.mock.calls[0][0]).toBe('user-1');
    expect(push.unregisterLiveEarningsSchedule.mock.calls[0][1]).toBeUndefined();
    expect(push.registerLiveEarningsSchedule).not.toHaveBeenCalled();
    expect(reminderArmed()).toBe(false);
  });

  it('disarms both when every day has been deselected', async () => {
    // A legitimate in-between state while the user is choosing days.
    await expect(run({ schedule: { ...SCHEDULE, days: [] } })).resolves.toBe('off');
    expect(push.registerLiveEarningsSchedule).not.toHaveBeenCalled();
    expect(reminderArmed()).toBe(false);
  });

  it('disarms both without a wage, since the card would count up from nothing', async () => {
    await expect(run({ hourlyRate: 0 })).resolves.toBe('off');
    expect(push.registerLiveEarningsSchedule).not.toHaveBeenCalled();
  });

  it('disarms both for a free account, and keeps disarming after a lapse', async () => {
    // Starting the clock by hand stays free; not having to is what Pro buys.
    // The check is here and not only at the toggle because a subscription can
    // lapse long after the switch was flipped, leaving a schedule that would
    // otherwise go on raising cards.
    await expect(run({ isPro: false })).resolves.toBe('off');

    expect(push.registerLiveEarningsSchedule).not.toHaveBeenCalled();
    expect(push.unregisterLiveEarningsSchedule).toHaveBeenCalledTimes(1);
    expect(reminderArmed()).toBe(false);
  });

  it('disarms both when Live Activities are switched off for the app', async () => {
    // A reminder is no use either: tapping it could not raise a card.
    liveActivity.getLiveActivityStatus.mockResolvedValue({ supported: true, enabled: false });

    await expect(run()).resolves.toBe('off');
    expect(push.registerLiveEarningsSchedule).not.toHaveBeenCalled();
    expect(reminderArmed()).toBe(false);
  });

  it('does nothing on a device with no Live Activities at all', async () => {
    liveActivity.isLiveActivityAvailable = false;

    await expect(run()).resolves.toBe('off');
    expect(liveActivity.getLiveActivityStatus).not.toHaveBeenCalled();
    expect(push.registerLiveEarningsSchedule).not.toHaveBeenCalled();
    expect(reminderArmed()).toBe(false);
  });
});
