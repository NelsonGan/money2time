/**
 * Keeps the iOS project building on Xcode 27 / the iOS 27 SDK. `ios/` is
 * generated, so each of these would otherwise be lost on the next
 * `expo prebuild --clean`:
 *
 * 1. Pod deployment targets. Xcode 27 refuses any target below iOS 15, and
 *    several pods still declare 9.0-13.4; they are aligned with the app's own.
 *
 * 2. RevenueCat's `PaywallColor`. Swift 6.4 synthesizes a memberwise
 *    `init(stringRepresentation:)` because the optional `var _underlyingColor`
 *    now defaults to nil, which collides with the SDK's public initializer.
 *    A `let` carries no implicit default, so nothing is synthesized. Remove
 *    once RevenueCat ships the fix upstream.
 *
 * The UIScene lifecycle the iOS 27 SDK requires used to be added here too.
 * Expo SDK 58's template does it natively: its `SceneDelegate` subclasses
 * `ExpoAppSceneDelegate`, which starts React Native, rebuilds the launch
 * options `Linking.getInitialURL()` reads from the scene's connection options
 * (so a widget or Shortcut cold start still delivers its link), and forwards
 * URLs, user activities and quick actions to the AppDelegate.
 *
 * The transform is idempotent and valid on older Xcode versions too.
 */
const { withPodfile } = require('@expo/config-plugins');

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
  return withPodfile(config, (cfg) => {
    cfg.modResults.contents = addPodfilePostInstall(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withXcode27Compat;
module.exports.addPodfilePostInstall = addPodfilePostInstall;
