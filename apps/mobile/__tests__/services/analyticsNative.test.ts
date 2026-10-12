const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockRegister = jest.fn();
const mockSetPersonProperties = jest.fn();
const mockFlush = jest.fn(async () => undefined);
const mockReset = jest.fn();
const mockStartSessionRecording = jest.fn(async () => undefined);
const mockPostHogClient = {
  capture: mockCapture,
  identify: mockIdentify,
  register: mockRegister,
  setPersonProperties: mockSetPersonProperties,
  flush: mockFlush,
  reset: mockReset,
  startSessionRecording: mockStartSessionRecording,
};
const mockPostHog = { enabled: true };
const mockAppStateListeners: ((state: string) => void)[] = [];

const mockFirebaseInstance = { app: 'default' };
const mockSetAnalyticsCollectionEnabled = jest.fn(async () => undefined);
const mockSetUserId = jest.fn(
  async (_instance: unknown, _userId: string | null): Promise<void> => undefined,
);
const mockSetUserProperties = jest.fn(async () => undefined);
const mockLogEvent = jest.fn(async () => undefined);
const mockLogScreenView = jest.fn(async () => undefined);
const mockResetAnalyticsData = jest.fn(async () => undefined);
const mockSetConsent = jest.fn(async (): Promise<void> => undefined);
const mockSetDefaultEventParameters = jest.fn(async (): Promise<void> => undefined);
const mockGetAppInstanceId = jest.fn(async (): Promise<string | null> => 'firebase-install-id');

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
  Platform: { OS: 'ios' },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn((_type: string, listener: (state: string) => void) => {
      mockAppStateListeners.push(listener);
      return { remove: jest.fn() };
    }),
  },
}));

jest.mock('~/services/posthog', () => ({
  getPostHog: () => (mockPostHog.enabled ? mockPostHogClient : null),
}));

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
  getAppInstanceId: mockGetAppInstanceId,
}));

const TODAY_ALREADY_OPENED = () =>
  JSON.stringify({
    day: (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate(),
      ).padStart(2, '0')}`;
    })(),
    opened: true,
    transactionLogged: false,
    features: [],
    activeDays: 1,
    loggingDays: 0,
    lastActiveDay: null,
  });

/** Person-property writes other than the `platform` one every first identify makes. */
const personWrites = () =>
  mockSetPersonProperties.mock.calls.filter(
    ([set]) => !(Object.keys(set as object).length === 1 && 'platform' in (set as object)),
  );

/** PostHog captures, optionally of one event name. */
const captured = (name?: string) =>
  mockCapture.mock.calls
    .filter(([eventName]) => name === undefined || eventName === name)
    .map(([eventName, properties]) => (name === undefined ? [eventName, properties] : properties));

/** GA4 events other than the daily engagement ones, which most tests do not exercise. */
const ga4Events = () =>
  (mockLogEvent.mock.calls as unknown[][]).filter(
    ([, name]) => !['m2t_daily_app_open', 'm2t_feature_used'].includes(name as string),
  );

describe('native analytics provider coordination', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockStorage.clear();
    Object.defineProperty(globalThis, '__DEV__', { value: true, configurable: true });
    mockPostHog.enabled = true;
    mockAppStateListeners.length = 0;
    // Today's `Daily App Open` already happened, so only the events a test
    // sends itself reach the providers; the daily tests clear this.
    mockStorage.set('@m2t/analytics_daily/v1', TODAY_ALREADY_OPENED());
  });

  it('returns the real Firebase installation ID only for the identified production user', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    const analytics = await import('~/services/analytics.native');
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBeNull();
    await analytics.identifyUser('m2t_revenue');
    expect(await analytics.getFirebaseAppInstanceId('m2t_other')).toBeNull();
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBe('firebase-install-id');
    expect(mockGetAppInstanceId).toHaveBeenCalledTimes(1);
  });

  it('keeps development Firebase IDs out of the production RevenueCat integration', async () => {
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_revenue');
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBeNull();
    expect(mockGetAppInstanceId).not.toHaveBeenCalled();
  });

  it('retries Firebase configuration for the same customer after a temporary failure', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    mockSetConsent.mockRejectedValueOnce(new Error('temporary consent failure'));
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_revenue');
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBeNull();
    expect(await analytics.setUserProperties({ pro_status: 'free' })).toBe(false);
    await analytics.identifyUser('m2t_revenue');
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBe('firebase-install-id');
    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(mockFirebaseInstance, true);
  });

  it('recovers Firebase collection on the next event after a temporary startup failure', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    mockSetConsent.mockRejectedValueOnce(new Error('temporary consent failure'));
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_revenue');
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBeNull();
    await Promise.all([
      analytics.trackEvent(analytics.AnalyticsEvents.PRO_PAYWALL_VIEWED),
      analytics.trackEvent(analytics.AnalyticsEvents.PRO_PAYWALL_VIEWED),
    ]);
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBe('firebase-install-id');
    expect(mockSetConsent).toHaveBeenCalledTimes(2);
    expect(mockLogEvent).toHaveBeenCalledTimes(2);
    expect(captured('Pro Paywall Viewed')).toHaveLength(2);
  });

  it('holds events and repeated identify calls until a later customer is configured', async () => {
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_old');
    mockLogEvent.mockClear();
    let finishConsent!: () => void;
    let consentStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      consentStarted = resolve;
    });
    mockSetConsent.mockImplementationOnce(() => {
      consentStarted();
      return new Promise<void>((resolve) => {
        finishConsent = resolve;
      });
    });
    const change = analytics.identifyUser('m2t_new');
    await started;
    let repeatFinished = false;
    const repeat = analytics.identifyUser('m2t_new').then(() => {
      repeatFinished = true;
    });
    const event = analytics.trackEvent(analytics.AnalyticsEvents.PRO_PAYWALL_VIEWED);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const callsWhilePending = mockLogEvent.mock.calls.length;
    const repeatedWhilePending = repeatFinished;
    finishConsent();
    await Promise.all([change, repeat, event]);
    expect(callsWhilePending).toBe(0);
    expect(repeatedWhilePending).toBe(false);
    expect(mockLogEvent).toHaveBeenCalledTimes(1);
    expect(mockSetUserId).toHaveBeenLastCalledWith(mockFirebaseInstance, 'm2t_new');
  });

  it('rejects stale Pro profile writes for a customer who is no longer identified', async () => {
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_new');
    mockSetPersonProperties.mockClear();
    mockRegister.mockClear();
    mockSetUserProperties.mockClear();
    expect(await analytics.setUserProperties({ pro_status: 'pro' }, 'm2t_old')).toBe(false);
    expect(await analytics.setSuperProperties({ is_pro: true }, 'm2t_old')).toBe(false);
    expect(mockSetPersonProperties).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockSetUserProperties).not.toHaveBeenCalled();
  });

  it('clears a pending old-customer revenue marker before collecting for a new customer', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_old');
    let finishMarker!: () => void;
    let markerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markerStarted = resolve;
    });
    let appliedMarker: number | null = null;
    mockSetDefaultEventParameters.mockImplementationOnce(() => {
      markerStarted();
      return new Promise<void>((resolve) => {
        finishMarker = () => {
          appliedMarker = 1;
          resolve();
        };
      });
    });
    const marker = analytics.markRevenueCatRevenueSource('m2t_old');
    await started;
    mockSetDefaultEventParameters.mockImplementationOnce(async () => {
      appliedMarker = null;
    });
    const change = analytics.identifyUser('m2t_new');
    await new Promise<void>((resolve) => setImmediate(resolve));
    const changedBeforeMarkerFinished = mockSetUserId.mock.calls.some(([, id]) => id === 'm2t_new');
    finishMarker();
    const [marked] = await Promise.all([marker, change]);
    expect(changedBeforeMarkerFinished).toBe(false);
    expect(marked).toBe(false);
    expect(appliedMarker).toBeNull();
    expect(await analytics.getFirebaseAppInstanceId('m2t_new')).toBe('firebase-install-id');
  });

  it('does not mark RevenueCat ready while Firebase startup can still clear its defaults', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    let finishDefaults!: () => void;
    let defaultsStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      defaultsStarted = resolve;
    });
    mockSetDefaultEventParameters.mockImplementationOnce(() => {
      defaultsStarted();
      return new Promise<void>((resolve) => {
        finishDefaults = resolve;
      });
    });
    const analytics = await import('~/services/analytics.native');
    const identify = analytics.identifyUser('m2t_revenue');
    await started;
    const earlyId = await analytics.getFirebaseAppInstanceId('m2t_revenue');
    const earlyMarker = await analytics.markRevenueCatRevenueSource('m2t_revenue');
    finishDefaults();
    await identify;
    expect(earlyId).toBeNull();
    expect(earlyMarker).toBe(false);
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBe('firebase-install-id');
    expect(await analytics.markRevenueCatRevenueSource('m2t_revenue')).toBe(true);
    expect(mockSetDefaultEventParameters).toHaveBeenLastCalledWith(mockFirebaseInstance, {
      revenuecat_revenue_enabled: 1,
    });
  });

  it('marks SDK revenue as supplemental only after production identity is ready', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    const analytics = await import('~/services/analytics.native');
    expect(await analytics.markRevenueCatRevenueSource('m2t_revenue')).toBe(false);
    await analytics.identifyUser('m2t_revenue');
    expect(await analytics.markRevenueCatRevenueSource('m2t_revenue')).toBe(true);
    expect(mockSetDefaultEventParameters).toHaveBeenLastCalledWith(mockFirebaseInstance, {
      revenuecat_revenue_enabled: 1,
    });
    await analytics.markRevenueCatRevenueSource('m2t_revenue');
    expect(mockSetDefaultEventParameters).toHaveBeenCalledTimes(2);
    await analytics.identifyUser('m2t_other');
    await analytics.identifyUser('m2t_revenue');
    await analytics.markRevenueCatRevenueSource('m2t_revenue');
    expect(mockSetDefaultEventParameters).toHaveBeenLastCalledWith(mockFirebaseInstance, {
      revenuecat_revenue_enabled: 1,
    });
    expect(mockSetDefaultEventParameters).toHaveBeenCalledTimes(5);
  });

  it('allows another Firebase ID lookup after a temporary SDK failure', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_revenue');
    mockGetAppInstanceId.mockRejectedValueOnce(new Error('temporarily unavailable'));
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBeNull();
    expect(await analytics.getFirebaseAppInstanceId('m2t_revenue')).toBe('firebase-install-id');
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
      revenuecat_revenue_enabled: null,
    });
    expect(mockSetUserId).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_native_test_2');
    expect(mockSetConsent.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetUserId.mock.invocationCallOrder[0],
    );
    expect(mockSetUserId.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetAnalyticsCollectionEnabled.mock.invocationCallOrder[1],
    );
    expect(mockIdentify).toHaveBeenCalledTimes(1);
    expect(mockIdentify).toHaveBeenCalledWith('m2t_native_test_2');
    expect(mockCapture).toHaveBeenCalledWith(
      'Pro Paywall Viewed',
      { source: 'settings_banner', current_screen: 'Calendar' },
      { timestamp: expect.any(Date) },
    );
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_pro_paywall_viewed', {
      source: 'settings_banner',
      current_screen: 'Calendar',
    });
    expect(mockLogScreenView).toHaveBeenCalledWith(mockFirebaseInstance, {
      screen_name: 'Calendar',
      screen_class: 'Calendar',
    });
  });

  it('identifies PostHog once per user and holds events until then', async () => {
    const analytics = await import('~/services/analytics.native');
    const event = analytics.trackEvent(analytics.AnalyticsEvents.FIRST_APP_OPEN);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const capturedBeforeIdentification = mockCapture.mock.calls.length;
    await analytics.identifyUser('m2t_native_test_2');
    await analytics.identifyUser('m2t_native_test_2');
    await event;

    expect(capturedBeforeIdentification).toBe(0);
    expect(mockIdentify).toHaveBeenCalledTimes(1);
    expect(captured('First App Open')).toEqual([{}]);
  });

  it('contains PostHog capture failures while GA4 still receives the event', async () => {
    const failure = new Error('queue unavailable');
    mockCapture.mockImplementationOnce(() => {
      throw failure;
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const analytics = await import('~/services/analytics.native');
      await analytics.identifyUser('m2t_native_test_2');
      await expect(
        analytics.trackEvent(analytics.AnalyticsEvents.ONBOARDING_STARTED),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith('[Analytics] PostHog event tracking failed:', failure);
      expect(mockLogEvent).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps GA4 working when PostHog is disabled', async () => {
    mockPostHog.enabled = false;
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    await analytics.trackEvent(analytics.AnalyticsEvents.ONBOARDING_STARTED);
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_onboarding_started', {});
    expect(await analytics.setUserProperties({ is_pro: false })).toBe(true);
  });

  it('writes person properties only when they change, across launches', async () => {
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    expect(await analytics.setUserProperties({ is_pro: false, pro_plan: 'free' })).toBe(true);
    expect(await analytics.setUserProperties({ is_pro: false, pro_plan: 'free' })).toBe(true);
    expect(await analytics.setUserProperties({ is_pro: true, pro_plan: 'free' })).toBe(true);
    expect(personWrites()).toEqual([
      [{ is_pro: false, pro_plan: 'free' }, {}, false],
      [{ is_pro: true }, {}, false],
    ]);
    expect(mockSetUserProperties).toHaveBeenLastCalledWith(mockFirebaseInstance, {
      is_pro: 'true',
      pro_plan: 'free',
    });

    // A relaunch with the same state sends nothing new.
    jest.resetModules();
    jest.clearAllMocks();
    const relaunched = await import('~/services/analytics.native');
    await relaunched.identifyUser('m2t_native_test_2');
    expect(await relaunched.setUserProperties({ is_pro: true, pro_plan: 'free' })).toBe(true);
    expect(mockSetPersonProperties).not.toHaveBeenCalled();
  });

  it('sends identify without properties and writes the platform once per install', async () => {
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    await analytics.setUserProperties({ is_pro: false });
    expect(mockIdentify.mock.calls).toEqual([['m2t_native_test_2']]);
    expect(mockSetPersonProperties).toHaveBeenCalledWith({ platform: 'ios' }, {}, false);

    // A relaunch identifies again (a no-op in the SDK) but writes nothing.
    jest.resetModules();
    jest.clearAllMocks();
    const relaunched = await import('~/services/analytics.native');
    await relaunched.identifyUser('m2t_native_test_2');
    await relaunched.setUserProperties({ is_pro: false });
    expect(mockSetPersonProperties).not.toHaveBeenCalled();
  });

  it('registers super properties locally and mirrors changed ones to the person', async () => {
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    expect(
      await analytics.setSuperProperties({
        currency_code: 'MYR',
        locale: undefined,
        is_pro: false,
      }),
    ).toBe(true);
    expect(mockRegister).toHaveBeenCalledWith({ currency_code: 'MYR', is_pro: false });
    expect(mockSetPersonProperties).toHaveBeenCalledWith(
      { currency_code: 'MYR', is_pro: false },
      {},
      false,
    );
    expect(await analytics.setSuperProperties({ currency_code: 'MYR', is_pro: false })).toBe(true);
    expect(personWrites()).toHaveLength(1);
  });

  it('reports failed profile writes so the caller can retry unchanged Pro state', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const analytics = await import('~/services/analytics.native');
      await analytics.identifyUser('m2t_native_test_2');
      mockSetPersonProperties.mockImplementationOnce(() => {
        throw new Error('profile unavailable');
      });
      expect(await analytics.setUserProperties({ is_pro: true })).toBe(false);
      expect(mockSetUserProperties).toHaveBeenLastCalledWith(mockFirebaseInstance, {
        is_pro: 'true',
      });
      expect(await analytics.setUserProperties({ is_pro: true })).toBe(true);
      expect(personWrites()).toHaveLength(2);

      mockRegister.mockImplementationOnce(() => {
        throw new Error('context unavailable');
      });
      expect(await analytics.setSuperProperties({ is_pro: true })).toBe(false);
      expect(await analytics.setSuperProperties({ is_pro: true })).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps GA4-only telemetry out of PostHog', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.trackEvent(analytics.AnalyticsEvents.ACCOUNT_CREATED, { type: 'debit' });
    await analytics.trackEvent(analytics.AnalyticsEvents.AUTO_BACKUP_RESTORED, {
      target: 'icloud',
    });

    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_account_created', {
      type: 'debit',
    });
  });

  it('sends low-volume moments such as data resets and imports to PostHog', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.trackEvent(analytics.AnalyticsEvents.DATA_RESET, { scope: 'all' });
    await analytics.trackEvent(analytics.AnalyticsEvents.DATA_IMPORTED, { transactions: 12 });

    expect(captured('Data Reset')).toEqual([{ scope: 'all' }]);
    expect(captured('Data Imported')).toEqual([{ transactions: 12 }]);
    expect(mockLogEvent).toHaveBeenCalledTimes(2);
  });

  it('stamps days_since_install on events and the install date on the person once', async () => {
    const analytics = await import('~/services/analytics.native');
    jest.useFakeTimers({
      now: Date.parse('2026-09-11T12:00:00.000Z'),
      doNotFake: ['setImmediate'],
    });
    try {
      // Tracked before the install date is known, as a launch-time event is.
      const earlyEvent = analytics.trackEvent(analytics.AnalyticsEvents.ONBOARDING_STARTED);
      const installDate = analytics.setInstallDate('2026-09-01T10:00:00.000Z');
      await analytics.identifyUser('m2t_native_test_2');
      await Promise.all([earlyEvent, installDate]);
      await analytics.setInstallDate('2026-09-01T10:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }

    expect(captured('Onboarding Started')).toEqual([{ days_since_install: 10 }]);
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_onboarding_started', {
      days_since_install: 10,
    });
    expect(personWrites()).toEqual([[{}, { first_app_open: '2026-09-01T10:00:00.000Z' }, false]]);
  });

  it('stamps the screen on each event and sends PostHog no screen events', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.setCurrentScreen('Settings');
    await analytics.trackEvent(analytics.AnalyticsEvents.PRO_PAYWALL_VIEWED, {
      source: 'settings_banner',
    });

    expect(mockRegister).not.toHaveBeenCalled();
    expect(captured()).toEqual([
      ['Pro Paywall Viewed', { source: 'settings_banner', current_screen: 'Settings' }],
    ]);
    expect(mockLogScreenView).toHaveBeenCalledWith(mockFirebaseInstance, {
      screen_name: 'Settings',
      screen_class: 'Settings',
    });
  });

  it('tracks repeated RiceCal ad taps once each in PostHog and GA4', async () => {
    const analytics = await import('~/services/analytics.native');
    const event = analytics.AnalyticsEvents.RICECAL_AD_CLICKED;
    await analytics.identifyUser('m2t_native_test_2');
    await analytics.setCurrentScreen('Settings');

    await analytics.trackEvent(event, { source: 'settings' });
    await analytics.trackEvent(event, { source: 'settings' });

    expect(captured('RiceCal Ad Clicked')).toEqual([
      { source: 'settings', current_screen: 'Settings' },
      { source: 'settings', current_screen: 'Settings' },
    ]);
    expect(mockLogEvent).toHaveBeenCalledTimes(2);
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_rice_cal_ad_clicked', {
      source: 'settings',
      current_screen: 'Settings',
    });
    expect(personWrites()).toEqual([]);
  });

  it('clears development-only event defaults in production', async () => {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true });
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_0');

    expect(mockSetDefaultEventParameters).toHaveBeenCalledWith(mockFirebaseInstance, {
      debug_mode: null,
      revenuecat_revenue_enabled: null,
    });
  });

  it('clears both providers and waits for a new identity after reset', async () => {
    const analytics = await import('~/services/analytics.native');

    await analytics.identifyUser('m2t_native_test_2');
    await analytics.resetAnalytics();

    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockSetAnalyticsCollectionEnabled).toHaveBeenLastCalledWith(mockFirebaseInstance, false);
    expect(mockSetUserId).toHaveBeenLastCalledWith(mockFirebaseInstance, null);
    expect(mockResetAnalyticsData).toHaveBeenCalledWith(mockFirebaseInstance);

    const eventAfterReset = analytics.trackEvent(analytics.AnalyticsEvents.ONBOARDING_STARTED);
    await analytics.identifyUser('m2t_native_test_0');
    await eventAfterReset;

    expect(mockIdentify).toHaveBeenLastCalledWith('m2t_native_test_0');
    expect(captured('Onboarding Started')).toEqual([{}]);
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_onboarding_started', {});
  });

  it('flushes the PostHog queue on request', async () => {
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    await analytics.flushAnalytics();
    expect(mockFlush).toHaveBeenCalledTimes(1);
  });
});

describe('native daily engagement', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockStorage.clear();
    mockPostHog.enabled = true;
    mockAppStateListeners.length = 0;
    Object.defineProperty(globalThis, '__DEV__', { value: true, configurable: true });
  });

  it('sends one Daily App Open per day however often the app comes to the foreground', async () => {
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    await analytics.recordDailyAppOpen();

    mockAppStateListeners.forEach((listener) => listener('background'));
    mockAppStateListeners.forEach((listener) => listener('active'));
    await analytics.recordDailyAppOpen();

    expect(captured('Daily App Open')).toEqual([{ active_days: 1, days_since_last_active: null }]);
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_daily_app_open', {
      active_days: 1,
    });
  });

  it('counts active days and the gap since the last one', async () => {
    mockStorage.set(
      '@m2t/analytics_daily/v1',
      JSON.stringify({
        day: '2020-01-01',
        opened: true,
        activeDays: 4,
        lastActiveDay: '2020-01-01',
      }),
    );
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    await analytics.recordDailyAppOpen();

    const [claim] = captured('Daily App Open') as { active_days: number }[];
    expect(claim.active_days).toBe(5);
  });

  it('sends the first logged transaction of each day with its entry path', async () => {
    mockStorage.set('@m2t/analytics_daily/v1', TODAY_ALREADY_OPENED());
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    await analytics.recordLoggedTransaction({ type: 'expense', source: 'voice' });
    await analytics.recordLoggedTransaction({ type: 'income', source: 'manual' });

    expect(captured('Daily Transaction Logged')).toEqual([
      { logging_days: 1, type: 'expense', source: 'voice' },
    ]);
  });

  it('sends Feature Used once per feature per day, from GA4-only uses and Insights visits', async () => {
    mockStorage.set('@m2t/analytics_daily/v1', TODAY_ALREADY_OPENED());
    const analytics = await import('~/services/analytics.native');
    await analytics.identifyUser('m2t_native_test_2');
    await analytics.trackEvent(analytics.AnalyticsEvents.VOICE_TRANSACTION_CREATED, {
      type: 'expense',
    });
    await analytics.trackEvent(analytics.AnalyticsEvents.VOICE_TRANSACTION_CREATED, {
      type: 'expense',
    });
    await analytics.setCurrentScreen('insights');
    await analytics.setCurrentScreen('calendar');
    await analytics.setCurrentScreen('insights');

    expect(captured('Feature Used')).toEqual([
      { feature: 'voice_entry' },
      { feature: 'insights', current_screen: 'insights' },
    ]);
    // The uses themselves stay GA4 only.
    expect(captured('Voice Transaction Created')).toEqual([]);
  });

  it('samples first-day launches for session replay far more often than later ones', async () => {
    const analytics = await import('~/services/analytics.native');
    expect(analytics.startSessionReplayForLaunch(true, () => 0.04)).toBe(true);
    expect(mockStartSessionRecording).toHaveBeenCalledTimes(1);
    // Decided once per launch.
    expect(analytics.startSessionReplayForLaunch(true, () => 0)).toBe(false);

    jest.resetModules();
    const later = await import('~/services/analytics.native');
    expect(later.startSessionReplayForLaunch(false, () => 0.04)).toBe(false);
    jest.resetModules();
    const sampled = await import('~/services/analytics.native');
    expect(sampled.startSessionReplayForLaunch(false, () => 0.001)).toBe(true);
  });
});

describe('native product usage milestones', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockStorage.clear();
    Object.defineProperty(globalThis, '__DEV__', { value: true, configurable: true });
    mockPostHog.enabled = true;
    mockAppStateListeners.length = 0;
    // Today's `Daily App Open` already happened, so only the events a test
    // sends itself reach the providers; the daily tests clear this.
    mockStorage.set('@m2t/analytics_daily/v1', TODAY_ALREADY_OPENED());
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

  const featuresUsedWrites = () =>
    mockSetPersonProperties.mock.calls
      .map(([set]) => (set as { features_used?: string[] }).features_used)
      .filter(Boolean);

  it("reports a new install's first use of each feature once, to both providers", async () => {
    const analytics = await launch({ newInstall: true });

    await analytics.trackEvent(analytics.AnalyticsEvents.GOAL_CREATED, { hasCover: true });
    await analytics.trackEvent(analytics.AnalyticsEvents.GOAL_CREATED, { hasCover: false });

    expect(captured('Feature First Used')).toEqual([{ feature: 'goals' }]);
    expect(mockLogEvent).toHaveBeenCalledWith(mockFirebaseInstance, 'm2t_feature_first_used', {
      feature: 'goals',
    });
    expect(featuresUsedWrites()).toEqual([['goals']]);
    // The use itself stays GA4 only.
    expect(captured('Goal Created')).toEqual([]);
  });

  it('reports a first use on the screen it happened on, even after leaving it', async () => {
    const analytics = await launch({ newInstall: true });
    await analytics.setCurrentScreen('ItemEditor');

    // The editor closes on save while the first use is still being recorded.
    const itemCreated = analytics.trackEvent(analytics.AnalyticsEvents.ITEM_CREATED);
    await analytics.setCurrentScreen('accounts');
    await itemCreated;

    expect(captured('Feature First Used')).toEqual([
      { feature: 'items', current_screen: 'ItemEditor' },
    ]);
  });

  it('remembers first uses across launches', async () => {
    const firstLaunch = await launch({ newInstall: true });
    await firstLaunch.trackEvent(firstLaunch.AnalyticsEvents.GOAL_CREATED);

    const secondLaunch = await relaunch();
    await secondLaunch.trackEvent(secondLaunch.AnalyticsEvents.GOAL_CREATED);
    await secondLaunch.trackEvent(secondLaunch.AnalyticsEvents.LOAN_CREATED);

    expect(captured('Feature First Used')).toEqual([{ feature: 'loans' }]);
  });

  it("lists an older install's features on its profile without calling them first uses", async () => {
    const analytics = await launch({ newInstall: false });

    await analytics.trackEvent(analytics.AnalyticsEvents.RECEIPT_SCAN_COMPLETED, { count: 1 });

    expect(featuresUsedWrites()).toEqual([['receipt_scan']]);
    expect(captured('Feature First Used')).toEqual([]);
    expect(captured('Receipt Scan Completed')).toEqual([{ count: 1 }]);
    expect(ga4Events()).toHaveLength(1);
  });

  it('reports each transaction milestone of a new install once', async () => {
    const analytics = await launch({ newInstall: true });

    for (let logged = 0; logged < 60; logged += 1) await analytics.recordLoggedTransaction();

    expect(captured('Transaction Milestone Reached')).toEqual([{ count: 10 }, { count: 50 }]);
    expect(mockLogEvent).toHaveBeenCalledWith(
      mockFirebaseInstance,
      'm2t_transaction_milestone_reached',
      { count: 10 },
    );

    // The count survives a relaunch, and a milestone is never reported twice.
    const relaunched = await relaunch();
    for (let logged = 60; logged < 100; logged += 1) await relaunched.recordLoggedTransaction();
    expect(captured('Transaction Milestone Reached')).toEqual([{ count: 100 }]);
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
    expect(featuresUsedWrites()).toEqual([['albums']]);
  });

  it('does not count transactions on an install from before usage tracking', async () => {
    const analytics = await launch({ newInstall: false });

    for (let logged = 0; logged < 10; logged += 1) await analytics.recordLoggedTransaction();

    expect(captured('Transaction Milestone Reached')).toEqual([]);
    expect(
      (mockLogEvent.mock.calls as unknown[][]).filter(
        ([, name]) => name === 'm2t_transaction_milestone_reached',
      ),
    ).toEqual([]);
  });
});
