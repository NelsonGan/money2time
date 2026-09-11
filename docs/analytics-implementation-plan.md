# Analytics sampling and GA4 implementation plan

## Goals

1. Reduce tracked analytics volume by 50% without breaking funnels, retention,
   or per-user journeys.
2. Send the sampled cohort to both Mixpanel and Google Analytics 4 (GA4) with
   the same identity, event semantics, and user traits.
3. Keep analytics best-effort: missing native modules or provider configuration
   must never block startup or an app action.

## Sampling design

Sampling is deterministic at the anonymous app-user level. The app hashes the
versioned string `money2time-analytics-sample-v1:<appUserId>` with SHA-256 and
maps the first 32 bits to the interval `[0, 1)`. A value below `0.5` is included.

This is cohort sampling rather than an independent random decision per event:

- included users send their complete event stream to both providers;
- excluded users send no custom, automatic, screen, identity, or profile data;
- the same user remains in the same cohort across launches and in-app data
  resets because `appUserId` is preserved by those resets;
- aggregate counts may be estimated with a weight of `1 / 0.5 = 2`, while
  funnels and event sequences remain internally consistent;
- the versioned hash namespace freezes the cohort definition and avoids an
  accidental reshuffle when implementation details change.

Every sampled custom event includes the sampling probability. Mixpanel uses
`sample_rate: 0.5`; GA4 uses `sampling_rate: 0.5` because its mobile SDK
silently drops `sample_rate` despite that name being absent from the published
reserved-name list. Sampled users also receive the provider-specific field as
a profile/user property. This makes the reporting weight explicit.

## GA4 integration

Use `@react-native-firebase/app` and `@react-native-firebase/analytics`. Expo's
Firebase JavaScript SDK cannot provide native mobile Analytics. The app already
uses development builds and native modules, so React Native Firebase fits the
existing build model.

Native configuration:

- Android app id: `com.nelsongan.money2time`
- production/preview iOS bundle id: `com.nelsongan.money2time`
- development iOS bundle id: `com.nelsongan.money2time.dev`
- native Analytics auto-collection disabled until the JavaScript layer resolves
  the sample cohort;
- automatic native screen reporting disabled because React Native navigation
  runs in a single native activity/view controller;
- iOS Analytics built without advertising-ID support so analytics alone does
  not introduce an App Tracking Transparency requirement.
- Android Advertising ID collection and its merged Advertising ID permissions
  are disabled; ad storage, ad user data, and ad personalization default off
  while product measurement and attribution remain available;
- iOS uses static frameworks and CocoaPods for React Native Firebase
  (`disableSPM: true`), which is compatible with ExpoModulesCore's static
  native dependencies.

Provider behavior:

- `identifyUser` resolves sampling first, enables GA4 only for included users,
  and sets the same non-PII `appUserId` in GA4 and Mixpanel;
- existing display names remain unchanged in Mixpanel;
- GA4 event and property names are deterministic lowercase snake_case versions
  that preserve camelCase word boundaries, and are validated to start with a
  letter and stay within the provider limits;
- null/undefined parameters are dropped, booleans are encoded as `1`/`0`, and
  strings are capped at GA4's standard 100-character event-parameter limit;
- `setCurrentScreen` continues to set Mixpanel context and additionally logs a
  GA4 `screen_view` with matching `screen_name` and `screen_class`;
- stable app traits and Pro state are mirrored to GA4 user properties. Screen
  name remains event context rather than a user property;
- GA4 batching is left to the native SDK. `flushAnalytics` flushes Mixpanel,
  which is the only provider exposing an explicit flush operation.

## Configuration and credentials

The Firebase project must be linked to a GA4 property. The repository then
needs the Firebase client configuration files for each registered app:

- `google-services.json` for Android;
- `GoogleService-Info.plist` for production/preview iOS;
- `GoogleService-Info.dev.plist` for the development iOS bundle.

These files contain client/project identifiers, not service-account private
keys. The Expo config chooses the appropriate iOS file from `APP_VARIANT`.

An authenticated Google CLI session is sufficient for Firebase app registration,
SDK-config downloads, and the Firebase-to-GA4 link when that Google identity has
access to both resources. No service-account key or Analytics secret belongs in
the app. Google Analytics account access is managed separately from Cloud IAM;
the Analytics Admin API also needs an OAuth token with an Analytics scope such
as `analytics.edit` if custom report definitions are managed through a CLI.

The Firebase project and all three native apps are registered in
`money2time-expo`. It is linked to the dedicated GA4 property
`money2time-expo` (property ID `553783025`) in Analytics account `350740029`;
Firebase provisioned a separate data stream for each native app.

## Verification

Automated checks:

- deterministic membership and boundary behavior;
- approximately half of a large synthetic ID population is selected;
- every event maps to a unique GA4-valid name;
- parameter and user-property normalization respects GA4 limits;
- typecheck, lint, formatting, and the full Jest suite;
- Expo config resolution for production and development variants;
- iOS and Android native prebuild/config-plugin generation.

Live verification completed on the Android development client:

- the device's normal anonymous ID resolved to the excluded cohort, and verbose
  Firebase logs confirmed collection stayed disabled;
- a disposable emulator database was assigned a known included ID, after which
  Firebase logs confirmed collection was enabled;
- GA4 DebugView showed `first_open`, `session_start`, the manually emitted
  `screen_view`, the same pseudonymous user ID, and stable user properties;
- a real `m2t_account_created` custom event appeared in DebugView with
  `current_screen`, `type`, and `sampling_rate: 0.5`;
- the live check found that GA's mobile SDK drops `sample_rate`; the central
  normalizer was updated and the retained `sampling_rate: 0.5` value was then
  confirmed in DebugView;
- no development-only sampling override was added to the app.

The iOS development client also built, installed, and reached the running app.
The Android native build, install, Firebase initialization, and JavaScript
bundle completed successfully; later Android UI interaction was limited by
system-wide emulator ANRs that also affected unrelated system processes.

## Rollout and reporting

The sampling version and rate are constants and should change only deliberately.
Dashboards that report estimated population event counts should apply a ×2
weight. Unique-user and funnel percentages should be computed directly within
the sampled cohort; multiplying those ratios would be incorrect. Compare the
first release's observed included-user share and platform mix with the prior
population before relying on weighted totals.
