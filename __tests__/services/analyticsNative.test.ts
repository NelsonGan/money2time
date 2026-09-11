const mockMixpanelTrack = jest.fn();
const mockMixpanelIdentify = jest.fn();
const mockMixpanelRegister = jest.fn();
const mockMixpanelPeopleSet = jest.fn();
const mockMixpanelInit = jest.fn(async () => undefined);
const mockMixpanelFlush = jest.fn();
const mockMixpanelReset = jest.fn();
const mockMixpanelConstructor = jest.fn().mockImplementation(() => ({
  init: mockMixpanelInit,
  identify: mockMixpanelIdentify,
  track: mockMixpanelTrack,
  registerSuperProperties: mockMixpanelRegister,
  getPeople: () => ({ set: mockMixpanelPeopleSet }),
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
}));

describe('native analytics provider coordination', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = 'test-token';
  });

  it('queues early calls and sends a complete event to both providers for a sampled Mixpanel user', async () => {
    const analytics = await import('~/services/analytics.native');
    const earlyScreen = analytics.setCurrentScreen('Calendar');
    const earlyEvent = analytics.trackEvent(analytics.AnalyticsEvents.ACCOUNT_CREATED, {
      type: 'debit',
    });

    await analytics.identifyUser('m2t_native_test_2');
    await Promise.all([earlyScreen, earlyEvent]);

    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenCalledWith(mockFirebaseInstance, true);
    expect(mockSetUserId).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_native_test_2');
    expect(mockMixpanelConstructor).toHaveBeenCalledTimes(1);
    expect(mockMixpanelIdentify).toHaveBeenCalledWith('m2t_native_test_2');
    expect(mockMixpanelTrack).toHaveBeenCalledWith('Account Created', {
      sample_rate: 0.5,
      type: 'debit',
      current_screen: 'Calendar',
    });
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_account_created', {
      type: 'debit',
      current_screen: 'Calendar',
    });
    expect(mockLogScreenView).toHaveBeenCalledWith(mockFirebaseInstance, {
      screen_name: 'Calendar',
      screen_class: 'Calendar',
    });
  });

  it('still sends GA4 events while initializing no Mixpanel SDK for an excluded user', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_0');
    await analytics.trackEvent(analytics.AnalyticsEvents.ACCOUNT_CREATED);
    await analytics.setUserProperties({ is_pro: false });

    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenCalledWith(mockFirebaseInstance, true);
    expect(mockSetUserId).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_native_test_0');
    expect(mockMixpanelConstructor).not.toHaveBeenCalled();
    expect(mockMixpanelTrack).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_account_created', {});
    expect(mockSetUserProperties).toHaveBeenLastCalledWith(mockFirebaseInstance, {
      is_pro: 'false',
    });
  });

  it('clears both providers and requires sampling to resolve again after reset', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.resetAnalytics();

    expect(mockMixpanelReset).toHaveBeenCalledTimes(1);
    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(mockFirebaseInstance, false);
    expect(mockSetUserId).toHaveBeenLastCalledWith(mockFirebaseInstance, null);
    expect(mockResetAnalyticsData).toHaveBeenCalledWith(mockFirebaseInstance);

    const eventAfterReset = analytics.trackEvent(analytics.AnalyticsEvents.ACCOUNT_CREATED);
    await analytics.identifyUser('m2t_native_test_0');
    await eventAfterReset;

    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_account_created', {});
  });
});
