# Synthetic receipt regression images

These images contain only synthetic merchants, amounts and account names. They
exercise the existing image modes after adding notification text scanning.

| Image                    | Mode         | Request context                                        | Expected result                                                                                           |
| ------------------------ | ------------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `receipt.png`            | `quick`      | Currency MYR; categories Food, Other                   | One MYR16 expense; ignore subtotal 15, tendered 20 and change 4                                           |
| `receipt.png`            | `itemized`   | Currency USD; categories Food, Other                   | One USD16 expense; receipt currency MYR; Coffee quantity 2 / line total 12, Tea quantity 1 / line total 3 |
| `payment-screenshot.png` | `screenshot` | Currency MYR; accounts Everyday Account, Travel Wallet | One MYR16 expense from Everyday Account; ignore balance 999                                               |
| `multiple-receipts.png`  | `quick`      | Currency MYR; categories Food, Other                   | Two expenses: MYR16 and MYR7.50; consume one image scan                                                   |

POST each image as base64 with its MIME (`image/png`), mode, request context and
synthetic `appUserId` to an authenticated scanner preview's `/scan` endpoint.
Run the four cases on the configured primary, then on a preview that forces the
backup by configuring an unavailable primary. Do not deploy that configuration.
The itemized currency assertion preserves the existing distinction between the
requested transaction currency and the currency detected on the receipt itself.

The 2026-10-08 evaluation passed all eight cases on the primary and forced backup.
Amounts, item quantities/currencies and account detection were checked; merchant
wording was allowed to vary. Once the printed date is more than 30 days old,
responses should use today's date, following the Worker's existing date clamp.
Recorded responses and limits are in
[receipt regression evidence](../../../../docs/pr-evidence/notification-text-scanning/receipt-regression-results.json).
