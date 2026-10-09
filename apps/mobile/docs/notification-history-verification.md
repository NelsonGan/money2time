# Local notification review verification

Reviewed on 2026-10-08 for PR 570. This replaces the earlier AI notification workflow.

## Behavior and review fixes

Notifications are captured locally, with monetary candidates extracted even when no currency symbol is present. Unlabelled numbers use the configured account currency; explicit currencies retain priority.
The final review added failing regressions for adjacent currency labels, masked
card digits, account/security identifiers and Unicode minus signs, then fixed
their extraction. Attached currencies take priority over neighbouring numbers;
a suffix currency cannot also label the next amount. PINs,
CVVs, passcodes and masked card suffixes do not become money candidates; Unicode
negative amounts are rejected. Capture no longer subscribes to transaction or
subscription state or receives an unused transaction creation function.
Queued notifications that failed under the retired AI workflow become pending
local reviews on retry. Replayed income, expense and ignored decisions stay
completed, so retries cannot reopen a finished review.
Capture never writes money or calls an AI provider. The user chooses Income,
Expense or Ignore. Several amounts require a selection; missing amounts can be entered in the full transaction editor. Compact cards use the detected currency and configured account without extra controls. The pencil opens the ordinary full editor, while its save uses the durable notification review guard. Categories reuse the Apple Pay keyword mapping after a valid same-type preset and before defaults. Bulk actions process the selected pending snapshot.
Apple Pay automatic logging and receipt photo/itemized/screenshot scanning keep
their existing behavior.

History keeps all pending items and the newest 10 completed items. Pending drafts
do not expire. An inline home action below the income/expense summary, alongside receipt-scan status, returns on launch/foreground and new captures. It appears in the calendar day view outside search.
The root review page intercepts Back, hardware Back and swipe-back; Cancel stays,
and confirmation durably ignores the unfinished snapshot before navigating.
New notifications arriving while the warning is open remain pending.

The review fixed malformed numeric grouping, currency-change validation,
three-decimal amount rounding, interrupted queue writes, replay after a partial history failure, recovery
of corrected amounts/accounts, reset and identity cancellation, list jumps after
reviewing an item, floating-action touch ordering, and bottom safe-area spacing.
Older notifications retain their capture links for 180 days after the last
review update, so a newly reviewed old notification remains recoverable. Raw-text
redaction does not extend that retention window. Successful backup restores,
Money Manager imports and all reset paths clear local history and native queues;
failed backup restores keep reviews intact.
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
- Full Jest regression suite: 183 suites, 2,528 tests, including receipt client,
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

Verified the floating action opens History, light/dark layouts, full transaction editing,
multiple amount candidates, disabled save buttons for missing amounts, bulk
handling of unfinished items, and the existing free account-limit warning.
Back showed the unfinished-items warning; Cancel kept the page open. While a
warning for three items was open, a fourth synthetic notification arrived.
Ignore and Leave returned to the calendar and left only that new item pending.
Ignore All then completed it. Ignoring did not increase the ledger count. Reload
preserved history and the completed list was capped at 10.

Final UI evidence is in `docs/pr-evidence/notification-review/`. Screenshots show
only synthetic text and demo accounts. Changed Android walkthrough frames are
refreshed to show the local review flow. Actual before screenshots and the generated design guide are included.
A symbol-free synthetic transfer of 0.20 went through production capture, produced one pending item and zero transactions, and displayed RM0.20 using the configured account currency. The redesigned page separates To review from Recent, uses compact cards and flat
action rows, and has no currency/account controls. Selected amounts survive
switching tabs; the exit warning still covers pending items while viewing Recent.
The review action was checked after a full bundle reload in its final position below the calendar summary; dismissing it preserved all three pending items. To review shows a spaced red count only when items are pending and the original rounded toggle highlights the active tab; Recent has no count. History uses an icon-only action beside the Notifications section title on both platforms’ Automation page; the Notifications settings header is centered. An edited RM0.20 draft saved as RM5.00 with Food selected, completed its capture and increased the ledger from 7,109 to 7,110 exactly once. Demo account fixtures used to exercise the allowed editor path were restored afterward.

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
