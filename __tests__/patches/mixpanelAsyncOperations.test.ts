import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { ModuleKind, transpileModule } from 'typescript';

function loadSdk(platform: 'ios' | 'android') {
  const native = Object.fromEntries(
    [
      'track',
      'registerSuperProperties',
      'unregisterSuperProperty',
      'reset',
      'flush',
      'set',
      'setOnce',
      'unset',
      'union',
    ].map((method) => [method, jest.fn(() => Promise.resolve())]),
  );
  const exports: Record<string, any> = {};
  const source = readFileSync(
    resolve(__dirname, '../../node_modules/mixpanel-react-native/index.js'),
    'utf8',
  );
  const { outputText } = transpileModule(source, {
    compilerOptions: { module: ModuleKind.CommonJS, esModuleInterop: true },
  });
  runInNewContext(outputText, {
    exports,
    require: (id: string) => {
      if (id === 'react-native')
        return { Platform: { OS: platform }, NativeModules: { MixpanelReactNative: native } };
      if (id === './package.json') return { metadata: {}, version: 'test' };
      if (id === 'mixpanel-react-native/javascript/mixpanel-main') return {};
      throw new Error(`Unexpected SDK dependency: ${id}`);
    },
  });
  return { sdk: new exports.Mixpanel('test-token', false, true), native };
}

describe('installed Mixpanel async wrapper', () => {
  it('returns the underlying promises so tracking errors and ordering can be handled', async () => {
    const { sdk, native } = loadSdk('ios');
    const operations: [string, () => unknown][] = [
      ['track', () => sdk.track('First App Open', {})],
      ['registerSuperProperties', () => sdk.registerSuperProperties({ is_pro: false })],
      ['unregisterSuperProperty', () => sdk.unregisterSuperProperty('sample_rate')],
      ['reset', () => sdk.reset()],
      ['flush', () => sdk.flush()],
      ['set', () => sdk.getPeople().set({ platform: 'ios' })],
      ['setOnce', () => sdk.getPeople().setOnce({ first_app_open: '2026-10-02' })],
      ['unset', () => sdk.getPeople().unset('sample_rate')],
    ];
    for (const [method, invoke] of operations) {
      const completion = Promise.resolve();
      native[method].mockReturnValueOnce(completion);
      expect(invoke()).toBe(completion);
      await completion;
    }
  });

  it.each(['ios', 'android'] as const)(
    'updates feature adoption once on %s and returns completion',
    async (platform) => {
      const { sdk, native } = loadSdk(platform);
      const completion = Promise.resolve();
      native.union.mockReturnValueOnce(completion);
      expect(sdk.getPeople().union('features_used', ['goals'])).toBe(completion);
      await completion;
      expect(native.union).toHaveBeenCalledTimes(1);
      expect(native.union).toHaveBeenCalledWith(
        'test-token',
        ...(platform === 'ios' ? [{ features_used: ['goals'] }] : ['features_used', ['goals']]),
      );
    },
  );
});
