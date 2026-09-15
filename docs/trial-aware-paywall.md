# Trial-aware paywall

## Goal

The paywall must advertise a free trial only when the exact package the user can buy includes one for the current store account. Every trial claim must include the store-provided duration and the price charged after the trial. Turning a trial on or off in App Store Connect, Google Play, or RevenueCat must not require an app release to correct the copy.

## Product invariants

1. Never infer a trial from a package name, product identifier, campaign, or hardcoded duration.
2. Never show trial copy when eligibility is unknown, the introductory price is greater than zero, or the duration cannot be represented safely.
3. Keep the selected package, CTA, trial duration, and renewal terms derived from one normalized object so they cannot disagree.
4. Show the renewal price and interval before the purchase action. Lifetime remains a one-time purchase and never inherits subscription copy.
5. A failed eligibility lookup must not hide a purchasable plan. It removes only the unverified trial promise.
6. Do not promise a reminder before renewal unless a separate reminder feature is shipped and verified.

## Store behavior and normalization

RevenueCat automatically applies an eligible introductory offer when a package is purchased. On Google Play, package purchase uses the product's default option, which favors the longest eligible free trial and falls back to the base plan. On iOS, introductory eligibility must be checked separately; an unknown result should use ordinary pricing copy. These rules follow RevenueCat's [subscription offer guidance](https://www.revenuecat.com/docs/subscription-guidance/subscription-offers) and the installed React Native SDK contract.

The app normalizes both stores into this paywall-facing shape:

```ts
interface RevenueCatFreeTrial {
  durationIso8601: string;
  durationCount: number;
  durationUnit: 'day' | 'week' | 'month' | 'year';
}
```

| Platform             | Trial source              | Eligibility rule                                                    | Safe fallback                        |
| -------------------- | ------------------------- | ------------------------------------------------------------------- | ------------------------------------ |
| iOS                  | Zero-price `introPrice`   | RevenueCat status must be `ELIGIBLE`                                | Keep plan; set `freeTrial` to `null` |
| Android              | `defaultOption.freePhase` | Google Play has already filtered the available subscription options | Keep plan; set `freeTrial` to `null` |
| Development fallback | Mock annual package       | Explicit one-week trial for visual QA only                          | Mock purchases remain unavailable    |

Multiple billing cycles are multiplied into both the displayed unit count and the normalized total ISO duration used for analytics. Unsupported units, inconsistent store period metadata, and invalid or non-positive durations are rejected rather than rendered as guessed copy.

The purchase section keeps the full localized renewal price more prominent than the effective monthly breakdown, states the trial duration and post-trial charge, and provides restore and legal links. These choices follow Apple's [auto-renewable subscription presentation guidance](https://developer.apple.com/app-store/subscriptions/) and [App Review subscription-information rule](https://developer.apple.com/app-store/review/guidelines/).

## Copy matrix

| Selected plan state                 | Hero                                     | Plan badge        | CTA                              | Supporting terms                                                                               |
| ----------------------------------- | ---------------------------------------- | ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Eligible free trial                 | “Try Money2Time Pro free for {duration}” | “{duration} free” | “Start my {duration} free trial” | “Free for {duration}, then {localized price / interval}. Renews automatically until canceled.” |
| Monthly or annual without a trial   | Existing benefit headline                | None              | “Continue”                       | “No commitment. Cancel anytime.”                                                               |
| Lifetime                            | Existing benefit headline                | None              | “Continue”                       | “Pay once, yours forever”                                                                      |
| Trial eligibility unknown or failed | Same as no-trial state                   | None              | “Continue”                       | Ordinary package terms                                                                         |
| Offering still loading              | Existing benefit headline                | None              | Disabled action                  | No trial promise                                                                               |

Duration copy supports singular and plural days, weeks, months, and years. The keys exist in every supported locale so future store-side trial changes cannot break locale parity.

## Interaction and layout

The previous plan rows purchased immediately. The revised section uses a two-step selection model:

1. The default is an annual trial, then any other trial, then annual, then monthly, then the first available package.
2. Tapping a row changes the selected radio state and all conditional copy.
3. One primary CTA purchases the selected package.
4. The close-path offer uses the same selection preference and the same presenter, so its trial wording cannot drift from the main paywall.

The compact trial spotlight is shown only for the selected trial package. Theme tokens drive its border, surface, type, and icons, and the exit modal injects theme variables into its detached native hierarchy. The purchase area keeps restore and privacy links visible, and adds Apple's standard EULA link on iOS.

## Visual references

The generated references are design inputs, not runtime assets:

- [Timeline-forward trial reference](design/trial-paywall-reference-timeline.png)
- [Compact trial purchase-section reference](design/trial-paywall-reference-compact.png)

The implementation takes the explicit terms and selection clarity from both references, while keeping the existing long-scroll feature comparison and bundled mascot artwork.

## Analytics

Purchase-started and purchase-completed events include:

- `package`
- `has_free_trial`
- `trial_duration` (the store ISO 8601 value, or `null`)

This distinguishes trial starts from direct purchases without creating a second conversion funnel.

## Verification matrix

Automated coverage must prove:

- eligible iOS zero-price intros produce a trial;
- iOS ineligible, unknown, no-offer, and failed checks suppress trial copy;
- Android reads the free phase from the package's default option;
- paid intros, unknown units, and invalid durations never become free trials;
- singular/plural duration keys cover every supported unit;
- default selection follows the documented preference;
- trial and non-trial presenters choose the correct hero, badge, CTA, and terms;
- all locale key sets and interpolation placeholders remain in parity.

Manual device QA must cover light and dark mode, a phone and tablet layout, trial and non-trial plan selection, the exit offer, loading state, restore, purchase cancellation, and Dynamic Type-independent text clipping. The simulator stays visible on the final tested screen, and the PR embeds reviewer-accessible final screenshots.

## Trial enablement runbook

Before enabling a production trial:

1. Configure the trial on the store product or Google Play offer attached to the RevenueCat package.
2. On Google Play, confirm the intended offer is the package's default eligible option and is not excluded by an `rc-ignore-offer` tag.
3. Confirm RevenueCat serves the intended offering to both a new eligible account and an ineligible previously subscribed account.
4. Verify the paywall duration, post-trial price, billing interval, purchase sheet, and entitlement activation on sandbox iOS and Android accounts.
5. Verify every supported locale on representative short and long durations.
6. Confirm analytics records trial starts with the matching package and ISO duration.
7. Re-run `npm run check`, the focused paywall/RevenueCat tests, and the full Jest suite before release.
