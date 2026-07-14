// Schema-locked receipt-parsing prompt for the vision model. The user's own expense
// category names are injected so the model assigns to their real categories;
// when the app sends none we fall back to the app's 8 default expense
// categories. The app's reporting currency is injected too — we never detect
// currency from the receipt (amounts are recorded as-is in the app's currency).

const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Groceries',
  'Transport',
  'Housing',
  'Bills',
  'Healthcare',
  'Shopping',
  'Other',
];

/** A valid 3-letter ISO-ish currency code, uppercased; falls back to USD. */
function normalizeCurrencyCode(currency: string): string {
  return typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())
    ? currency.trim().toUpperCase()
    : 'USD';
}

export type ScanMode = 'quick' | 'itemized';

export function buildReceiptPrompt(
  categories: string[],
  currency: string,
  mode: ScanMode = 'quick',
): string {
  const list =
    Array.isArray(categories) && categories.length > 0
      ? categories
      : DEFAULT_EXPENSE_CATEGORIES;
  // De-dupe, trim, and keep it a clean comma list for the model.
  const allowed = Array.from(
    new Set(list.map((c) => String(c).trim()).filter(Boolean)),
  );
  const allowedLine = allowed.join(', ');
  const currencyCode = normalizeCurrencyCode(currency);

  return mode === 'itemized'
    ? buildItemizedPrompt(allowedLine, currencyCode)
    : buildTotalPrompt(allowedLine, currencyCode);
}

function buildTotalPrompt(allowedLine: string, currencyCode: string): string {
  return `You are a receipt-parsing engine for a personal finance app. You are given an
image containing one or more receipts. Return ONLY a JSON object — no prose, no
markdown, no code fences.

## What to produce

Emit exactly ONE transaction for the receipt:

1. Find the receipt's FINAL TOTAL — the amount actually paid (see "Finding the
   total" below). That is the transaction's "amount".
2. Pick the SINGLE category from the allowed list that best fits the overall
   purchase (e.g. a supermarket run -> "Groceries", a restaurant bill ->
   "Food").

Do NOT split the receipt into multiple line-item transactions. If the image
contains several separate receipts, emit one transaction per receipt.

## Finding the total (do this carefully — it is the most common mistake)

The final total is the amount the customer actually paid, AFTER tax, tip, and
discounts. It is usually the largest money figure, near the bottom, labelled
TOTAL, GRAND TOTAL, TOTAL DUE, AMOUNT DUE, BALANCE DUE, TOTAL PAID, or shown as
the amount charged to the card.

- If both a SUBTOTAL and a TOTAL are printed, use the TOTAL (the one that
  includes tax) — never the subtotal.
- IGNORE these when picking the total: SUBTOTAL, individual TAX/VAT/GST lines,
  "AMOUNT TENDERED" / "CASH" / "CARD" / "PAID", "CHANGE" / "CHANGE DUE",
  loyalty/points balances, and per-item unit prices.
- Include tip/gratuity only if it is part of the printed final total.
- If several receipts are in the image, find each one's total separately.

## Output schema

{
  "transactions": [
    {
      "type": "expense",         // "expense" | "income". Receipts are almost always "expense".
      "amount": 0.00,            // The receipt's FINAL TOTAL (see "Finding the total"). Number only.
      "currency": "${currencyCode}",       // ALWAYS "${currencyCode}". Do not detect or convert currency.
      "date": "YYYY-MM-DD",      // Purchase date from the receipt. null if not visible.
      "category": "Other",       // MUST be exactly one value from the allowed list below.
      "note": "string",          // Merchant name, e.g. "Walmart".
      "sentiment": "neutral"     // "happy" | "neutral" | "sad". Default "neutral".
    }
  ]
}

## Allowed categories (pick the single best fit — value must match EXACTLY, case included)

${allowedLine}

If nothing fits well, use the category named "Other" if present, otherwise the
closest general-purpose category from the list. Never invent a category.

## Rules

1. Exactly ONE array element per receipt. Multiple separate receipts in the
   image -> one element each. Never split a single receipt into multiple rows.
2. "currency" is ALWAYS "${currencyCode}". Ignore any currency symbol printed on
   the receipt; copy the printed numeric amount as-is without converting.
3. Numbers only in "amount": use "." as the decimal separator, strip currency
   symbols and thousands separators (e.g. "1.234,56" -> 1234.56).
4. "amount" is the receipt's final total (from "Finding the total"), rounded to
   2 decimals.
5. "category" is the single best fit for the whole receipt, copied verbatim from
   the allowed list above.
6. "date" must be "YYYY-MM-DD". If only day/month show, infer the most recent
   plausible year. If no date is present, use null.
7. "note" is the merchant name.
8. Never fabricate values. If a field can't be read, use null (except "type",
   "currency", "category", and "sentiment", which always have a valid default).
9. If the image has no readable receipt, return {"transactions": []}.
10. Output valid JSON and nothing else.`;
}

// Itemized mode: the quick-scan transaction envelope PLUS a "receiptDetail"
// object listing the receipt's line items, used by the app's Split-by-Item
// flow (which splits the items and applies tax itself). Only emitted when the
// image holds exactly one receipt.
function buildItemizedPrompt(allowedLine: string, currencyCode: string): string {
  return `You are a receipt-parsing engine for a personal finance app. You are given an
image containing one or more receipts. Return ONLY a JSON object — no prose, no
markdown, no code fences.

## What to produce

1. Emit exactly ONE transaction per receipt (the "transactions" array).
2. When the image contains exactly ONE receipt, ALSO emit a "receiptDetail"
   object listing the receipt's line items. When the image holds several
   separate receipts, or no readable receipt, omit "receiptDetail" entirely.

## Finding the total (for the transaction amount)

The final total is the amount the customer actually paid, AFTER tax, tip, and
discounts — usually the largest money figure near the bottom, labelled TOTAL,
GRAND TOTAL, AMOUNT DUE, BALANCE DUE, or the amount charged to the card. If both
a SUBTOTAL and a TOTAL are printed, use the TOTAL. Ignore AMOUNT TENDERED /
CASH / CARD / CHANGE / loyalty balances.

## Output schema

{
  "transactions": [
    {
      "type": "expense",         // "expense" | "income". Receipts are almost always "expense".
      "amount": 0.00,            // The receipt's FINAL TOTAL. Number only.
      "currency": "${currencyCode}",       // ALWAYS "${currencyCode}". Do not detect or convert currency.
      "date": "YYYY-MM-DD",      // Purchase date from the receipt. null if not visible.
      "category": "Other",       // MUST be exactly one value from the allowed list below.
      "note": "string",          // Merchant name, e.g. "Walmart".
      "sentiment": "neutral"     // "happy" | "neutral" | "sad". Default "neutral".
    }
  ],
  "receiptDetail": {             // Only when the image holds exactly ONE receipt.
    "merchant": "string",        // Merchant name. null if unreadable.
    "date": "YYYY-MM-DD",        // Purchase date as printed. null if not visible.
    "currency": "USD",           // ISO code detected FROM THE RECEIPT itself. null if unsure.
    "items": [                   // One entry per purchased line item, top to bottom.
      {
        "name": "string",        // Item description as printed (lightly cleaned).
        "quantity": 1,           // Printed quantity. Default 1. Fractional allowed (e.g. 0.45 kg).
        "lineTotal": 0.00,       // What this line cost (pre-tax), after its own per-item discount.
        "confidence": "high"     // "high" | "low" — "low" when the line was hard to read.
      }
    ],
    "itemsConfidence": "high"    // "high" | "low" — "low" when items are incomplete or blurry.
  }
}

## Allowed categories (pick the single best fit — value must match EXACTLY, case included)

${allowedLine}

If nothing fits well, use the category named "Other" if present, otherwise the
closest general-purpose category from the list. Never invent a category.

## Rules

1. Exactly ONE "transactions" element per receipt; the transaction "amount" and
   "currency" follow the quick-scan rules ("currency" is ALWAYS
   "${currencyCode}"; copy printed amounts as-is without converting).
2. "receiptDetail.currency" is the code you detect from the receipt's printed
   symbols/labels (e.g. "MYR", "JPY"). Use null when unsure — never guess.
3. Line items: include every purchased item, with its pre-tax "lineTotal" (fold
   any per-item discount into it). Do NOT include subtotal, tax, service charge,
   tips, receipt-level discounts, rounding, change, loyalty points, or payment
   lines as items — the app adds tax/service itself.
4. Numbers only in every amount field: "." as decimal separator, no currency
   symbols or thousands separators (e.g. "1.234,56" -> 1234.56). Round to 2
   decimals.
5. NEVER invent items. If the item section is unreadable, return "items": []
   with "itemsConfidence": "low". Mark individual hard-to-read lines with
   "confidence": "low".
6. "date" fields must be "YYYY-MM-DD". If only day/month show, infer the most
   recent plausible year. Use null when absent.
7. If the image has no readable receipt, return {"transactions": []} with no
   "receiptDetail".
8. Output valid JSON and nothing else.`;
}
