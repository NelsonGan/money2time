# Analytics implementation plan

## Goals

1. Give Mixpanel a small, complete record of the install, activation and Pro
   purchase funnels, and of which features each user takes up, from every user.
   Mixpanel bills per event, so it gets the events that answer "where do users
   come from, do they activate, what do they use, and what gets them to pay".
   Product usage arrives as milestones (a feature's first use, a transaction
   count reached), never as an event per use.
2. Send Google Analytics 4 (GA4) the complete population and every event. GA4 is
   free, so it keeps the per-use telemetry (every feature use, sessions,
   retention, screen views) that Mixpanel does not receive.
3. Keep analytics best-effort: missing native modules or provider configuration
   must never block startup or an app action.

## Provider roles

|                  | Mixpanel                                                                        | GA4                                            |
| ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------------- |
| Users            | Every user (no sampling)                                                        | Every user                                     |
| Events           | `MIXPANEL_EVENTS` only: 25, each bounded per user                               | Every event in `AnalyticsEvents` (104)         |
| Automatic events | Off (`trackAutomaticEvents: false`)                                             | Its own `first_open`, `session_start`, etc.    |
| Screens          | `current_screen` property on each event                                         | `screen_view` per screen                       |
| User state       | People profile: Pro plan, trial state, install date, acquisition, features used | User properties: platform, Pro state, settings |

Mixpanel used to receive a deterministic 50% cohort of users, with every event
and the SDK's automatic mobile events. Two things drove the bill: `$ae_session`
fired on every app background, and per-use product events fired for everyone
in the cohort. Both are gone. Controlling volume by choosing events rather than
by dropping users means every paying user is in Mixpanel. Purchases are rare, so
sampling halved a conversion sample that was already small.

Mixpanel's billing excludes user profile updates and `$identify`/`$merge`, so
state (plan, trial, install date) lives on the profile rather than in events.
Automatic events count like any other, so they stay off. `First App Open`
replaces the only one worth keeping (`$ae_first_open`), and GA4's own session
reporting covers sessions.

## Event routing

Every event constant lives in `services/analytics.shared.ts`, in exactly one of
two groups:

- `MIXPANEL_EVENTS`: sent to Mixpanel and GA4.
- `GA4_ONLY_EVENTS`: sent to GA4 only.

`AnalyticsEvents` is the union call sites use, and `trackEvent` only accepts its
names. Placing a new event in a group is the decision about whether it is worth
paying for. An event belongs in Mixpanel when it answers an acquisition,
activation, adoption or revenue question and fires a bounded number of times per
user. A per-use event for a frequent action does not qualify even if the feature
matters: its first use already arrives as `Feature First Used` (add the feature
to `FEATURE_BY_EVENT` instead), every use is in GA4, and the Pro gate it
eventually hits arrives as `Pro Paywall Viewed` with the gate as its `source`.
Data maintenance (resets, imports, backups and restores) is GA4 only: it is not
product usage. `__tests__/services/analyticsEvents.test.ts` fails if the groups
overlap, the purchase funnel leaves Mixpanel, or a feature use is read from a
billed event.

`trackEvent` adds two properties to every event, in both providers:

- `current_screen`: the visible screen when the event was tracked.
- `days_since_install`: whole 24-hour periods since `settings.firstAppOpen`
  (day 0 is the first 24 hours). It makes "how long after install" readable on
  any event, including for users who installed before `First App Open` existed.

## Mixpanel events

### Install and activation

| Event                                                     | Fires when                                                                                                            | Properties                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `First App Open`                                          | The launch that creates the install's settings row, and with it its `appUserId` (`initializeDatabase().isNewInstall`) | `locale`, `currency_code`                                                                                 |
| `Onboarding Started`                                      | Get started on the welcome step                                                                                       |                                                                                                           |
| `Onboarding Backup Enabled` / `Onboarding Backup Skipped` | The backup step                                                                                                       | `target`, `pending` (enabled only)                                                                        |
| `Onboarding Source Selected`                              | The acquisition-source step (also written to the profile as `acquisition_source`)                                     | `source`                                                                                                  |
| `Onboarding Notifications Enabled`                        | The OS permission prompt was answered                                                                                 | `permission`: `granted`, `denied`, `undetermined` or `error`                                              |
| `Onboarding Notifications Skipped`                        | The notifications step was skipped                                                                                    |                                                                                                           |
| `Onboarding Completed`                                    | Onboarding finished; the intro paywall opens next                                                                     |                                                                                                           |
| `First Transaction Created`                               | The first expense or income the install logs                                                                          | `type`, `source`: `manual`, `voice`, `receipt`, `autolog`, `split`, `receipt_split` or `statement_import` |
| `Wage Config Updated`                                     | A wage is saved; this is what unlocks the time view                                                                   | `wage_type`                                                                                               |

`First Transaction Created` is checked once per session, before the entry's own
row lands, so it fires only when no expense or income exists yet. After a data
reset (`Data Reset` in GA4) it can fire again; funnels that count unique users
are unaffected.

### Product usage

| Event                           | Fires when                                                                                                      | Properties             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `Feature First Used`            | The install's first use of a feature                                                                            | `feature` (see below)  |
| `Transaction Milestone Reached` | The expenses and incomes the install has logged reach 10, 50, 100, 250, 500 or 1,000 (`TRANSACTION_MILESTONES`) | `count`: the milestone |

Each fires at most once per feature or milestone, so a user costs at most 23 of
these over the install's life, and `days_since_install` on each is the time it
took. Funnels such as `First App Open` → `Feature First Used` (`receipt_scan`) →
`Pro Purchase Completed`, or `Transaction Milestone Reached` (`count` 10) within
a week, answer which features and habits lead to Pro.

A use is the GA4 event listed below (`FEATURE_BY_EVENT` in
`services/analytics.shared.ts`), so a feature's adoption in Mixpanel and its
per-use volume in GA4 come from the same moment:

| `feature`         | A use is                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `receipt_scan`    | A receipt scan returned a result (`Receipt Scan Completed`)                                                                  |
| `voice_entry`     | A transaction saved from voice entry (`Voice Transaction Created`)                                                           |
| `autolog`         | A transaction created by the Shortcuts auto-log (`Autolog Transaction Created`)                                              |
| `back_tap`        | The app opened by an iOS Back Tap shortcut (`Back Tap Triggered`)                                                            |
| `widget`          | The app opened from a home-screen widget or shortcut link (`Widget Opened`), but not the live-earnings reminder notification |
| `live_earnings`   | A live-earnings Live Activity started (`Live Earnings Started`)                                                              |
| `time_display`    | The display switched to time (`Display Mode Toggled` with `mode: time`)                                                      |
| `split_bill`      | A bill split with someone else, when created or added in an edit (`Split Bill Created`)                                      |
| `split_by_item`   | An itemized receipt split saved (`Receipt Split Saved`)                                                                      |
| `settle_up_share` | A settle-up receipt shared (`Settle Up Receipt Shared`)                                                                      |
| `reimbursements`  | An expense flagged as reimbursable (`Reimbursement Flagged` with `reimbursable: true`)                                       |
| `recurring`       | A recurring rule created (`Recurring Rule Created`)                                                                          |
| `goals`           | A savings goal created (`Goal Created`)                                                                                      |
| `loans`           | A loan created (`Loan Created`)                                                                                              |
| `budgets`         | A budget template created (`Budget Template Created`)                                                                        |
| `albums`          | An album created (`Album Created`)                                                                                           |
| `items`           | An item created (`Item Created`)                                                                                             |

Both events come only from installs tracked since their first launch: the
`First App Open` of this release on. On an older install, the first use seen
after updating is not a first use, and a transaction count would start from
zero, so reporting either would be wrong. Every install, old or new, still adds
each feature it uses to the profile's `features_used` list, which is not billed,
so segments such as "uses receipt scanning" cover everyone.

The record lives on the device (`UsageState`, AsyncStorage key
`@m2t/analytics_usage/v1`): the features seen, and the count of expenses and
incomes the user has logged in the app (manual, voice, receipt, auto-log and
split entries; not recurring-rule rows, statement or backup imports, or
restores). It survives data resets. Reinstalling starts a new install with a
new `appUserId`.

### Pro purchase funnel

| Event                             | Fires when                                                                              | Properties                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Pro Paywall Viewed`              | The paywall opens                                                                       | `source`, `variant`: `plans`, `lifetime_upgrade` or `already_pro`                                                                               |
| `Pro Plans Unavailable`           | The paywall finished loading with nothing to buy (store unavailable, no offering)       | `source`, `variant`                                                                                                                             |
| `Pro Purchase Started`            | The purchase button is tapped                                                           | `source`, `plan`, `package`, `price`, `currency`, `has_free_trial`, `trial_duration`, `plan_selection` (`default` or `changed`), `upgrade_from` |
| `Pro Purchase Completed`          | The store confirmed the purchase and Pro is active                                      | As started, plus `period_type` from the store: `trial` means a trial really started                                                             |
| `Pro Purchase Pending`            | The store accepted the purchase but has not activated Pro yet                           | As started                                                                                                                                      |
| `Pro Purchase Cancelled`          | The user backed out of the store sheet                                                  | As started                                                                                                                                      |
| `Pro Purchase Failed`             | The store or SDK refused the purchase                                                   | As started, plus `reason` (action status) and `error_code` (RevenueCat's readable name, such as `StoreProblemError`)                            |
| `Pro Restore Started`             | Restore purchases is tapped                                                             | `source`                                                                                                                                        |
| `Pro Restore Completed`           | The store answered                                                                      | `source`, `found`                                                                                                                               |
| `Pro Restore Failed`              | The restore errored                                                                     | `source`, `reason`, `error_code`                                                                                                                |
| `Pro Limit Hit`                   | The account limit blocks a new transaction behind an alert, without opening the paywall | `type`, `active_account_count`                                                                                                                  |
| `Pro Cancel Sub Prompt Actioned`  | A subscriber who just bought Lifetime answers the cancel-your-subscription prompt       | `choice`: `cancel` or `not_now`                                                                                                                 |
| `Pro Redundant Sub Cancel Tapped` | A Lifetime owner with a still-renewing subscription taps cancel in Pro management       |                                                                                                                                                 |

`variant` is fixed when the paywall opens. Only `plans` is a free user who can
convert, so free-to-paid conversion rates should filter on it. `upgrade_from`
appears only when a current subscriber buys (in practice, moving to Lifetime).
`price` is in the store's local `currency`: use it to compare price points and
regional pricing, and take revenue itself from the stores.

Paywall `source` values:

| `source`                  | Entry point                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding`              | The paywall shown straight after onboarding                                                                                                                                                                               |
| `settings_banner`         | The upgrade card on Settings                                                                                                                                                                                              |
| `settings_subscription`   | The subscription tile on Settings, for a free user                                                                                                                                                                        |
| `app_lock`                | The App Lock tile on Settings, for a free user                                                                                                                                                                            |
| `pro_management`          | Pro management: Switch to Lifetime, or Upgrade after a lapse                                                                                                                                                              |
| `news`, `news_list`       | A feature-announcement call to action: the modal, or Settings > News                                                                                                                                                      |
| `insights_trend`          | A Pro trend on Insights                                                                                                                                                                                                   |
| `accounts_transaction`    | Upgrade on the account-limit block                                                                                                                                                                                        |
| A free-tier limit         | `accounts`, `categories`, `recurring`, `wage_entries`, `custom_logos`, `custom_item_images`, `subcurrencies`, `albums`, `items`, `budget_templates`, `receipts`, `split_bills`, `goals`, `loans`, `receipt_scan`, `voice` |
| A Pro-only feature        | `app_icon`, `custom_category_icons`, `custom_subscription_logos`, `icon_packs`, `live_earnings_auto_start`, `reimbursements`                                                                                              |
| `widget_<kind>`, `widget` | A home-screen widget's Pro call to action (iOS names the widget; Android sends `widget`)                                                                                                                                  |
| `unknown`                 | An entry point that passed no source: a bug to fix, not a real surface                                                                                                                                                    |

## Profile and super properties

Mixpanel People profile:

- `$name` (the `appUserId`) and `platform`, on every identify;
- Pro state from `buildProAnalyticsProfile`: `is_pro`, `pro_plan`,
  `pro_period_type` (`trial`, `intro`, `normal`, `prepaid`, `none` or
  `unknown`), `pro_renewing`, and the historical `pro_product_id`, `pro_since`,
  `pro_expires_at`. Written only when they change, compared by signature;
- `acquisition_source`, from onboarding;
- `first_app_open`, set once from `settings.firstAppOpen`, so every user
  (including those who installed before `First App Open`) has an install cohort;
- `features_used`, a list each feature joins the first time the install uses it
  (see Product usage).

Super properties, on every Mixpanel event: `is_pro`, `pro_plan`,
`pro_period_type`, `currency_code`, `locale`, `theme_mode`, `theme_color` and
`display_mode`. `current_screen` is stamped on each event by `trackEvent`
instead.

Earlier releases left two super properties persisted on the device: the
retired cohort's `sample_rate` (also on the profile) and `current_screen`,
which was registered on every navigation. The first identify after this
release removes them, keyed off the persisted values, so it runs once per
affected install.

## Purchase lifecycle after the app closes

Trial conversions, renewals, cancellations, billing issues and refunds happen
in the stores while the app is not running, often after a user has stopped
opening it. The app cannot report those reliably. RevenueCat's Mixpanel
integration sends them server-side, keyed by the same `appUserId`
(`Purchases.logIn` and `mp.identify` share it), so enabling it in the RevenueCat
dashboard completes the funnel without app changes. In the app,
`pro_period_type` shows who is mid-trial now, and `period_type` on
`Pro Purchase Completed` shows which purchases started one.

## What changed for existing reports

| Before                                                                                        | After                                                                                         |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `sample_rate: 0.5`, ×2 weighting for population estimates                                     | Removed. Data from this release on is the full population: do not weight it                   |
| `$ae_first_open`                                                                              | `First App Open`                                                                              |
| `$ae_session`, `$ae_updated`                                                                  | Removed (GA4 `session_start` covers sessions)                                                 |
| `Settings Updated`                                                                            | Removed. Settings state is in super properties and GA4 user properties                        |
| `Pro Lifetime Upgrade Viewed`                                                                 | `Pro Paywall Viewed` where `variant` is `lifetime_upgrade`                                    |
| `Pro Lifetime Upgrade Tapped`                                                                 | `Pro Paywall Viewed` where `source` is `pro_management`                                       |
| `Pro Lifetime Upgrade Completed`, `Pro Cancel Sub Prompt Viewed`                              | `Pro Purchase Completed` where `upgrade_from` is set and `plan` is `lifetime`                 |
| `Pro Redundant Sub Warning Viewed`                                                            | Profile: `pro_plan` is `lifetime` and `pro_renewing` is true                                  |
| `Pro Limit Hit` for a gate that opens the paywall                                             | `Pro Paywall Viewed` by `source`                                                              |
| `Pro Paywall Viewed` with `source: settings` (five surfaces)                                  | One `source` per surface (see the table above)                                                |
| `Settle Up Opened`, `Reimbursements Opened`, `Insights Drilldown Opened`                      | Removed; GA4 `screen_view` covers them                                                        |
| `Map Pin Tapped`, `Review Prompt Skipped`                                                     | Removed                                                                                       |
| Adoption read from per-use events (`Goal Created`, `Receipt Scan Started`, ...)               | `Feature First Used` by `feature` (new installs), or the profile's `features_used` (everyone) |
| `current_screen` super property                                                               | Still on every event, now set per event rather than persisted between launches                |
| Every other product event, including `Data Reset`, `Data Imported` and `Auto Backup Restored` | GA4 only, same name (`m2t_` snake case)                                                       |

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
  until it resolves;
- no analytics prompt or preference is shown; GA4 product measurement is enabled
  by default while financial records remain excluded from event properties;
- development builds set the GA4 `debug_mode` default event parameter so the
  property-level Developer Traffic filter can keep QA data out of reports;
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

The Firebase project and all three native apps are registered in
`money2time-expo`. It is linked to the dedicated GA4 property
`Money2Time Mobile App` (property ID `553783025`) in Analytics account `350740029`;
Firebase provisioned a separate data stream for each native app.

## Verification

Automated checks:

- `analyticsEvents.test.ts`: every event is in exactly one routing group, the
  purchase funnel and the usage milestones stay in Mixpanel and data maintenance
  stays out, no event name starts with `$`, the `days_since_install`
  arithmetic, which events count as a feature use, reading the stored usage
  record, and GA4 naming (never truncated) and parameter limits;
- `analyticsNative.test.ts`: automatic events off, every user identified in
  Mixpanel, GA4-only events kept out of Mixpanel, early events held until
  identify, `days_since_install` and `first_app_open`, the retired super
  property cleanup, and first uses and transaction milestones reported once per
  new install and remembered across launches, while older installs only fill
  in `features_used`;
- `newInstallSignal.test.ts`: `isNewInstall` is true exactly once per install;
- `paywallAnalytics.test.ts`: paywall variants and the purchase properties;
- `proAnalyticsProfile.test.ts` and `revenueCatRestore.test.ts`: the trial
  period type and the readable error code;
- typecheck, lint, formatting, and the full Jest suite.

## Rollout and reporting

- From the release date, Mixpanel user counts roughly double (the full
  population rather than half) while event volume drops, because the automatic
  events and product telemetry are gone. Weight pre-release data ×2 for
  population estimates as before; never weight post-release data.
- Update saved reports that use the retired events with the mapping above.
- For install cohorts that span the release, use the profile's `first_app_open`
  rather than `First App Open`, which exists only for installs from this
  release on. `Feature First Used` and `Transaction Milestone Reached` have the
  same start; `features_used` fills in for older installs as they use features.
- Enable the RevenueCat Mixpanel integration to complete trial conversion,
  renewal and churn reporting.
