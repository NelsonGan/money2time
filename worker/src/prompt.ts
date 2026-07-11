// Schema-locked receipt-parsing prompt for Qwen3-VL. The user's own expense
// category names are injected so the model assigns to their real categories;
// when the app sends none we fall back to the app's 8 default expense categories.

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

export function buildReceiptPrompt(categories: string[]): string {
  const list =
    Array.isArray(categories) && categories.length > 0
      ? categories
      : DEFAULT_EXPENSE_CATEGORIES;
  // De-dupe, trim, and keep it a clean comma list for the model.
  const allowed = Array.from(
    new Set(list.map((c) => String(c).trim()).filter(Boolean)),
  );
  const allowedLine = allowed.join(', ');

  return `You are a receipt-parsing engine for a personal finance app. You are given an
image containing one or more receipts. Extract every distinct purchase as a
transaction and return ONLY a JSON object — no prose, no markdown, no code fences.

## Output schema

{
  "transactions": [
    {
      "type": "expense",         // "expense" | "income". Receipts are almost always "expense".
      "amount": 0.00,            // FINAL total paid (incl. tax & tip, after discounts). Number only.
      "currency": "USD",         // ISO 4217 code inferred from the receipt.
      "date": "YYYY-MM-DD",      // Purchase date from the receipt. null if not visible.
      "category": "Other",       // MUST be exactly one value from the allowed list below.
      "note": "string",          // Short label, usually the merchant name, e.g. "Joe's Diner".
      "sentiment": "neutral"     // "happy" | "neutral" | "sad". Default "neutral".
    }
  ]
}

## Allowed categories (pick the single best fit — value must match EXACTLY, case included)

${allowedLine}

If none fits well, choose the category named "Other" if present, otherwise the
closest general-purpose category from the list. Never invent a category.

## Rules

1. One array element per distinct receipt/purchase. Multiple receipts in one
   image -> multiple elements. A single purchase -> exactly one element.
2. "amount" is the printed grand total actually paid. If a total is printed,
   trust it — do not re-sum line items.
3. Numbers only in "amount": use "." as the decimal separator, strip currency
   symbols and thousands separators (e.g. "1.234,56 €" -> 1234.56, "EUR").
4. Infer "currency" from the symbol/locale ($, €, £, ¥, RM, S$, ₹, ฿, Rp …).
   If genuinely ambiguous, use "USD".
5. "date" must be "YYYY-MM-DD". If only day/month show, infer the most recent
   plausible year. If no date is present, use null.
6. "category" must be copied verbatim from the allowed list above.
7. Never fabricate values. If a field can't be read, use null (except "type",
   "category", and "sentiment", which always have a valid default).
8. If the image has no readable receipt, return {"transactions": []}.
9. Output valid JSON and nothing else.`;
}
