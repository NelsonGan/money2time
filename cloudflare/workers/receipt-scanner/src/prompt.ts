// Schema-locked receipt-parsing prompt for the vision model. The user's own expense
// category names are injected so the model assigns to their real categories;
// when the app sends none we fall back to the app's 8 default expense
// categories. The app's reporting currency is injected too — we never detect
// currency from the receipt (amounts are recorded as-is in the app's currency).
//
// The two modes share their intro / total-finding / category blocks (deduped
// below) and both ask for MINIFIED JSON so we pay for as few output tokens as
// possible. Fields the parser can default (sentiment, quantity=1) are omitted
// from the schema rather than asked for.

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
    Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_EXPENSE_CATEGORIES;
  // De-dupe, trim, and keep it a clean comma list for the model.
  const allowed = Array.from(new Set(list.map((c) => String(c).trim()).filter(Boolean)));
  const allowedLine = allowed.join(', ');
  const currencyCode = normalizeCurrencyCode(currency);

  return mode === 'itemized'
    ? buildItemizedPrompt(allowedLine, currencyCode)
    : buildTotalPrompt(allowedLine, currencyCode);
}

// ---- shared blocks -------------------------------------------------------

const INTRO = `You are a receipt-parsing engine for a personal finance app, given an image of one or more receipts. Return ONLY minified JSON — a single line, no extra whitespace, no prose, no markdown, no code fences.`;

const FIND_TOTAL = `## Finding the total (the most common mistake)
The final total is what the customer actually paid, AFTER tax, tip and discounts — usually the largest money figure near the bottom, labelled TOTAL, GRAND TOTAL, AMOUNT DUE, BALANCE DUE, or the amount charged to the card. If both a SUBTOTAL and a TOTAL are printed, use the TOTAL. Ignore SUBTOTAL, individual TAX/VAT/GST lines, AMOUNT TENDERED / CASH / CARD / PAID, CHANGE, loyalty balances, and per-item unit prices.`;

function categoriesBlock(allowedLine: string): string {
  return `## Allowed categories (pick the single best fit — value must match EXACTLY, case included)
${allowedLine}
If nothing fits well, use "Other" when present, otherwise the closest general-purpose category. Never invent a category.`;
}

// ---- quick (total-only) mode ---------------------------------------------

function buildTotalPrompt(allowedLine: string, currencyCode: string): string {
  return `${INTRO}

Emit exactly ONE transaction per receipt (one array element each). Never split a single receipt into multiple rows; if the image holds several separate receipts, emit one element per receipt.

${FIND_TOTAL}

## Output schema
{"transactions":[{"type":"expense","amount":0.00,"currency":"${currencyCode}","date":"YYYY-MM-DD","category":"Other","note":"string"}]}

- type: "expense" | "income" — receipts are almost always "expense".
- amount: the receipt's FINAL TOTAL. Number only, 2 decimals, "." decimal separator, strip currency symbols and thousands separators (e.g. "1.234,56" -> 1234.56).
- currency: ALWAYS "${currencyCode}". Never detect or convert currency.
- date: "YYYY-MM-DD" from the receipt. If only day/month show, infer the most recent plausible year; null if absent.
- note: the merchant name (e.g. "Walmart").

${categoriesBlock(allowedLine)}

If the image has no readable receipt, return {"transactions":[]}.`;
}

// ---- itemized mode -------------------------------------------------------
// The quick-scan transaction envelope PLUS a "receiptDetail" object listing the
// receipt's line items, used by the app's Split-by-Item flow (which splits the
// items and applies tax itself). Only emitted when the image holds exactly one
// receipt.

function buildItemizedPrompt(allowedLine: string, currencyCode: string): string {
  return `${INTRO}

1. Emit exactly ONE transaction per receipt (the "transactions" array).
2. When the image holds exactly ONE receipt, ALSO emit a "receiptDetail" object listing its line items. Omit "receiptDetail" entirely for multi-receipt images or when there is no readable receipt.

${FIND_TOTAL}

## Output schema
{"transactions":[{"type":"expense","amount":0.00,"currency":"${currencyCode}","date":"YYYY-MM-DD","category":"Other","note":"string"}],"receiptDetail":{"merchant":"string","date":"YYYY-MM-DD","currency":"USD","items":[{"name":"string","lineTotal":0.00,"confidence":"high"}],"itemsConfidence":"high"}}

- transactions[].amount/currency follow the total rules above; "currency" is ALWAYS "${currencyCode}".
- receiptDetail.currency: the ISO code detected from the receipt's own symbols/labels (e.g. "MYR", "JPY"); null when unsure — never guess.
- items: one entry per purchased line, top to bottom. "lineTotal" is that line's pre-tax cost (fold in any per-item discount), number only, 2 decimals. Add "quantity": N ONLY when the printed quantity is greater than 1 (it defaults to 1). Do NOT include subtotal, tax, service charge, tips, receipt-level discounts, rounding, change, loyalty points, or payment lines as items — the app adds tax/service itself.
- "confidence" / "itemsConfidence": "high" | "low" ("low" when hard to read). If the item section is unreadable, return "items":[] with "itemsConfidence":"low". Never invent items.
- date fields: "YYYY-MM-DD"; infer the recent plausible year from a day/month; null if absent.

${categoriesBlock(allowedLine)}

If the image has no readable receipt, return {"transactions":[]} with no "receiptDetail".`;
}
