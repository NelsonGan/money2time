// Stands in for @revenuecat/purchases-js-hybrid-mappings in iOS and Android
// bundles (see nativeStubs.cjs). That package is RevenueCat's web SDK, about
// 1 MB of minified JS. react-native-purchases calls it only in "browser mode",
// which it picks when the RNPurchases native module is missing (Expo Go, the
// Rork sandbox, web). Every native build of this app links RNPurchases, so the
// real package is never called there. If browser mode ever starts anyway, each
// call fails with this error instead of running the web SDK.
const message =
  'RevenueCat browser mode is not bundled in native builds. The RNPurchases native module is missing from this build.';

function unavailable() {
  throw new Error(message);
}

const PurchasesCommon = new Proxy(
  {},
  {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      if (key === 'isConfigured') return () => false;
      return unavailable;
    },
  },
);

module.exports = { PurchasesCommon };
