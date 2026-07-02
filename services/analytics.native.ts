/**
 * Native Mixpanel analytics integration.
 *
 * Initialises the Mixpanel SDK on first call, identifies the user with the
 * same appUserId used by RevenueCat, and exposes a thin `track` / `identify`
 * surface consumed by the rest of the app.
 *
 * The SDK is loaded via lazy `require()` so the bundle doesn't break in
 * Expo Go where native modules aren't available.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import type {
  AnalyticsProperties,
  AnalyticsSuperProperties,
  TrackEventOptions,
} from './analytics.shared';

export * from './analytics.shared';

// ---------------------------------------------------------------------------
// Lazy SDK resolution – returns null in Expo Go
// ---------------------------------------------------------------------------

type MixpanelInstance = any;

let hasWarnedMissingMixpanelToken = false;
let hasWarnedMissingMixpanelSdk = false;
let hasWarnedUsingMixpanelJsMode = false;

function warnMissingMixpanelToken() {
  if (!__DEV__ || hasWarnedMissingMixpanelToken) return;

  hasWarnedMissingMixpanelToken = true;
  console.warn('[Analytics] EXPO_PUBLIC_MIXPANEL_TOKEN is missing. Mixpanel tracking is disabled.');
}

function warnMissingMixpanelSdk(error?: unknown) {
  if (!__DEV__ || hasWarnedMissingMixpanelSdk) return;

  hasWarnedMissingMixpanelSdk = true;
  console.warn(
    '[Analytics] mixpanel-react-native is unavailable. Rebuild the native app after installing native dependencies; Expo Go does not support this module.',
    error,
  );
}

function warnUsingMixpanelJsMode() {
  if (!__DEV__ || hasWarnedUsingMixpanelJsMode) return;

  hasWarnedUsingMixpanelJsMode = true;
  console.warn(
    '[Analytics] Mixpanel native module is unavailable in this build. Falling back to JavaScript mode.',
  );
}

function isMixpanelNativeModuleAvailable(): boolean {
  return Boolean(NativeModules.MixpanelReactNative);
}

function getMixpanelClass(): (new (...args: unknown[]) => MixpanelInstance) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('mixpanel-react-native').Mixpanel;
  } catch (error) {
    warnMissingMixpanelSdk(error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let mixpanelInstance: MixpanelInstance | null = null;
let initPromise: Promise<void> | null = null;
let identifiedUserId: string | null = null;
let currentScreen: string | null = null;

function getMixpanelToken(): string | null {
  const token = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN?.trim();
  return token || null;
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function ensureInitialized(): Promise<MixpanelInstance | null> {
  const token = getMixpanelToken();
  if (!token) {
    warnMissingMixpanelToken();
    return null;
  }

  if (mixpanelInstance) return mixpanelInstance;

  if (!initPromise) {
    initPromise = (async () => {
      const MixpanelClass = getMixpanelClass();
      if (!MixpanelClass) return;

      const useNativeMixpanel = isMixpanelNativeModuleAvailable();

      if (!useNativeMixpanel) {
        warnUsingMixpanelJsMode();
      }

      // Automatic events ($ae_session → "App Session", $ae_first_open →
      // "First App Open", $ae_updated) are disabled: "App Session" fires on
      // every foreground and was the single largest slice of our Mixpanel
      // event volume. We re-emit a manual "First App Open" (see
      // `trackFirstAppOpenIfNeeded`) so that signal is preserved.
      const trackAutomaticEvents = false;
      const mp = new MixpanelClass(token, trackAutomaticEvents, useNativeMixpanel);
      await mp.init();
      mixpanelInstance = mp;
    })().catch((error) => {
      initPromise = null;
      if (__DEV__) {
        console.warn('[Analytics] Mixpanel init failed:', error);
      }
    });
  }

  await initPromise;
  return mixpanelInstance;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Identify the user so all subsequent events are attributed to them.
 * Uses the same `appUserId` (e.g. `m2t_<uuid>`) that RevenueCat uses.
 */
export async function identifyUser(appUserId: string): Promise<void> {
  if (!appUserId || appUserId === identifiedUserId) return;

  const mp = await ensureInitialized();
  if (!mp) return;

  mp.identify(appUserId);
  identifiedUserId = appUserId;

  mp.getPeople().set('$name', appUserId);
  mp.getPeople().set('platform', Platform.OS);
}

/**
 * Track a single event with optional properties.
 */
export async function trackEvent(
  eventName: string,
  properties?: AnalyticsProperties,
  options?: TrackEventOptions,
): Promise<void> {
  // Client-side sampling: when a sampleRate below 1 is supplied, only send the
  // event with that probability. Bail before touching the SDK so dropped calls
  // are essentially free.
  const sampleRate = options?.sampleRate;
  const isSampled = typeof sampleRate === 'number' && sampleRate < 1;
  if (isSampled && (sampleRate <= 0 || Math.random() >= sampleRate)) return;

  const mp = await ensureInitialized();
  if (!mp) return;

  const nextCurrentScreen =
    typeof properties?.current_screen === 'string'
      ? properties.current_screen
      : typeof properties?.screen === 'string'
        ? properties.screen
        : typeof properties?.tab === 'string'
          ? properties.tab
          : currentScreen;
  let eventProperties = nextCurrentScreen
    ? { ...properties, current_screen: nextCurrentScreen }
    : properties;

  // Record the sample rate so true volume can be reconstructed downstream by
  // scaling the count by 1 / sample_rate.
  if (isSampled) {
    eventProperties = { ...eventProperties, sample_rate: sampleRate };
  }

  if (eventProperties) {
    mp.track(eventName, eventProperties);
  } else {
    mp.track(eventName);
  }
}

// ---------------------------------------------------------------------------
// Manual "First App Open"
// ---------------------------------------------------------------------------

const FIRST_APP_OPEN_TRACKED_KEY = 'analytics.firstAppOpenTracked.v1';

// Synchronous in-memory guard so two near-simultaneous calls (the identify
// effect re-runs when onboarding flips to complete) can't both pass the async
// AsyncStorage check and double-emit. Set before the first await.
let firstAppOpenHandledThisSession = false;

/**
 * Emit a "First App Open" event exactly once per install.
 *
 * Mixpanel's automatic events are all-or-nothing, and we disabled them to drop
 * the high-volume "App Session" event — which also removes the built-in
 * "First App Open". This re-creates that signal cheaply (one event per install,
 * guarded by a persisted flag). Safe to call on every launch.
 *
 * `suppressEmit` handles the upgrade case: existing users had their real first
 * open long ago (as Mixpanel's `$ae_first_open`), but the guard flag is a new
 * key so it's absent for them too. Passing `suppressEmit` for anyone who has
 * already used the app marks the flag as consumed WITHOUT firing a spurious
 * first-open, so only genuinely-new installs emit the event going forward.
 */
export async function trackFirstAppOpenIfNeeded(options?: {
  suppressEmit?: boolean;
}): Promise<void> {
  if (firstAppOpenHandledThisSession) return;
  firstAppOpenHandledThisSession = true;
  try {
    const alreadyTracked = await AsyncStorage.getItem(FIRST_APP_OPEN_TRACKED_KEY);
    if (alreadyTracked) return;
    await AsyncStorage.setItem(FIRST_APP_OPEN_TRACKED_KEY, '1');
    if (options?.suppressEmit) return;
    await trackEvent('First App Open');
  } catch {
    // Best-effort only; never block startup on analytics. Allow a retry on a
    // later launch (fresh process) since the persisted flag was never written.
    firstAppOpenHandledThisSession = false;
  }
}

/**
 * Keep Mixpanel's `current_screen` in sync with the visible app screen.
 */
export async function setCurrentScreen(screen: string | null): Promise<void> {
  if (screen === currentScreen) return;

  currentScreen = screen;
  if (!screen) return;

  const mp = await ensureInitialized();
  if (!mp) return;

  mp.registerSuperProperties({ current_screen: screen });
}

/**
 * Register super-properties that are sent with every subsequent event.
 */
export async function setSuperProperties(properties: AnalyticsSuperProperties): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  mp.registerSuperProperties(properties);
}

/**
 * Set user profile properties (People).
 */
export async function setUserProperties(
  properties: Record<string, string | number | boolean>,
): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  mp.getPeople().set(properties);
}

/**
 * Flush queued events immediately.
 */
export async function flushAnalytics(): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  mp.flush();
}

/**
 * Reset Mixpanel state (e.g. on data reset / logout).
 */
export async function resetAnalytics(): Promise<void> {
  const mp = await ensureInitialized();
  if (!mp) return;

  mp.reset();
  identifiedUserId = null;
  currentScreen = null;
}
