// Stands in for @revenuecat/purchases-js-hybrid-mappings in iOS and Android
// bundles (see nativeStubs.cjs). That package is RevenueCat's web SDK, about
// 1 MB of minified JS. react-native-purchases calls it only in "browser mode",
// which it picks in Expo Go (no RNPurchases native module), the Rork sandbox
// and on web. None of those is a native build of this app, so the real
// package is never called there. If browser mode ever starts anyway, each call
// fails with this error instead of running the web SDK.
//
// These are the PurchasesCommon methods react-native-purchases' browser code
// calls; __tests__/build/nativeStubs.test.ts fails if an upgrade calls another.
const message =
  'RevenueCat browser mode (Expo Go, the Rork sandbox, web) is not bundled in iOS and Android builds.';

function unavailable() {
  throw new Error(message);
}

const PurchasesCommon = {
  configure: unavailable,
  getInstance: unavailable,
  isConfigured: () => false,
  setLogHandler: unavailable,
  setLogLevel: unavailable,
  setProxyUrl: unavailable,
};

module.exports = { PurchasesCommon };
