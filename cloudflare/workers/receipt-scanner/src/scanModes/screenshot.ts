// Screenshot scan mode — parses an arbitrary payment screenshot (bank app,
// wallet/payment confirmation, card notification, transfer receipt, or a
// photographed paper receipt) into ONE transaction, and ADDITIONALLY tries to
// match the payment source shown on screen ("Visa ••1234", "Chase Checking",
// "GCash") to one of the user's account names, so the app can post to the
// right account instead of the default. Everything specific to this path —
// its prompt and its token budget — lives here.

// One transaction per screenshot (occasionally a short list); the extra
// `account` string is tiny, so the quick-mode headroom carries over.
export const SCREENSHOT_MAX_TOKENS = 1200;

/**
 * Build the screenshot prompt.
 *
 * @param allowedCategoriesLine comma-joined list of the user's expense category names
 * @param currencyCode          the app's reporting currency (amounts recorded as-is in it)
 * @param allowedAccountsLine   comma-joined list of the user's account names; "" when none were sent
 */
export function buildScreenshotPrompt(
  allowedCategoriesLine: string,
  currencyCode: string,
  allowedAccountsLine: string,
): string {
  // With no account list to match against, the model cannot resolve a payment
  // source to one of the user's accounts — pin `account` to "" and drop the
  // matching section entirely rather than invite a free-text guess the app
  // can't use.
  const accountsBlock = allowedAccountsLine
    ? `## Detecting the account (the payment source)
Screenshots usually show WHERE the money moved: a card ("Visa ••1234", "•• 4242"), a bank or account name ("Chase Checking"), or a wallet/app ("GCash", "PayPal", "Apple Pay"). If the source shown clearly corresponds to exactly ONE of the user's accounts below, set "account" to that account's name — the value must match EXACTLY, case included. If no source is shown, or no listed account is a clear match, set "account" to "". Never invent an account name and never guess between two candidates.

### User's accounts (choose the single clear match, or "")
${allowedAccountsLine}`
    : `## Detecting the account
Always set "account" to "".`;

  return `You are a transaction-parsing engine for a personal finance app, given a screenshot from a phone: a bank or card app, a payment/wallet confirmation (PayPal, Apple Pay, GCash, etc.), a transfer receipt, a purchase notification, or a photo of a paper receipt. Return ONLY minified JSON — a single line, no extra whitespace, no prose, no markdown, no code fences.

Emit ONE transaction for the payment the screenshot is about (one array element). Most screenshots show a single payment — emit just that one. Only when the image is clearly a list of several distinct payments should you emit one element per row.

Every transaction is an "expense" — the app records these as money spent. Report the magnitude of the payment as a positive amount and always set "type" to "expense".

## Finding the amount
Use the amount actually transacted — the total charged or sent. On a paper receipt that is the final TOTAL after tax, tip and discounts (ignore SUBTOTAL, tax lines, AMOUNT TENDERED / CASH / CARD / PAID, and CHANGE). On a payment or banking screen it is the headline amount of the payment. Number only, 2 decimals, "." decimal separator, strip currency symbols and thousands separators (e.g. "1.234,56" -> 1234.56).

## Output schema
{"transactions":[{"type":"expense","amount":0.00,"currency":"${currencyCode}","date":"YYYY-MM-DD","category":"Other","note":"string","account":""}]}

- type: ALWAYS "expense".
- amount: per the amount rule above.
- currency: ALWAYS "${currencyCode}". Never detect or convert currency.
- date: "YYYY-MM-DD" from the screen. If only day/month show, infer the most recent plausible year; null if absent.
- note: the merchant, payee, or payer shown (e.g. "Walmart", "John Smith").
- account: per the account rules below; "" when unknown.

## Allowed categories (pick the single best fit — value must match EXACTLY, case included)
${allowedCategoriesLine}
If nothing fits well, use "Other" when present, otherwise the closest general-purpose category. Never invent a category.

${accountsBlock}

If the image shows no readable payment or receipt, return {"transactions":[]}.`;
}
