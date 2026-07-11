const path = require('path');

const { withNativeWind } = require('nativewind/metro');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

// Belt-and-suspenders: the Cloudflare Workers in /workers must never be bundled
// into the app. Nothing imports them today, but this makes it structurally
// impossible even via a future accidental import. Anchored to the absolute
// project path so it never matches an unrelated `workers/` dir in node_modules.
const workerDirEscaped = path.resolve(__dirname, 'workers').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockWorker = new RegExp(`^${workerDirEscaped}[\\\\/]`);
const existingBlockList = config.resolver.blockList;

config.resolver = {
  ...config.resolver,
  // Drop svg from assets (handled by the transformer); add db so the bundled
  // read-only cities database (assets/db/cities.db) ships as an asset.
  assetExts: [...config.resolver.assetExts.filter((ext) => ext !== 'svg'), 'db'],
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  blockList: existingBlockList ? [].concat(existingBlockList, blockWorker) : blockWorker,
};

module.exports = withNativeWind(config, { input: './global.css' });
