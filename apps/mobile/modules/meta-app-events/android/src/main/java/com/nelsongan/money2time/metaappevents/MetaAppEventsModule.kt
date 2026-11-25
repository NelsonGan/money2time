package com.nelsongan.money2time.metaappevents

import android.app.Application
import com.facebook.FacebookSdk
import com.facebook.LoggingBehavior
import com.facebook.appevents.internal.ActivityLifecycleTracker
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Meta app events for ad measurement: the SDK's automatic install and
 * app-launch events, nothing else. The SDK's own startup provider is removed
 * from the manifest (plugins/withMetaAppEvents.js), so the SDK does not load
 * at all, and makes no request, until JavaScript calls `start()`
 * (services/metaAppEvents.ts decides when). The manifest ships the app ID and
 * client token with automatic logging, automatic advanced matching and
 * advertising-ID collection off; the AD_ID permission stays blocked.
 */
class MetaAppEventsModule : Module() {
  private var started = false

  override fun definition() = ModuleDefinition {
    Name("MetaAppEvents")

    AsyncFunction("start") { debug: Boolean ->
      if (started) return@AsyncFunction true
      val application =
        appContext.reactContext?.applicationContext as? Application ?: return@AsyncFunction false
      if (debug) {
        FacebookSdk.setIsDebugEnabled(true)
        FacebookSdk.addLoggingBehavior(LoggingBehavior.APP_EVENTS)
        FacebookSdk.addLoggingBehavior(LoggingBehavior.REQUESTS)
      }
      // The SDK's startup provider normally does this at launch.
      @Suppress("DEPRECATION")
      FacebookSdk.sdkInitialize(application)
      FacebookSdk.setAdvertiserIDCollectionEnabled(false)
      // No automatic advanced matching (it reads what people type into
      // fields) and no product-improvement logging: launches and installs only.
      FacebookSdk.setAutoLogMetaDataEnabled(false)
      FacebookSdk.setAutoLogProductImprovementEnabled(false)
      // Starts lifecycle tracking. The install ping goes out when the settings
      // fetch that sdkInitialize began finishes (the SDK calls activateApp
      // itself then); calling activateApp here too would race it and send the
      // install twice.
      FacebookSdk.setAutoLogAppEventsEnabled(true)
      FacebookSdk.fullyInitialize()
      // Tracking starts after this launch's activity resumed, so report that
      // resume here; later foregrounds report themselves.
      appContext.currentActivity?.let { ActivityLifecycleTracker.onActivityResumed(it) }
      started = true
      true
    }.runOnQueue(Queues.MAIN)

    // Nothing to switch off: without `start()` the SDK never loads on Android.
    AsyncFunction("disable") {}
  }
}
