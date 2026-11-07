import fs from 'node:fs';
import path from 'node:path';

const { NATIVE_STUBS, nativeStubFor } = require('../../scripts/metro/nativeStubs.cjs');

const MAPPINGS = '@revenuecat/purchases-js-hybrid-mappings';
const PURCHASES_DIST = path.resolve(__dirname, '../../node_modules/react-native-purchases/dist');

function jsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(file);
    return entry.name.endsWith('.js') ? [file] : [];
  });
}

describe('native bundle stubs', () => {
  it('stubs RevenueCat web SDK on iOS and Android and keeps the real package on web', () => {
    expect(nativeStubFor(MAPPINGS, 'ios')).toBe(NATIVE_STUBS[MAPPINGS]);
    expect(nativeStubFor(MAPPINGS, 'android')).toBe(NATIVE_STUBS[MAPPINGS]);
    expect(nativeStubFor(MAPPINGS, 'web')).toBeNull();
    expect(nativeStubFor('react-native-purchases', 'ios')).toBeNull();
    expect(nativeStubFor('constructor', 'ios')).toBeNull();
    for (const file of Object.values(NATIVE_STUBS) as string[]) {
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it('fails each browser-mode call with a clear error', () => {
    const { PurchasesCommon } = require(NATIVE_STUBS[MAPPINGS]);
    expect(PurchasesCommon.isConfigured()).toBe(false);
    expect(() => PurchasesCommon.configure({})).toThrow('not bundled in native builds');
    expect(() => PurchasesCommon.getInstance()).toThrow('not bundled in native builds');
  });

  // The stub is only safe while react-native-purchases reaches the web SDK
  // through its browser-mode module and nothing else. An upgrade that calls it
  // from the native path must fail here rather than in a store build.
  it('react-native-purchases only uses the web SDK in browser mode', () => {
    const users = jsFiles(PURCHASES_DIST).filter((file) =>
      fs.readFileSync(file, 'utf8').includes(MAPPINGS),
    );
    expect(users.length).toBeGreaterThan(0);
    for (const file of users) {
      expect(path.relative(PURCHASES_DIST, file)).toMatch(/^browser\//);
      const used = new Set(
        [...fs.readFileSync(file, 'utf8').matchAll(/purchases_js_hybrid_mappings_1\.(\w+)/g)].map(
          (match) => match[1],
        ),
      );
      expect([...used]).toEqual(['PurchasesCommon']);
    }
    const purchases = fs.readFileSync(path.join(PURCHASES_DIST, 'purchases.js'), 'utf8');
    expect(purchases).toContain(
      'var nativeModule = usingBrowserMode ? nativeModule_1.browserNativeModuleRNPurchases : react_native_1.NativeModules.RNPurchases;',
    );
    const environment = fs.readFileSync(path.join(PURCHASES_DIST, 'utils/environment.js'), 'utf8');
    expect(environment).toContain('if (!!react_native_1.NativeModules.RNPurchases) {');
  });

  // A call made while the library loads (say, at the top of its browser-mode
  // module, which it always imports) would throw at app start on iOS and
  // Android. Load it as a native build does and check it never asks the stub.
  it('loads react-native-purchases on native without touching the stub', () => {
    const touched: PropertyKey[] = [];
    jest.isolateModules(() => {
      jest.doMock(
        'react-native',
        () => ({
          NativeModules: { RNPurchases: { addListener: jest.fn(), removeListeners: jest.fn() } },
          NativeEventEmitter: class {
            addListener() {
              return { remove: jest.fn() };
            }
          },
          Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios },
        }),
        { virtual: true },
      );
      jest.doMock(MAPPINGS, () => {
        const { PurchasesCommon } = jest.requireActual(NATIVE_STUBS[MAPPINGS]);
        return {
          PurchasesCommon: new Proxy(PurchasesCommon, {
            get(target, key) {
              touched.push(key);
              return Reflect.get(target, key);
            },
          }),
        };
      });
      const Purchases = require('react-native-purchases').default;
      expect(typeof Purchases.configure).toBe('function');
    });
    expect(touched).toEqual([]);
  });
});
