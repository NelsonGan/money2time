# Analytics integration notes

[analytics-tracking.md](analytics-tracking.md) is the **single source of truth** for current Mixpanel and Google Analytics tracking. Its tables own event names, destinations, triggers, frequency, payloads, user state, paywall sources, adoption thresholds, retired tracking and Mixpanel usage monitoring. Update those tables in the same change as the implementation. This document covers integration, native setup and verification; keep event inventories in the canonical document only.

## Implementation map

- `services/analytics.shared.ts` defines the typed custom events, destination groups, GA4 converters, feature-use rules, transaction thresholds and Pro profile builder.
- `services/analytics.native.ts` identifies/configures both providers, queues work until identity is ready, routes events, records first uses and transaction milestones, and logs visible screens.
- `services/analytics.ts` is the web/unsupported-platform no-op fallback.
- `context/AppContext.tsx` and `context/ProContext.tsx` sync installation identity, settings and subscription state. Features emit tracking through the shared analytics API.
- The native layer remembers adoption state in AsyncStorage; the canonical tables explain cohort eligibility and the persistent volume budget.

## GA4 integration

Use `@react-native-firebase/app` and `@react-native-firebase/analytics`. Expo's
Firebase JavaScript SDK cannot provide native mobile Analytics. The app already
uses development builds and native modules, so React Native Firebase fits the
existing build model.

Native configuration:

- Android app id: `com.nelsongan.money2time`
- production/preview iOS bundle id: `com.nelsongan.money2time`
- development iOS bundle id: `com.nelsongan.money2time.dev`
- native Analytics auto-collection disabled until the JavaScript layer has the
  pseudonymous app-user identity, explicitly grants analytics storage, denies
  all advertising consent, and then enables collection for every user;
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

- `identifyUser` configures GA4 consent and identity, then identifies Mixpanel,
  using the same non-PII `appUserId` in both; events tracked earlier are held
  until identification, base profile writes and retired-property cleanup finish.
  A rejected Mixpanel identity attempt skips Mixpanel writes and retries on the
  next operation; GA4 event sends remain independent of Mixpanel sends;
- no analytics prompt or preference is shown; GA4 product measurement is enabled
  by default while financial records remain excluded from event properties;
- development builds set the GA4 `debug_mode` default event parameter so the
  property-level Developer Traffic filter can keep QA data out of reports.
  Production explicitly clears the persisted key with `{ debug_mode: null }`;
- GA4 event and property names are deterministic lowercase `snake_case`
  versions of the Mixpanel display names, prefixed `m2t_`, that preserve
  camelCase word boundaries, and are validated to start with a letter and stay
  within the provider limits (a test fails if an event name would be cut to fit
  GA4's 40 characters);
- null/undefined parameters are dropped, booleans are encoded as `1`/`0`, and
  strings are capped at GA4's standard 100-character event-parameter limit;
- `setCurrentScreen` logs a GA4 `screen_view` with matching `screen_name` and
  `screen_class`, and becomes the `current_screen` of later events;
- stable app traits and Pro state are mirrored to GA4 user properties. Screen
  name remains event context rather than a user property;
- GA4 batching is left to the native SDK. `flushAnalytics` flushes Mixpanel,
  which is the only provider exposing an explicit flush operation.

The installed Mixpanel 3.3.0 wrapper discards completion promises from several
operations and calls iOS `People.union` twice. The repository's
[postinstall patch](../patches/mixpanel-react-native+3.3.0.patch) returns those
promises and makes union a single operation; keep it until an SDK upgrade
provides both fixes. The canonical provider table owns the resulting behavior.

Identity contract:

- `settings.appUserId` is the canonical pseudonymous identifier shared by GA4,
  Mixpanel, and RevenueCat;
- it is generated locally as `m2t_<random UUID>`, contains no name, email,
  advertising identifier, or financial data, and is never exported in backups;
- in-app data resets and backup restores preserve the current installation's ID
  so analytics and subscription history do not fragment;
- uninstalling the app removes the database and therefore rotates the ID on the
  next install, which is also what makes that launch a `First App Open`. Store
  purchase restoration remains the recovery path because Money2Time has no
  login account that could provide a cross-device identity.

## Configuration and credentials

The Firebase project must be linked to a GA4 property. The repository then
needs the Firebase client configuration files for each registered app:

- `google-services.json` for Android;
- `GoogleService-Info.plist` for production/preview iOS;
- `GoogleService-Info.dev.plist` for the development iOS bundle.

These files contain client/project identifiers, not service-account private
keys. The Expo config chooses the appropriate iOS file from `APP_VARIANT`.

Mixpanel is enabled by `EXPO_PUBLIC_MIXPANEL_TOKEN`; without it the app sends
Mixpanel nothing and warns once in development.

The checked-in client configuration targets `money2time-expo` and matches all
three native app identifiers. Earlier setup notes record the dedicated GA4
property `Money2Time Mobile App` (property ID `553783025`) in Analytics account
`350740029`, with a data stream for each native app. Live linking, data streams
and the Developer Traffic filter were not reverified in this review; see the
canonical provider table for verification limits.

## Verification

Automated checks:

- `analyticsTrackingPlan.test.ts`: the canonical table and implementation agree on every custom event, exact provider names/routing, coverage counts, feature adoption triggers/exclusions and transaction thresholds;

- `analyticsEvents.test.ts`: every event is in exactly one routing group, the
  purchase funnel and the usage milestones stay in Mixpanel and data maintenance
  stays out, no event name starts with `$`, the `days_since_install`
  arithmetic, which events count as a feature use, reading the stored usage
  record, and GA4 naming (never truncated) and parameter limits;
- `analyticsNative.test.ts`: automatic events off, every user identified in
  Mixpanel, GA4-only events kept out of Mixpanel, early events held until
  identify completes, identity retries, independent GA4 sends, async error
  handling and profile sync success/failure, `days_since_install` and `first_app_open`, the retired super
  property cleanup, and first uses and transaction milestones reported once per
  new install and remembered across launches, while older installs only fill
  in `features_used`;
- `mixpanelAsyncOperations.test.ts`: load the installed SDK wrapper and verify
  promise propagation and one union operation on iOS/Android;
- `firstTransactionSignal.test.ts`: failed and overlapping saves do not lose or
  duplicate activation, and existing expense/income history suppresses it;
- `newInstallSignal.test.ts`: `isNewInstall` is true exactly once per install;
- `paywallAnalytics.test.ts`: paywall variants and the purchase properties;
- `proAnalyticsProfile.test.ts` and `revenueCatRestore.test.ts`: the trial
  period type and the readable error code;
- typecheck, lint, formatting, and the full Jest suite.

## Reporting and rollout

Use the [canonical tracking tables](analytics-tracking.md#monitor-mixpanel-usage) to monitor volume and attribution, and its [retired tracking table](analytics-tracking.md#retired-tracking) to migrate older reports. Keep pre-release sampled data separate from the unsampled population.

RevenueCat's native GA4 and Mixpanel integrations were activated on 2026-10-02.
The app now syncs its real Firebase installation ID and stable Mixpanel identity
to RevenueCat, with retries and customer-switch coordination. Production GA4
stream rules retain SDK store events as supplemental observations after the
client confirms that identity sync. The canonical [revenue tables](analytics-tracking.md#revenue-measurement)
own the exact server names, external settings, duplicate-control rules,
credential status, Mixpanel volume impact and remaining release/receipt checks.
The GA4 integration does not implement refund-adjusted totals or historical
backfill; RevenueCat remains the financial source of truth.
