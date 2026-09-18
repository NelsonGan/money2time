// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../plugins/withXcode27Compat') as {
  addSceneDelegate: (contents: string) => string;
  addSceneManifest: (plist: Record<string, unknown>) => Record<string, unknown>;
  addPodfilePostInstall: (contents: string) => string;
};

const APP_DELEGATE = `import Expo

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins
}
`;

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
  describe('addSceneDelegate', () => {
    it('inserts a SceneDelegate that adopts the AppDelegate window', () => {
      const out = plugin.addSceneDelegate(APP_DELEGATE);
      expect(out).toContain('class SceneDelegate: UIResponder, UIWindowSceneDelegate');
      expect(out).toContain('appWindow.windowScene = windowScene');
      // Deep links and Universal Links must still reach the AppDelegate.
      expect(out).toContain('openURLContexts');
      expect(out).toContain('continue userActivity');
      expect(out.indexOf('class SceneDelegate')).toBeLessThan(
        out.indexOf('class ReactNativeDelegate'),
      );
    });

    it('starts React in didFinishLaunching only for the dev client', () => {
      const out = plugin.addSceneDelegate(APP_DELEGATE);
      // AppDelegate: the template's call is kept, but behind the dev-launcher check.
      expect(out).toMatch(
        /#if canImport\(EXDevLauncher\)\n.*\n\s*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)\n#endif/,
      );
      // SceneDelegate: a store build starts React with the cold-start URL rebuilt.
      expect(out).toMatch(
        /#if !canImport\(EXDevLauncher\)\n\s*appDelegate\.reactNativeFactory\?\.startReactNative\([\s\S]*launchOptions: Self\.launchOptions\(from: connectionOptions\)\)\n#endif/,
      );
      expect(out).toContain('"UIApplicationLaunchOptionsURLKey"');
    });

    it('is idempotent', () => {
      const once = plugin.addSceneDelegate(APP_DELEGATE);
      expect(plugin.addSceneDelegate(once)).toBe(once);
    });

    it('fails loudly when the template anchors move', () => {
      expect(() => plugin.addSceneDelegate('public class AppDelegate {}')).toThrow(
        /ReactNativeDelegate/,
      );
      expect(() =>
        plugin.addSceneDelegate('class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {\n}\n'),
      ).toThrow(/didFinishLaunching/);
    });
  });

  describe('addSceneManifest', () => {
    it('declares a single scene backed by SceneDelegate', () => {
      const plist = plugin.addSceneManifest({ CFBundleName: 'x' });
      expect(plist.CFBundleName).toBe('x');
      expect(plist.UIApplicationSceneManifest).toEqual({
        UIApplicationSupportsMultipleScenes: false,
        UISceneConfigurations: {
          UIWindowSceneSessionRoleApplication: [
            {
              UISceneConfigurationName: 'Default Configuration',
              UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
            },
          ],
        },
      });
    });

    it('leaves an existing manifest alone', () => {
      const existing = { UIApplicationSceneManifest: { custom: true } };
      expect(plugin.addSceneManifest(existing)).toBe(existing);
    });
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
