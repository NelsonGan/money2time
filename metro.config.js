const { withNativeWind } = require('nativewind/metro');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};
config.resolver = {
  ...config.resolver,
  // Drop svg from assets (handled by the transformer); add db so the bundled
  // read-only cities database (assets/db/cities.db) ships as an asset.
  assetExts: [...config.resolver.assetExts.filter((ext) => ext !== 'svg'), 'db'],
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

module.exports = withNativeWind(config, { input: './global.css' });
