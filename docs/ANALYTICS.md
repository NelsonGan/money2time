# Mixpanel Analytics Tracking

This document describes every event tracked by the Money2Time app via Mixpanel.

## Setup

1. Create a Mixpanel project at <https://mixpanel.com>.
2. Copy the **Project Token** and add it to your `.env` file:

```
EXPO_PUBLIC_MIXPANEL_TOKEN=your_mixpanel_project_token
```

3. Rebuild the app. When the token is missing or empty, all analytics calls are silent no-ops.

## User Identity

Users are identified by the same `appUserId` used for RevenueCat (format: `m2t_<uuid>`).
This ID is generated on first app launch, stored in the local SQLite settings table,
and passed to both RevenueCat and Mixpanel so you can correlate purchase data with
behavioural analytics.

The identifier is set via `identifyUser(appUserId)` in `AppContext` whenever
`settings.appUserId` is available.

## Super Properties (sent with every event)

| Property       | Type    | Description                          |
| -------------- | ------- | ------------------------------------ |
| `user_mode`    | string  | `"simple"` or `"power"`             |
| `currency_code`| string  | ISO currency code (e.g. `"USD"`)     |
| `locale`       | string  | App locale (e.g. `"en"`, `"zh"`)     |
| `theme_mode`   | string  | `"light"`, `"dark"`, or `"system"`   |
| `theme_color`  | string  | Theme accent colour (e.g. `"sage"`)  |
| `display_mode` | string  | `"money"` or `"time"`               |
| `has_ad_free`  | boolean | Whether user has ad-free entitlement |
| `current_screen` | string | The current screen/tab the user is on (e.g. `"home"`, `"transactions"`, `"AddTransaction"`, `"DisplaySettings"`) |

These are refreshed automatically whenever the underlying settings change or the user navigates.

The `current_screen` property is particularly useful: it is automatically attached to
every event, so you always know which page the user was on when an action occurred
(e.g. a `Transaction Created` event will carry `current_screen: "AddTransaction"`).

## User Profile Properties (People)

| Property   | Type   | Description                            |
| ---------- | ------ | -------------------------------------- |
| `$name`    | string | Same as `appUserId`                    |
| `platform` | string | `"ios"` or `"android"`                 |
| `has_ad_free` | boolean | Set to `true` after successful purchase |

## Events Reference

### App Lifecycle

| Event          | Properties | Trigger                     |
| -------------- | ---------- | --------------------------- |
| `App Opened`   | _none_     | Reserved for future use     |

### Onboarding

| Event                         | Properties                                         | Trigger                                    |
| ----------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `Onboarding Started`          | _none_                                             | User taps "Get Started" on the value prop  |
| `Onboarding Step Viewed`      | _none_                                             | Reserved for future step-level tracking    |
| `Onboarding Completed`        | _none_                                             | User finishes onboarding                   |
| `Onboarding Skipped`          | `at_step`: number                                  | User skips onboarding at a specific step   |
| `Onboarding Mode Selected`    | `mode`: `"simple"` \| `"power"`                    | User picks Simple or Power mode            |
| `Onboarding Import Started`   | _none_                                             | User initiates a .mmbak file import        |
| `Onboarding Import Completed` | `accounts`, `categories`, `transactions`: number   | Import finishes successfully               |
| `Onboarding Import Failed`    | _none_                                             | Import fails                               |
| `Onboarding Defaults Created` | _none_                                             | Reserved for future use                    |

### Navigation / Screen Views

| Event           | Properties                  | Trigger                                |
| --------------- | --------------------------- | -------------------------------------- |
| `Tab Viewed`    | `tab`: string               | User taps a bottom navigation tab      |
| `Screen Viewed` | `screen`: string            | User opens a modal screen (e.g. AddTransaction) |

### Transactions

| Event                      | Properties                                                  | Trigger                       |
| -------------------------- | ----------------------------------------------------------- | ----------------------------- |
| `Transaction Created`      | `type`: string, `has_category`: boolean, `has_note`: boolean | New transaction saved         |
| `Transaction Updated`      | `count`: number                                             | Transaction(s) edited         |
| `Transaction Deleted`      | `count`: number                                             | Single transaction deleted    |
| `Transactions Bulk Deleted` | `count`: number                                             | Multiple transactions deleted |

### Accounts

| Event             | Properties        | Trigger             |
| ----------------- | ----------------- | ------------------- |
| `Account Created` | `type`: string    | New account added   |
| `Account Updated` | _none_            | Reserved            |
| `Account Deleted` | _none_            | Account deleted     |

### Categories

| Event              | Properties        | Trigger              |
| ------------------ | ----------------- | -------------------- |
| `Category Created` | `type`: string    | New category added   |
| `Category Updated` | _none_            | Reserved             |
| `Category Deleted` | _none_            | Category deleted     |

### Recurring Rules

| Event                    | Properties                           | Trigger                |
| ------------------------ | ------------------------------------ | ---------------------- |
| `Recurring Rule Created` | `type`: string, `pattern`: string    | New rule created       |
| `Recurring Rule Updated` | _none_                               | Rule edited            |
| `Recurring Rule Deleted` | _none_                               | Rule deleted           |

### Insights

| Event                      | Properties | Trigger                                  |
| -------------------------- | ---------- | ---------------------------------------- |
| `Insights Drilldown Opened`| _none_     | User taps into a category drilldown      |
| `Insights Type Changed`    | _none_     | Reserved for future use                  |

### Settings

| Event                 | Properties                     | Trigger                                 |
| --------------------- | ------------------------------ | --------------------------------------- |
| `Settings Updated`    | `changed_fields`: string (CSV) | Any display/locale/currency/theme saved |
| `Display Mode Toggled`| `mode`: `"money"` \| `"time"`  | User toggles money/time display         |
| `Wage Config Updated` | `wage_type`: string            | Wage settings saved                     |
| `Mode Switched`       | `mode`: `"simple"` \| `"power"` | User switches app mode                 |
| `Data Reset`          | `scope`: `"all"` \| `"transactions_only"` | User resets data              |
| `Data Exported`       | _none_                         | Reserved for future use                 |
| `Data Imported`       | `accounts`, `categories`, `transactions`: number | Data imported from .mmbak  |

### Purchases / Ad Removal

| Event                  | Properties                                     | Trigger                            |
| ---------------------- | ---------------------------------------------- | ---------------------------------- |
| `Purchase Modal Opened`| _none_                                         | User opens the tip/remove-ads modal |
| `Purchase Initiated`   | `product_id`: string, `price`: number          | User selects a tip amount          |
| `Purchase Completed`   | `product_id`: string, `price`: number          | Store purchase succeeds            |
| `Purchase Cancelled`   | `product_id`: string                           | User cancels purchase flow         |
| `Purchase Failed`      | `product_id`: string                           | Store purchase fails               |
| `Purchase Restored`    | `has_entitlement`: boolean                     | User restores previous purchases   |

### Tutorial

| Event                | Properties              | Trigger                     |
| -------------------- | ----------------------- | --------------------------- |
| `Tutorial Started`   | _none_                  | User starts guided tutorial |
| `Tutorial Completed` | `steps_viewed`: number  | User finishes all steps     |
| `Tutorial Skipped`   | `steps_viewed`: number  | User exits early            |

## Architecture

The analytics service follows the same platform-specific pattern as RevenueCat and Ads:

```
services/
  analytics.shared.ts   # Event constants, types (shared across platforms)
  analytics.native.ts   # Mixpanel SDK integration (iOS/Android)
  analytics.ts          # Web/unsupported platform no-op fallback
```

All functions are async and fire-and-forget (`void trackEvent(...)`) so they never
block the UI thread or cause unhandled promise rejections.

When `EXPO_PUBLIC_MIXPANEL_TOKEN` is not set, the native module initialises as a no-op,
identical to the web fallback behaviour.
