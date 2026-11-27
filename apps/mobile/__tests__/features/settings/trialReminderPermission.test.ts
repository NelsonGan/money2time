type AlertButton = { text: string; onPress?: () => void };
const mockAlert = jest.fn();
const mockOpenSettings = jest.fn(async () => undefined);
jest.mock('react-native', () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  Linking: { openSettings: () => mockOpenSettings() },
}));

jest.mock('~/utils/interactions', () => ({
  runAfterInteractions: (cb: () => void) => {
    cb();
    return { cancel: jest.fn() };
  },
}));

let mockPermission = { status: 'undetermined', canAskAgain: true };
const mockRequest = jest.fn(async () => 'granted');
jest.mock('~/services/notifications', () => ({
  getPermissionState: jest.fn(async () => mockPermission),
  requestPermissions: () => mockRequest(),
}));

import { ensureTrialReminderPermission } from '~/features/settings/trialReminderPermission';

beforeEach(() => {
  jest.useFakeTimers();
  mockAlert.mockReset();
  mockOpenSettings.mockClear();
  mockRequest.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

async function run(pressButton?: string) {
  const done = ensureTrialReminderPermission();
  await jest.runAllTimersAsync();
  if (pressButton) {
    const buttons = mockAlert.mock.calls[0][2] as AlertButton[];
    buttons.find((button) => button.text === pressButton)?.onPress?.();
  }
  await done;
}

describe('ensureTrialReminderPermission', () => {
  it('shows the system prompt to a member who never answered', async () => {
    mockPermission = { status: 'undetermined', canAskAgain: true };
    await run();
    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('asks again where Android still allows it', async () => {
    mockPermission = { status: 'denied', canAskAgain: true };
    await run();
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('offers Settings when the system prompt can no longer show', async () => {
    mockPermission = { status: 'denied', canAskAgain: false };
    await run('notifications.open_settings');
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('leaves Settings closed when the member says not now', async () => {
    mockPermission = { status: 'denied', canAskAgain: false };
    await run('pro.not_now');
    expect(mockOpenSettings).not.toHaveBeenCalled();
  });

  it('does nothing when notifications are already allowed', async () => {
    mockPermission = { status: 'granted', canAskAgain: true };
    await run();
    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockAlert).not.toHaveBeenCalled();
  });
});
