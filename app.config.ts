import type { ExpoConfig, ConfigContext } from 'expo/config';

const appJson = require('./app.json') as { expo: ExpoConfig };
const baseConfig = appJson.expo;

const ANDROID_TEST_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const IOS_TEST_APP_ID = 'ca-app-pub-3940256099942544~1458002511';
const ADMOB_APP_ID_PATTERN = /^ca-app-pub-\d{16}~\d{10,}$/;

type ExpoPluginEntry = NonNullable<ExpoConfig['plugins']>[number];

function upsertPlugin(plugins: ExpoPluginEntry[], plugin: ExpoPluginEntry) {
  const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
  const index = plugins.findIndex((entry) =>
    Array.isArray(entry) ? entry[0] === pluginName : entry === pluginName,
  );

  if (index >= 0) {
    plugins[index] = plugin;
    return plugins;
  }

  plugins.push(plugin);
  return plugins;
}

function normalizeEnvValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resolveAdMobAppId(envName: 'EXPO_PUBLIC_ADMOB_ANDROID_APP_ID' | 'EXPO_PUBLIC_ADMOB_IOS_APP_ID', fallback: string) {
  const configured = normalizeEnvValue(process.env[envName]);

  if (configured && ADMOB_APP_ID_PATTERN.test(configured)) {
    return configured;
  }

  if (configured) {
    console.warn(`[AdMob] Ignoring invalid ${envName}; falling back to the Google test app ID.`);
  }

  return fallback;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = [...((baseConfig.plugins ?? []) as ExpoPluginEntry[])];

  upsertPlugin(plugins, [
    'react-native-google-mobile-ads',
    {
      androidAppId: resolveAdMobAppId('EXPO_PUBLIC_ADMOB_ANDROID_APP_ID', ANDROID_TEST_APP_ID),
      iosAppId: resolveAdMobAppId('EXPO_PUBLIC_ADMOB_IOS_APP_ID', IOS_TEST_APP_ID),
      delayAppMeasurementInit: true,
      userTrackingUsageDescription:
        'This identifier will be used to deliver more relevant ads in Money2Time.',
    },
  ]);

  return {
    ...baseConfig,
    ...config,
    plugins,
  };
};
