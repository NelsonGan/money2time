// Quick scan path — total-only receipt parse. Emits ONE transaction per receipt
// (final total + category + merchant + date); no line-item extraction. This is
// the default mode behind "Scan receipt". Everything for this path lives here;
// the sibling itemized path is deliberately kept separate.

/**
 * Build the total-only receipt prompt.
 *
 * @param allowedLine  comma-joined list of the user's expense category names
 * @param currencyCode the app's reporting currency (amounts recorded as-is in it)
 */
export function buildQuickPrompt(allowedLine: string, currencyCode: string): string {
  return `You are a receipt-parsing engine for a personal finance app, given an image of one or more receipts. Return ONLY minified JSON — a single line, no extra whitespace, no prose, no markdown, no code fences.

Emit exactly ONE transaction per receipt (one array element each). Never split a single receipt into multiple rows; if the image holds several separate receipts, emit one element per receipt.

## Finding the total (the most common mistake)
The final total is what the customer actually paid, AFTER tax, tip and discounts — usually the largest money figure near the bottom, labelled TOTAL, GRAND TOTAL, AMOUNT DUE, BALANCE DUE, or the amount charged to the card. If both a SUBTOTAL and a TOTAL are printed, use the TOTAL. Ignore SUBTOTAL, individual TAX/VAT/GST lines, AMOUNT TENDERED / CASH / CARD / PAID, CHANGE, loyalty balances, and per-item unit prices.

## Output schema
{"transactions":[{"type":"expense","amount":0.00,"currency":"${currencyCode}","date":"YYYY-MM-DD","category":"Other","note":"string"}]}

- type: "expense" | "income" — receipts are almost always "expense".
- amount: the receipt's FINAL TOTAL. Number only, 2 decimals, "." decimal separator, strip currency symbols and thousands separators (e.g. "1.234,56" -> 1234.56).
- currency: ALWAYS "${currencyCode}". Never detect or convert currency.
- date: "YYYY-MM-DD" from the receipt. If only day/month show, infer the most recent plausible year; null if absent.
- note: the merchant name (e.g. "Walmart").

## Allowed categories (pick the single best fit — value must match EXACTLY, case included)
${allowedLine}
If nothing fits well, use "Other" when present, otherwise the closest general-purpose category. Never invent a category.

If the image has no readable receipt, return {"transactions":[]}.`;
}
