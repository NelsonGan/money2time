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

On Android, a free phase with an indeterminate cycle count or a paid introductory phase after the free phase is not advertised as a trial. This paywall's simple “free, then standard renewal price” contract does not describe a mixed free-plus-discounted schedule; do not make such an option the package default until its complete billing sequence is supported in the UI.

The purchase section keeps the full localized renewal price more prominent than the effective monthly breakdown, states the trial duration and post-trial charge, and provides restore and legal links. These choices follow Apple's [auto-renewable subscription presentation guidance](https://developer.apple.com/app-store/subscriptions/) and [App Review subscription-information rule](https://developer.apple.com/app-store/review/guidelines/).

## Copy matrix

| Selected plan state                 | Hero                      | Plan badge        | CTA                | Supporting terms                                                                               |
| ----------------------------------- | ------------------------- | ----------------- | ------------------ | ---------------------------------------------------------------------------------------------- |
| Eligible free trial                 | Existing benefit headline | “{duration} free” | “Start free trial” | “Free for {duration}, then {localized price / interval}. Renews automatically until canceled.” |
| Monthly or annual without a trial   | Existing benefit headline | None              | “Subscribe”        | “{localized price / interval}. Renews automatically until canceled.”                           |
| Lifetime                            | Existing benefit headline | None              | “Buy Lifetime”     | “{localized price}. Pay once, yours forever.”                                                  |
| Trial eligibility unknown or failed | Existing benefit headline | None              | “Subscribe”        | Ordinary package terms                                                                         |
| Offering still loading              | Existing benefit headline | None              | Disabled action    | No trial promise                                                                               |

Duration copy supports singular and plural days, weeks, months, and years. The keys exist in every supported locale so future store-side trial changes cannot break locale parity.

## Interaction and layout

The previous plan rows purchased immediately. The revised section uses a two-step selection model:

1. The default is an annual trial, then any other trial, then annual, then monthly, then the first available package.
2. Tapping a row changes the selected radio state, plan badge, CTA, and terms. The benefit headline stays the same.
3. One primary CTA purchases the selected package.
4. The X and “Maybe later” dismiss directly; there is no second-chance prompt.

The yearly, monthly, and lifetime rows appear first, before the long-scroll comparison. The purchase CTA, selected-plan terms, and “Maybe later” stay fixed below the scroll area. The compact trial spotlight and exit modal have been removed. Restore and privacy links remain in the scroll content, with Apple's standard EULA link on iOS. Onboarding immediately opens this paywall; all announcements already in the catalog are marked seen for the new user, so a feature announcement cannot interrupt signup or appear on the next launch. Future announcements remain eligible.

## Visual references

The generated references are design inputs, not runtime assets:

- [Timeline-forward trial reference](design/trial-paywall-reference-timeline.png)
- [Compact trial purchase-section reference](design/trial-paywall-reference-compact.png)

The timeline reference includes a reminder concept that is not implemented or promised by the app. Its illustrated trial lengths are also examples; runtime duration always comes from the store package.

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
- trial and non-trial presenters keep the benefit headline and choose the correct badge, CTA, and terms;
- all locale key sets and interpolation placeholders remain in parity.

Manual device QA must cover light and dark mode, a phone and tablet layout, trial and non-trial plan selection, direct dismissal, the onboarding transition, loading state, restore, purchase cancellation, and Dynamic Type-independent text clipping. The simulator stays visible on the final tested screen, and the PR embeds reviewer-accessible final screenshots.

## Trial enablement runbook

Before enabling a production trial:

1. Configure the trial on the store product or Google Play offer attached to the RevenueCat package.
2. On Google Play, confirm the intended offer is the package's default eligible option and is not excluded by an `rc-ignore-offer` tag.
   Keep the default option to a free phase followed directly by standard renewal pricing; a mixed paid intro requires a separate pricing UI.
3. Confirm RevenueCat serves the intended offering to both a new eligible account and an ineligible previously subscribed account.
4. Verify the paywall duration, post-trial price, billing interval, purchase sheet, and entitlement activation on sandbox iOS and Android accounts.
5. Verify every supported locale on representative short and long durations.
6. Confirm analytics records trial starts with the matching package and ISO duration.
7. Re-run `npm run check`, the focused paywall/RevenueCat tests, and the full Jest suite before release.
