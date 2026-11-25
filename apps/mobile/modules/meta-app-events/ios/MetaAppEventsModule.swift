import ExpoModulesCore
import FBSDKCoreKit
import UIKit

/**
 Meta app events for ad measurement: the SDK's automatic install and app-launch
 events, nothing else. Info.plist (plugins/withMetaAppEvents.js) ships the app ID
 and client token with automatic logging and advertiser-ID collection off, and
 the iOS SDK never starts by itself, so nothing reaches Meta until JavaScript
 calls `start()` (services/metaAppEvents.ts decides when). The app never asks for
 App Tracking Transparency, so the SDK reports through SKAdNetwork and
 Aggregated Event Measurement only.
 */
public class MetaAppEventsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MetaAppEvents")

    AsyncFunction("start") { (debug: Bool) -> Bool in
      MetaAppEventsState.start(debug: debug)
    }.runOnQueue(.main)

    AsyncFunction("disable") {
      MetaAppEventsState.disable()
    }.runOnQueue(.main)
  }
}

enum MetaAppEventsState {
  private(set) static var started = false
  /// A URL the app was opened with before `start()`, such as an ad's deep link
  /// on a cold launch, handed to the SDK once it starts (AEM reads it).
  private static var pendingURL: (URL, [UIApplication.OpenURLOptionsKey: Any])?

  static func start(debug: Bool) -> Bool {
    if started { return true }
    guard Bundle.main.object(forInfoDictionaryKey: "FacebookAppID") is String else { return false }
    let settings = Settings.shared
    settings.isAdvertiserIDCollectionEnabled = false
    settings.isAutoLogAppEventsEnabled = true
    if debug {
      settings.enableLoggingBehavior(.appEvents)
      settings.enableLoggingBehavior(.networkRequests)
    }
    ApplicationDelegate.shared.initializeSDK()
    started = true
    // The SDK logs a launch when the app becomes active. This launch already
    // did, before JavaScript ran, so log it here; later ones log themselves.
    if UIApplication.shared.applicationState == .active {
      AppEvents.shared.activateApp()
    }
    if let (url, options) = pendingURL {
      pendingURL = nil
      _ = ApplicationDelegate.shared.application(UIApplication.shared, open: url, options: options)
    }
    return true
  }

  /// The SDK remembers the automatic-logging switch across launches; turn it
  /// off when this launch may not measure, so it never sends on its own.
  static func disable() {
    pendingURL = nil
    guard !started else { return }
    Settings.shared.isAutoLogAppEventsEnabled = false
  }

  static func handle(_ app: UIApplication, url: URL, options: [UIApplication.OpenURLOptionsKey: Any]) {
    if started {
      _ = ApplicationDelegate.shared.application(app, open: url, options: options)
    } else {
      pendingURL = (url, options)
    }
  }
}

/// Passes opened URLs to the SDK so Aggregated Event Measurement can read an
/// ad's deep-link parameters. It never claims a URL: the app's own linking
/// still handles every one.
public class MetaAppEventsAppDelegate: ExpoAppDelegateSubscriber {
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    MetaAppEventsState.handle(app, url: url, options: options)
    return false
  }
}
