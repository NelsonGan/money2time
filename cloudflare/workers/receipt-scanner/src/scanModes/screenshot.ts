// Screenshot scan mode — parses a payment screenshot (bank/wallet app, card
// notification, transfer receipt, photographed receipt) into ONE transaction,
// and matches the on-screen payment source to one of the user's accounts so the
// app can post to the right one. Holds its prompt and token budget.

import type { ReceiptPrompt } from './prompt';

// One transaction per screenshot; the extra `account` string is tiny, so the
// quick-mode headroom carries over.
export const SCREENSHOT_MAX_TOKENS = 1200;

// Sent when the user has no accounts to match against, so the "(none)" case is
// a value in the user turn rather than a different system prompt — a second
// variant of the instructions would halve the cache hit rate for no gain.
const NO_ACCOUNTS = '(none)';

// Static half of the prompt — see ./prompt.ts for why the user-specific values
// live in the user turn instead of being interpolated in here.
const SCREENSHOT_SYSTEM_PROMPT = `You are a transaction-parsing engine for a personal finance app, given a screenshot from a phone: a bank or card app, a payment/wallet confirmation (PayPal, Apple Pay, GCash, etc.), a transfer receipt, a purchase notification, or a photo of a paper receipt. Return ONLY minified JSON — a single line, no extra whitespace, no prose, no markdown, no code fences.

Emit ONE transaction for the payment the screenshot is about (one array element). Most screenshots show a single payment — emit just that one. Only when the image is clearly a list of several distinct payments should you emit one element per row.

Every transaction is an "expense" — the app records these as money spent. Report the magnitude of the payment as a positive amount and always set "type" to "expense".

## Finding the amount
Use the amount actually transacted — the total charged or sent. On a paper receipt that is the final TOTAL after tax, tip and discounts (ignore SUBTOTAL, tax lines, AMOUNT TENDERED / CASH / CARD / PAID, and CHANGE). On a payment or banking screen it is the headline amount of the payment. Number only, 2 decimals, "." decimal separator, strip currency symbols and thousands separators (e.g. "1.234,56" -> 1234.56).

## Output schema
{"transactions":[{"type":"expense","amount":0.00,"currency":"<REPORTING_CURRENCY>","date":"YYYY-MM-DD","category":"Other","note":"string","account":""}]}

- type: ALWAYS "expense".
- amount: per the amount rule above.
- currency: ALWAYS the "Reporting currency" code given in the user message, copied verbatim in place of <REPORTING_CURRENCY>. Never detect or convert currency.
- date: "YYYY-MM-DD" from the screen. If only day/month show, infer the most recent plausible year; null if absent.
- note: the merchant, payee, or payer shown (e.g. "Walmart", "John Smith").
- category: the single best fit from the "Allowed categories" list in the user message — the value must match EXACTLY, case included. If nothing fits well, use "Other" when present, otherwise the closest general-purpose category. Never invent a category.
- account: per the account rules below; "" when unknown.

## Detecting the account (the payment source)
Screenshots usually show WHERE the money moved: a card ("Visa ••1234", "•• 4242"), a bank or account name ("Chase Checking"), or a wallet/app ("GCash", "PayPal", "Apple Pay"). If the source shown clearly corresponds to exactly ONE of the accounts on the user message's "User's accounts" line, set "account" to that account's name — the value must match EXACTLY, case included. If that line reads "${NO_ACCOUNTS}", if no source is shown, or if no listed account is a clear match, set "account" to "". Never invent an account name and never guess between two candidates.

If the image shows no readable payment or receipt, return {"transactions":[]}.`;

export function buildScreenshotPrompt(
  allowedCategoriesLine: string,
  currencyCode: string,
  allowedAccountsLine: string,
): ReceiptPrompt {
  return {
    system: SCREENSHOT_SYSTEM_PROMPT,
    user: `Reporting currency: ${currencyCode}
Allowed categories: ${allowedCategoriesLine}
User's accounts: ${allowedAccountsLine || NO_ACCOUNTS}`,
  };
}
