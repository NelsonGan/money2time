/**
 * The app's single PostHog client (product analytics, error tracking, session
 * replay and feature flags).
 *
 * Created once at launch by `initPostHog` (App.tsx, before anything renders) so
 * error autocapture covers startup. Every option that would generate events on
 * its own is off or narrowed: PostHog bills per event, and the README's
 * "PostHog event budget" assumes only the events the app sends deliberately.
 */

import Constants from 'expo-constants';
import { PostHog, type PostHogOptions } from 'posthog-react-native';

import { POSTHOG_HOST, POSTHOG_PROJECT_TOKEN } from '~/constants/posthog';

import { POSTHOG_EVENT_NAMES } from './analytics.shared';
import { beforeSendException } from './errorReporting.shared';

const IS_DEVELOPMENT = typeof __DEV__ !== 'undefined' && __DEV__;

/**
 * `development`, `preview` or `production`, from the EAS build profile. A
 * development bundle always reports `development`: local Metro serves a
 * manifest evaluated without `APP_VARIANT`, which would otherwise read as
 * production and slip past the test-account filter.
 */
export function getAppVariant(): string {
  if (IS_DEVELOPMENT) return 'development';
  const variant = Constants.expoConfig?.extra?.appVariant;
  return typeof variant === 'string' && variant ? variant : 'production';
}

/**
 * SDK events the app relies on. Every other `$` event (lifecycle, `$screen`,
 * rage clicks, autocapture) is dropped as a backstop to the options below, so
 * an SDK upgrade cannot start spending the event budget unnoticed.
 */
const ALLOWED_SDK_EVENTS: ReadonlySet<string> = new Set([
  '$identify',
  '$set',
  '$exception',
  '$feature_flag_called',
]);

/** Drop anything that is neither an approved app event nor an allowed SDK event. */
export function isAllowedPostHogEvent(event: string): boolean {
  return POSTHOG_EVENT_NAMES.has(event) || ALLOWED_SDK_EVENTS.has(event);
}

type CaptureEvent = Parameters<
  Extract<PostHogOptions['before_send'], (...args: never[]) => unknown>
>[0];

/**
 * Hosts that receive PostHog's tracing headers (`X-POSTHOG-SESSION-ID`,
 * `X-POSTHOG-DISTINCT-ID`): only the receipt-scanner Worker, which copies the
 * session onto its `$ai_generation` events so an AI trace links to the replay
 * and events of the session that sent it. Read from the same env var the scan
 * client uses, so a PR build pointing at its preview Worker links too.
 */
function tracingHeaderHosts(): string[] {
  const url = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_RECEIPT_SCANNER?.trim();
  if (!url) return [];
  try {
    return [new URL(url).hostname];
  } catch {
    return [];
  }
}

let client: PostHog | null | undefined;

/**
 * Development builds stay silent unless `EXPO_PUBLIC_POSTHOG_DEV=1`, so local
 * work does not spend the free tier. Events from development and preview
 * builds carry `app_variant`, which the project's test-account filter excludes.
 */
function isEnabled(): boolean {
  if (!POSTHOG_PROJECT_TOKEN) return false;
  return !IS_DEVELOPMENT || process.env.EXPO_PUBLIC_POSTHOG_DEV === '1';
}

export function initPostHog(): PostHog | null {
  if (client !== undefined) return client;
  if (!isEnabled()) {
    client = null;
    return client;
  }
  try {
    client = new PostHog(POSTHOG_PROJECT_TOKEN, {
      host: POSTHOG_HOST,
      // Anonymous until `identifyUser` runs, which happens as soon as settings
      // load; nothing the app sends is captured before that.
      personProfiles: 'identified_only',
      // `Daily App Open` replaces the per-foreground lifecycle events.
      captureAppLifecycleEvents: false,
      // The app starts recording itself, sampled per launch.
      enableSessionReplay: false,
      sessionReplayConfig: {
        // Finance app: the user's information is masked, the app around it is
        // not. Every text and input is masked, because amounts, notes and names
        // are text (on iOS this flag covers labels as well as inputs). Images
        // are shown, so icons, logos and illustrations stay readable; pictures
        // the user supplied (receipts, covers, the profile photo, uploads, QR
        // codes, the camera and the album map) carry `REPLAY_PRIVATE`
        // (components/ui/replayPrivacy.ts) and are masked one by one. Fixed
        // app copy that can never hold user data can opt back in with a
        // `ph-no-mask` testID, as `FatButton` does.
        maskAllTextInputs: true,
        maskAllImages: false,
        maskAllSandboxedViews: true,
        // The number pads are custom views, so tap positions would spell out
        // the amounts typed on them.
        captureTouches: false,
        // Logcat and request URLs can carry identifiers; neither is needed.
        captureLog: false,
        captureNetworkTelemetry: false,
        // The project's remote rate is the website's; the app samples in JS.
        sampleRate: 1,
      },
      // iOS rage taps would be a billable `$rageclick` per burst.
      rageClickConfig: { enabled: false },
      errorTracking: {
        autocapture: {
          uncaughtExceptions: true,
          unhandledRejections: true,
          // Render errors arrive through AppErrorBoundary; console output is
          // noise and can contain anything the app logs.
          console: false,
          nativeCrashes: true,
          androidNdkCrashes: true,
        },
      },
      before_send: [
        (event: CaptureEvent | null) =>
          event && isAllowedPostHogEvent(event.event) ? event : null,
        (event: CaptureEvent | null) =>
          event && event.event === '$exception' ? beforeSendException(event) : event,
      ],
      addTracingHeaders: tracingHeaderHosts(),
      disableSurveys: true,
      capturePushNotificationSubscriptions: false,
      capturePushNotificationOpened: false,
      flushInterval: 30000,
    });
    client.register({ app_variant: getAppVariant() });
  } catch (error) {
    client = null;
    if (IS_DEVELOPMENT) console.warn('[PostHog] initialization failed:', error);
  }
  return client;
}

/** The client, created on first use; null when PostHog is disabled. */
export function getPostHog(): PostHog | null {
  return initPostHog();
}
