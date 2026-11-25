const {
  AndroidConfig,
  withAndroidManifest,
  withInfoPlist,
  withStringsXml,
} = require('@expo/config-plugins');

/**
 * Native configuration for Meta app events (modules/meta-app-events), which
 * measures installs and app launches from our Meta ads. Design: "Meta app
 * events" in the README's Analytics section.
 *
 * Everything here keeps the SDK quiet until JavaScript starts it
 * (services/metaAppEvents.ts decides when):
 *
 * - **iOS** gets the app ID, client token and display name, with automatic
 *   logging and advertiser-ID collection off. The iOS SDK never initializes on
 *   its own; the module does it in `start()`. No `NSUserTrackingUsageDescription`:
 *   the app does not ask for App Tracking Transparency, so the SDK reports
 *   through SKAdNetwork and Aggregated Event Measurement only.
 * - **Android** gets the same IDs as string resources (a numeric literal in a
 *   manifest `meta-data` value is read as an integer), with auto-init, automatic
 *   logging, automatic advanced matching and advertising-ID collection off. The
 *   SDK's startup provider (`FacebookInitProvider`) is removed, so the SDK does
 *   not load, and fetches nothing from Meta, until the module's `start()`
 *   initializes it: otherwise it would load at every launch, and after one
 *   start it would send launches on its own before JavaScript can decide.
 *   The advertising-ID and Privacy Sandbox permissions the SDK's
 *   manifest adds are blocked in app.json. `<queries>` lets the SDK read the
 *   Facebook apps' attribution ID, Meta's install match on Android without the
 *   advertising ID.
 */

// The Facebook apps whose AttributionIdProvider facebook-core reads.
const META_PACKAGES = ['com.facebook.katana', 'com.facebook.wakizashi'];

function requireOptions(options) {
  const { appId, clientToken, displayName } = options ?? {};
  if (!/^\d+$/.test(String(appId ?? ''))) {
    throw new Error('withMetaAppEvents: `appId` must be the numeric Meta app ID.');
  }
  if (!/^[0-9a-f]{32}$/.test(String(clientToken ?? ''))) {
    throw new Error('withMetaAppEvents: `clientToken` must be the 32-character client token.');
  }
  return { appId: String(appId), clientToken, displayName: displayName ?? 'Money2Time' };
}

function applyMetaInfoPlist(infoPlist, options) {
  const { appId, clientToken, displayName } = requireOptions(options);
  return {
    ...infoPlist,
    FacebookAppID: appId,
    FacebookClientToken: clientToken,
    FacebookDisplayName: displayName,
    FacebookAutoLogAppEventsEnabled: false,
    FacebookAdvertiserIDCollectionEnabled: false,
  };
}

// facebook-core's startup ContentProvider, removed by `tools:node="remove"`.
const META_INIT_PROVIDER = 'com.facebook.internal.FacebookInitProvider';

const MANIFEST_META_DATA = {
  'com.facebook.sdk.ApplicationId': '@string/facebook_app_id',
  'com.facebook.sdk.ClientToken': '@string/facebook_client_token',
  'com.facebook.sdk.AutoInitEnabled': 'false',
  'com.facebook.sdk.AutoLogAppEventsEnabled': 'false',
  'com.facebook.sdk.AdvertiserIDCollectionEnabled': 'false',
  'com.facebook.sdk.AutoLogMetaDataEnabled': 'false',
  'com.facebook.sdk.AutoLogProductImprovementEnabled': 'false',
};

function applyMetaManifest(manifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  for (const [name, value] of Object.entries(MANIFEST_META_DATA)) {
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(application, name, value);
  }
  manifest.manifest.$ = {
    'xmlns:tools': 'http://schemas.android.com/tools',
    ...manifest.manifest.$,
  };
  application.provider = (application.provider ?? []).filter(
    (provider) => provider.$?.['android:name'] !== META_INIT_PROVIDER,
  );
  application.provider.push({
    $: { 'android:name': META_INIT_PROVIDER, 'tools:node': 'remove' },
  });
  const ours = new Set(META_PACKAGES);
  manifest.manifest.queries = (manifest.manifest.queries ?? [])
    .map((query) => ({
      ...query,
      package: (query.package ?? []).filter((entry) => !ours.has(entry.$?.['android:name'])),
    }))
    .filter((query) =>
      Object.keys(query).some((key) => key !== 'package' || query.package.length > 0),
    );
  manifest.manifest.queries.push({
    package: META_PACKAGES.map((name) => ({ $: { 'android:name': name } })),
  });
  return manifest;
}

function applyMetaStrings(strings, options) {
  const { appId, clientToken } = requireOptions(options);
  return AndroidConfig.Strings.setStringItem(
    [
      AndroidConfig.Resources.buildResourceItem({ name: 'facebook_app_id', value: appId }),
      AndroidConfig.Resources.buildResourceItem({
        name: 'facebook_client_token',
        value: clientToken,
      }),
    ],
    strings,
  );
}

module.exports = function withMetaAppEvents(config, options) {
  requireOptions(options);
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults = applyMetaInfoPlist(cfg.modResults, options);
    return cfg;
  });
  config = withStringsXml(config, (cfg) => {
    cfg.modResults = applyMetaStrings(cfg.modResults, options);
    return cfg;
  });
  config = withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyMetaManifest(cfg.modResults);
    return cfg;
  });
  return config;
};

module.exports.META_PACKAGES = META_PACKAGES;
module.exports.META_INIT_PROVIDER = META_INIT_PROVIDER;
module.exports.MANIFEST_META_DATA = MANIFEST_META_DATA;
module.exports.applyMetaInfoPlist = applyMetaInfoPlist;
module.exports.applyMetaManifest = applyMetaManifest;
module.exports.applyMetaStrings = applyMetaStrings;
