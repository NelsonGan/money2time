const mockMixpanelTrack = jest.fn();
const mockMixpanelIdentify = jest.fn();
const mockMixpanelRegister = jest.fn();
const mockMixpanelUnregister = jest.fn();
const mockMixpanelGetSuperProperties = jest.fn(async (): Promise<Record<string, unknown>> => ({}));
const mockMixpanelPeopleSet = jest.fn();
const mockMixpanelPeopleSetOnce = jest.fn();
const mockMixpanelPeopleUnset = jest.fn();
const mockMixpanelInit = jest.fn(async () => undefined);
const mockMixpanelFlush = jest.fn();
const mockMixpanelReset = jest.fn();
const mockMixpanelConstructor = jest.fn().mockImplementation(() => ({
  init: mockMixpanelInit,
  identify: mockMixpanelIdentify,
  track: mockMixpanelTrack,
  registerSuperProperties: mockMixpanelRegister,
  unregisterSuperProperty: mockMixpanelUnregister,
  getSuperProperties: mockMixpanelGetSuperProperties,
  getPeople: () => ({
    set: mockMixpanelPeopleSet,
    setOnce: mockMixpanelPeopleSetOnce,
    unset: mockMixpanelPeopleUnset,
  }),
  flush: mockMixpanelFlush,
  reset: mockMixpanelReset,
}));

const mockFirebaseInstance = { app: 'default' };
const mockSetAnalyticsCollectionEnabled = jest.fn(async () => undefined);
const mockSetUserId = jest.fn(async () => undefined);
const mockSetUserProperties = jest.fn(async () => undefined);
const mockLogEvent = jest.fn(async () => undefined);
const mockLogScreenView = jest.fn(async () => undefined);
const mockResetAnalyticsData = jest.fn(async () => undefined);
const mockSetConsent = jest.fn(async () => undefined);
const mockSetDefaultEventParameters = jest.fn(async () => undefined);

jest.mock('react-native', () => ({
  NativeModules: { MixpanelReactNative: {} },
  Platform: { OS: 'ios' },
}));

jest.mock('mixpanel-react-native', () => ({ Mixpanel: mockMixpanelConstructor }));

jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: () => mockFirebaseInstance,
  setAnalyticsCollectionEnabled: mockSetAnalyticsCollectionEnabled,
  setUserId: mockSetUserId,
  setUserProperties: mockSetUserProperties,
  logEvent: mockLogEvent,
  logScreenView: mockLogScreenView,
  resetAnalyticsData: mockResetAnalyticsData,
  setConsent: mockSetConsent,
  setDefaultEventParameters: mockSetDefaultEventParameters,
}));

describe('native analytics provider coordination', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    Object.defineProperty(globalThis, '__DEV__', { value: true, configurable: true });
    process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = 'test-token';
  });

  it('queues early calls and sends a funnel event to both providers once identified', async () => {
    const analytics = await import('~/services/analytics.native');
    const earlyScreen = analytics.setCurrentScreen('Calendar');
    const earlyEvent = analytics.trackEvent(analytics.AnalyticsEvents.PRO_PAYWALL_VIEWED, {
      source: 'settings_banner',
    });

    await analytics.identifyUser('m2t_native_test_2');
    await Promise.all([earlyScreen, earlyEvent]);

    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenNthCalledWith(
      1,
      mockFirebaseInstance,
      false,
    );
    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenNthCalledWith(
      2,
      mockFirebaseInstance,
      true,
    );
    expect(mockSetConsent).toHaveBeenCalledWith(mockFirebaseInstance, {
      analytics_storage: true,
      ad_storage: false,
      ad_user_data: false,
      ad_personalization: false,
    });
    expect(mockSetDefaultEventParameters).toHaveBeenCalledWith(mockFirebaseInstance, {
      debug_mode: 1,
    });
    expect(mockSetUserId).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_native_test_2');
    expect(mockSetConsent.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetUserId.mock.invocationCallOrder[0],
    );
    expect(mockSetUserId.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetAnalyticsCollectionEnabled.mock.invocationCallOrder[1],
    );
    expect(mockMixpanelConstructor).toHaveBeenCalledTimes(1);
    expect(mockMixpanelIdentify).toHaveBeenCalledWith('m2t_native_test_2');
    expect(mockMixpanelPeopleSet).toHaveBeenCalledWith({
      $name: 'm2t_native_test_2',
      platform: 'ios',
    });
    expect(mockMixpanelTrack).toHaveBeenCalledWith('Pro Paywall Viewed', {
      source: 'settings_banner',
      current_screen: 'Calendar',
    });
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_pro_paywall_viewed', {
      source: 'settings_banner',
      current_screen: 'Calendar',
    });
    expect(mockLogScreenView).toHaveBeenCalledWith(mockFirebaseInstance, {
      screen_name: 'Calendar',
      screen_class: 'Calendar',
    });
  });

  it('switches off the automatic mobile events ($ae_session, $ae_first_open, ...)', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');

    expect(mockMixpanelConstructor).toHaveBeenCalledWith('test-token', false, true);
  });

  it('sends Mixpanel every user, with no sampling cohort', async () => {
    const analytics = await import('~/services/analytics.native');

    // Fell outside the retired 50% cohort, so it used to reach GA4 only.
    await analytics.identifyUser('m2t_native_test_0');
    await analytics.trackEvent(analytics.AnalyticsEvents.PRO_PURCHASE_STARTED, { plan: 'annual' });
    await analytics.setUserProperties({ is_pro: false });

    expect(mockMixpanelIdentify).toHaveBeenCalledWith('m2t_native_test_0');
    expect(mockMixpanelTrack).toHaveBeenCalledWith('Pro Purchase Started', { plan: 'annual' });
    expect(mockMixpanelPeopleSet).toHaveBeenLastCalledWith({ is_pro: false });
    expect(mockSetUserProperties).toHaveBeenLastCalledWith(mockFirebaseInstance, {
      is_pro: 'false',
    });
  });

  it('keeps GA4-only telemetry out of Mixpanel', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.trackEvent(analytics.AnalyticsEvents.ACCOUNT_CREATED, { type: 'debit' });

    expect(mockMixpanelTrack).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_account_created', {
      type: 'debit',
    });
  });

  it('stamps days_since_install on events and the install date on the profile once', async () => {
    const analytics = await import('~/services/analytics.native');
    jest.useFakeTimers({ now: Date.parse('2026-09-11T12:00:00.000Z') });
    try {
      // Tracked before the install date is known, as a launch-time event is.
      const earlyEvent = analytics.trackEvent(analytics.AnalyticsEvents.ONBOARDING_STARTED);
      const installDate = analytics.setInstallDate('2026-09-01T10:00:00.000Z');
      await analytics.identifyUser('m2t_native_test_2');
      await Promise.all([earlyEvent, installDate]);
    } finally {
      jest.useRealTimers();
    }

    expect(mockMixpanelTrack).toHaveBeenCalledWith('Onboarding Started', {
      days_since_install: 10,
    });
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_onboarding_started', {
      days_since_install: 10,
    });
    expect(mockMixpanelPeopleSetOnce).toHaveBeenCalledWith({
      first_app_open: '2026-09-01T10:00:00.000Z',
    });
  });

  it('clears the retired sample_rate marker a previously sampled install still carries', async () => {
    mockMixpanelGetSuperProperties.mockResolvedValueOnce({
      sample_rate: 0.5,
      current_screen: 'calendar',
    });
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.trackEvent(analytics.AnalyticsEvents.DATA_RESET, { scope: 'all' });

    expect(mockMixpanelUnregister).toHaveBeenCalledWith('sample_rate');
    expect(mockMixpanelPeopleUnset).toHaveBeenCalledWith('sample_rate');
    // Cleared during identification, so no event after it can carry the marker.
    expect(mockMixpanelUnregister.mock.invocationCallOrder[0]).toBeLessThan(
      mockMixpanelTrack.mock.invocationCallOrder[0],
    );
  });

  it('leaves an install without the marker alone', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');

    expect(mockMixpanelGetSuperProperties).toHaveBeenCalledTimes(1);
    expect(mockMixpanelUnregister).not.toHaveBeenCalled();
    expect(mockMixpanelPeopleUnset).not.toHaveBeenCalled();
  });

  it('clears development-only event defaults in production', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_0');

    expect(mockSetDefaultEventParameters).toHaveBeenCalledWith(mockFirebaseInstance, undefined);
  });

  it('clears both providers and waits for a new identity after reset', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.resetAnalytics();

    expect(mockMixpanelReset).toHaveBeenCalledTimes(1);
    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(mockFirebaseInstance, false);
    expect(mockSetUserId).toHaveBeenLastCalledWith(mockFirebaseInstance, null);
    expect(mockResetAnalyticsData).toHaveBeenCalledWith(mockFirebaseInstance);

    const eventAfterReset = analytics.trackEvent(analytics.AnalyticsEvents.DATA_RESET, {
      scope: 'all',
    });
    await analytics.identifyUser('m2t_native_test_0');
    await eventAfterReset;

    expect(mockMixpanelIdentify).toHaveBeenLastCalledWith('m2t_native_test_0');
    expect(mockMixpanelTrack).toHaveBeenCalledWith('Data Reset', { scope: 'all' });
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_data_reset', {
      scope: 'all',
    });
  });
});
