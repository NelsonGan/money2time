import type { ConfigContext, ExpoConfig } from 'expo/config';

import { getNativeAssetRevision } from './scripts/lib/nativeAssetRevision.cjs';

const appJson = require('./app.json') as { expo: ExpoConfig };
const baseConfig = appJson.expo;

// Over-the-air updates are for internal builds only. Production ships store
// binaries and never publishes to the `production` channel (CI publishes no
// `eas update` at all), so on a store build the whole expo-updates launch path
// was pure downside: every cold start went through the updater's
// cache/launcher before React Native got a bundle, and when that resolution
// failed the app never received one at all.
// The user sat on the native splash forever, with nothing behind it to report
// the failure, until their next store update changed the runtime version and
// invalidated the poisoned cache. Sentry showed hundreds of users reaching
// `Expo Updates emergency launch` (`Launch asset not found for update`,
// `AppLoaderTask encountered an unexpected error`) across releases 1.3.3-1.4.3;
// those were the ones lucky enough to recover far enough to send an event.
//
// Disabling updates makes a store build launch straight from its embedded
// bundle, removing that failure mode entirely. Only the two internal variants
// keep OTA: `development` lets a dev client pull a new bundle without a native
// rebuild, and a `preview` build can likewise load an `eas update` published to
// it. Every other value, `production` and an unset APP_VARIANT included, falls
// through to `enabled: false`.
const OTA_VARIANTS = ['development', 'preview'];
const IS_OTA_VARIANT = OTA_VARIANTS.includes(process.env.APP_VARIANT ?? '');

const EXPO_SDK_MAJOR = (require('expo/package.json') as { version: string }).version.split('.')[0];

function applyUpdatesPolicy(cfg: ExpoConfig): ExpoConfig {
  return {
    ...cfg,
    // Logo/tutorial/news assets are omitted from OTA uploads and must exist in
    // the matching native build. A version-only runtime lets an old dev client
    // load a bundle whose renamed/recompressed assets it cannot resolve.
    // Both internal variants share the revision so a dev client can load an
    // update published for `preview`.
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
// local and CI builds without it keep building exactly as before
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
      // Tags every PostHog event (`app_variant`), so development and preview
      // traffic can be filtered out of production reports.
      appVariant: process.env.APP_VARIANT || 'production',
    },
  };

  return applyPostHogSymbolUpload(applyUpdatesPolicy(merged));
};
