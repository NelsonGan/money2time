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

  return `You are a receipt-parsing engine for a personal finance app. You are given an
image containing one or more receipts. Read the line items and return ONLY a
JSON object — no prose, no markdown, no code fences.

## What to produce

Do NOT collapse a whole receipt into a single total. Instead:

1. Read every purchased line item (product/service, quantity, price).
2. Assign each line item to the single best-fitting category from the allowed
   list below.
3. GROUP the line items by category and emit ONE transaction per distinct
   category, whose "amount" is the sum of that category's line items.

So a mixed shopping trip (e.g. groceries + household + toiletries) becomes
several transactions — one per category — instead of one lump sum. A receipt
whose items all fall in a single category becomes exactly one transaction.

## Output schema

{
  "transactions": [
    {
      "type": "expense",         // "expense" | "income". Receipts are almost always "expense".
      "amount": 0.00,            // Sum of this category's line items (see reconciliation rules). Number only.
      "currency": "${currencyCode}",       // ALWAYS "${currencyCode}". Do not detect or convert currency.
      "date": "YYYY-MM-DD",      // Purchase date from the receipt. null if not visible.
      "category": "Other",       // MUST be exactly one value from the allowed list below.
      "note": "string",          // Merchant name, e.g. "Walmart". Same merchant repeats across that receipt's categories.
      "sentiment": "neutral"     // "happy" | "neutral" | "sad". Default "neutral".
    }
  ]
}

## Allowed categories (pick the single best fit — value must match EXACTLY, case included)

${allowedLine}

If a line item fits nothing well, put it under the category named "Other" if
present, otherwise the closest general-purpose category from the list. Never
invent a category.

## Rules

1. One array element per (receipt, category) pair. Multiple categories on one
   receipt -> multiple elements sharing the same merchant "note" and "date".
   All items of one category on one receipt -> exactly one element.
2. "currency" is ALWAYS "${currencyCode}" for every transaction. Ignore any
   currency symbol printed on the receipt; copy the printed numeric amounts
   as-is without converting.
3. Numbers only in "amount": use "." as the decimal separator, strip currency
   symbols and thousands separators (e.g. "1.234,56" -> 1234.56).
4. Reconciliation: the sum of all transactions' "amount" values for a receipt
   MUST equal that receipt's printed grand total actually paid (incl. tax &
   tip, after discounts). If line-item prices exclude tax/discounts, distribute
   the tax/discount across categories in proportion to their subtotals so the
   amounts add up to the grand total. Round each amount to 2 decimals.
5. If the individual line items cannot be read (blurry, itemization missing),
   fall back to a SINGLE transaction using the printed grand total and the best
   overall category.
6. "date" must be "YYYY-MM-DD". If only day/month show, infer the most recent
   plausible year. If no date is present, use null.
7. "category" must be copied verbatim from the allowed list above.
8. Never fabricate values. If a field can't be read, use null (except "type",
   "currency", "category", and "sentiment", which always have a valid default).
9. If the image has no readable receipt, return {"transactions": []}.
10. Output valid JSON and nothing else.`;
}
