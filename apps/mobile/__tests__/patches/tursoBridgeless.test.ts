import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Cloud Sync's Turso replica on React Native 0.88.
 *
 * @tursodatabase/sync-react-native 0.8.3 installs its JSI bindings through
 * `RCTCxxBridge` (iOS) and `getCatalystInstance()` (Android). React Native 0.88
 * is bridgeless: the iOS code does not compile and the Android call fails, so
 * `install()` returns false and Cloud Sync cannot open its replica.
 *
 * patches/@tursodatabase+sync-react-native+0.8.3.patch makes the iOS module a
 * TurboModule that installs in `installJSIBindingsWithRuntime` (React Native
 * calls it only for modules that provide `getTurboModule:`), and reads the
 * runtime and call invoker from the ReactContext on Android. This reads the
 * installed package, so an upgrade that drops the patch fails here instead of
 * on a device.
 */

const ROOT = path.resolve(__dirname, '../../node_modules/@tursodatabase/sync-react-native');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

describe('@tursodatabase/sync-react-native on bridgeless React Native', () => {
  it('installs on iOS without the removed bridge', () => {
    const module = read('ios/TursoModule.mm');
    expect(module).not.toMatch(/RCTCxxBridge \*/);
    expect(module).toContain('installJSIBindingsWithRuntime');
    expect(module).toContain('getTurboModule:');
    expect(module).toContain('ObjCInteropTurboModule');
  });

  it('installs on Android without the catalyst instance', () => {
    const bridge = read('android/src/main/java/com/turso/sync/reactnative/TursoBridge.java');
    expect(bridge).not.toContain('getCatalystInstance');
    expect(bridge).toContain('context.getJSCallInvokerHolder()');
  });
});
