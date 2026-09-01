const trackEvent = jest.fn();
let currentScreen: string | null = null;

jest.mock('~/services/analytics', () => ({
  AnalyticsEvents: { SETTINGS_UPDATED: 'Settings Updated' },
  trackEvent: (...args: unknown[]) => trackEvent(...args),
  getCurrentScreen: () => currentScreen,
}));

import {
  flushSettingsUpdates,
  IDLE_FLUSH_MS,
  recordSettingsUpdate,
  resetSettingsUpdateBatch,
} from '~/services/settingsUpdateBatch';

describe('settings update batching', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    trackEvent.mockClear();
    currentScreen = null;
    resetSettingsUpdateBatch();
  });

  afterEach(() => {
    resetSettingsUpdateBatch();
    jest.useRealTimers();
  });

  it('sends nothing until the batch is flushed', () => {
    recordSettingsUpdate(['themeMode']);
    recordSettingsUpdate(['themeColor']);

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('collapses a screenful of toggles into one event', () => {
    recordSettingsUpdate(['themeMode']);
    recordSettingsUpdate(['themeColor']);
    recordSettingsUpdate(['iconStyle']);
    flushSettingsUpdates();

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('Settings Updated', {
      changed_fields: 'iconStyle,themeColor,themeMode',
      changed_count: 3,
      update_count: 3,
    });
  });

  it('dedupes a key toggled repeatedly and counts every write', () => {
    recordSettingsUpdate(['hapticsEnabled']);
    recordSettingsUpdate(['hapticsEnabled']);
    flushSettingsUpdates();

    expect(trackEvent).toHaveBeenCalledWith('Settings Updated', {
      changed_fields: 'hapticsEnabled',
      changed_count: 1,
      update_count: 2,
    });
  });

  it('sorts the changed keys so the same toggles read as one value', () => {
    recordSettingsUpdate(['weekStartsOn', 'locale']);
    flushSettingsUpdates();

    expect(trackEvent).toHaveBeenCalledWith(
      'Settings Updated',
      expect.objectContaining({ changed_fields: 'locale,weekStartsOn' }),
    );
  });

  it('is a no-op when nothing is pending', () => {
    flushSettingsUpdates();
    flushSettingsUpdates();

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('does not re-send an already flushed batch', () => {
    recordSettingsUpdate(['themeMode']);
    flushSettingsUpdates();
    flushSettingsUpdates();

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('ignores empty key lists', () => {
    recordSettingsUpdate([]);
    recordSettingsUpdate(['']);
    flushSettingsUpdates();

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('flushes on its own once the idle window passes', () => {
    recordSettingsUpdate(['themeMode']);
    jest.advanceTimersByTime(IDLE_FLUSH_MS - 1);
    expect(trackEvent).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('restarts the idle window on each change so one sitting stays one event', () => {
    recordSettingsUpdate(['themeMode']);
    jest.advanceTimersByTime(IDLE_FLUSH_MS - 1);
    recordSettingsUpdate(['themeColor']);
    jest.advanceTimersByTime(IDLE_FLUSH_MS - 1);
    expect(trackEvent).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      'Settings Updated',
      expect.objectContaining({ changed_fields: 'themeColor,themeMode' }),
    );
  });

  it('cancels the idle timer once flushed by hand', () => {
    recordSettingsUpdate(['themeMode']);
    flushSettingsUpdates();
    jest.advanceTimersByTime(IDLE_FLUSH_MS * 2);

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('drops the pending batch on reset without sending it', () => {
    recordSettingsUpdate(['themeMode']);
    resetSettingsUpdateBatch();
    jest.advanceTimersByTime(IDLE_FLUSH_MS * 2);
    flushSettingsUpdates();

    expect(trackEvent).not.toHaveBeenCalled();
  });

  // The batch is normally flushed *because* the user navigated away, so the
  // screen has to be captured when the change was made. Resolving it at flush
  // time would attribute every settings change to whatever came next.
  it('attributes the batch to the screen the change was made on', () => {
    currentScreen = 'DisplaySettings';
    recordSettingsUpdate(['themeMode']);

    currentScreen = 'calendar';
    flushSettingsUpdates();

    expect(trackEvent).toHaveBeenCalledWith(
      'Settings Updated',
      expect.objectContaining({ current_screen: 'DisplaySettings' }),
    );
  });

  it('keeps the screen the sitting started on', () => {
    currentScreen = 'AccountSettings';
    recordSettingsUpdate(['hapticsEnabled']);
    currentScreen = 'DisplaySettings';
    recordSettingsUpdate(['themeMode']);
    flushSettingsUpdates();

    expect(trackEvent).toHaveBeenCalledWith(
      'Settings Updated',
      expect.objectContaining({ current_screen: 'AccountSettings' }),
    );
  });

  it('starts a fresh screen capture after a flush', () => {
    currentScreen = 'DisplaySettings';
    recordSettingsUpdate(['themeMode']);
    flushSettingsUpdates();

    currentScreen = 'AppLock';
    recordSettingsUpdate(['biometricLockEnabled']);
    flushSettingsUpdates();

    expect(trackEvent).toHaveBeenLastCalledWith(
      'Settings Updated',
      expect.objectContaining({ current_screen: 'AppLock' }),
    );
  });

  // Sending `current_screen: null` would override trackEvent's own fallback
  // with nothing, which is worse than saying nothing at all.
  it('omits the screen entirely when none is known', () => {
    recordSettingsUpdate(['themeMode']);
    flushSettingsUpdates();

    expect(trackEvent.mock.calls[0][1]).not.toHaveProperty('current_screen');
  });
});
