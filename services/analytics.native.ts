/**
 * Native product analytics integration.
 *
 * Within the opted-in population, Mixpanel uses a deterministic 50% app-user
 * cohort while GA4 is unsampled. Included Mixpanel users keep their full
 * journeys; excluded users never initialize the Mixpanel SDK.
 */

import { NativeModules, Platform } from 'react-native';

import {
  ANALYTICS_SAMPLE_RATE,
  isUserInAnalyticsSample,
  toGa4EventName,
  toGa4EventParameters,
  toGa4UserProperties,
  type AnalyticsProperties,
  type AnalyticsSuperProperties,
} from './analytics.shared';

export * from './analytics.shared';

type MixpanelInstance = any;
type FirebaseAnalyticsSdk = typeof import('@react-native-firebase/analytics');
type FirebaseAnalyticsInstance = ReturnType<FirebaseAnalyticsSdk['getAnalytics']>;
const IS_DEVELOPMENT = typeof __DEV__ !== 'undefined' && __DEV__;

let hasWarnedMissingMixpanelToken = false;
let hasWarnedMissingMixpanelSdk = false;
let hasWarnedUsingMixpanelJsMode = false;
let hasWarnedMissingFirebaseSdk = false;
let hasWarnedAnalyticsFailure = false;

function warnOnce(
  kind: 'mixpanel-token' | 'mixpanel-sdk' | 'mixpanel-js' | 'firebase-sdk',
  error?: unknown,
) {
  if (!IS_DEVELOPMENT) return;
  if (kind === 'mixpanel-token') {
    if (hasWarnedMissingMixpanelToken) return;
    hasWarnedMissingMixpanelToken = true;
    console.warn(
      '[Analytics] EXPO_PUBLIC_MIXPANEL_TOKEN is missing. Mixpanel tracking is disabled.',
    );
  } else if (kind === 'mixpanel-sdk') {
    if (hasWarnedMissingMixpanelSdk) return;
    hasWarnedMissingMixpanelSdk = true;
    console.warn('[Analytics] mixpanel-react-native is unavailable in this build.', error);
  } else if (kind === 'mixpanel-js') {
    if (hasWarnedUsingMixpanelJsMode) return;
    hasWarnedUsingMixpanelJsMode = true;
    console.warn('[Analytics] Mixpanel native module is unavailable; using JavaScript mode.');
  } else {
    if (hasWarnedMissingFirebaseSdk) return;
    hasWarnedMissingFirebaseSdk = true;
    console.warn(
      '[Analytics] Firebase Analytics is unavailable. Add Firebase app config and rebuild the native app.',
      error,
    );
  }
}

function reportProviderFailure(
  provider: 'Mixpanel' | 'Firebase',
  operation: string,
  error: unknown,
) {
  if (!IS_DEVELOPMENT || hasWarnedAnalyticsFailure) return;
  hasWarnedAnalyticsFailure = true;
  console.warn(`[Analytics] ${provider} ${operation} failed:`, error);
}

let mixpanelInstance: MixpanelInstance | null = null;
let mixpanelInitPromise: Promise<void> | null = null;
let firebaseAnalytics:
  | { sdk: FirebaseAnalyticsSdk; instance: FirebaseAnalyticsInstance }
  | null
  | undefined;
let analyticsUserId: string | null = null;
let includedInMixpanelSample: boolean | null = null;
let analyticsConsentGranted: boolean | null = null;
let currentScreen: string | null = null;
let lastFirebaseScreen: string | null = null;
let cachedSuperProperties: AnalyticsSuperProperties = {};
let cachedUserProperties: Record<string, string | number | boolean> = {};
let activeConfigurationKey: string | null = null;
let providerConfigurationPromise: Promise<void> = Promise.resolve();

type AnalyticsReady = { enabled: boolean; mixpanelIncluded: boolean };
let resolveAnalyticsReady: (value: AnalyticsReady) => void;
let analyticsReadyPromise = new Promise<AnalyticsReady>((resolve) => {
  resolveAnalyticsReady = resolve;
});
let hasResolvedAnalyticsReady = false;

function getMixpanelToken(): string | null {
  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN?.trim();
  return token || null;
}

function isMixpanelNativeModuleAvailable(): boolean {
  return Boolean(NativeModules.MixpanelReactNative);
}

function getMixpanelClass(): (new (...args: unknown[]) => MixpanelInstance) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('mixpanel-react-native').Mixpanel;
  } catch (error) {
    warnOnce('mixpanel-sdk', error);
    return null;
  }
}

async function ensureMixpanelInitialized(): Promise<MixpanelInstance | null> {
  const token = getMixpanelToken();
  if (!token) {
    warnOnce('mixpanel-token');
    return null;
  }
  if (mixpanelInstance) return mixpanelInstance;

  if (!mixpanelInitPromise) {
    mixpanelInitPromise = (async () => {
      const MixpanelClass = getMixpanelClass();
      if (!MixpanelClass) return;
      const useNativeMixpanel = isMixpanelNativeModuleAvailable();
      if (!useNativeMixpanel) warnOnce('mixpanel-js');

      const mp = new MixpanelClass(token, true, useNativeMixpanel);
      await mp.init();
      mp.optInTracking();
      mp.registerSuperProperties({ sample_rate: ANALYTICS_SAMPLE_RATE });
      mixpanelInstance = mp;
    })().catch((error) => {
      mixpanelInitPromise = null;
      reportProviderFailure('Mixpanel', 'initialization', error);
    });
  }

  await mixpanelInitPromise;
  return mixpanelInstance;
}

function getFirebaseAnalytics(): {
  sdk: FirebaseAnalyticsSdk;
  instance: FirebaseAnalyticsInstance;
} | null {
  if (firebaseAnalytics !== undefined) return firebaseAnalytics;
  try {
    // Lazy loading keeps Expo Go and native builds made before this dependency
    // was added from crashing when the JavaScript bundle starts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require('@react-native-firebase/analytics') as FirebaseAnalyticsSdk;
    firebaseAnalytics = { sdk, instance: sdk.getAnalytics() };
  } catch (error) {
    firebaseAnalytics = null;
    warnOnce('firebase-sdk', error);
  }
  return firebaseAnalytics;
}

async function logFirebaseScreen(screen: string): Promise<void> {
  if (!analyticsConsentGranted) return;
  if (screen === lastFirebaseScreen) return;
  const firebase = getFirebaseAnalytics();
  if (!firebase) return;
  try {
    await firebase.sdk.logScreenView(firebase.instance, {
      screen_name: screen,
      screen_class: screen,
    });
    lastFirebaseScreen = screen;
  } catch (error) {
    reportProviderFailure('Firebase', 'screen tracking', error);
  }
}

async function configureProviders(
  appUserId: string,
  enabled: boolean,
  mixpanelIncluded: boolean,
): Promise<void> {
  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      if (enabled) {
        const { current_screen: _currentScreen, ...stableSuperProperties } = cachedSuperProperties;
        // Keep collection paused until consent, identity and stable properties
        // are all configured. This prevents the first event from being
        // attributed to a temporary SDK-generated identity.
        await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, false);
        await firebase.sdk.setConsent(firebase.instance, {
          analytics_storage: true,
          ad_storage: false,
          ad_user_data: false,
          ad_personalization: false,
        });
        await firebase.sdk.setDefaultEventParameters(
          firebase.instance,
          IS_DEVELOPMENT ? { debug_mode: 1 } : undefined,
        );
        await firebase.sdk.setUserId(firebase.instance, appUserId);
        await firebase.sdk.setUserProperties(
          firebase.instance,
          toGa4UserProperties({
            platform: Platform.OS,
            ...cachedUserProperties,
            ...stableSuperProperties,
          }),
        );
        await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, true);
      } else {
        await firebase.sdk.setConsent(firebase.instance, {
          analytics_storage: false,
          ad_storage: false,
          ad_user_data: false,
          ad_personalization: false,
        });
        await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, false);
        await firebase.sdk.setUserId(firebase.instance, null);
        lastFirebaseScreen = null;
      }
    } catch (error) {
      reportProviderFailure('Firebase', 'configuration', error);
    }
  }

  if (!enabled) {
    if (mixpanelInstance) {
      try {
        mixpanelInstance.optOutTracking();
      } catch (error) {
        reportProviderFailure('Mixpanel', 'opt out', error);
      }
    }
    return;
  }

  if (mixpanelIncluded) {
    const mp = await ensureMixpanelInitialized();
    if (mp) {
      try {
        mp.optInTracking();
        mp.identify(appUserId);
        mp.registerSuperProperties({
          ...cachedSuperProperties,
          sample_rate: ANALYTICS_SAMPLE_RATE,
        });
        mp.getPeople().set({
          $name: appUserId,
          platform: Platform.OS,
          ...cachedUserProperties,
          sample_rate: ANALYTICS_SAMPLE_RATE,
        });
      } catch (error) {
        reportProviderFailure('Mixpanel', 'identification', error);
      }
    }
  }

  if (currentScreen) await logFirebaseScreen(currentScreen);
}

async function waitForAnalyticsReady(): Promise<AnalyticsReady> {
  await analyticsReadyPromise;
  // A preference change can enqueue a second provider transition immediately
  // after the first one resolves. Always wait until the queue is stable.
  while (true) {
    const pending = providerConfigurationPromise;
    await pending;
    if (pending === providerConfigurationPromise) break;
  }
  return {
    enabled: analyticsConsentGranted === true,
    mixpanelIncluded: includedInMixpanelSample === true,
  };
}

function queueProviderConfiguration(appUserId: string, enabled: boolean): Promise<void> {
  const mixpanelIncluded = isUserInAnalyticsSample(appUserId);
  const configurationKey = `${appUserId}:${enabled ? 'enabled' : 'disabled'}`;
  analyticsUserId = appUserId;
  includedInMixpanelSample = mixpanelIncluded;

  if (configurationKey !== activeConfigurationKey) {
    activeConfigurationKey = configurationKey;
    providerConfigurationPromise = providerConfigurationPromise
      .catch(() => undefined)
      .then(() => configureProviders(appUserId, enabled, mixpanelIncluded));
  }

  if (!hasResolvedAnalyticsReady) {
    hasResolvedAnalyticsReady = true;
    resolveAnalyticsReady({ enabled, mixpanelIncluded });
  }
  return providerConfigurationPromise;
}

/** Apply the user's stored consent before either provider can receive events. */
export async function configureAnalytics(appUserId: string, enabled: boolean): Promise<void> {
  const normalizedId = appUserId.trim();
  if (!normalizedId) return;
  analyticsConsentGranted = enabled;
  await queueProviderConfiguration(normalizedId, enabled);
}

/** Resolve the stable anonymous identity without changing the user's consent. */
export async function identifyUser(appUserId: string): Promise<void> {
  const normalizedId = appUserId.trim();
  if (!normalizedId) return;
  analyticsUserId = normalizedId;
  includedInMixpanelSample = isUserInAnalyticsSample(normalizedId);
  if (analyticsConsentGranted === null) {
    await waitForAnalyticsReady();
    return;
  }
  await queueProviderConfiguration(normalizedId, analyticsConsentGranted);
}

/** Track every event in GA4 and the complete sampled journey in Mixpanel. */
export async function trackEvent(
  eventName: string,
  properties?: AnalyticsProperties,
): Promise<void> {
  const nextCurrentScreen =
    typeof properties?.current_screen === 'string'
      ? properties.current_screen
      : typeof properties?.screen === 'string'
        ? properties.screen
        : typeof properties?.tab === 'string'
          ? properties.tab
          : currentScreen;
  const { enabled, mixpanelIncluded } = await waitForAnalyticsReady();
  if (!enabled) return;

  const eventProperties: AnalyticsProperties = { ...properties };
  if (nextCurrentScreen) eventProperties.current_screen = nextCurrentScreen;

  const [mp, firebase] = await Promise.all([
    mixpanelIncluded ? ensureMixpanelInitialized() : Promise.resolve(null),
    Promise.resolve(getFirebaseAnalytics()),
  ]);

  if (mp) {
    try {
      mp.track(eventName, { ...eventProperties, sample_rate: ANALYTICS_SAMPLE_RATE });
    } catch (error) {
      reportProviderFailure('Mixpanel', 'event tracking', error);
    }
  }
  if (firebase) {
    try {
      await firebase.sdk.logEvent(
        firebase.instance,
        toGa4EventName(eventName),
        toGa4EventParameters(eventProperties),
      );
    } catch (error) {
      reportProviderFailure('Firebase', 'event tracking', error);
    }
  }
}

/** Keep provider screen context aligned with the visible React Navigation screen. */
export async function setCurrentScreen(screen: string | null): Promise<void> {
  if (screen === currentScreen) return;
  currentScreen = screen;
  if (!screen) return;
  const { enabled, mixpanelIncluded } = await waitForAnalyticsReady();
  if (!enabled) return;
  if (screen !== currentScreen) return;

  const mp = mixpanelIncluded ? await ensureMixpanelInitialized() : null;
  if (mp) {
    try {
      mp.registerSuperProperties({ current_screen: screen });
    } catch (error) {
      reportProviderFailure('Mixpanel', 'screen context', error);
    }
  }
  await logFirebaseScreen(screen);
}

export function getCurrentScreen(): string | null {
  return currentScreen;
}

/** Register event context in Mixpanel and stable user traits in GA4. */
export async function setSuperProperties(properties: AnalyticsSuperProperties): Promise<void> {
  cachedSuperProperties = { ...cachedSuperProperties, ...properties };
  const { enabled, mixpanelIncluded } = await waitForAnalyticsReady();
  if (!enabled) return;

  const mp = mixpanelIncluded ? await ensureMixpanelInitialized() : null;
  if (mp) {
    try {
      mp.registerSuperProperties({ ...properties, sample_rate: ANALYTICS_SAMPLE_RATE });
    } catch (error) {
      reportProviderFailure('Mixpanel', 'super properties', error);
    }
  }

  const { current_screen: _currentScreen, ...stableProperties } = properties;
  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      await firebase.sdk.setUserProperties(
        firebase.instance,
        toGa4UserProperties(stableProperties),
      );
    } catch (error) {
      reportProviderFailure('Firebase', 'user properties', error);
    }
  }
}

/** Update the user profile in both providers. */
export async function setUserProperties(
  properties: Record<string, string | number | boolean>,
): Promise<void> {
  cachedUserProperties = { ...cachedUserProperties, ...properties };
  const { enabled, mixpanelIncluded } = await waitForAnalyticsReady();
  if (!enabled) return;

  const mp = mixpanelIncluded ? await ensureMixpanelInitialized() : null;
  if (mp) {
    try {
      mp.getPeople().set({ ...properties, sample_rate: ANALYTICS_SAMPLE_RATE });
    } catch (error) {
      reportProviderFailure('Mixpanel', 'user properties', error);
    }
  }

  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      await firebase.sdk.setUserProperties(firebase.instance, toGa4UserProperties(properties));
    } catch (error) {
      reportProviderFailure('Firebase', 'user properties', error);
    }
  }
}

/** Firebase manages its own batches; Mixpanel exposes the explicit flush. */
export async function flushAnalytics(): Promise<void> {
  const { enabled, mixpanelIncluded } = await waitForAnalyticsReady();
  if (!enabled || !mixpanelIncluded) return;
  const mp = await ensureMixpanelInitialized();
  if (!mp) return;
  try {
    mp.flush();
  } catch (error) {
    reportProviderFailure('Mixpanel', 'flush', error);
  }
}

export async function resetAnalytics(): Promise<void> {
  if (includedInMixpanelSample) {
    const mp = await ensureMixpanelInitialized();
    if (mp) {
      try {
        mp.reset();
      } catch (error) {
        reportProviderFailure('Mixpanel', 'reset', error);
      }
    }
  }

  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      await firebase.sdk.setConsent(firebase.instance, {
        analytics_storage: false,
        ad_storage: false,
        ad_user_data: false,
        ad_personalization: false,
      });
      await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, false);
      await firebase.sdk.setUserId(firebase.instance, null);
      await firebase.sdk.resetAnalyticsData(firebase.instance);
    } catch (error) {
      reportProviderFailure('Firebase', 'reset', error);
    }
  }

  analyticsUserId = null;
  includedInMixpanelSample = null;
  analyticsConsentGranted = null;
  currentScreen = null;
  lastFirebaseScreen = null;
  cachedSuperProperties = {};
  cachedUserProperties = {};
  activeConfigurationKey = null;
  providerConfigurationPromise = Promise.resolve();
  hasResolvedAnalyticsReady = false;
  analyticsReadyPromise = new Promise<AnalyticsReady>((resolve) => {
    resolveAnalyticsReady = resolve;
  });
}
