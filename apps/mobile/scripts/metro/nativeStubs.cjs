// Packages that iOS and Android bundles replace with a local stub, because the
// app never calls them on those platforms. Web bundles keep the real package.
const NATIVE_STUBS = {
  // RevenueCat's web SDK (~1 MB) only runs in react-native-purchases' browser
  // mode (Expo Go, the Rork sandbox, web), never in a native build.
  '@revenuecat/purchases-js-hybrid-mappings': require.resolve('./purchasesJsHybridMappingsStub.js'),
};

/** The stub file for `moduleName` on `platform`, or null to resolve it normally. */
function nativeStubFor(moduleName, platform) {
  if (platform !== 'ios' && platform !== 'android') return null;
  // A subpath of a stubbed package (`pkg/dist/x`) gets the same stub, so a
  // deep import cannot bring the real package back.
  const name = Object.keys(NATIVE_STUBS).find(
    (pkg) => moduleName === pkg || moduleName.startsWith(`${pkg}/`),
  );
  return name ? NATIVE_STUBS[name] : null;
}

module.exports = { NATIVE_STUBS, nativeStubFor };
