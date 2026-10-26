import { readFileSync } from 'node:fs';
import path from 'node:path';

const plugin = require('../../plugins/withXcode27Compat') as {
  addPodfilePostInstall: (contents: string) => string;
};

const PODFILE = `target 'Money2TimeDev' do
  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
  end
end
`;

describe('withXcode27Compat', () => {
  // The plugin used to add the UIScene lifecycle; Expo SDK 58's template does
  // it, through ExpoAppSceneDelegate. This fails if a later Expo stops
  // rebuilding the launch options Linking.getInitialURL() reads, which is what
  // lets a widget or Shortcut cold start deliver its link.
  it('relies on Expo rebuilding cold-start launch options from the scene', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../node_modules/expo/ios/Expo/ExpoAppSceneDelegate.swift'),
      'utf8',
    );
    expect(source).toContain('connectionOptions.urlContexts.first?.url');
    expect(source).toMatch(/startReactNative\([\s\S]*launchOptions: Self\.launchOptions\(/);
    expect(source).toContain('func scene(_ scene: UIScene, openURLContexts');
    expect(source).toContain('func scene(_ scene: UIScene, continue userActivity');
  });

  describe('addPodfilePostInstall', () => {
    it('runs after react_native_post_install, inside post_install', () => {
      const out = plugin.addPodfilePostInstall(PODFILE);
      const rnCall = out.indexOf('react_native_post_install(');
      const targets = out.indexOf("config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']");
      const revenueCat = out.indexOf('fileprivate let _underlyingColor');
      expect(targets).toBeGreaterThan(rnCall);
      expect(revenueCat).toBeGreaterThan(targets);
      expect(revenueCat).toBeLessThan(out.lastIndexOf('  end\nend'));
    });

    it('is idempotent', () => {
      const once = plugin.addPodfilePostInstall(PODFILE);
      expect(plugin.addPodfilePostInstall(once)).toBe(once);
    });

    it('fails loudly when there is no post_install hook to extend', () => {
      expect(() => plugin.addPodfilePostInstall("target 'x' do\nend\n")).toThrow(
        /react_native_post_install/,
      );
    });
  });
});
