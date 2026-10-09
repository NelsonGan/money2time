# Historical notification scanner verification

This is evidence for the retired AI workflow in merged PR 569. It is superseded
by [notification-history-verification.md](notification-history-verification.md).
The evaluation script and notification AI endpoint described below have been
removed. These historical results and release instructions do not apply to the
current local review workflow.

Verified on 2026-10-08. All notification examples and receipt images used for
inference were synthetic. Production Worker traffic was not changed.

## Automated checks

- `npm run check`: app type checking, lint and formatting.
- `npm test -- --runInBand`: 180 suites, 2536 tests after the receipt compatibility review.
- Receipt scanner Worker: `npm run typecheck` and explicit formatting check.
- Worker contract tests exercise signed requests, entitlement/allowance isolation,
  text-only provider payloads, malformed output, intentional ignores, primary and
  backup failure, unchanged image requests and daily attempt throttling.
- App tests exercise income categories, currency/billed amounts, duplicates,
  atomic persistence, retrying saved classifications, notification scanning opt-in,
  live preference changes, manual entries during inference, offline batch stopping
  and preservation of a late failure condition in long text.
- Android and iOS native fields at their existing 2000-character truncation
  boundary are discarded without uploading or creating a transaction, since the
  cut-off suffix might change a payment's meaning. Truncation evidence is retained
  before whitespace trimming.
- Review regressions cover account currency changes during inference and saved
  retries, fresh duplicate records after transaction deletion, immediate raw-text
  removal when a failed capture is discarded, complete multiline native bodies,
  sanitized provider errors (with capacity behavior preserved), and setup results
  belonging only to the current requested test.
- The evaluation runner rejects missing or contradictory explicit decisions;
  four local HTTP contract cases passed. These checks test the reporting script,
  not model accuracy.
- The setup preview scans the sample payment without its synthetic test title and
  never creates a transaction. Locale keys/interpolations retain parity across
  all 24 catalogues; the analytics tracking-plan check passes.

## Live model evaluation

The final primary preview was `395f6cf7-987a-487d-a59d-5f316ee281e2`.
All 52 original semantic cases passed, followed by the newly added setup sample:
53/53 in total. This is a synthetic evaluation, not a guarantee for unseen bank
messages. The corpus covers completed purchases, salary, received money, credited
refunds/cashback, foreign billed amounts, regional number formats, three-decimal
currencies, multilingual alerts, promotions, rhetorical marketing, security codes,
pending/failed payments, holds, statements, balances, multiple movements and
instruction injection. See [primary results](pr-evidence/notification-text-scanning/model-results.json)
and [setup result](pr-evidence/notification-text-scanning/setup-model-result.json).

A separate preview deliberately configured an unavailable primary model. Salary,
refund, rhetorical promotion, OTP and a receipt image all passed through
`google/gemini-2.5-flash-lite`: 5/5. See [backup results](pr-evidence/notification-text-scanning/backup-results.json).
The final primary also scanned a synthetic MYR15 receipt successfully. Live testing
found the former backup model unavailable, so the supported image/text backup is
now configured for every scanner mode.

These isolated previews used temporary authentication limited to synthetic QA
user IDs because the production signing secret was unavailable locally. That
authentication exists only in the QA preview bundles, never in the committed
Worker. Production HMAC verification is covered by the contract tests. Preview
evaluation also used the existing remote quota database with synthetic user IDs.

To repeat against an appropriately configured preview, use
`scripts/evaluate-notification-scanner.mjs`. Set `SCANNER_EVALUATION_URL` to its
`/scan` endpoint, `SCANNER_EVALUATION_USER` to a synthetic user ID and
`EXPO_PUBLIC_REQUEST_SIGNING_KEY` when signing is required. Optional
`SCANNER_EVALUATION_HEADERS` supplies preview-specific headers;
`SCANNER_EVALUATION_OUTPUT` saves a compact report. Optional fixture IDs select a
subset. Do not use private notification text or publish credentials.

## Device walkthrough

Android API36 emulator testing used the real native notification listener and
the native scanner client, with requests routed to the isolated live preview:

- The original disclosure and scan switch rendered correctly in light and dark themes.
  Returning from the background with notification access already granted did not
  bypass the disclosure.
- A completed MYR21.23 purchase, MYR121.23 salary and equal-value MYR21.23 refund
  produced the correct expenses/income. Refunds were not suppressed by the expense.
- A rhetorical promotion and an OTP containing monetary amounts were ignored;
  ignored capture records retained no raw notification body.
- The existing free account gate rejected a capture before uploading text.
- A simulated network failure retained a MYR31.24 capture in the native queue.
  Restoring the connection logged it once and cleared the queue.
- Setup preview returned MYR1.00, Test Cafe, the selected account and expense
  category without saving a transaction. A failed scan displayed the arrived-but-
  unclassified error, rather than claiming no notification arrived.

iPhone18Pro/iOS27 testing verified the native text scanner client against the live
preview and the original Automation disclosure layout in light/dark themes. iPad mini A17
Pro/iOS27 verified the centered tablet layout. Real iOS financial data was not
sent or included in evidence. The real iPhone Shortcuts notification trigger was
not exercised; its existing native queue/action format is unchanged.

The Android emulator remained visible. This Xcode installation lacks the macOS
Simulator application; iOS devices were controllable through Argent but a visible
Simulator window could not be opened. iOS visual checks used device captures.
Final screenshots are in [PR evidence](pr-evidence/notification-text-scanning/).
Only final images were captured; there is no before/after comparison.

The review follow-up used the same Android emulator with a held local scanner
response. Unsolicited and stale setup results did not change the screen; releasing
the current native test returned the expected MYR1 preview; a duplicate completion
was ignored. This timing test made one locally intercepted notification request,
sent no notification text to a provider and saved no transaction. Its final image
is [current-test preview](pr-evidence/notification-text-scanning/android-setup-current-test.png).
The original scanning preference and development Pro override were restored.

Three affected in-app automation tutorial frames were recaptured and annotated.
Tutorial registry generation and website sync completed; the website catalogue
had no changes because these automation guides are maintained separately.

## UI copy follow-up

Removed the added scanner/provider explanation entirely from the scan control and
Android setup, including its unused locale entries in all 24 catalogues. The scan
switch and processing behavior are unchanged. Analytics triggers and payloads are
unchanged. Android and iPhone light/dark layouts, Android setup and the centered
iPad layout were checked again. Three tutorial images and their moved markers
were refreshed; website sync produced no catalogue changes. All 178 suites and
2488 tests passed again, along with app type checking, lint and formatting.

## Existing receipt operations review

No receipt regression was found. The shared image request path was compared with
`main`, including signing, local image reads, payload limits, timeouts, error
mapping and compatibility with older responses. Quick, itemized and screenshot
prompts, normalization, receipt draft resolution and the camera/picker, share and
Back Tap job paths retain their existing behavior. The receipt context still
forces expense direction, selects the posting account, opens itemized scans for
review, and keeps or deletes images according to the existing preferences.
Notification validation and counters are isolated from image scans.

Added 48 automated regression checks in the native receipt client and image Worker
endpoint. They cover omitted mode from older clients; all three explicit image
modes; signed image payloads and resolution hints on primary/backup attempts;
free/Pro receipt quota and exhausted notification counters; unreadable-image
retries and failures; multi-receipt results billed once per image; split-item data,
screenshot accounts and dates; malformed replies and inputs; image size limits;
and the existing 70-second Worker / 90-second client timeouts. All 180 suites and
2536 tests passed, along with app type checking, lint/formatting and Worker type
checking. This review adds tests and evidence without changing app behavior or
analytics.

Live current-code preview `c64c94a1-c02f-48ca-85c3-948b5ca1915e` passed **8/8**
synthetic image checks: four on `qwen/qwen3.7-flash` and four with the primary
intentionally unavailable, forcing `google/gemini-2.5-flash-lite`:

- Quick: final MYR16 total after tax/discount, ignoring MYR20 tendered and MYR4 change.
- Itemized: Coffee quantity 2 / line total 12 and Tea quantity 1 / line total 3;
  detected receipt currency MYR while transaction currency stayed at the requested USD.
- Screenshot: MYR16 payment, ignoring MYR999 balance, matched to Everyday Account.
- Multi-receipt: separate MYR16 and MYR7.50 expenses, using one receipt allowance unit.

See [live responses](pr-evidence/notification-text-scanning/receipt-regression-results.json)
and [synthetic fixtures](../__tests__/fixtures/receipts/scanner-regression/README.md).
The preview's temporary authentication was limited to two synthetic QA user IDs;
it also fixed their entitlement to free, so it made no RevenueCat requests. Real
signatures and free/Pro handling are covered by the automated endpoint tests.
Production deployment IDs were identical before and after the preview upload.
No private images were uploaded. The real camera/picker and Shortcuts triggers
were reviewed in code, not repeated on devices during this follow-up. Model
accuracy on photographed, blurry or unusually long receipts remains variable.

## Release order and remaining checks

Deploy the scanner Worker before publishing the app update. Existing users must
accept notification text scanning; old local-only permission does not authorize
uploads. Update the public privacy policy and Play Console disclosure at release.
Verify representative real bank messages and the real iPhone Shortcuts trigger
before release. No native module, app database or Worker database migration is
required. Model decisions and provider availability can vary beyond this corpus.
