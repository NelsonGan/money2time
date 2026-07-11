// Schema-locked receipt-parsing prompt for Qwen3-VL. The user's own expense
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

export function buildReceiptPrompt(categories: string[], currency: string): string {
  const list =
    Array.isArray(categories) && categories.length > 0
      ? categories
      : DEFAULT_EXPENSE_CATEGORIES;
  // De-dupe, trim, and keep it a clean comma list for the model.
  const allowed = Array.from(
    new Set(list.map((c) => String(c).trim()).filter(Boolean)),
  );
  const allowedLine = allowed.join(', ');
  const currencyCode =
    typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())
      ? currency.trim().toUpperCase()
      : 'USD';

  return buildTotalPrompt(allowedLine, currencyCode);
}

/**
 * Itemized prompt for the split-bill flow: instead of one total, break the
 * receipt into its individual line items (name + price each) so the user can
 * assign each item to a person. No categories are needed here.
 */
export function buildItemizedReceiptPrompt(currency: string): string {
  const currencyCode =
    typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())
      ? currency.trim().toUpperCase()
      : 'USD';

  return `You are a receipt-parsing engine for a bill-splitting app. You are given an
image of a single receipt. Return ONLY a JSON object — no prose, no markdown, no
code fences.

## What to produce

Break the receipt into its individual purchased line items. For EACH item emit
its name and the price actually charged for that line.

## Reading line items (do this carefully)

- One array entry per printed line item. If a line shows a quantity greater than
  one (e.g. "2 Coke  6.00"), emit ONE entry whose "amount" is the line's total
  for that quantity (6.00), and put the quantity in the name (e.g. "2x Coke").
- "amount" is the money charged for that line, not the unit price.
- IGNORE non-item lines: SUBTOTAL, TOTAL, TAX/VAT/GST, service charge, tip,
  "AMOUNT TENDERED" / "CASH" / "CARD" / "CHANGE", loyalty/points, and any
  discount summary line. Do NOT emit rows for these.
- Do NOT add a row for tax or the total. The app applies tax/service as a
  percentage on top of the item rows separately.
- Numbers only in "amount": use "." as the decimal separator, strip currency
  symbols and thousands separators (e.g. "1.234,56" -> 1234.56), round to 2dp.

## Output schema

{
  "merchant": "string",        // Merchant / store name, or "" if not visible.
  "date": "YYYY-MM-DD",        // Purchase date from the receipt, or null.
  "items": [
    {
      "name": "string",        // The item's name as printed, e.g. "Chicken Rice".
      "amount": 0.00           // The line's charged price. Number only.
    }
  ]
}

## Rules

1. "currency" is always "${currencyCode}" for the whole receipt — do not detect
   or convert currency, and do not add a currency field to each item.
2. Every item must have a non-empty "name" and a positive "amount".
3. Skip any line whose amount can't be read; never fabricate a price.
4. If the image has no readable receipt or no line items, return
   {"merchant": "", "date": null, "items": []}.
5. Output valid JSON and nothing else.`;
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
