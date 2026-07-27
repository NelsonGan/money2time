import type { ConfigContext, ExpoConfig } from 'expo/config';

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
// bundle, removing that failure mode entirely. Internal variants keep OTA so the
// PR-preview QR flow still works.
const OTA_VARIANTS = ['development', 'preview'];
const IS_OTA_VARIANT = OTA_VARIANTS.includes(process.env.APP_VARIANT ?? '');

const DEV_BUNDLE_IDENTIFIER = 'com.nelsongan.money2time.dev';

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
  ios.usesIcloudStorage = false;

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
    updates: {
      ...cfg.updates,
      enabled: IS_OTA_VARIANT,
    },
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const merged: ExpoConfig = {
    ...baseConfig,
    ...config,
  };

  return applyUpdatesPolicy(IS_DEV_VARIANT ? applyDevVariant(merged) : merged);
};
