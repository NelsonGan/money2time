// Packages that iOS and Android bundles replace with a local stub, because the
// app never calls them on those platforms. Web bundles keep the real package.
const NATIVE_STUBS = {
  // RevenueCat's web SDK (~1 MB) only runs in react-native-purchases' browser
  // mode (Expo Go, web), never in a native build.
  '@revenuecat/purchases-js-hybrid-mappings': require.resolve('./purchasesJsHybridMappingsStub.js'),
};

/** The stub file for `moduleName` on `platform`, or null to resolve it normally. */
function nativeStubFor(moduleName, platform) {
  if (platform !== 'ios' && platform !== 'android') return null;
  return Object.prototype.hasOwnProperty.call(NATIVE_STUBS, moduleName)
    ? NATIVE_STUBS[moduleName]
    : null;
}

module.exports = { NATIVE_STUBS, nativeStubFor };
