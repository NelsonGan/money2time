# Pro purchase restoration

## Identity and store accounts

Money2Time has no shared Pro sign-in account. `settings.appUserId` is a locally
generated `m2t_<uuid>`, passed to RevenueCat as an **identified** App User ID. It is
different on a fresh second installation. Google Sign-In in the app authorizes
Google Drive backups; it does not sign the user into Google Play or RevenueCat.
Importing a Money2Time data backup deliberately preserves the destination's App
User ID. Do not change that to trust purchase identity from an editable backup.

On Android, Restore Purchases must query the Google Play account that owns the
purchase and submit its purchase tokens for the current RevenueCat App User ID.
On iOS, the corresponding source is the App Store account. Store sign-in and
Drive sign-in are separate. This flow does not provide an iOS-to-Android transfer.

## Dashboard inspection, 2026-09-08

The following were checked in the live Money2Time RevenueCat dashboard, read-only:

- Android `m2t_pro_lifetime` is **Non-consumable**, Published, and attached to
  entitlement `pro` and offering `pro`.
- Project restore behavior is **Transfer to new App User ID**. There is no
  separate sandbox override.
- The Google Play application ID is `com.nelsongan.money2time`; credentials are
  marked **Valid credentials**, and Google developer notifications are connected.

These observations rule out those current configuration errors. They do not
establish which Google Play account an affected phone uses or what purchase
tokens it returns. No affected customer's ID, order, or device logs were supplied.

## Code defects corrected

- Use one explicit `Purchases.restorePurchases()` call on both platforms. Android
  posts it with `isRestore=true`; background `syncPurchasesForResult()` uses the
  SDK's account-sharing policy instead. A sync result must not short-circuit the
  user's explicit store restore. The old comments claiming explicit Android
  restores do not repost tokens were incorrect.
- Serialize identity changes and record the ID actually passed to `logIn`.
  Recheck the desired ID after login completes, including when settings switch
  back to the previously active ID while another login is pending.
- Apply purchase/restore/listener state ahead of older background reads. Do not
  launch another cached customer-info fetch after a successful purchase/restore.
  A failed refresh is not evidence that a paid entitlement disappeared; a
  confirmed inactive entitlement still revokes access, and subscription expiry
  continues to be checked locally.
- Authorize access only from `entitlements.active[configuredEntitlement]`.
  Historical entries can contain refunded/revoked lifetime purchases without
  an expiration date and must not unlock Pro.
- Report actual restore failures to Sentry under `revenueCat.restore`, with the
  platform, and preserve the restore error during already-owned purchase recovery.

These are reproducible code defects, not a confirmed diagnosis of an individual
customer's store-side failure.

## Verification

Automated regression suites:

```sh
npx jest __tests__/services/revenueCatRestore.test.ts __tests__/services/proCustomerStateRefresh.test.ts --runInBand
npm run check
npm test -- --runInBand
```

The native service tests mock the RevenueCat SDK boundary, exercising Android/iOS
restore, identity ordering/retry, already-owned recovery, empty results,
subscriptions, revoked lifetime access, cancellation, and error reporting. State
refresh tests deliberately resolve asynchronous reads out of order.

### Required Google Play end-to-end check

Use two Play Store devices and a license tester with a Play-installed test build.
The available local AVD uses the `google_apis` image with `PlayStore.enabled=no`;
it cannot validate restoration of purchases owned by a Google Play account.

1. On device A, buy lifetime Pro with the tester account. Record its App User ID
   from Settings > Display. Repeat separately for an active monthly/annual plan.
2. Install the test build on device B using the same purchasing **Google Play**
   account. Confirm its App User ID differs from A. With multiple Google accounts,
   verify which account installed the app and owns the order.
3. Open the paywall and restore. Confirm success, unlocked Pro, and the expected
   RevenueCat transfer. Background/resume the app, reopen the paywall, and restart
   it; Pro must remain active. Also restore while the initial paywall refresh is
   still pending.
4. On the original device, account for the project's transfer policy: different
   identified App User IDs do not automatically share access simultaneously.
5. With an account that owns nothing, verify no-purchases feedback and locked Pro.
   Repeat offline, then retry online; errors must not claim successful recovery.
6. Revoke/refund the test entitlement and confirm it no longer unlocks Pro once
   RevenueCat reports it inactive. Repeat a normal restore on iOS as a regression
   check.

For a failing real purchase, obtain the current App User ID, the Google Play
order ID (`GPA...`), the exact restore message, app version, and approximate restore
time. Inspect that customer's history and the scoped Sentry error before assigning
a store-side cause. Do not log receipts, purchase tokens, or Google credentials.

## Historical consumed purchases

RevenueCat React Native SDK 9+ uses Google Billing Client 8+, which cannot query
already-consumed one-time purchases. Neither restore nor repeated sync calls can
recover those tokens on a new installation. The current lifetime product is
non-consumable; there is no evidence from this inspection that it was previously
consumed. If an affected order was consumed historically, verify ownership and
follow RevenueCat's manual recovery procedure using its order ID. Do not grant
access just because an editable backup contains a previous App User ID.

## Sources

- [RevenueCat restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior)
- [Android SDK restore/sync implementation](https://github.com/RevenueCat/purchases-android/blob/main/purchases/src/main/kotlin/com/revenuecat/purchases/PurchasesOrchestrator.kt)
- [Google Play non-consumable product setup](https://www.revenuecat.com/docs/getting-started/entitlements/android-products)
- [Consumed purchase limitations in Billing Client 8](https://www.revenuecat.com/docs/known-store-issues/play-billing-library/restore-consumable-purchases-bc8)
