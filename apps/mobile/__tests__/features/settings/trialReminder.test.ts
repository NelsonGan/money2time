const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
  },
}));

let mockPermission: 'granted' | 'denied' | 'undetermined' = 'granted';
const mockSchedule = jest.fn(async (_date: Date, _content: unknown) => undefined);
const mockCancel = jest.fn(async () => undefined);
jest.mock('~/services/notifications', () => ({
  PRO_MANAGEMENT_URL: 'money2time://pro-management',
  getPermissionStatus: jest.fn(async () => mockPermission),
  scheduleTrialReminder: (date: Date, content: unknown) => mockSchedule(date, content),
  cancelTrialReminder: () => mockCancel(),
}));

import type { RevenueCatCustomerState } from '~/services/revenueCat';

const NOW = new Date(2026, 10, 27, 21, 15);
const trial: RevenueCatCustomerState = {
  activatedAt: NOW.toISOString(),
  activeProductIdentifier: 'm2t_pro_annual',
  expirationDate: new Date(2026, 11, 4, 21, 15).toISOString(),
  latestPurchaseDate: NOW.toISOString(),
  hasRenewingSubscription: true,
  periodType: 'trial',
};

// A fresh module per test: it remembers what it scheduled.
function load() {
  let mod!: typeof import('~/features/settings/trialReminder');
  jest.isolateModules(() => {
    mod = require('~/features/settings/trialReminder');
  });
  return mod;
}

beforeEach(() => {
  mockStore.clear();
  mockPermission = 'granted';
  mockSchedule.mockClear();
  mockCancel.mockClear();
});

describe('syncTrialReminder', () => {
  it('schedules one reminder two days before a renewing trial ends, naming its price', async () => {
    const { rememberTrialPrice, syncTrialReminder } = load();
    await rememberTrialPrice('m2t_pro_annual', 'RM74.90 / year');
    await syncTrialReminder(trial, NOW);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const [date, content] = mockSchedule.mock.calls[0];
    expect(date).toEqual(new Date(2026, 11, 2, 10, 0));
    expect(content).toMatchObject({ url: 'money2time://pro-management' });
    expect(JSON.stringify(content)).toContain('trial_ending_body_price');

    // The same state again (every foreground) does not reschedule.
    await syncTrialReminder({ ...trial }, NOW);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('leaves the price out when it was not kept for this product', async () => {
    const { rememberTrialPrice, syncTrialReminder } = load();
    await rememberTrialPrice('m2t_pro_monthly', 'RM14.90 / month');
    await syncTrialReminder(trial, NOW);
    expect(JSON.stringify(mockSchedule.mock.calls[0][1])).not.toContain('body_price');
  });

  it('cancels it once the trial is cancelled, converts or ends', async () => {
    const { syncTrialReminder } = load();
    await syncTrialReminder(trial, NOW);
    await syncTrialReminder({ ...trial, hasRenewingSubscription: false }, NOW);
    expect(mockCancel).toHaveBeenCalledTimes(1);
    await syncTrialReminder({ ...trial, periodType: 'normal' }, NOW);
    // Already cancelled: no second call to the scheduler.
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it('schedules nothing without notification permission', async () => {
    mockPermission = 'denied';
    const { syncTrialReminder } = load();
    await syncTrialReminder(trial, NOW);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('schedules it again after a data reset cancelled every notification', async () => {
    const { forgetScheduledTrialReminder, syncTrialReminder } = load();
    await syncTrialReminder(trial, NOW);
    forgetScheduledTrialReminder();
    await syncTrialReminder({ ...trial }, NOW);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });
});
