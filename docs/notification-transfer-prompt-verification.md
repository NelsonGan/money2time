# Notification transfer prompt review

Reviewed on 2026-10-08 after a completed RM0.20 transfer was discarded. The
committed reproduction uses the fictional payee ALEX TAN in the same sentence
structure; no private notification text, account numbers or credentials are
included.

## Research and implications

Provider documentation describes notification families more often than it
publishes complete, current text templates. The added cases are synthetic
examples of those documented situations, not claimed verbatim bank templates.

| Official source                                                                                                                                                                                                    | Finding                                                                                                                                            | Prompt / evaluation implication                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [Touch ’n Go incoming transfers](https://support.tngdigital.com.my/hc/en-my/articles/360035587874-Will-I-receive-a-notification-if-someone-transfers-money-to-my-account)                                          | Transfers from another person generate in-app notifications.                                                                                       | A transfer can be income or expense; direction matters.                                                         |
| [Touch ’n Go merchant confirmations](https://merchantsupport.tngdigital.com.my/hc/en-us/articles/360058505833-How-can-merchant-be-assured-if-the-payment-made-by-user-is-successful)                               | Merchants receive a notification after a customer pays successfully.                                                                               | “Payment received” from the recipient's perspective is income.                                                  |
| [GCash notification channels](https://help.gcash.com/hc/en-us/articles/10040298426137-Shift-of-SMS-messages-to-GCash-App-Inbox)                                                                                    | Express Send confirmations reach senders and recipients; the app also handles cash-in, cash-out, bill payments and refunds.                        | Identify what happened and to whom, rather than treating “transfer” as an automatic exclusion.                  |
| [GCash Express Send](https://help.gcash.com/hc/en-us/articles/360017566614-How-to-send-money-to-another-GCash-account)                                                                                             | Express Send sends money to another GCash account.                                                                                                 | Another wallet/account is not necessarily the user's own account.                                               |
| [CIMB transaction status](https://www.cimb.com.my/en/personal/help-support/faq/cimb-clicks-online-banking/cimb-clicks-transaction-protection/how-will-i-know-if-my-transaction-has-successfully-gone-through.html) | Customers can receive status messages for successful, pending and failed transactions.                                                             | A message's existence does not establish completion; later failure/pending status must govern.                  |
| [CIMB remittance guide](https://www.cimb.com.my/content/dam/cimb/personal/documents/banking-with-us/remittance/user-guide/foreign-transfer-user-guide-app-sep-2022.pdf)                                            | The guide distinguishes successful submission for processing from the transfer itself.                                                             | “Successfully submitted” is insufficient to log a completed payment.                                            |
| [OCBC push notification overview](https://www.ocbc.com/personal-banking/digital-banking/day-to-day-services/mobilepush)                                                                                            | Banking notifications include successful transfers/card spending alongside servicing/security updates; deals have a separate section.              | Classify the complete message, not merely the bank sender or successful wording.                                |
| [OCBC alert contents](https://www.ocbc.com/personal-banking/security/epayments-user-protection-guidelines)                                                                                                         | Transaction alerts may include account/payee identifiers, currency/amount, date, type and merchant details, with confidential information omitted. | Missing merchant names do not invalidate a clear debit; identifiers/reference numbers are not amounts or notes. |
| [MessageBird Malaysian SMS guidelines](https://messagebird.com/support-center/omnichannel-and-connectivity/policies-and-guidelines/malaysia)                                                                       | Malaysian messages may require an RM0.00 prefix.                                                                                                   | That prefix is not a zero-value transaction or an additional movement.                                          |
| [HSBC FPX guide](https://sp.hsbc.com.my/notices/conventional/hbmy_fpx_notice.pdf)                                                                                                                                  | The historical guide gives an RM0.00-prefixed purchase OTP example before payment is completed.                                                    | OTP/approval text must still be discarded even if it contains payment details.                                  |

## Change and review

The prompt now applies an ordered confirmation/context/direction/exclusion check,
anchors direction to the notification addressee, treats completed
person/business transfers as expense or income, and excludes own-account moves
only when the notification explicitly establishes ownership. It explicitly
allows positive fractional amounts, maps RM to MYR, and permits empty category or
merchant fields. It recognizes a sender saying they sent money to you as income,
and keeps the original foreign purchase separate from its billed account amount.
The output must contain an explicit decision rather than `{}`; ambiguous currency
uses the JSON value `null`, never the string `"null"`.

Questions and quoted promotional examples are distinguished before extracting
money. Successful submission/scheduling and approval requests remain excluded,
as do OTPs, failures, holds, top-ups, withdrawals and multiple distinct payments.
Two ledger legs describing the same transfer are one movement. No application
keyword parsing or unconditional transaction fallback was added.

The only runtime change is the notification prompt. Receipt image prompts,
parsers, retries, timeouts, quota and model configuration are unchanged. The
analytics table records qualifying transfer cases; event names, payloads,
routing, milestone thresholds and maximum Mixpanel volume are unchanged.

## Verification

The baseline live primary rejected the synthetic RM0.20 reproduction and
incorrectly accepted a promotional question about the same transfer: three of
five targeted baseline cases passed. Intermediate model evaluations also found
ambiguous-direction guesses, missing-payee false rejects, and isolated malformed
JSON replies, a sender-perspective income false reject and reversal of original
versus billed foreign-currency amounts. A synthetic-only diagnostic preview
identified a repeated malformed backup response using `"null"` as a currency
string; the prompt now spells out literal JSON null. The final prompt uses an
ordered decision process and complete
expense/income JSON examples rather than relying on success words or implicit
account ownership. Malformed replies retain retryable service-error handling.

Live evaluation uses 84 semantic cases: 53 existing cases plus 31 transfer,
status, ownership, small-amount and researched notification scenarios. It supplies
57 expense category labels (including repeated names) and 16 income labels to
exercise the longer context from the reported request. The normal primary route
retains its existing fallback to the backup on invalid
output or provider failure; the response does not identify which model completed
each request. The backup-only route is tested by forcing the primary to an
unavailable model in the isolated preview.

Final full runs on preview version `755acb30-f726-4124-b5f6-a31b6ce4b4f6`
passed **84/84 on the normal route and 84/84 on the forced backup**, with no
per-case reruns in those final matrices. An additional five-case backup smoke
run also passed before the final matrices. Both routes returned the reported
transfer structure as expense MYR0.20 to ALEX TAN, and preserved USD12 with
secondary MYR56.30 for the foreign purchase.

`npm run check`, Worker type checking, explicit formatting checks and the full
Jest suite passed: **180 suites / 2,540 tests**. The six focused analytics suites
also passed (113 tests). Existing receipt regressions are included in the full
suite; receipt prompts and shared transport are unchanged. Production deployment
IDs matched before and after evaluation.

[Machine-readable model results](pr-evidence/notification-transfer-prompt/model-results.json)
record the complete final matrices, five-case baseline, category context, source
checksum and intermediate issues found and corrected. These are finite
synthetic evaluations, not a guarantee of future accuracy.

The committed `scripts/evaluate-notification-scanner.mjs` replays the same fixture
IDs with its smaller default category list. To reproduce the longer context,
POST each fixture's text/currency plus the category arrays recorded in the live
results to an authenticated `/scan` preview, with `mode: "notification"`, a
synthetic app user ID and a valid capture timestamp. Test the configured primary,
then a preview with an unavailable primary to force the backup; do not deploy
that test configuration.

QA preview authentication is restricted to three synthetic user IDs per preview
and expires after two hours. Entitlement is fixed to free for those IDs, avoiding
RevenueCat
calls. The shim and credential are absent from committed code. Only preview
versions are uploaded; production deployment IDs are compared before and after.
No UI or physical-phone verification is included in this server-prompt change.

## Limits

A prompt improves classification but cannot guarantee every provider response.
The classifier has no account-ownership database: a real self-transfer that
omits any ownership indication can look identical to payment to another person.
The new rule uses explicit direction without inventing ownership. It still
requires scanning opt-in; already acknowledged ignores are not automatically
rescanned after the Worker update.
