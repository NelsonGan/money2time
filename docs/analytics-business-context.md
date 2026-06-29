# money2time — Business Context & Mixpanel Tracking

> A handoff doc for the Mixpanel agent. It explains **what money2time is**, **how it makes
> money**, **the questions analytics should answer**, and then maps **every tracked event**
> to that business context — including what each event means, where it fires, and the
> properties it carries.

---

## 1. What the product is

**money2time** is a local-first, offline, on-device mobile expense tracker (iOS + Android,
built with React Native / Expo). Its signature hook: every expense can be reframed from
**money into time** — "this $60 dinner cost you 3.5 hours of your life" — based on the
user's configured hourly wage. The user toggles between **money mode** and **time mode**
(`display_mode` super property).

Key product facts that shape the analytics:

- **Local-first / offline.** All data lives in on-device SQLite. There is no account
  system or server-side user table — a user is identified only by a locally-generated
  `appUserId` (`m2t_<uuid>`), which is also the RevenueCat identity. Mixpanel `identify()`
  uses this same id, so Mixpanel is the primary source of truth for cross-user behavior.
- **Two usage modes** (`user_mode` super property):
  - **Simple mode** — one auto-created wallet, no accounts tab, simplified activity list.
    Aimed at casual trackers.
  - **Power mode** — full multi-account, multi-currency, recurring rules, etc. Aimed at
    power users migrating from apps like Money Manager.
- **Onboarding** is a multi-step first-run flow (value prop → mode → wage → preferences →
  notifications) and supports **importing a Money Manager `.mmbak` backup** to seed data.

## 2. How it makes money (the monetization model)

money2time is **freemium with a Pro subscription** sold through **RevenueCat** (App Store /
Play billing). Free users hit hard limits; Pro removes them. The free-tier ceilings
(`constants/proLimits.ts`) are:

| Limit                  | Free cap |
| ---------------------- | -------- |
| Accounts               | 5        |
| Categories             | 9        |
| Recurring rules        | 5        |
| Wage entries           | 5        |
| Custom account logos   | 2        |
| Sub-currencies (FX)    | 1        |
| Voice entries (lifetime) | 15     |
| Albums (trips)         | 3        |
| Premium insight trends | Pro-only |

**The monetization funnel the analytics must illuminate:**

1. **Acquisition / activation** — does the user finish onboarding and log their first
   transaction? (Onboarding + Transaction events.)
2. **Engagement** — are they logging transactions regularly, using voice, albums,
   recurring rules, insights? Engagement is the leading indicator of willingness to pay.
3. **Limit friction → paywall** — a free user bumping a limit (`Pro Limit Hit`) is the
   primary conversion trigger; it routes them to the paywall.
4. **Conversion** — paywall view → purchase start → purchase complete (the core revenue
   funnel). Restores matter for re-installs and cross-device.
5. **Retention / satisfaction** — review pre-prompt sentiment, auto-backup health, and
   continued logging signal whether retained users are happy.

**The headline metrics this tracking is designed to support:** onboarding completion rate,
activation (first transaction), DAU/WAU logging frequency, feature adoption (voice, albums,
recurring, multi-currency), **paywall view→purchase conversion**, which limit drives the
most paywall hits, and review sentiment.

## 3. How tracking is wired up

- **SDK:** `mixpanel-react-native`, initialized lazily in
  `services/analytics.native.ts` (token `EXPO_PUBLIC_MIXPANEL_TOKEN`). On web/test/Expo Go
  it falls back to no-op stubs (`services/analytics.ts` / `.shared.ts`), so absence of the
  native module silently disables tracking rather than crashing.
- **Identity:** `identifyUser(appUserId)` ties all events to the local `m2t_<uuid>` id —
  the *same* id RevenueCat uses, so Mixpanel ↔ RevenueCat can be joined on it. People
  profile gets `$name = appUserId` and `platform` (ios/android).
- **Event names** are central constants in `services/analytics.shared.ts`
  (`AnalyticsEvents`), all in `Category Action` title-case so they sort naturally in the
  Mixpanel UI.
- **Calling convention:** `trackEvent(AnalyticsEvents.X, { ...props })`.

### Super properties (attached to every event)

Set via `setSuperProperties` whenever settings change (`context/AppContext.tsx`). Use these
for segmentation across **all** events:

| Super property   | Values                         | Why it matters                                    |
| ---------------- | ------------------------------ | ------------------------------------------------- |
| `user_mode`      | `simple` \| `power`            | Segment casual vs power users (different funnels). |
| `currency_code`  | e.g. `USD`, `EUR`              | Geography / market proxy.                          |
| `locale`         | device locale (23 supported)   | Localization & market analysis.                   |
| `theme_mode`     | `system` \| `light` \| `dark`  | Preference signal.                                |
| `theme_color`    | one of 8 palettes              | Preference signal.                                |
| `display_mode`   | `money` \| `time`              | **Core hook adoption** — are users actually using time mode? |
| `current_screen` | last visible screen name       | Where the user is when an event fires; set by `setCurrentScreen`. |

> Note: `current_screen` is also auto-derived inside `trackEvent` from any `current_screen` /
> `screen` / `tab` property on an individual event, keeping the super property in sync.

---

## 4. Event catalog (mapped to business context)

Every event below is a member of `AnalyticsEvents`. "Fires from" points at the source so the
Mixpanel agent can trust the semantics.

### Onboarding — *activation funnel (top of funnel)*

These answer: **do new installs complete setup and reach first value?**

| Event (display name)              | Fires when                                                    | Properties                                        |
| --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `Onboarding Started`              | User begins the onboarding flow (value-prop step).            | —                                                 |
| `Onboarding Completed`            | Onboarding finished and app entered.                          | —                                                 |
| `Onboarding Skipped`              | User skips onboarding; defaults to power mode.                | `at_step` (step index where they bailed)          |
| `Onboarding Mode Selected`        | User picks simple vs power during onboarding. *(constant defined; wire to mode step.)* | mode selection            |
| `Onboarding Import Started`       | User starts importing a Money Manager `.mmbak` backup.        | —                                                 |
| `Onboarding Import Completed`     | Import succeeded.                                             | `accounts`, `categories`, `transactions` (counts) |
| `Onboarding Import Failed`        | Import errored.                                               | —                                                 |
| `Onboarding Notifications Enabled`| User opts into notifications in onboarding.                   | —                                                 |
| `Onboarding Notifications Skipped`| User declines notifications in onboarding.                    | —                                                 |

*Funnel to build:* `Onboarding Started` → `Onboarding Completed` → first `Transaction Created`.
Import events show how many users migrate from a competitor (Money Manager) and how much data
they bring — a strong retention predictor.

### Transactions — *core engagement / activation*

The heartbeat of the app. Logging frequency = the primary retention/engagement metric.

| Event                       | Fires when                                              | Properties                                                                                          |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Transaction Created`       | A transaction is saved (manual entry).                  | `type` (expense/income/transfer/balance_adjustment), `has_category`, `has_note`, `sentiment`, `split_count`, `split_total` |
| `Voice Transaction Created` | A transaction is created via on-device voice quick-entry. | Same props as above. **Tracks adoption of the voice feature** (a Pro-gated funnel after 15 free uses). |
| `Transaction Updated`       | A transaction (or bulk selection) is edited.            | `count` and/or `split_count`                                                                        |
| `Transaction Deleted`       | A single transaction is deleted.                        | `count` (= 1)                                                                                       |
| `Transactions Bulk Deleted` | Multiple transactions deleted at once.                  | `count`                                                                                             |

*`sentiment`* (`happy`/`neutral`/`sad`) is a money2time differentiator — emotional tagging of
spend. Worth a breakdown to see how users feel about their spending.

### Split bills (Pay First) — *engagement, social feature*

| Event                | Fires when                                | Properties                                  |
| -------------------- | ----------------------------------------- | ------------------------------------------- |
| `Split Marked Paid`  | A split-bill participant is marked repaid. | `payback_account_changed`, `same_account`   |
| `Split Marked Unpaid`| A repayment is reversed.                  | —                                           |

### Accounts & Categories — *power-mode setup depth*

Setup depth correlates with retention and with hitting the 5-account / 9-category free limits.

| Event             | Fires when             | Properties                       |
| ----------------- | ---------------------- | -------------------------------- |
| `Account Created` | A wallet is created.   | `type` (debit/credit)            |
| `Account Deleted` | A wallet is deleted.   | —                                |
| `Category Created`| A category is created. | `type` (expense/income)          |
| `Category Deleted`| A category is deleted. | `reassigned` (txns moved or not) |

### Albums (trips) — *Pro-limited feature (cap 3)*

Trip albums group transactions with a cover photo, date range, and optional map location.
A conversion lever — free users cap at 3 albums.

| Event                   | Fires when                                  | Properties          |
| ----------------------- | ------------------------------------------- | ------------------- |
| `Album Created`         | A trip album is created.                    | `transactionCount`  |
| `Album Updated`         | Album details edited.                       | —                   |
| `Album Deleted`         | Album deleted.                              | —                   |
| `Album Location Set`    | A geo location is attached/cleared.         | `cleared` (boolean) |
| `Album Locations Opened`| The full-page album map is opened.          | `count` (pins)      |
| `Map Pin Tapped`        | A pin on the album map is tapped.           | —                   |

### Recurring rules — *power feature, free cap 5*

| Event                   | Fires when                  | Properties                  |
| ----------------------- | --------------------------- | --------------------------- |
| `Recurring Rule Created`| A recurring template added. | `type`, `pattern`           |
| `Recurring Rule Updated`| A recurring rule edited.    | —                           |
| `Recurring Rule Deleted`| A recurring rule deleted.   | —                           |

### Insights — *analytics engagement*

| Event                       | Fires when                          | Properties                       |
| --------------------------- | ----------------------------------- | -------------------------------- |
| `Insights Drilldown Opened` | User drills into a chart/breakdown. | `screen` (= `InsightsDrilldown`) |

Several insight **trend types are Pro-only** (`PRO_TREND_TYPES`: expense/income/category
trends, expense sentiment, asset history), so insights engagement feeds the paywall funnel.

### Settings & data lifecycle — *preferences, mode switching, the core hook*

| Event                 | Fires when                                | Properties                                |
| --------------------- | ----------------------------------------- | ----------------------------------------- |
| `Settings Updated`    | Any settings field changes.               | `changed_fields` (comma-joined keys; also `currencyCode_reset`) |
| `Display Mode Toggled`| User flips money ↔ time.                  | `mode` (`money` \| `time`)                |
| `Wage Config Updated` | Hourly/monthly/yearly wage configured.    | `wage_type`                               |
| `Mode Switched`       | User switches simple ↔ power mode.        | `mode` (`simple` \| `power`)              |
| `Data Reset`          | User wipes data.                          | `scope` (`all` \| `transactions_only`)    |
| `Data Imported`       | Money Manager backup imported (post-onboarding). | `accounts`, `categories`, `transactions` |

`Display Mode Toggled` + the `display_mode` super property are the **best measures of the
product's signature feature** — whether people actually use "time" framing.

### Tutorial — *onboarding assistance*

| Event               | Fires when                  | Properties      |
| ------------------- | --------------------------- | --------------- |
| `Tutorial Started`  | Coach-mark tutorial begins. | —               |
| `Tutorial Completed`| Tutorial finished.          | `steps_viewed`  |
| `Tutorial Skipped`  | Tutorial dismissed early.   | `steps_viewed`  |

### Pro / monetization — *the revenue funnel (most important commercially)*

| Event                    | Fires when                                  | Properties                                                                 |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- |
| `Pro Limit Hit`          | A free user bumps a gated limit.            | `type` (which limit, e.g. `voice`, accounts, albums, categories, recurring, logos, currencies, trends) |
| `Pro Paywall Viewed`     | The paywall screen is shown.                | `source` (where it was opened from, e.g. `settings`, a limit type)        |
| `Pro Purchase Started`   | User taps to buy a package.                 | `package` (package id)                                                    |
| `Pro Purchase Completed` | Purchase succeeded.                         | `package`                                                                 |
| `Pro Purchase Pending`   | Purchase is pending (e.g. deferred billing).| `package`                                                                 |
| `Pro Purchase Cancelled` | User cancelled the purchase sheet.          | `package`                                                                 |
| `Pro Purchase Failed`    | Purchase failed.                            | `package`, `reason`                                                       |
| `Pro Restore Started`    | User taps "restore purchases".              | —                                                                         |
| `Pro Restore Completed`  | Restore finished.                           | `found` (boolean — was an active entitlement found)                       |

***The conversion funnel:*** `Pro Limit Hit` → `Pro Paywall Viewed` → `Pro Purchase Started`
→ `Pro Purchase Completed`. Break `Pro Limit Hit` down by `type` to learn **which limit
drives the most upgrades**, and `Pro Paywall Viewed` by `source` to learn **which entry
point converts best**. Join to RevenueCat on `appUserId` for revenue truth.

### Statement import — *power onboarding / migration*

| Event                       | Fires when                       | Properties        |
| --------------------------- | -------------------------------- | ----------------- |
| `Statement Import Completed`| A bank statement import finishes.| `imported_count`  |

### Auto-backup — *retention / data-safety health*

Data safety = trust = retention (especially since data is local-first with no server).

| Event                        | Fires when                          | Properties                                          |
| ---------------------------- | ----------------------------------- | --------------------------------------------------- |
| `Auto Backup Run`            | A backup completes.                 | `target` (local/icloud/googleDrive), `written_count`, `errors_count`, `trigger` (`auto`/`manual`) |
| `Auto Backup Failed`         | A backup run had errors.            | `target`, `message`                                 |
| `Auto Backup Restored`       | A backup is restored.               | `target`                                            |
| `Auto Backup Deleted`        | A backup file is deleted.           | `target`                                            |
| `Auto Backup Setting Toggled`| Auto-backup turned on/off.          | `enabled` (boolean)                                 |
| `Auto Backup Target Changed` | Backup destination changed.         | `target`                                            |

### Review prompt — *satisfaction signal + ASO*

money2time gates the OS review prompt behind a **happy/unhappy pre-prompt** so only happy
users are routed to the store, while unhappy users are routed to feedback. The pre-prompt
sentiment is a **free, continuous NPS-like satisfaction signal.**

| Event                               | Fires when                                        | Properties                  |
| ----------------------------------- | ------------------------------------------------- | --------------------------- |
| `Review Preprompt Shown`            | The happy/unhappy pre-prompt is shown.            | `trigger`                   |
| `Review Preprompt Happy`            | User taps "happy" → routed to store review.       | `trigger`                   |
| `Review Preprompt Unhappy`          | User taps "unhappy" → routed to feedback.         | `trigger`                   |
| `Review Preprompt Dismissed`        | Pre-prompt dismissed without choosing.            | `trigger`                   |
| `Review Preprompt Feedback Opened`  | Unhappy user opts to send feedback.               | `trigger`                   |
| `Review Preprompt Feedback Declined`| Unhappy user declines to send feedback.           | `trigger`                   |
| `Review Prompt Requested`           | The native store review prompt is requested.      | —                           |
| `Review Prompt Skipped`             | Review request skipped (cooldown / unavailable).  | `trigger`, `reason`         |
| `Review Prompt Manual Opened`       | User opens store review manually (from settings). | —                           |

> `trigger` identifies which moment prompted the review (e.g. after a milestone). Use
> Preprompt Happy ÷ (Happy + Unhappy) as a satisfaction ratio, segmented by `user_mode`,
> `locale`, or Pro status.

### Widgets & deep links — *re-engagement*

| Event           | Fires when                                          | Properties                                |
| --------------- | --------------------------------------------------- | ----------------------------------------- |
| `Widget Opened` | App opened via a home-screen widget deep link.      | `widget` (e.g. `quick_add`), `type`, `focus` (varies by widget) |

Widget opens measure how much home-screen widgets drive return visits and quick logging.

---

## 5. Suggested analyses for the Mixpanel agent

1. **Activation funnel:** `Onboarding Started` → `Onboarding Completed` → first
   `Transaction Created`, segmented by `user_mode` and by whether they imported.
2. **Conversion funnel:** `Pro Limit Hit` → `Pro Paywall Viewed` → `Pro Purchase Started` →
   `Pro Purchase Completed`; break `Pro Limit Hit` by `type` to rank which limit sells Pro,
   and `Pro Paywall Viewed` by `source` to rank entry points.
3. **Core-hook adoption:** distribution of the `display_mode` super property + frequency of
   `Display Mode Toggled` — are people using "time" framing?
4. **Engagement / retention:** `Transaction Created` per user per week; cohort retention by
   logging frequency; voice/album/recurring adoption rates.
5. **Satisfaction:** Review Preprompt Happy vs Unhappy ratio over time, segmented by Pro
   status and `user_mode`.
6. **Data-safety health:** `Auto Backup Failed` rate by `target`.

> Join key to RevenueCat for revenue truth: **`appUserId`** (`m2t_<uuid>`), which is the
> Mixpanel distinct id (`identify`) and the RevenueCat app user id.
