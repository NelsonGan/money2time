# Local notification review verification

Reviewed on 2026-10-08 for PR 570. This replaces the earlier AI notification workflow.

## Behavior and review fixes

Notifications are captured locally, with currency-labelled monetary candidates.
Capture never writes money or calls an AI provider. The user chooses Income,
Expense or Ignore. Several amounts require a selection; missing amounts and
accounts can be corrected. Bulk actions process the selected pending snapshot.
Apple Pay automatic logging and receipt photo/itemized/screenshot scanning keep
their existing behavior.

History keeps all pending items and the newest 10 completed items. Pending drafts
do not expire. A floating action returns on launch/foreground and new captures.
The root review page intercepts Back, hardware Back and swipe-back; Cancel stays,
and confirmation durably ignores the unfinished snapshot before navigating.
New notifications arriving while the warning is open remain pending.

The review fixed malformed numeric grouping, currency-change validation,
three-decimal amount rounding, interrupted queue writes, replay after a partial history failure, recovery
of corrected amounts/accounts, reset and identity cancellation, list jumps after
reviewing an item, floating-action touch ordering, and bottom safe-area spacing.
A committed capture link prevents duplicate saves; transaction and capture writes
share a SQLite transaction. Explicit review uses no scanner credits or automatic
log allowance, while preserving the existing free account-count gate. Ignore is
available without an account, amount or subscription.

Notification content, amounts and history stay off analytics and Sentry payloads.
Existing successful-save events use `decision: confirm` and drain telemetry adds
pending counts. No new Mixpanel event is added for capture or review. RiceCal's
Settings ad click tracking remains included in this PR.

## Automated verification

- Root type checking, lint and formatting: `npm run check`.
- Full Jest regression suite: 181 suites, 2,494 tests, including receipt client,
  Worker image modes, native queue contracts, Apple Pay, localization parity,
  notification extraction, capture/history and review/recovery scenarios.
- Six analytics suites: 115 tests passed. Trigger/payload/source prose was also
  checked against the final code; event counts and existing dashboards stay intact.
- Receipt-scanner Worker: separate TypeScript check passed. Retired notification
  requests return 400 before entitlement, quota or inference. Existing receipt
  image regression tests pass; no live receipt-provider evaluation was run.

## Visible Android verification

Tested using local Metro and the visible `m2t_pixel` Android API 36 emulator, with
fictional notification text and demo accounts. Five inputs passed through the
production local capture service: a RM0.20 transfer, a RM12.50 credit, a cashback
promotion, a payment plus balance, and an OTP. Capture returned five pending
reviews and zero logged transactions. Choosing Expense saved RM0.20; choosing
Income saved RM12.50; choosing Ignore dismissed the promotion. The ledger grew
by exactly two entries and the automatic-log preferences stayed unchanged.

Verified the floating action opens History, light/dark layouts, amount/account editing controls,
multiple amount candidates, disabled save buttons for missing amounts, bulk
handling of unfinished items, and the existing free account-limit warning.
Back showed the unfinished-items warning; Cancel kept the page open. While a
warning for three items was open, a fourth synthetic notification arrived.
Ignore and Leave returned to the calendar and left only that new item pending.
Ignore All then completed it. Ignoring did not increase the ledger count. Reload
preserved history and the completed list was capped at 10.

Final UI evidence is in `docs/pr-evidence/notification-review/`. Screenshots show
only synthetic text and demo accounts. Changed Android walkthrough frames are
refreshed to show the local review flow. No before screenshots are claimed.

## Limits and rollout

Visible iOS and tablet UI testing was not completed: this Xcode installation does
not provide a usable visible Simulator window. Physical-device notification
delivery was not tested. iOS native queue/Shortcut identity contracts are covered
by automated tests. The generated Shortcut description now describes review;
that wording appears with the next native build.

No production Worker deployment was performed. Cloudflare CI deploys Worker
changes on merge, so coordinate app rollout with retirement of the text endpoint.
Older clients cannot process notifications against the retired endpoint until
updated. Receipt image modes remain available.
