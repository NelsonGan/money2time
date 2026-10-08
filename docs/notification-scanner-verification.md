# Notification scanner verification

Verified on 2026-10-08. All notification examples and receipt images used for
inference were synthetic. Production Worker traffic was not changed.

## Automated checks

- `npm run check`: app type checking, lint and formatting.
- `npm test -- --runInBand`: 176 suites, 2469 tests.
- Receipt scanner Worker: `npm run typecheck` and explicit formatting check.
- Worker contract tests exercise signed requests, entitlement/allowance isolation,
  text-only provider payloads, malformed output, intentional ignores, primary and
  backup failure, unchanged image requests and daily attempt throttling.
- App tests exercise income categories, currency/billed amounts, duplicates,
  atomic persistence, retrying saved classifications, explicit upload consent,
  live preference changes, manual entries during inference, offline batch stopping
  and preservation of a late failure condition in long text.
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

- Explicit disclosure and scan switch rendered correctly in light and dark themes.
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
preview and the Automation disclosure layout in light/dark themes. iPad mini A17
Pro/iOS27 verified the centered tablet layout. Real iOS financial data was not
sent or included in evidence. The real iPhone Shortcuts notification trigger was
not exercised; its existing native queue/action format is unchanged.

The Android emulator remained visible. This Xcode installation lacks the macOS
Simulator application; iOS devices were controllable through Argent but a visible
Simulator window could not be opened. iOS visual checks used device captures.
Final screenshots are in [PR evidence](pr-evidence/notification-text-scanning/).
Only final images were captured; there is no before/after comparison.

Three affected in-app automation tutorial frames were recaptured and annotated.
Tutorial registry generation and website sync completed; the website catalogue
had no changes because these automation guides are maintained separately.

## Release order and remaining checks

Deploy the scanner Worker before publishing the app update. Existing users must
accept notification text scanning; old local-only permission does not authorize
uploads. Update the public privacy policy and Play Console disclosure at release.
Verify representative real bank messages and the real iPhone Shortcuts trigger
before release. No native module, app database or Worker database migration is
required. Model decisions and provider availability can vary beyond this corpus.
