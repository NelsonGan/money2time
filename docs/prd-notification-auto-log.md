# Notification transactions

Current design, updated 2026-10-08.

## Product behavior

Notifications from selected bank and wallet apps become completed expenses or
income, including refunds actually credited back. Account selection remains
explicit: Android uses the app's selected debit/credit account; iOS uses Account
in the existing Log Notification action. Deleted, goal and loan accounts never
receive transactions. The app does not guess an account or create a review inbox.

Notification text uses the receipt scanner's new text-only `notification` mode.
There is no notification keyword classifier, amount extraction lexicon or
merchant keyword category matcher. Apple Pay and manual Quick Entry retain their
existing behavior. Category precedence is explicit automation category, scanner
category of the correct type, Quick Entry's default for that type, then fallback.
Amounts keep the notification's explicit currency, falling back to the selected
account currency only when ambiguous. An explicit foreign billed amount supplies
the account amount and reporting snapshot. Transactions use the capture timestamp.

The scanner reads the complete notification in any language and returns either
one high-confidence completed income/expense or an explicit ignore. Offers,
hypothetical spending, OTPs, security messages, balances, statements, reminders,
future/pending/failed payments, holds, own-account transfers, top-ups and
withdrawals are discarded. Multiple distinct movements and uncertain direction
are also discarded. A malformed model reply is a service failure, not an ignore.
An intentional ignore is final and is never retried into a transaction.

## Disclosure and interface

Notification scanning needs internet and sends selected notification text and
category names through Money2Time's Cloudflare scanner to OpenRouter and the
configured model provider. Account names are not sent or inferred. Notifications
outside the selected Android packages never reach the scanner.

`notificationScanningEnabled` defaults false when reading old preferences.
Existing local-only capture permission never silently enables uploads. Users
read the new disclosure and enable Scan notification text in Android Notifications
or the iOS Automation Notifications card. Android setup's Continue also accepts
the prominent disclosure. Pending captures remain queued while scanning is off.
Turning Android's Read notifications switch off still ignores queued captures.
Explicit user ignore phrases are filters only; they never transform a notification.

Android setup retains disclosure, system access, app/account selection and a test
notification. Its preview calls the same scanner without saving a transaction,
waits up to 105 seconds, and explains scan failure. The setup success event
requires a successful transaction classification.
The preview omits the native test notification's synthetic title while scanning
its sample payment body; real notifications always include their complete text.
Every selected Android app
needs a payable account. iOS still uses the Log Notification action with Message
bound to Notification Body and an explicit Account; Category may be left empty.
The action identity, queue format and native listener stay compatible.

## Capture, retries and duplicates

The native Android listener and iOS App Intent keep their atomic queues.
`PaymentAlertSync` runs outside tabs on launch, foreground, listener events and
explicit drain requests. It checks source settings, account validity, explicit
filters and the shared automatic-log allowance before uploading. After inference,
it rechecks live settings/accounts/categories and allowance before saving.

Only durable handling acknowledges a native capture. Network, capacity, quota,
malformed reply and database failures remain queued. A failed-save capture reuses
its successful scanner classification instead of spending another inference.
Transaction creation, capture link and the shared automatic-log counter commit
in one SQLite transaction. Already logged captures are acknowledged without a
second save. No keyword fallback runs during outages or against older Workers.

Duplicate checks cover repeat/update captures, cross-source bank/wallet messages,
Apple Pay taps and manually entered/recurring transactions. Account, direction,
currency and amount must match; cross-source/manual matches also need merchant
or payer evidence. A refund credit is not suppressed by its original equal-value
expense. The existing time windows and three-decimal currency precision remain.

## Allowances and storage

Notification scans never spend the receipt-image allowance. The Worker keeps
notification counters under `notification:<appUserId>` using the existing D1
schema: 100 valid scans in a lifetime for free, 2000/month fair use for Pro.
Intentional ignores do not consume this allowance. A separate attempt counter
bounds all notification calls, including ignores and failures, to 500 per UTC day.
These caps are configurable. Server throttling leaves captures queued.
The shared Apple Pay/notification auto-log allowance remains 100 lifetime free
logs and unlimited for Pro; the free account gate still applies.

Migration 067 remains unchanged. Internal capture rows serve duplicate and retry
bookkeeping, not an inbox. Ignored captures store no raw title/body. Other capture
retention, backup exclusions and reset/restore cleanup remain. Raw text, amounts
and merchant/payer names are excluded from analytics and new Worker logs.

## Verification and release

App and Worker contract tests cover text-only signed requests, strict classification
results, no retry on ignores, failover, quotas, account/category resolution,
income/refunds, duplicate protection, durable acknowledgement, opt-in and settings
changes during a scan. Localized catalogues retain key/interpolation parity.
The synthetic notification corpus supports real-model evaluation; mocked inference
checks must be reported separately from real-model accuracy.

Deploy the receipt-scanner Worker before publishing the app update. Old clients
retain image scanning; a new client against an older Worker keeps text captures
queued. No native rebuild is required for this change. Existing guides still use
the same native action and account setup; the in-app copy now explains text scanning.
Real bank notifications and the real iPhone Shortcuts trigger need verification
before release. Update the public privacy policy and Play Console disclosure for
notification text processing when releasing.
