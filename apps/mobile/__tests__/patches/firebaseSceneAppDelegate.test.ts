/**
 * Firebase has to be configured in the AppDelegate before React starts, or
 * Google Analytics never initializes. @react-native-firebase/app's config
 * plugin inserts `FirebaseApp.configure()` above the line that starts React
 * Native. Expo SDK 58's scene-based template moved that call into
 * `SceneDelegate`, so the 26.4.0 plugin found no anchor, printed a prebuild
 * warning and silently left Firebase out.
 *
 * patches/@react-native-firebase+app+26.4.0.patch backports the 27.1.0 fix
 * (anchor on `return super.application(...)`). 27.x itself also moves iOS to
 * Swift Package Manager only, which the app opts out of (`disableSPM`). This
 * runs the installed plugin on the SDK 58 template, so it keeps holding after
 * an upgrade drops the patch.
 */

import path from 'node:path';

// Required by path: the package's `exports` map does not expose plugin/build.
const { modifySwiftAppDelegate } = require(
  path.resolve(
    __dirname,
    '../../node_modules/@react-native-firebase/app/plugin/build/ios/appDelegate.js',
  ),
) as { modifySwiftAppDelegate: (contents: string) => string };

// The AppDelegate.swift Expo SDK 58 generates.
const SDK_58_APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // The window is created and React Native is started by \`SceneDelegate\` under the
    // scene-based life cycle (required by the iOS 27 SDK).
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe('@react-native-firebase/app AppDelegate plugin', () => {
  it('configures Firebase in the Expo SDK 58 scene-based AppDelegate', () => {
    const out = modifySwiftAppDelegate(SDK_58_APP_DELEGATE);
    expect(out).toContain('import FirebaseCore');
    const configure = out.indexOf('FirebaseApp.configure()');
    expect(configure).toBeGreaterThan(out.indexOf('didFinishLaunchingWithOptions launchOptions'));
    expect(configure).toBeLessThan(out.indexOf('return super.application('));
  });

  it('adds Firebase only once', () => {
    const once = modifySwiftAppDelegate(SDK_58_APP_DELEGATE);
    expect(modifySwiftAppDelegate(once)).toBe(once);
  });
});
