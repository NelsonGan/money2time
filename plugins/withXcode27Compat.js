/**
 * Keeps the iOS project building and launching on Xcode 27 / the iOS 27 SDK.
 * `ios/` is generated, so each of these would otherwise be lost on the next
 * `expo prebuild --clean`:
 *
 * 1. UIScene lifecycle. An app linked against the iOS 27 SDK that has not
 *    adopted scenes is trapped by UIKit at launch
 *    (`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`). Where
 *    React starts depends on whether expo-dev-launcher is linked (it is
 *    `debugOnly`, so `canImport(EXDevLauncher)` answers that per build):
 *    - Dev client: React must start in `didFinishLaunching`, before `super`.
 *      The launcher's `autoSetupPrepare` runs when the root view is created and
 *      its app-delegate subscriber throws if `autoSetupStart` gets there first.
 *      The launcher queues a cold-start link itself (pending deep link).
 *    - Store build: React starts in `scene(_:willConnectTo:)`, as Expo SDK 56's
 *      `ExpoAppSceneDelegate` does. Under scenes a cold-start URL arrives in the
 *      connection options, not the launch options, and `Linking.getInitialURL()`
 *      reads only the launch options, so they are rebuilt from the scene.
 *      Starting React earlier would lose the link a widget or Shortcut opened
 *      a killed app with.
 *    Either way the scene adopts the window AppDelegate built, and URLs and
 *    user activities (deep links, Universal Links, Google Sign-In) are
 *    forwarded to the AppDelegate, which a scene-based app otherwise never
 *    receives. Remove this once on Expo SDK 56+, whose template does it.
 *
 * 2. Pod deployment targets. Xcode 27 refuses any target below iOS 15, and
 *    several pods still declare 9.0-13.4; they are aligned with the app's own.
 *
 * 3. RevenueCat's `PaywallColor`. Swift 6.4 synthesizes a memberwise
 *    `init(stringRepresentation:)` because the optional `var _underlyingColor`
 *    now defaults to nil, which collides with the SDK's public initializer.
 *    A `let` carries no implicit default, so nothing is synthesized. Remove
 *    once RevenueCat ships the fix upstream.
 *
 * Every transform is idempotent and valid on older Xcode versions too.
 */
const { withAppDelegate, withInfoPlist, withPodfile } = require('@expo/config-plugins');

const SCENE_DELEGATE_MARKER = 'class SceneDelegate: UIResponder, UIWindowSceneDelegate';

const SCENE_DELEGATE_SWIFT = `// iOS 27 traps apps that have not adopted the UIScene lifecycle. See
// plugins/withXcode27Compat.js for why React starts here in a store build but
// in didFinishLaunching in a dev client.
${SCENE_DELEGATE_MARKER} {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let appWindow = appDelegate.window else {
      return
    }

    appWindow.windowScene = windowScene
    appWindow.frame = windowScene.coordinateSpace.bounds
#if !canImport(EXDevLauncher)
    appDelegate.reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: appWindow,
      launchOptions: Self.launchOptions(from: connectionOptions))
#endif
    appWindow.makeKeyAndVisible()
    window = appWindow

    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    if let userActivity = connectionOptions.userActivities.first {
      self.scene(scene, continue: userActivity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }

    for urlContext in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [
        .openInPlace: urlContext.options.openInPlace,
      ]
      if let sourceApplication = urlContext.options.sourceApplication {
        options[.sourceApplication] = sourceApplication
      }
      if let annotation = urlContext.options.annotation {
        options[.annotation] = annotation
      }
      _ = appDelegate.application(UIApplication.shared, open: urlContext.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }

  /// Rebuilds the launch options React Native's \`Linking.getInitialURL()\` reads, from the
  /// scene's connection options (where UIKit puts them under the scene lifecycle).
  static func launchOptions(
    from connectionOptions: UIScene.ConnectionOptions
  ) -> [UIApplication.LaunchOptionsKey: Any]? {
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsURLKey")] = url
    }
    if let activity = connectionOptions.userActivities.first(where: {
      $0.activityType == NSUserActivityTypeBrowsingWeb
    }) {
      launchOptions[UIApplication.LaunchOptionsKey(rawValue: "UIApplicationLaunchOptionsUserActivityDictionaryKey")] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]
    }
    return launchOptions.isEmpty ? nil : launchOptions
  }
}

`;

const REACT_NATIVE_DELEGATE_ANCHOR = 'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {';

// Expo's SDK 54 template starts React in didFinishLaunching.
const START_REACT_NATIVE =
  /\n([ \t]*)factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)/;

function addSceneDelegate(contents) {
  if (contents.includes(SCENE_DELEGATE_MARKER)) return contents;
  if (!contents.includes(REACT_NATIVE_DELEGATE_ANCHOR)) {
    throw new Error(
      'withXcode27Compat: AppDelegate.swift no longer declares ReactNativeDelegate; update the SceneDelegate anchor.',
    );
  }
  if (!START_REACT_NATIVE.test(contents)) {
    throw new Error(
      'withXcode27Compat: AppDelegate.swift no longer starts React Native in didFinishLaunching; update the plugin.',
    );
  }
  return contents
    .replace(
      START_REACT_NATIVE,
      (call) =>
        `\n#if canImport(EXDevLauncher)\n    // Dev client only; a store build starts React from SceneDelegate.${call}\n#endif`,
    )
    .replace(
      REACT_NATIVE_DELEGATE_ANCHOR,
      `${SCENE_DELEGATE_SWIFT}${REACT_NATIVE_DELEGATE_ANCHOR}`,
    );
}

function addSceneManifest(infoPlist) {
  if (infoPlist.UIApplicationSceneManifest) return infoPlist;
  return {
    ...infoPlist,
    UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    },
  };
}

const PODFILE_MARKER = '# withXcode27Compat';

const PODFILE_POST_INSTALL = `
    ${PODFILE_MARKER}: Xcode 27 rejects pod targets below iOS 15, and Swift 6.4
    # synthesizes an init that collides with RevenueCat's PaywallColor one.
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = podfile_properties['ios.deploymentTarget'] || '15.1'
      end
    end
    paywall_color = File.join(installer.sandbox.root, 'RevenueCat/Sources/Paywalls/PaywallColor.swift')
    if File.exist?(paywall_color)
      src = File.read(paywall_color)
      patched = src.sub('fileprivate var _underlyingColor: (any Sendable)?', 'fileprivate let _underlyingColor: (any Sendable)?')
      if patched != src
        File.chmod(0644, paywall_color)
        File.write(paywall_color, patched)
      end
    end
`;

// Expo's template closes post_install with the react_native_post_install call.
const POST_INSTALL_ANCHOR = /(\n\s*react_native_post_install\([\s\S]*?\n\s*\)\n)/;

function addPodfilePostInstall(contents) {
  if (contents.includes(PODFILE_MARKER)) return contents;
  if (!POST_INSTALL_ANCHOR.test(contents)) {
    throw new Error(
      'withXcode27Compat: Podfile has no react_native_post_install call to hook after.',
    );
  }
  return contents.replace(POST_INSTALL_ANCHOR, `$1${PODFILE_POST_INSTALL}`);
}

function withXcode27Compat(config) {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults = addSceneManifest(cfg.modResults);
    return cfg;
  });
  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withXcode27Compat: expected a Swift AppDelegate.');
    }
    cfg.modResults.contents = addSceneDelegate(cfg.modResults.contents);
    return cfg;
  });
  config = withPodfile(config, (cfg) => {
    cfg.modResults.contents = addPodfilePostInstall(cfg.modResults.contents);
    return cfg;
  });
  return config;
}

module.exports = withXcode27Compat;
module.exports.addSceneDelegate = addSceneDelegate;
module.exports.addSceneManifest = addSceneManifest;
module.exports.addPodfilePostInstall = addPodfilePostInstall;
