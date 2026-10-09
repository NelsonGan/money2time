const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

const { getMainApplicationOrThrow } = AndroidConfig.Manifest;

const MAIN_ACTIVITY = '.MainActivity';

// Expo's template only lists keyboard|keyboardHidden|orientation|screenSize|
// screenLayout|uiMode. Anything else (a display-size or font-size change, a
// locale switch) makes Android destroy and recreate MainActivity, and if a React
// Native <Modal> is open its dialog window dies with the activity, so
// ReactModalHostView.dismiss throws "not attached to window manager" (Sentry
// MONEY2TIME-3Y / MONEY2TIME-62). React Native already handles all of these in
// onConfigurationChanged, so declaring them is safe.
const HANDLED_CONFIG_CHANGES = [
  'keyboard',
  'keyboardHidden',
  'orientation',
  'screenSize',
  'smallestScreenSize',
  'screenLayout',
  'uiMode',
  'density',
  'fontScale',
  'locale',
  'layoutDirection',
];

module.exports = function withAndroidMainActivityConfigChanges(config) {
  return withAndroidManifest(config, (config) => {
    const mainApplication = getMainApplicationOrThrow(config.modResults);
    const mainActivity = (mainApplication.activity ?? []).find(
      (activity) => activity.$?.['android:name'] === MAIN_ACTIVITY,
    );
    if (!mainActivity) return config;

    const existing = (mainActivity.$['android:configChanges'] ?? '').split('|').filter(Boolean);
    mainActivity.$['android:configChanges'] = [
      ...new Set([...existing, ...HANDLED_CONFIG_CHANGES]),
    ].join('|');
    return config;
  });
};
