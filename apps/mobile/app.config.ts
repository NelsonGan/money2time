import type { ConfigContext, ExpoConfig } from 'expo/config';

import { getNativeAssetRevision } from './scripts/lib/nativeAssetRevision.cjs';

const appJson = require('./app.json') as { expo: ExpoConfig };
const baseConfig = appJson.expo;

// The development EAS profile sets APP_VARIANT=development (see eas.json). When it is set we
// build a distinct app (own bundle id + name) so the dev client installs alongside the App
// Store build instead of colliding with it. The widget extension and iCloud container are
// dropped from the variant so no extra Apple Developer identifiers need provisioning — the
// dev app still runs every feature and loads all `eas update` bundles.
const IS_DEV_VARIANT = process.env.APP_VARIANT === 'development';

// Over-the-air updates are for internal builds only. Production ships store
// binaries and never publishes to the `production` channel — the only thing
// `eas update` targets is a per-PR preview branch (see deploy.yml) — so on a
// store build the whole expo-updates launch path was pure downside: every cold
// start went through the updater's cache/launcher before React Native got a
// bundle, and when that resolution failed the app never received one at all.
// The user sat on the native splash forever, with nothing behind it to report
// the failure, until their next store update changed the runtime version and
// invalidated the poisoned cache. Sentry showed hundreds of users reaching
// `Expo Updates emergency launch` (`Launch asset not found for update`,
// `AppLoaderTask encountered an unexpected error`) across releases 1.3.3-1.4.3;
// those were the ones lucky enough to recover far enough to send an event.
//
// Disabling updates makes a store build launch straight from its embedded
// bundle, removing that failure mode entirely. Only the two internal variants
// keep OTA, and for different reasons: `preview` is what the per-PR QR flow
// publishes to, and `development` lets a dev client pull a new bundle without a
// native rebuild. Every other value, `production` and an unset APP_VARIANT
// included, falls through to `enabled: false`.
const OTA_VARIANTS = ['development', 'preview'];
const IS_OTA_VARIANT = OTA_VARIANTS.includes(process.env.APP_VARIANT ?? '');

const DEV_BUNDLE_IDENTIFIER = 'com.nelsongan.money2time.dev';

const EXPO_SDK_MAJOR = (require('expo/package.json') as { version: string }).version.split('.')[0];

type ExtraShape = Record<string, unknown> & {
  eas?: Record<string, unknown> & {
    build?: Record<string, unknown> & { experimental?: unknown };
  };
};

function omitKeys<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): T {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key))) as T;
}

function applyDevVariant(cfg: ExpoConfig): ExpoConfig {
  const ios = { ...cfg.ios };
  ios.bundleIdentifier = DEV_BUNDLE_IDENTIFIER;
  ios.googleServicesFile = './GoogleService-Info.dev.plist';
  ios.usesIcloudStorage = false;
  // Sign in with Apple is provisioned for the store bundle id only; Cloud Sync
  // hides the Apple button when the build has no entitlement.
  ios.usesAppleSignIn = false;

  // No iCloud container is provisioned for the variant id — strip the iCloud entitlements.
  if (ios.entitlements) {
    ios.entitlements = omitKeys(ios.entitlements, [
      'com.apple.developer.icloud-container-identifiers',
      'com.apple.developer.icloud-services',
      'com.apple.developer.ubiquity-container-identifiers',
    ]);
  }

  // Drop the iCloud ubiquity-container mapping and give the app a distinct home-screen name.
  if (ios.infoPlist) {
    ios.infoPlist = {
      ...omitKeys(ios.infoPlist, ['NSUbiquitousContainers']),
      CFBundleDisplayName: 'M2T Dev',
    };
  }

  // Exclude the widget config plugin — the variant ships without the widget extension, whose
  // bundle id must otherwise be a child of the host id.
  const plugins = (cfg.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return typeof name !== 'string' || !name.includes('withMoney2TimeWidgets');
  });

  // Remove the widget app-extension while keeping extra.eas.projectId (updates/project binding).
  let extra = cfg.extra;
  if (extra) {
    const cloned = JSON.parse(JSON.stringify(extra)) as ExtraShape;
    if (cloned.eas?.build) {
      cloned.eas.build = omitKeys(cloned.eas.build, ['experimental']);
    }
    extra = cloned;
  }

  return {
    ...cfg,
    name: 'Money2Time Dev',
    ios,
    plugins,
    extra,
  };
}

function applyUpdatesPolicy(cfg: ExpoConfig): ExpoConfig {
  return {
    ...cfg,
    // Logo/tutorial/news assets are omitted from OTA uploads and must exist in
    // the matching native build. A version-only runtime lets an old dev client
    // load a bundle whose renamed/recompressed assets it cannot resolve.
    // Both internal variants share the revision so dev clients can open PR
    // previews despite their different bundle IDs and widget configuration.
    // The Expo SDK major is in it too: an SDK upgrade replaces the native code
    // without necessarily bumping the app version, and a dev client built on
    // the old SDK must not load a bundle written for the new one.
    runtimeVersion: IS_OTA_VARIANT
      ? `${cfg.version}-sdk${EXPO_SDK_MAJOR}-assets-${getNativeAssetRevision(__dirname)}`
      : cfg.runtimeVersion,
    updates: {
      ...cfg.updates,
      enabled: IS_OTA_VARIANT,
    },
  };
}

// PostHog error tracking reads minified Hermes stacks and unsymbolicated native
// crashes unless the build uploads source maps and debug symbols. The upload
// needs a personal API key, which only exists as an EAS secret, so the config
// plugin that adds the upload steps is applied only when that key is present:
// local, CI and PR preview builds without it keep building exactly as before
// (`eas-build-post-install` in package.json installs posthog-cli for the same
// condition).
const POSTHOG_SYMBOL_UPLOAD = Boolean(process.env.POSTHOG_CLI_API_KEY?.trim());

function applyPostHogSymbolUpload(cfg: ExpoConfig): ExpoConfig {
  if (!POSTHOG_SYMBOL_UPLOAD) return cfg;
  return {
    ...cfg,
    plugins: [
      ...(cfg.plugins ?? []),
      ['posthog-react-native/expo', { uploadNativeSymbols: true, skipOnConflict: true }],
    ],
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const merged: ExpoConfig = {
    ...baseConfig,
    ...config,
    extra: {
      ...baseConfig.extra,
      ...config.extra,
      // Tags every PostHog event (`app_variant`), so development and per-PR
      // preview traffic can be filtered out of production reports.
      appVariant: process.env.APP_VARIANT || 'production',
    },
  };

  return applyPostHogSymbolUpload(
    applyUpdatesPolicy(IS_DEV_VARIANT ? applyDevVariant(merged) : merged),
  );
};
