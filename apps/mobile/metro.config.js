const path = require('path');

const { withNativeWind } = require('nativewind/metro');
const { getPostHogExpoConfig } = require('posthog-react-native/metro');

const { nativeStubFor } = require('./scripts/metro/nativeStubs.cjs');

// Injects debug IDs into each bundle so PostHog can match an exception's
// minified Hermes frames to the source map the build uploaded.
const config = getPostHogExpoConfig(__dirname);
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

// Belt-and-suspenders: the other apps in apps/ (the Cloudflare Workers and D1
// schemas, the website, App Studio) must never be bundled into the app. Nothing
// imports them today, and they sit outside this project so Metro does not watch
// them, but this makes it structurally impossible even via a future accidental
// import. Anchored to the absolute paths so it never matches an unrelated
// `cloudflare/` or `web/` dir in node_modules.
const blockOtherApps = ['../cloudflare', '../web', '../app-studio'].map((dir) => {
  const escaped = path.resolve(__dirname, dir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}[\\\\/]`);
});
const existingBlockList = config.resolver.blockList;
const existingResolveRequest = config.resolver.resolveRequest;

config.resolver = {
  ...config.resolver,
  // iOS and Android bundle a stub for packages they never call; see
  // scripts/metro/nativeStubs.cjs.
  resolveRequest(context, moduleName, platform) {
    const stub = nativeStubFor(moduleName, platform);
    if (stub) return { type: 'sourceFile', filePath: stub };
    return (existingResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
  },
  // Drop svg from assets (handled by the transformer); add gz so the bundled
  // read-only cities database (assets/db/cities.db.gz) ships as an asset.
  assetExts: [...config.resolver.assetExts.filter((ext) => ext !== 'svg'), 'gz'],
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  blockList: existingBlockList ? [].concat(existingBlockList, blockOtherApps) : blockOtherApps,
};

module.exports = withNativeWind(config, { input: './global.css' });
