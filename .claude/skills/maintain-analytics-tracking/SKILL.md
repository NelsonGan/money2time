---
name: maintain-analytics-tracking
description: Keep the canonical Money2Time Mixpanel and Google Analytics tracking tables in sync when adding, changing, removing or reviewing analytics events, payloads, routing, tracked flows, paywall sources, screens, user properties, adoption milestones or provider configuration.
---

# Maintain analytics tracking

[docs/analytics-tracking.md](../../../apps/mobile/docs/analytics-tracking.md) is the **single source of truth** for tracking. Read its relevant tables before changing analytics or a tracked product flow. The integration notes explain setup; they must not become a second event inventory.

For every product/code change, assess its analytics impact. If it changes an event name, payload, trigger, frequency, destination, paywall source, visible screen, profile/super property, feature-use rule, transaction milestone, provider configuration or external producer, update the affected tracking tables **in the same change**. No analytics impact means no artificial table edit. A change with stale tracking documentation is unfinished.

## Keep implementation and tables aligned

- Add each custom event to exactly one routing group in `services/analytics.shared.ts` and exactly one active table row. Record the constant, exact display/GA4 names, Mixpanel Yes/No, trigger and frequency, extra payload keys and emitters. Update the coverage counts.
- Check actual call sites and helpers, not only constants. A moved trigger, retry, bulk operation or edited flow can change volume without changing an event name. Document conditional properties and GA4 key/value normalization. Update property-value and source tables when their domains change.
- Keep frequent per-use telemetry in GA4. Mixpanel receives the approved install/activation/adoption/Pro events, with every user and no sampling. Before adding a Mixpanel event or increasing its frequency, record why it is needed and its expected volume in the table. Keep Mixpanel automatic mobile events off.
- For adoption, update the feature table alongside `FEATURE_BY_EVENT` / `featureUsedBy`, including qualifying and excluded contexts. Update the transaction threshold table and the derived maximum milestone volume if thresholds change. Older installs must not acquire false first-use events.
- Update user-state and screen/SDK tables when identity, profile, super properties, screen reporting, consent/default collection or SDK behavior changes. Explicitly label SDK-managed and external events separately from app custom events; record only externally verified integration state.
- For revenue changes, update the canonical Revenue measurement table. Keep funnel success separate from collected money: advertised package prices, free trials and restores are not new charges. Verify Google Play linking, StoreKit 2 coverage, Firebase app-instance identity, external integration settings and one monetary producer per transaction; reconcile currency, date/time zone, refunds and gross/net definitions before claiming GA4 matches RevenueCat.
- RevenueCat lifecycle events belong in the external server inventory, outside the app custom-event counts. Record enabled event names, region, currency/gross-net choices, sandbox and optional paywall/funnel switches, delayed-refund credential coverage and expected recurring Mixpanel volume. Keep the client revenue marker and GA4 stream modification rules aligned; wait for Firebase configuration and an explicit HTTP acknowledgement from the official RevenueCat attributes endpoint before enabling it; local SDK setters and `syncAttributesAndOfferingsIfNeeded` are not delivery acknowledgements. Keep attribute uploads bounded, out of customer-status loading and free of store-offerings fetches; serialize the marker with customer configuration; leave SDK revenue intact if synchronization fails; verify receipt delivery after release before claiming end-to-end accuracy. Never add SDK purchase/charge logging alongside the server feed without reconciling duplicate producers.
- For removal/rename, remove the old active row, add its replacement to Retired tracking and keep existing reports understandable. Do not leave a retired event marked as active.
- Keep the Live Mixpanel dashboards inventory and affected saved reports aligned when event names, properties, filters, formulas, breakdowns or conversion windows change. Record exact report/board links and counting rules in the canonical table, execute changed queries and read saved reports back. Keep approved app-volume lists and configured charge formulas complete, including names not yet observed; preserve financial coverage, legacy-schema and cohort-maturity limits. Dashboard queries do not change emitted event volume.
- Mirror edits to this skill and other Claude workflows into `.agents/skills/` or `.agents/commands/` as required by the repository instructions.

## Verify before completing the change

Run:

```bash
npm test -- --runInBand __tests__/services/analyticsTrackingPlan.test.ts __tests__/services/analyticsEvents.test.ts __tests__/services/analyticsNative.test.ts __tests__/services/revenueCatRestore.test.ts __tests__/patches/mixpanelAsyncOperations.test.ts __tests__/utils/firstTransactionSignal.test.ts
```

The table check enforces event completeness, exact names/destinations, summary counts, feature triggers/exclusions and transaction thresholds. The native, installed-SDK and activation tests cover provider ordering, async failures, profile retries, RevenueCat identity/marker coordination and successful-save claims. Reconcile the Mixpanel SDK patch and run the installed-SDK tests on dependency upgrades. Review trigger prose, payload keys, source/screen tables and provider configuration against the diff as well; the table test does not validate those automatically. Follow the repository's broader checks for code changes. When opening a PR or reporting completion, identify tracking-table updates and explain any Mixpanel volume change.
