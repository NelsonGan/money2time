package com.nelsongan.money2time.metaappevents

import android.app.Application
import com.facebook.FacebookSdk
import com.facebook.LoggingBehavior
import com.facebook.appevents.AppEventsLogger
import com.facebook.appevents.internal.ActivityLifecycleTracker
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Meta app events for ad measurement: the SDK's automatic install and
 * app-launch events, nothing else. The manifest (plugins/withMetaAppEvents.js)
 * ships the app ID and client token with auto-init, automatic logging and
 * advertising-ID collection off, so the SDK's startup provider initializes it
 * locally but sends nothing until JavaScript calls `start()`
 * (services/metaAppEvents.ts decides when). The AD_ID permission stays blocked.
 */
class MetaAppEventsModule : Module() {
  private var started = false

  override fun definition() = ModuleDefinition {
    Name("MetaAppEvents")

    AsyncFunction("start") { debug: Boolean ->
      if (started) return@AsyncFunction true
      val application =
        appContext.reactContext?.applicationContext as? Application ?: return@AsyncFunction false
      FacebookSdk.setAdvertiserIDCollectionEnabled(false)
      // No automatic advanced matching (it reads what people type into
      // fields) and no product-improvement logging: launches and installs only.
      FacebookSdk.setAutoLogMetaDataEnabled(false)
      FacebookSdk.setAutoLogProductImprovementEnabled(false)
      if (debug) {
        FacebookSdk.setIsDebugEnabled(true)
        FacebookSdk.addLoggingBehavior(LoggingBehavior.APP_EVENTS)
        FacebookSdk.addLoggingBehavior(LoggingBehavior.REQUESTS)
      }
      FacebookSdk.setAutoLogAppEventsEnabled(true)
      FacebookSdk.setAutoInitEnabled(true)
      FacebookSdk.fullyInitialize()
      AppEventsLogger.activateApp(application)
      // Tracking starts after this launch's activity resumed, so report that
      // resume here; later launches and foregrounds report themselves.
      appContext.currentActivity?.let { ActivityLifecycleTracker.onActivityResumed(it) }
      started = true
      true
    }

    // The SDK remembers both switches across launches; turn them off when this
    // launch may not measure, so it never starts or sends on its own.
    AsyncFunction("disable") {
      if (!started) {
        FacebookSdk.setAutoInitEnabled(false)
        FacebookSdk.setAutoLogAppEventsEnabled(false)
      }
    }
  }
}
