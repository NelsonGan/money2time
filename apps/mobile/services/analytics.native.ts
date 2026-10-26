/**
 * Native product analytics integration.
 *
 * GA4 receives every event from every user. PostHog also receives every user,
 * but only the events in `POSTHOG_EVENTS` (see `analytics.shared.ts`): its free
 * tier is a million events a month, so it gets installs, activation, daily
 * engagement, the purchase funnel and low-volume moments, and none of the
 * per-use telemetry. Daily engagement is capped on the device (`DailyState`), so
 * a user who opens the app ten times a day still sends one `Daily App Open`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import {
  SESSION_REPLAY_NEW_INSTALL_RATE,
  SESSION_REPLAY_RETURNING_RATE,
} from '~/constants/posthog';

import {
  type AnalyticsEventName,
  AnalyticsEvents,
  type AnalyticsProperties,
  type AnalyticsSuperProperties,
  claimDailyAppOpen,
  claimDailyFeature,
  claimDailyTransaction,
  DAILY_STATE_STORAGE_KEY,
  type DailyFeature,
  type DailyState,
  daysSinceInstall,
  EMPTY_USAGE_STATE,
  featureUsedBy,
  featureViewedOn,
  isPostHogEvent,
  localDayKey,
  parseDailyState,
  parseUsageState,
  type ProductFeature,
  toGa4EventName,
  toGa4EventParameters,
  toGa4UserProperties,
  TRANSACTION_MILESTONES,
  USAGE_STATE_STORAGE_KEY,
  type UsageState,
} from './analytics.shared';
import { addErrorStep } from './errorReporting';
import { getPostHog } from './posthog';

export * from './analytics.shared';

type FirebaseAnalyticsSdk = typeof import('@react-native-firebase/analytics');
type FirebaseAnalyticsInstance = ReturnType<FirebaseAnalyticsSdk['getAnalytics']>;
type PersonValue = string | number | boolean | string[];
const IS_DEVELOPMENT = typeof __DEV__ !== 'undefined' && __DEV__;

/** Past the last milestone the count has nothing left to report. */
const LAST_TRANSACTION_MILESTONE = Math.max(...TRANSACTION_MILESTONES);

/**
 * The person properties last written to PostHog, per user, so a launch that
 * finds nothing changed sends no `$set` (each one is a billable event).
 */
const PERSON_STATE_STORAGE_KEY = '@m2t/analytics_person/v1';

let hasWarnedMissingFirebaseSdk = false;
let hasWarnedAnalyticsFailure = false;

function warnMissingFirebase(error?: unknown) {
  if (!IS_DEVELOPMENT || hasWarnedMissingFirebaseSdk) return;
  hasWarnedMissingFirebaseSdk = true;
  console.warn(
    '[Analytics] Firebase Analytics is unavailable. Add Firebase app config and rebuild the native app.',
    error,
  );
}

function reportProviderFailure(
  provider: 'PostHog' | 'Firebase',
  operation: string,
  error: unknown,
) {
  if (!IS_DEVELOPMENT || hasWarnedAnalyticsFailure) return;
  hasWarnedAnalyticsFailure = true;
  console.warn(`[Analytics] ${provider} ${operation} failed:`, error);
}

let firebaseAnalytics:
  | { sdk: FirebaseAnalyticsSdk; instance: FirebaseAnalyticsInstance }
  | null
  | undefined;
let analyticsUserId: string | null = null;
let firebaseConfiguredUserId: string | null = null;
let postHogIdentifiedUserId: string | null = null;
let revenueCatRevenueUserId: string | null = null;
let installDate: string | null = null;
let currentScreen: string | null = null;
let lastFirebaseScreen: string | null = null;
let usageState: UsageState | null = null;
let usageUpdates: Promise<unknown> = Promise.resolve();
let dailyState: DailyState | null = null;
let dailyUpdates: Promise<unknown> = Promise.resolve();
let personUpdates: Promise<unknown> = Promise.resolve();
/** The last person-property write, loaded from storage on first use. */
let personState: PersonState | null | undefined;
let providerConfigurationPromise: Promise<void> | null = null;
let firebaseMutations: Promise<unknown> = Promise.resolve();
let analyticsReadyResolved = false;
let appStateSubscription: { remove(): void } | null = null;
let lastAppState: AppStateStatus | null = null;
let sessionReplayDecided = false;
/** This launch was sampled for session replay. */
let sessionReplaySampled = false;
/** Number pads on screen now; recording waits while any is. */
let sessionReplayPauses = 0;

let resolveAnalyticsReady: () => void;
let analyticsReadyPromise = new Promise<void>((resolve) => {
  resolveAnalyticsReady = resolve;
});

async function waitForAnalyticsReady(): Promise<void> {
  let ready: Promise<void>;
  do {
    ready = analyticsReadyPromise;
    await ready;
  } while (ready !== analyticsReadyPromise);
}

function mutateFirebase<T>(operation: () => Promise<T>): Promise<T> {
  const next = firebaseMutations.then(operation, operation);
  firebaseMutations = next.catch(() => undefined);
  return next;
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
    warnMissingFirebase(error);
  }
  return firebaseAnalytics;
}

async function logFirebaseScreen(screen: string): Promise<void> {
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

async function configureFirebase(appUserId: string): Promise<void> {
  const firebase = getFirebaseAnalytics();
  if (firebase && firebaseConfiguredUserId !== appUserId) {
    await mutateFirebase(async () => {
      if (analyticsUserId !== appUserId || firebaseConfiguredUserId === appUserId) return;
      firebaseConfiguredUserId = null;
      revenueCatRevenueUserId = null;
      try {
        // Configure identity and consent before collection starts so the first
        // event is attributed to the stable app user and never enables ad data.
        await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, false);
        await firebase.sdk.setConsent(firebase.instance, {
          analytics_storage: true,
          ad_storage: false,
          ad_user_data: false,
          ad_personalization: false,
        });
        await firebase.sdk.setDefaultEventParameters(firebase.instance, {
          debug_mode: IS_DEVELOPMENT ? 1 : null,
          revenuecat_revenue_enabled: null,
        });
        await firebase.sdk.setUserId(firebase.instance, appUserId);
        await firebase.sdk.setUserProperties(
          firebase.instance,
          toGa4UserProperties({ platform: Platform.OS }),
        );
        await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, true);
        if (analyticsUserId === appUserId) firebaseConfiguredUserId = appUserId;
      } catch (error) {
        reportProviderFailure('Firebase', 'configuration', error);
      }
    });
  }
}

/**
 * Identify PostHog with the stable app user ID. The SDK persists the identity,
 * so this sends `$identify` once per install (and once more after a reset), not
 * once per launch. No properties ride on identify: for an already-identified
 * ID the SDK turns them into a `$set` plus a flag reload on every launch, since
 * its duplicate check is in memory only. `platform` goes through
 * `syncPersonProperties` instead, which persists what it last wrote.
 */
function identifyPostHog(appUserId: string): void {
  const posthog = getPostHog();
  if (!posthog || postHogIdentifiedUserId === appUserId) return;
  try {
    posthog.identify(appUserId);
    postHogIdentifiedUserId = appUserId;
  } catch (error) {
    reportProviderFailure('PostHog', 'identification', error);
  }
}

async function configureProviders(appUserId: string): Promise<void> {
  await configureFirebase(appUserId);
  identifyPostHog(appUserId);
  if (postHogIdentifiedUserId === appUserId) {
    void syncPersonProperties({ platform: Platform.OS }, {}, appUserId);
  }

  if (currentScreen) await logFirebaseScreen(currentScreen);
}

/** Identify both providers before either receives events, profile data or screens. */
export async function identifyUser(appUserId: string): Promise<void> {
  const normalizedId = appUserId.trim();
  if (!normalizedId) return;
  if (
    normalizedId === analyticsUserId &&
    !providerConfigurationPromise &&
    (!getFirebaseAnalytics() || firebaseConfiguredUserId === normalizedId) &&
    (!getPostHog() || postHogIdentifiedUserId === normalizedId)
  ) {
    await waitForAnalyticsReady();
    return;
  }

  // Reopen readiness for later customers and retries; preserve the initial
  // promise so calls queued before settings loaded are still released.
  if (analyticsReadyResolved) {
    analyticsReadyResolved = false;
    analyticsReadyPromise = new Promise<void>((resolve) => {
      resolveAnalyticsReady = resolve;
    });
  }
  analyticsUserId = normalizedId;
  while (providerConfigurationPromise) await providerConfigurationPromise;
  if (analyticsUserId !== normalizedId) return;
  providerConfigurationPromise = configureProviders(normalizedId).finally(() => {
    providerConfigurationPromise = null;
  });
  await providerConfigurationPromise;
  if (analyticsUserId === normalizedId) {
    analyticsReadyResolved = true;
    resolveAnalyticsReady();
    watchAppForeground();
    void recordDailyAppOpen();
  }
}

/** RevenueCat needs Firebase's installation ID, not our shared user ID. */
export async function getFirebaseAppInstanceId(appUserId: string): Promise<string | null> {
  // RevenueCat's integration targets production streams, never the dev iOS app.
  if (IS_DEVELOPMENT || analyticsUserId !== appUserId || firebaseConfiguredUserId !== appUserId)
    return null;
  const firebase = getFirebaseAnalytics();
  if (!firebase) return null;
  try {
    const instanceId = await firebase.sdk.getAppInstanceId(firebase.instance);
    return analyticsUserId === appUserId && firebaseConfiguredUserId === appUserId
      ? instanceId
      : null;
  } catch (error) {
    reportProviderFailure('Firebase', 'installation identity', error);
    return null;
  }
}

/** Enables the stream rules that retain SDK store events as non-revenue observations. */
export async function markRevenueCatRevenueSource(appUserId: string): Promise<boolean> {
  if (IS_DEVELOPMENT || analyticsUserId !== appUserId || firebaseConfiguredUserId !== appUserId)
    return false;
  if (revenueCatRevenueUserId === appUserId) return true;
  const firebase = getFirebaseAnalytics();
  if (!firebase) return false;
  return mutateFirebase(async () => {
    if (analyticsUserId !== appUserId || firebaseConfiguredUserId !== appUserId) return false;
    try {
      await firebase.sdk.setDefaultEventParameters(firebase.instance, {
        revenuecat_revenue_enabled: 1,
      });
      if (analyticsUserId !== appUserId || firebaseConfiguredUserId !== appUserId) return false;
      revenueCatRevenueUserId = appUserId;
      return true;
    } catch (error) {
      reportProviderFailure('Firebase', 'revenue source', error);
      return false;
    }
  });
}

/**
 * Anchor for the `days_since_install` every event carries, from
 * `settings.firstAppOpen`. Also stamped once on the PostHog person as
 * `first_app_open`, so users who installed before `First App Open` existed
 * still fall into an install cohort, and used to pick this launch's session
 * replay sample rate. GA4 records its own first open.
 */
export async function setInstallDate(firstAppOpen: string | null): Promise<void> {
  installDate = firstAppOpen;
  if (!firstAppOpen) return;
  await waitForAnalyticsReady();
  await syncPersonProperties({}, { first_app_open: firstAppOpen });
  startSessionReplayForLaunch(daysSinceInstall(firstAppOpen) === 0);
}

/**
 * Decide once per launch whether to record this session, at a higher rate on an
 * install's first day (see `SESSION_REPLAY_NEW_INSTALL_RATE`). `random` is
 * injectable for tests.
 */
export function startSessionReplayForLaunch(
  isFirstDay: boolean,
  random: () => number = Math.random,
): boolean {
  if (sessionReplayDecided) return false;
  sessionReplayDecided = true;
  const posthog = getPostHog();
  if (!posthog) return false;
  const rate = isFirstDay ? SESSION_REPLAY_NEW_INSTALL_RATE : SESSION_REPLAY_RETURNING_RATE;
  if (random() >= rate) return false;
  sessionReplaySampled = true;
  // A number pad already on screen (onboarding's) starts it when it goes.
  if (sessionReplayPauses === 0) startSessionRecording();
  return true;
}

/** Starts this launch's recording, or resumes it after a pause, in the same session. */
function startSessionRecording(): void {
  getPostHog()
    ?.startSessionRecording(true)
    .catch((error: unknown) => {
      reportProviderFailure('PostHog', 'session replay', error);
    });
}

/**
 * Stop recording until the returned function runs. Recordings capture touch
 * positions, and on the app's own number pads a tap's position is the digit
 * typed, so every pad pauses the recording while it is on screen (see
 * `usePauseSessionReplay`). Pauses nest; the recording resumes in the same
 * session when the last one ends. A launch that is not recording ignores them.
 */
export function pauseSessionReplay(): () => void {
  sessionReplayPauses += 1;
  if (sessionReplayPauses === 1 && sessionReplaySampled) {
    getPostHog()
      ?.stopSessionRecording()
      .catch((error: unknown) => {
        reportProviderFailure('PostHog', 'session replay', error);
      });
  }
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    sessionReplayPauses -= 1;
    if (sessionReplayPauses === 0 && sessionReplaySampled) startSessionRecording();
  };
}

// Storage failures, thrown or rejected, must never reach `trackEvent`'s
// fire-and-forget callers. Unreadable reads as empty, which reports nothing.
async function readStoredUsageState(): Promise<UsageState> {
  try {
    return parseUsageState(await AsyncStorage.getItem(USAGE_STATE_STORAGE_KEY));
  } catch {
    return EMPTY_USAGE_STATE;
  }
}

async function writeStoredUsageState(state: UsageState): Promise<void> {
  try {
    await AsyncStorage.setItem(USAGE_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Kept in memory for this session; at worst a relaunch repeats a first use.
  }
}

/**
 * Apply one read-modify-write to the stored `UsageState`, serialized so two
 * uses at the same moment cannot both read the same snapshot.
 */
function updateUsageState<T>(change: (state: UsageState) => [UsageState, T]): Promise<T> {
  const result = usageUpdates.then(async () => {
    usageState ??= await readStoredUsageState();
    const [next, value] = change(usageState);
    if (next !== usageState) {
      usageState = next;
      await writeStoredUsageState(next);
    }
    return value;
  });
  usageUpdates = result.catch(() => undefined);
  return result;
}

/** The same serialized read-modify-write, for today's `DailyState`. */
function updateDailyState<T>(change: (state: DailyState) => [DailyState, T]): Promise<T> {
  const result = dailyUpdates.then(async () => {
    if (!dailyState) {
      try {
        dailyState = parseDailyState(await AsyncStorage.getItem(DAILY_STATE_STORAGE_KEY));
      } catch {
        dailyState = parseDailyState(null);
      }
    }
    const [next, value] = change(dailyState);
    if (next !== dailyState) {
      dailyState = next;
      try {
        await AsyncStorage.setItem(DAILY_STATE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Kept in memory; at worst a relaunch repeats today's daily event.
      }
    }
    return value;
  });
  dailyUpdates = result.catch(() => undefined);
  return result;
}

type PersonState = { userId: string; set: Record<string, PersonValue>; setOnce: string[] };

function samePersonValue(a: PersonValue | undefined, b: PersonValue): boolean {
  return Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((value, index) => value === b[index])
    : a === b;
}

/**
 * Write person properties to PostHog, sending only what changed since the last
 * write stored for this user. Returns false while PostHog is configured but the
 * user is not identified, so profile callers can retry.
 */
function syncPersonProperties(
  set: Record<string, PersonValue>,
  setOnce: Record<string, PersonValue> = {},
  expectedAppUserId?: string,
): Promise<boolean> {
  const result = personUpdates.then(async () => {
    const posthog = getPostHog();
    if (!posthog) return true;
    const userId = expectedAppUserId ?? analyticsUserId;
    if (!userId || userId !== analyticsUserId || postHogIdentifiedUserId !== userId) return false;

    if (personState === undefined) {
      try {
        const raw = await AsyncStorage.getItem(PERSON_STATE_STORAGE_KEY);
        personState = raw ? (JSON.parse(raw) as PersonState) : null;
      } catch {
        personState = null;
      }
    }
    const known = personState?.userId === userId ? personState : { userId, set: {}, setOnce: [] };
    const changed = Object.fromEntries(
      Object.entries(set).filter(([key, value]) => !samePersonValue(known.set[key], value)),
    );
    const once = Object.fromEntries(
      Object.entries(setOnce).filter(([key]) => !known.setOnce.includes(key)),
    );
    if (Object.keys(changed).length === 0 && Object.keys(once).length === 0) return true;

    try {
      // No flag reload: flags are fetched at launch and on identify, and each
      // reload would be another billable flag request.
      posthog.setPersonProperties(changed, once, false);
    } catch (error) {
      reportProviderFailure('PostHog', 'person properties', error);
      return false;
    }
    const next: PersonState = {
      userId,
      set: { ...known.set, ...changed },
      setOnce: [...known.setOnce, ...Object.keys(once)],
    };
    personState = next;
    try {
      await AsyncStorage.setItem(PERSON_STATE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Unsaved: the next launch rewrites the same values once.
    }
    return true;
  });
  personUpdates = result.catch(() => undefined);
  return result;
}

/**
 * A milestone is reported after a storage round trip, by which time the user
 * may have left the screen they reached it on (an editor that closed on save),
 * so it carries the screen of the action itself.
 */
function onScreen(screen: string | null): AnalyticsProperties {
  return screen ? { current_screen: screen } : {};
}

/**
 * Record a feature use: on the PostHog person the first time this install
 * uses it, and as `Feature First Used` when the install has been tracked since
 * its first launch.
 */
async function recordFeatureUse(feature: ProductFeature, screen: string | null): Promise<void> {
  const firstUse = await updateUsageState<{ fromInstall: boolean; features: string[] } | null>(
    (state) =>
      state.features.includes(feature)
        ? [state, null]
        : [
            { ...state, features: [...state.features, feature] },
            { fromInstall: state.fromInstall, features: [...state.features, feature] },
          ],
  );
  if (firstUse === null) return;

  await syncPersonProperties({ features_used: firstUse.features });
  if (firstUse.fromInstall) {
    await trackEvent(AnalyticsEvents.FEATURE_FIRST_USED, { feature, ...onScreen(screen) });
  }
}

/** `Feature Used`, at most once per feature per local day. */
async function recordDailyFeatureUse(feature: DailyFeature, screen: string | null): Promise<void> {
  const today = localDayKey();
  const claimed = await updateDailyState((state) => claimDailyFeature(state, today, feature));
  if (claimed) await trackEvent(AnalyticsEvents.FEATURE_USED, { feature, ...onScreen(screen) });
}

/**
 * `Daily App Open`, at most once per local day. Runs when analytics becomes
 * ready at launch and on every return to the foreground; the day claim makes
 * all but the first of those a single local storage read.
 */
export async function recordDailyAppOpen(): Promise<void> {
  await waitForAnalyticsReady();
  const today = localDayKey();
  const claim = await updateDailyState((state) => claimDailyAppOpen(state, today));
  if (claim) await trackEvent(AnalyticsEvents.DAILY_APP_OPEN, claim);
}

function watchAppForeground(): void {
  if (appStateSubscription) return;
  // RN 0.88 types currentState as a plain string; the values are AppStateStatus.
  lastAppState = (AppState.currentState as AppStateStatus | null | undefined) ?? null;
  appStateSubscription = AppState.addEventListener('change', (next) => {
    const cameToForeground = next === 'active' && lastAppState !== 'active';
    lastAppState = next;
    if (cameToForeground) void recordDailyAppOpen();
  });
}

export interface LoggedTransactionDetails {
  /** Expense or income. */
  type: string;
  /** The entry path, as in `First Transaction Created`'s `source`. */
  source: string;
}

/**
 * Count an expense or income the user logged. The first one each local day is
 * `Daily Transaction Logged`, on every install. Each of `TRANSACTION_MILESTONES`
 * is reported as the install reaches it, counted only on installs tracked since
 * their first launch, whose count starts at zero (`UsageState`).
 */
export async function recordLoggedTransaction(details?: LoggedTransactionDetails): Promise<void> {
  const screen = currentScreen;
  const today = localDayKey();
  const daily = await updateDailyState((state) => claimDailyTransaction(state, today));
  if (daily) {
    await trackEvent(AnalyticsEvents.DAILY_TRANSACTION_LOGGED, {
      ...daily,
      ...(details ?? {}),
      ...onScreen(screen),
    });
  }

  const milestone = await updateUsageState<number | null>((state) => {
    if (!state.fromInstall || state.loggedTransactions >= LAST_TRANSACTION_MILESTONE) {
      return [state, null];
    }
    const loggedTransactions = state.loggedTransactions + 1;
    return [
      { ...state, loggedTransactions },
      TRANSACTION_MILESTONES.includes(loggedTransactions) ? loggedTransactions : null,
    ];
  });
  if (milestone != null) {
    await trackEvent(AnalyticsEvents.TRANSACTION_MILESTONE_REACHED, {
      count: milestone,
      ...onScreen(screen),
    });
  }
}

/**
 * Track every event in GA4, and `POSTHOG_EVENTS` in PostHog. An event that is
 * a feature use (`featureUsedBy`) also records that use once it has been sent.
 */
export async function trackEvent(
  eventName: AnalyticsEventName,
  properties?: AnalyticsProperties,
): Promise<void> {
  if (eventName === AnalyticsEvents.FIRST_APP_OPEN) {
    // A new install starts a usage record whose firsts are real firsts. Queued
    // now, ahead of any use the new user can make.
    void updateUsageState((): [UsageState, void] => [
      { ...EMPTY_USAGE_STATE, fromInstall: true },
      undefined,
    ]);
  }
  // The screen and the clock are read at the call, so they describe when the
  // event happened, but the install date after the wait: an event queued during
  // launch fires before the settings that carry it have loaded.
  const screen =
    typeof properties?.current_screen === 'string' ? properties.current_screen : currentScreen;
  const trackedAt = Date.now();
  await waitForAnalyticsReady();

  const eventProperties: AnalyticsProperties = { ...properties };
  if (screen) eventProperties.current_screen = screen;
  const installAge = daysSinceInstall(installDate, trackedAt);
  if (installAge != null) eventProperties.days_since_install ??= installAge;

  // Start both independently: a failed PostHog capture must not hold up GA4.
  // Each provider handles its own failures for void callers.
  await Promise.all([
    (async () => {
      if (!isPostHogEvent(eventName)) return;
      const posthog = getPostHog();
      const appUserId = analyticsUserId;
      if (!posthog || !appUserId || postHogIdentifiedUserId !== appUserId) return;
      try {
        // Undefined values are dropped; PostHog stores nulls as explicit nulls.
        const payload = Object.fromEntries(
          Object.entries(eventProperties).filter(([, value]) => value !== undefined),
        ) as Record<string, string | number | boolean | null>;
        posthog.capture(eventName, payload, { timestamp: new Date(trackedAt) });
      } catch (error) {
        reportProviderFailure('PostHog', 'event tracking', error);
      }
    })(),
    (async () => {
      const firebase = getFirebaseAnalytics();
      if (!firebase) return;
      const appUserId = analyticsUserId;
      if (!appUserId) return;
      await configureFirebase(appUserId);
      if (analyticsUserId !== appUserId || firebaseConfiguredUserId !== appUserId) return;
      try {
        await firebase.sdk.logEvent(
          firebase.instance,
          toGa4EventName(eventName),
          toGa4EventParameters(eventProperties),
        );
      } catch (error) {
        reportProviderFailure('Firebase', 'event tracking', error);
      }
    })(),
  ]);

  const feature = featureUsedBy(eventName, properties);
  if (feature) {
    await recordFeatureUse(feature, screen);
    await recordDailyFeatureUse(feature, screen);
  }
}

/**
 * Follow the visible React Navigation screen: `trackEvent` stamps it on each
 * event as `current_screen`, GA4 gets a `screen_view` per change, crash reports
 * get it as an exception step, and a screen that is itself a feature (Insights)
 * counts toward that feature's `Feature Used`. PostHog gets no `$screen`
 * events; they would be the largest line in the event budget.
 */
export async function setCurrentScreen(screen: string | null): Promise<void> {
  if (screen === currentScreen) return;
  currentScreen = screen;
  if (!screen) return;
  addErrorStep(`Screen: ${screen}`);
  await waitForAnalyticsReady();
  if (screen !== currentScreen) return;
  await logFirebaseScreen(screen);
  const feature = featureViewedOn(screen);
  if (feature) await recordDailyFeatureUse(feature, screen);
}

/**
 * Register context on every later event; false lets profile callers retry an
 * incomplete sync. PostHog super properties are local to the device and cost
 * nothing; the stable ones are also written to the person (`$set`, only when
 * changed) so cohorts can use them.
 */
export async function setSuperProperties(
  properties: AnalyticsSuperProperties,
  expectedAppUserId?: string,
): Promise<boolean> {
  await waitForAnalyticsReady();
  const appUserId = expectedAppUserId ?? analyticsUserId;
  if (appUserId !== analyticsUserId) return false;

  let succeeded = true;
  const definedProperties = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null),
  ) as Record<string, string | number | boolean>;
  const posthog = getPostHog();
  if (posthog) {
    try {
      posthog.register(definedProperties);
    } catch (error) {
      succeeded = false;
      reportProviderFailure('PostHog', 'super properties', error);
    }
    if (!(await syncPersonProperties(definedProperties, {}, appUserId ?? undefined))) {
      succeeded = false;
    }
  }

  const firebase = getFirebaseAnalytics();
  if (appUserId !== analyticsUserId) return false;
  if (firebase && firebaseConfiguredUserId !== appUserId) {
    succeeded = false;
  } else if (firebase) {
    try {
      await firebase.sdk.setUserProperties(
        firebase.instance,
        toGa4UserProperties({ ...properties }),
      );
    } catch (error) {
      succeeded = false;
      reportProviderFailure('Firebase', 'user properties', error);
    }
  }
  return succeeded;
}

/** Update the profile; false lets callers retry an incomplete sync. */
export async function setUserProperties(
  properties: Record<string, string | number | boolean>,
  expectedAppUserId?: string,
): Promise<boolean> {
  await waitForAnalyticsReady();
  const appUserId = expectedAppUserId ?? analyticsUserId;
  if (appUserId !== analyticsUserId) return false;

  let succeeded = await syncPersonProperties(properties, {}, appUserId ?? undefined);

  const firebase = getFirebaseAnalytics();
  if (appUserId !== analyticsUserId) return false;
  if (firebase && firebaseConfiguredUserId !== appUserId) {
    succeeded = false;
  } else if (firebase) {
    try {
      await firebase.sdk.setUserProperties(firebase.instance, toGa4UserProperties(properties));
    } catch (error) {
      succeeded = false;
      reportProviderFailure('Firebase', 'user properties', error);
    }
  }
  return succeeded;
}

/** Firebase manages its own batches; PostHog exposes the explicit flush. */
export async function flushAnalytics(): Promise<void> {
  await waitForAnalyticsReady();
  const posthog = getPostHog();
  if (!posthog) return;
  try {
    await posthog.flush();
  } catch (error) {
    reportProviderFailure('PostHog', 'flush', error);
  }
}

export async function resetAnalytics(): Promise<void> {
  const posthog = getPostHog();
  if (posthog) {
    try {
      posthog.reset();
    } catch (error) {
      reportProviderFailure('PostHog', 'reset', error);
    }
  }

  const firebase = getFirebaseAnalytics();
  if (firebase) {
    try {
      await firebase.sdk.setAnalyticsCollectionEnabled(firebase.instance, false);
      await firebase.sdk.setUserId(firebase.instance, null);
      await firebase.sdk.resetAnalyticsData(firebase.instance);
    } catch (error) {
      reportProviderFailure('Firebase', 'reset', error);
    }
  }

  analyticsUserId = null;
  firebaseConfiguredUserId = null;
  revenueCatRevenueUserId = null;
  postHogIdentifiedUserId = null;
  installDate = null;
  currentScreen = null;
  lastFirebaseScreen = null;
  analyticsReadyPromise = new Promise<void>((resolve) => {
    resolveAnalyticsReady = resolve;
  });
  analyticsReadyResolved = false;
}
