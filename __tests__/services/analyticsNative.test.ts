const mockMixpanelTrack = jest.fn();
const mockMixpanelIdentify = jest.fn();
const mockMixpanelRegister = jest.fn();
const mockMixpanelUnregister = jest.fn();
const mockMixpanelGetSuperProperties = jest.fn(async (): Promise<Record<string, unknown>> => ({}));
const mockMixpanelPeopleSet = jest.fn();
const mockMixpanelPeopleSetOnce = jest.fn();
const mockMixpanelPeopleUnset = jest.fn();
const mockMixpanelPeopleUnion = jest.fn();
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
    union: mockMixpanelPeopleUnion,
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

// Survives `jest.resetModules()`, so a re-import reads what the last one wrote,
// the way a relaunch reads the device's storage.
const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
  },
}));

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
    mockStorage.clear();
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

  it('clears the super properties earlier releases persisted on the device', async () => {
    mockMixpanelGetSuperProperties.mockResolvedValueOnce({
      sample_rate: 0.5,
      current_screen: 'calendar',
      is_pro: false,
    });
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.trackEvent(analytics.AnalyticsEvents.ONBOARDING_STARTED);

    expect(mockMixpanelUnregister).toHaveBeenCalledWith('sample_rate');
    expect(mockMixpanelUnregister).toHaveBeenCalledWith('current_screen');
    expect(mockMixpanelUnregister).not.toHaveBeenCalledWith('is_pro');
    // Only the sampling marker was ever written to the profile too.
    expect(mockMixpanelPeopleUnset).toHaveBeenCalledTimes(1);
    expect(mockMixpanelPeopleUnset).toHaveBeenCalledWith('sample_rate');
    // Cleared during identification, so no event after it can carry them.
    expect(mockMixpanelUnregister.mock.invocationCallOrder[1]).toBeLessThan(
      mockMixpanelTrack.mock.invocationCallOrder[0],
    );
  });

  it('stamps the screen on each event rather than registering it on every navigation', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.setCurrentScreen('Settings');
    await analytics.trackEvent(analytics.AnalyticsEvents.PRO_PAYWALL_VIEWED, {
      source: 'settings_banner',
    });

    expect(mockMixpanelRegister).not.toHaveBeenCalled();
    expect(mockMixpanelTrack).toHaveBeenCalledWith('Pro Paywall Viewed', {
      source: 'settings_banner',
      current_screen: 'Settings',
    });
    expect(mockLogScreenView).toHaveBeenCalledWith(mockFirebaseInstance, {
      screen_name: 'Settings',
      screen_class: 'Settings',
    });
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

    const eventAfterReset = analytics.trackEvent(analytics.AnalyticsEvents.ONBOARDING_STARTED);
    await analytics.identifyUser('m2t_native_test_0');
    await eventAfterReset;

    expect(mockMixpanelIdentify).toHaveBeenLastCalledWith('m2t_native_test_0');
    expect(mockMixpanelTrack).toHaveBeenCalledWith('Onboarding Started', {});
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_onboarding_started', {});
  });

  it('keeps data resets, imports and restores out of Mixpanel', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.trackEvent(analytics.AnalyticsEvents.DATA_RESET, { scope: 'all' });
    await analytics.trackEvent(analytics.AnalyticsEvents.DATA_IMPORTED, { transactions: 12 });
    await analytics.trackEvent(analytics.AnalyticsEvents.AUTO_BACKUP_RESTORED, {
      target: 'icloud',
    });

    expect(mockMixpanelTrack).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_data_reset', {
      scope: 'all',
    });
    expect(mockLogEvent).toHaveBeenCalledTimes(3);
  });
});

describe('native product usage milestones', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockStorage.clear();
    Object.defineProperty(globalThis, '__DEV__', { value: true, configurable: true });
    process.env.EXPO_PUBLIC_MIXPANEL_TOKEN = 'test-token';
  });

  async function launch({ newInstall }: { newInstall: boolean }) {
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    if (newInstall) await analytics.trackEvent(analytics.AnalyticsEvents.FIRST_APP_OPEN);
    return analytics;
  }

  /** Relaunch: fresh module state and mocks, over the storage the last one left. */
  async function relaunch() {
    jest.resetModules();
    jest.clearAllMocks();
    return launch({ newInstall: false });
  }

  const mixpanelEventsNamed = (name: string) =>
    mockMixpanelTrack.mock.calls.filter(([eventName]) => eventName === name).map(([, p]) => p);

  it("reports a new install's first use of each feature once, to both providers", async () => {
    const analytics = await launch({ newInstall: true });

    await analytics.trackEvent(analytics.AnalyticsEvents.GOAL_CREATED, { hasCover: true });
    await analytics.trackEvent(analytics.AnalyticsEvents.GOAL_CREATED, { hasCover: false });

    expect(mixpanelEventsNamed('Feature First Used')).toEqual([{ feature: 'goals' }]);
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_feature_first_used', {
      feature: 'goals',
    });
    expect(mockMixpanelPeopleUnion).toHaveBeenCalledTimes(1);
    expect(mockMixpanelPeopleUnion).toHaveBeenCalledWith('features_used', ['goals']);
    // The use itself stays GA4 only.
    expect(mixpanelEventsNamed('Goal Created')).toEqual([]);
  });

  it('reports a first use on the screen it happened on, even after leaving it', async () => {
    const analytics = await launch({ newInstall: true });
    await analytics.setCurrentScreen('ItemEditor');

    // The editor closes on save while the first use is still being recorded.
    const itemCreated = analytics.trackEvent(analytics.AnalyticsEvents.ITEM_CREATED);
    await analytics.setCurrentScreen('accounts');
    await itemCreated;

    expect(mixpanelEventsNamed('Feature First Used')).toEqual([
      { feature: 'items', current_screen: 'ItemEditor' },
    ]);
  });

  it('remembers first uses across launches', async () => {
    const firstLaunch = await launch({ newInstall: true });
    await firstLaunch.trackEvent(firstLaunch.AnalyticsEvents.GOAL_CREATED);

    const secondLaunch = await relaunch();
    await secondLaunch.trackEvent(secondLaunch.AnalyticsEvents.GOAL_CREATED);
    await secondLaunch.trackEvent(secondLaunch.AnalyticsEvents.LOAN_CREATED);

    expect(mixpanelEventsNamed('Feature First Used')).toEqual([{ feature: 'loans' }]);
  });

  it("lists an older install's features on its profile without calling them first uses", async () => {
    const analytics = await launch({ newInstall: false });

    await analytics.trackEvent(analytics.AnalyticsEvents.RECEIPT_SCAN_COMPLETED, { count: 1 });

    expect(mockMixpanelPeopleUnion).toHaveBeenCalledWith('features_used', ['receipt_scan']);
    expect(mockMixpanelTrack).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
  });

  it('reports each transaction milestone of a new install once', async () => {
    const analytics = await launch({ newInstall: true });

    for (let logged = 0; logged < 60; logged += 1) await analytics.recordLoggedTransaction();

    expect(mixpanelEventsNamed('Transaction Milestone Reached')).toEqual([
      { count: 10 },
      { count: 50 },
    ]);
    expect(mockLogEvent).toHaveBeenCalledWith(
      mockFirebaseInstance,
      'm2t_transaction_milestone_reached',
      { count: 10 },
    );

    // The count survives a relaunch, and a milestone is never reported twice.
    const relaunched = await relaunch();
    for (let logged = 60; logged < 100; logged += 1) await relaunched.recordLoggedTransaction();
    expect(mixpanelEventsNamed('Transaction Milestone Reached')).toEqual([{ count: 100 }]);
  });

  it('keeps tracking when device storage fails', async () => {
    const { default: storage } = await import('@react-native-async-storage/async-storage');
    jest.mocked(storage.getItem).mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    jest.mocked(storage.setItem).mockRejectedValueOnce(new Error('disk full'));
    const analytics = await launch({ newInstall: false });

    // Callers fire and forget, so neither may reject.
    await expect(
      analytics.trackEvent(analytics.AnalyticsEvents.ALBUM_CREATED, { transactionCount: 0 }),
    ).resolves.toBeUndefined();
    await expect(analytics.recordLoggedTransaction()).resolves.toBeUndefined();

    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_album_created', {
      transaction_count: 0,
    });
    expect(mockMixpanelPeopleUnion).toHaveBeenCalledWith('features_used', ['albums']);
  });

  it('does not count transactions on an install from before usage tracking', async () => {
    const analytics = await launch({ newInstall: false });

    for (let logged = 0; logged < 10; logged += 1) await analytics.recordLoggedTransaction();

    expect(mockMixpanelTrack).not.toHaveBeenCalled();
    expect(mockLogEvent).not.toHaveBeenCalled();
  });
});
